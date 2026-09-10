import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
function load(path, modules = {}) {
  const output = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function("require", "exports", output)(name => modules[name] ?? require(name), exports);
  return exports;
}
const reports = load("lib/community/communityReports.ts");
const id = "11111111-1111-4111-8111-111111111111", commentId = "22222222-2222-4222-8222-222222222222";
const input = { targetType: "post", targetId: id, reason: "spam", detail: "  설명  " };
const row = { id, target_type: "post", post_id: id, comment_id: null, title: "TEST 신고 대상", body: "대상 본문", target_state: "published", reason: "spam", detail: "신고 설명", status: "open", created_at: "2026-09-10T00:00:00Z", resolved_at: null };
const rpcPage = { items: [row], total: 1, has_more: false };
function client(data, error) {
  const calls = [];
  return { calls, rpc: async (...args) => { calls.push(args); return { data, error }; } };
}

test("intake validates target/reason/detail before RPC and binds only allowed fields", async () => {
  const c = client({ duplicate: false });
  assert.deepEqual(await reports.submitCommunityReport(c, { ...input, reporter: "forged" }), { duplicate: false });
  assert.deepEqual(c.calls, [["submit_community_report", { p_target_type: "post", p_target_id: id, p_reason: "spam", p_detail: "설명" }]]);
  for (const invalid of [null, {}, { ...input, targetType: "user" }, { ...input, targetId: "x" }, { ...input, reason: "toString" }, { ...input, reason: "invalid" }, { ...input, detail: 1 }, { ...input, detail: "x".repeat(1001) }]) {
    const unused = client({ duplicate: false });
    await assert.rejects(reports.submitCommunityReport(unused, invalid), error => error.code === "invalid");
    assert.equal(unused.calls.length, 0);
  }
  for (const reason of Object.keys(reports.communityReportReasons)) assert.equal((await reports.submitCommunityReport(client({ duplicate: false }), { ...input, reason })).duplicate, false);
});

test("duplicate is exact boolean and failed or malformed responses cannot appear successful", async () => {
  assert.deepEqual(await reports.submitCommunityReport(client({ duplicate: true }), input), { duplicate: true });
  for (const data of [null, {}, { duplicate: "false" }, []]) await assert.rejects(reports.submitCommunityReport(client(data), input), error => error.code === "unknown");
  for (const [message, code] of [["community_report_self", "self"], ["community_report_target_unavailable", "unavailable"], ["community_report_invalid", "invalid"], ["로그인이 필요합니다.", "login"], ["PRIVATE SQL email=secret", "unknown"]]) {
    await assert.rejects(reports.submitCommunityReport(client(null, { message }), input), error => error.code === code && !error.message.includes("PRIVATE"));
  }
});

test("management parser minimizes DTOs, handles lifecycle and rejects malformed lists/pagination", async () => {
  for (const targetState of ["published", "hidden", "removed"]) {
    const page = await reports.listCommunityReports(client({ ...rpcPage, items: [{ ...row, target_state: targetState, reporter_email: "private" }] }));
    assert.equal(page.items[0].targetState, targetState);
    assert.doesNotMatch(JSON.stringify(page), /reporter|private/);
  }
  for (const data of [null, { ...rpcPage, total: -1 }, { ...rpcPage, has_more: "true" }, { ...rpcPage, items: [{ ...row, target_type: "comment" }] }, { ...rpcPage, items: [{ ...row, status: "resolved" }] }]) await assert.rejects(reports.listCommunityReports(client(data)));
  for (const args of [["bogus"], ["all", 51], ["open", 20, -1], ["all", 20, Infinity]]) {
    const c = client(rpcPage); await assert.rejects(reports.listCommunityReports(c, ...args)); assert.equal(c.calls.length, 0);
  }
});

function actions(options = {}) {
  const c = client(options.data ?? { duplicate: false }, options.error);
  const invalidated = [];
  return { c, invalidated, ...load("app/community/report-actions.ts", {
    "@/lib/community/communityReports": reports,
    "@/lib/supabase/auth": { getAuthenticatedSupabaseContext: async () => options.anonymous ? null : { supabase: c, userId: id } },
    "next/cache": { revalidatePath: path => invalidated.push(path) },
  }) };
}
test("server actions require verified login, never accept client identity and return friendly errors", async () => {
  const anon = actions({ anonymous: true });
  assert.equal((await anon.submitCommunityReportAction(input)).needsLogin, true);
  assert.equal((await anon.resolveCommunityReportAction(id)).needsLogin, true);
  assert.equal(anon.c.calls.length, 0);
  const s = actions(); assert.equal((await s.submitCommunityReportAction({ ...input, userId: "forged" })).ok, true);
  assert.doesNotMatch(JSON.stringify(s.c.calls), /forged|userId/);
  const failed = actions({ error: { message: "PRIVATE backend" } });
  assert.equal((await failed.submitCommunityReportAction(input)).ok, false);
  assert.doesNotMatch(JSON.stringify(await failed.resolveCommunityReportAction(id)), /PRIVATE/);
  assert.deepEqual(failed.invalidated, []);
});
test("resolution validates returned identity/status and only successful writes revalidate management", async () => {
  const success = actions({ data: { id, status: "resolved" } });
  assert.deepEqual(await success.resolveCommunityReportAction(id), { ok: true });
  assert.deepEqual(success.invalidated, ["/community/manage/reports"]);
  for (const data of [{ id: commentId, status: "resolved" }, { id, status: "open" }, null]) {
    const s = actions({ data }); assert.equal((await s.resolveCommunityReportAction(id)).ok, false); assert.deepEqual(s.invalidated, []);
  }
});

function walk(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(walk);
  return [node, ...walk(node.props?.children)];
}
const uiModules = {
  "@/lib/community/communityReports": reports,
  "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
  "@/components/ui/Container": { Container: ({ children, ...props }) => React.createElement("div", props, children) },
};
function harness(path, exportName, props, modules = {}) {
  const state = [], refs = [], tasks = [];
  let cursor = 0, refCursor = 0;
  const component = load(path, { ...uiModules, ...modules, react: { ...React,
    useId: () => "report-form-test",
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
    useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; },
    useTransition: () => [false, fn => { tasks.push(fn()); }],
  } })[exportName];
  return {
    render() { cursor = 0; refCursor = 0; return component(props); },
    async flush() { await Promise.all(tasks.splice(0)); },
  };
}
const find = (tree, type) => walk(tree).find(node => node.type === type);
function form(options = {}) {
  const calls = [];
  const h = harness("components/community/CommunityReportForm.tsx", "CommunityReportForm", { targetType: options.targetType ?? "post", targetId: commentId, postId: id }, {
    "@/app/community/report-actions": { submitCommunityReportAction: async value => { calls.push(value); if (options.throw) throw new Error("PRIVATE"); return options.result ?? { ok: true, data: { duplicate: false } }; } },
  });
  return { ...h, calls, open() { find(h.render(), "button").props.onClick(); return h.render(); }, submit() { find(h.render(), "form").props.onSubmit({ preventDefault() {} }); } };
}
test("post/comment report controls open a small accessible form with five reasons and optional detail", () => {
  for (const targetType of ["post", "comment"]) {
    const h = form({ targetType });
    assert.match(renderToStaticMarkup(h.render()), targetType === "post" ? /게시글 신고/ : /댓글 신고/);
    const tree = h.open();
    assert.equal(find(tree, "select").props.required, true);
    assert.equal(walk(tree).filter(node => node.type === "option").length, 6);
    assert.equal(find(tree, "textarea").props.maxLength, 1000);
    assert.equal(find(tree, "textarea").props.required, undefined);
    assert.match(renderToStaticMarkup(tree), /로그인 회원/);
    assert.equal(walk(tree).find(node => node.props?.type === "submit").props.disabled, true);
  }
});
test("form submits real target, suppresses overlapping clicks and shows success or duplicate", async () => {
  for (const duplicate of [false, true]) {
    const h = form({ targetType: "comment", result: { ok: true, data: { duplicate } } });
    find(h.open(), "select").props.onChange({ target: { value: "other" } });
    find(h.render(), "textarea").props.onChange({ target: { value: "설명" } });
    h.submit(); h.submit(); await h.flush();
    assert.deepEqual(h.calls, [{ targetType: "comment", targetId: commentId, reason: "other", detail: "설명" }]);
    assert.match(renderToStaticMarkup(h.render()), duplicate ? /이미 접수된 신고/ : /신고가 접수/);
    assert.equal(find(h.render(), "form"), undefined);
  }
});
test("login and network failures stay actionable, retain input and never display raw errors", async () => {
  for (const options of [{ result: { ok: false, error: "로그인 후 신고할 수 있습니다.", needsLogin: true } }, { throw: true }]) {
    const h = form(options); find(h.open(), "select").props.onChange({ target: { value: "spam" } });
    h.submit(); await h.flush();
    const html = renderToStaticMarkup(h.render()); assert.match(html, /role="alert"/); assert.doesNotMatch(html, /PRIVATE/);
    assert.equal(find(h.render(), "select").props.value, "spam");
    if (options.result) assert.match(html, /login\?next=/);
  }
});
test("self-authored post/comment retain edit controls and have no report form", () => {
  const StubReport = () => null;
  const data = load("data/communityData.ts");
  for (const canEdit of [false, true]) {
    const h = harness("components/community/CommunityPostDetailContent.tsx", "CommunityPostDetailContent", {
      initialPost: { id, title: "게시글", body: "본문", category: "free", canEdit },
      initialComments: { items: [{ id: commentId, body: "댓글", canEdit }], total: 1, hasMore: false },
    }, {
      "next/navigation": { useRouter: () => ({}) }, "@/app/community/actions": {},
      "@/components/community/CommunityPostDialog": {},
      "@/components/community/CommunityReportForm": { CommunityReportForm: StubReport },
      "@/data/communityData": data,
    });
    const nodes = walk(h.render()).filter(node => node.type === StubReport);
    assert.equal(nodes.length, canEdit ? 0 : 2);
    if (!canEdit) assert.deepEqual(nodes.map(node => [node.props.targetType, node.props.targetId]), [["post", id], ["comment", commentId]]);
  }
});

test("management shows exact target links/reasons/status and safely renders removed contents", async () => {
  for (const targetState of ["published", "hidden", "removed"]) {
    const page = await reports.listCommunityReports(client({ ...rpcPage, items: [{ ...row, target_type: "comment", comment_id: commentId, target_state: targetState }] }));
    const h = harness("components/community/CommunityReportManagement.tsx", "CommunityReportManagement", { page, status: "open", pageNumber: 2 }, {
      "next/navigation": { useRouter: () => ({ refresh() {} }) }, "@/app/community/report-actions": {},
    });
    const html = renderToStaticMarkup(h.render());
    assert.match(html, /스팸·광고/); assert.match(html, /대상 본문/); assert.match(html, /미처리/); assert.match(html, /이전 페이지/);
    if (targetState === "published") assert.match(html, new RegExp(`/community/${id}#comment-${commentId}`));
    else { assert.match(html, /공개 화면에서는 확인할 수 없습니다/); assert.doesNotMatch(html, new RegExp(`#comment-${commentId}`)); }
  }
});
test("management completion calls actual action and refreshes only after success", async () => {
  const page = await reports.listCommunityReports(client(rpcPage));
  for (const ok of [true, false]) {
    const calls = [], refresh = [];
    const h = harness("components/community/CommunityReportManagement.tsx", "CommunityReportManagement", { page, status: "open", pageNumber: 1 }, {
      "next/navigation": { useRouter: () => ({ refresh: () => refresh.push(true) }) },
      "@/app/community/report-actions": { resolveCommunityReportAction: async value => { calls.push(value); return { ok, error: "권한이 없습니다." }; } },
    });
    find(h.render(), "button").props.onClick(); await h.flush();
    assert.deepEqual(calls, [id]); assert.equal(refresh.length, ok ? 1 : 0);
    assert.match(renderToStaticMarkup(h.render()), ok ? /검토 완료로 표시했습니다/ : /권한이 없습니다/);
  }
});
test("admin route enforces login/RPC permission and has safe failure output", async () => {
  for (const scenario of ["anonymous", "permission", "network", "success"]) {
    const c = client(rpcPage, scenario === "permission" ? { message: "community_report_permission" } : scenario === "network" ? { message: "PRIVATE" } : undefined);
    const route = load("app/community/manage/reports/page.tsx", { ...uiModules,
      "next/navigation": { redirect: url => { throw new Error(url); } },
      "@/lib/supabase/auth": { getAuthenticatedSupabaseContext: async () => scenario === "anonymous" ? null : { supabase: c } },
      "@/components/community/CommunityReportManagement": { CommunityReportManagement: () => React.createElement("p", null, "신고 목록") },
    }).default;
    if (scenario === "anonymous") { await assert.rejects(route({ searchParams: Promise.resolve({}) }), /login\?next=/); assert.equal(c.calls.length, 0); }
    else {
      const html = renderToStaticMarkup(await route({ searchParams: Promise.resolve({ status: "all", page: "2" }) }));
      assert.doesNotMatch(html, /PRIVATE/);
      assert.match(html, scenario === "permission" ? /운영 권한이 없습니다/ : scenario === "network" ? /불러오지 못했습니다/ : /신고 목록/);
      assert.deepEqual(c.calls[0], ["list_community_reports", { p_status: "all", p_limit: 20, p_offset: 20 }]);
    }
  }
  assert.match(read("app/manage/page.tsx"), /href: "\/community\/manage\/reports"/);
});
