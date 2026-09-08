import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

import {
  getMarketListing,
  MarketError,
  mutateMarketListing,
  validateListingInput,
} from "./market.ts";
import {
  getMarketListingReportForManagement,
  listMarketListingReportsForManagement,
  MarketListingReportError,
  removeMarketListingForModeration,
  resolveMarketListingReport,
  submitMarketListingReport,
} from "./marketListingReports.ts";

const listingId = randomUUID();
const requestId = randomUUID();
const reportKey = "a".repeat(32);
const now = "2026-09-04T00:00:00.000Z";

function client(handler) {
  return {
    rpc: handler,
    storage: { from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: `https://example.invalid/${path}` } }) }) },
  };
}

function listingDetail(overrides = {}) {
  return {
    id: listingId,
    name: "TEST 파크골프채",
    category: "club",
    seller_type: "personal",
    price: 120000,
    region: "서울",
    condition: "lightUse",
    trade_type: "direct",
    sale_status: "selling",
    description: "상태가 좋은 테스트 판매글입니다.",
    seller_display_name: "PUL 회원",
    created_at: now,
    updated_at: now,
    version: 1,
    can_edit: false,
    image_paths: [],
    public_contact_method: "phone",
    public_contact_value: "01012345678",
    ...overrides,
  };
}

test("listing contact normalizes phone and preserves an exact mutation payload", async () => {
  let call;
  const input = validateListingInput({
    title: " TEST 파크골프채 ", category: "club", price: 120000, region: "서울",
    condition: "lightUse", tradeType: "direct", description: " 상태가 좋은 테스트 판매글입니다. ",
    publicContactMethod: "phone", publicContactValue: "010-1234-5678", publicContactConsent: true,
  });
  assert.equal(input.publicContactValue, "01012345678");
  await mutateMarketListing(client(async (name, args) => {
    call = { name, args };
    return { data: { request_id: requestId, listing_id: listingId, sale_status: "selling", version: 1, replayed: false, removed_storage_paths: [] }, error: null };
  }), "create", null, null, input, requestId);
  assert.equal(call.name, "mutate_market_listing");
  assert.deepEqual(call.args.p_payload, {
    title: "TEST 파크골프채", category: "club", price: 120000, region: "서울",
    condition: "lightUse", trade_type: "direct", description: "상태가 좋은 테스트 판매글입니다.",
    public_contact_method: "phone", public_contact_value: "01012345678", public_contact_consent: true,
  });
});

test("listing contact accepts SMS and HTTPS, and rejects unsafe or partial consent", () => {
  const base = {
    title: "TEST 파크골프채", category: "club", price: 120000, region: "서울",
    condition: "lightUse", tradeType: "direct", description: "상태가 좋은 테스트 판매글입니다.",
    publicContactMethod: "sms", publicContactValue: "+82 10 1234 5678", publicContactConsent: true,
  };
  assert.equal(validateListingInput(base).publicContactValue, "821012345678");
  assert.equal(validateListingInput({ ...base, publicContactMethod: "external_url", publicContactValue: "https://example.com/contact" }).publicContactValue, "https://example.com/contact");
  for (const input of [
    { ...base, publicContactValue: "123" },
    { ...base, publicContactValue: "문자만" },
    { ...base, publicContactMethod: "external_url", publicContactValue: "http://example.com" },
    { ...base, publicContactMethod: "external_url", publicContactValue: "javascript:alert(1)" },
    { ...base, publicContactConsent: false },
  ]) assert.throws(() => validateListingInput(input), (error) => error instanceof MarketError && error.code === "validation");
});

test("detail parser accepts consent-filtered contact and rejects extra private identity", async () => {
  const detail = await getMarketListing(client(async (name, args) => {
    assert.equal(name, "get_market_listing");
    assert.deepEqual(args, { p_listing_id: listingId });
    return { data: listingDetail(), error: null };
  }), listingId);
  assert.equal(detail.publicContactValue, "01012345678");
  await assert.rejects(
    getMarketListing(client(async () => ({ data: listingDetail({ seller_user_id: randomUUID() }), error: null })), listingId),
    (error) => error instanceof MarketError && error.code === "unknown",
  );
});

test("report submit normalizes note and binds replay response to request ID", async () => {
  let call;
  const result = await submitMarketListingReport(client(async (name, args) => {
    call = { name, args };
    return { data: { report_key: reportKey, report_status: "received", version: 1, request_id: requestId, replayed: false }, error: null };
  }), { listingId, reasonCode: "privacy_exposure", note: "  공개 연락처에 민감정보가 포함되어 있습니다.  ", requestId });
  assert.equal(result.reportKey, reportKey);
  assert.deepEqual(call, { name: "submit_market_listing_report", args: {
    p_listing_id: listingId,
    p_reason_code: "privacy_exposure",
    p_note: "공개 연락처에 민감정보가 포함되어 있습니다.",
    p_request_id: requestId,
  } });
});

test("report client rejects invalid reason, note, identifiers, and response prototypes", async () => {
  const invalid = [
    { listingId, reasonCode: "unknown", note: "충분히 자세한 신고 내용입니다.", requestId },
    { listingId, reasonCode: "other", note: "짧음", requestId },
    { listingId: "not-uuid", reasonCode: "other", note: "충분히 자세한 신고 내용입니다.", requestId },
  ];
  for (const input of invalid) await assert.rejects(
    submitMarketListingReport(client(async () => ({ data: null, error: null })), input),
    (error) => error instanceof MarketListingReportError && error.code === "validation",
  );
  const exotic = Object.assign(Object.create({ inherited: true }), {
    items: [], total: 0, limit: 30, offset: 0, has_more: false,
  });
  await assert.rejects(
    listMarketListingReportsForManagement(client(async () => ({ data: exotic, error: null }))),
    (error) => error instanceof MarketListingReportError && error.code === "unknown",
  );
});

test("management list/detail expose only the contracted fields", async () => {
  const summary = {
    report_key: reportKey, listing_title: "TEST 파크골프채", listing_status: "selling",
    reason_code: "other", report_status: "received", version: 1, created_at: now, resolved_at: null,
  };
  const page = await listMarketListingReportsForManagement(client(async () => ({
    data: { items: [summary], total: 1, limit: 30, offset: 0, has_more: false }, error: null,
  })));
  assert.equal(page.items[0].reportKey, reportKey);
  assert.equal("reporterUserId" in page.items[0], false);
  const detail = await getMarketListingReportForManagement(client(async () => ({ data: {
    report_key: reportKey, reason_code: "other", note: "충분히 자세한 신고 내용입니다.",
    report_status: "received", version: 1, created_at: now, resolved_at: null, resolution_note: null,
    listing: { id: listingId, name: "TEST 파크골프채", seller_display_name: "PUL 회원", sale_status: "selling", version: 1 },
  }, error: null })), reportKey);
  assert.equal(detail.listing.id, listingId);
});

test("resolution and moderation use separate exact RPC contracts", async () => {
  const resolutionRequest = randomUUID();
  const resolved = await resolveMarketListingReport(client(async (name, args) => {
    assert.equal(name, "resolve_market_listing_report");
    assert.equal(args.p_resolution_status, "handled");
    return { data: { report_key: reportKey, report_status: "handled", version: 2, resolved_at: now, request_id: resolutionRequest, replayed: false }, error: null };
  }), { reportKey, expectedVersion: 1, resolution: "handled", note: "운영 확인 완료", requestId: resolutionRequest });
  assert.equal(resolved.reportStatus, "handled");

  const moderationRequest = randomUUID();
  const removed = await removeMarketListingForModeration(client(async (name, args) => {
    assert.equal(name, "remove_market_listing_for_moderation");
    assert.equal(args.p_reason, "운영 정책 위반");
    return { data: { request_id: moderationRequest, listing_id: listingId, sale_status: "removed", version: 2, replayed: false, removed_storage_paths: [] }, error: null };
  }), { listingId, expectedVersion: 1, reason: "운영 정책 위반", requestId: moderationRequest });
  assert.equal(removed.status, "removed");
});

test("database errors map to stable user-safe classes", async () => {
  for (const [message, code] of [
    ["로그인이 필요합니다.", "authentication"],
    ["장터 운영 권한이 없습니다.", "permission"],
    ["이미 확인 대기 중인 판매글 신고가 있습니다.", "conflict"],
    ["판매글 신고를 찾을 수 없습니다.", "notFound"],
    ["Failed to fetch", "network"],
  ]) await assert.rejects(
    listMarketListingReportsForManagement(client(async () => ({ data: null, error: { message } }))),
    (error) => error instanceof MarketListingReportError && error.code === code,
  );
});

test("strict HTTPS authority and port boundary agrees with the database contract", () => {
  const base = { title: "TEST 연락처", category: "club", price: 10000, region: "서울",
    condition: "lightUse", tradeType: "direct", description: "TEST 연락처 경계 검증입니다.",
    publicContactMethod: "external_url", publicContactConsent: true };
  for (const value of ["https://example.com", "https://example.com/path?q=1#contact", "https://example.com:443/path", "https://[::1]:8443/path"]) {
    assert.equal(new URL(validateListingInput({ ...base, publicContactValue: value }).publicContactValue).protocol, "https:");
  }
  for (const value of ["http://example.com", "javascript:alert(1)", "data:text/plain,test", "https://", "https:///path",
    "https://.", "https://example.com:bad", "https://example.com:0", "https://example.com:65536", "https://example.com:-1",
    "https://example.com:", "https://exa mple.com", "https://exa\tmple.com", "https://exa\nmple.com",
    "https://user:pass@example.com", "https://example.com\\path", "https://example..com", "https://999.1.1.1"]) {
    assert.throws(() => validateListingInput({ ...base, publicContactValue: value }), (error) => error instanceof MarketError && error.code === "validation", value);
  }
});

function detailHandlers() {
  const source = readFileSync(new URL("../../components/market/MarketPageContent.tsx", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("MarketPageContent.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ["cancelListingDetail", "openListingDetail", "openEntry", "closeOverlay"];
  const declarations = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
      declarations.set(node.name.text, `const ${node.name.text} = ${node.initializer.getText(parsed)};`);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(declarations.size, names.length);
  const state = { detailLoading: false, busy: false, selected: null, entry: undefined, focused: false };
  const pending = [];
  const dependencies = {
    detailGenerationRef: { current: 0 }, triggerRef: { current: null },
    useCallback: (callback) => callback,
    setDetailLoading: (value) => { state.detailLoading = value; },
    setBusy: () => { throw new Error("detail must never acquire/release mutation busy"); },
    setSelectedItem: (value) => { state.selected = value; },
    setEntryDialog: (value) => { state.entry = value; },
    setStartupEntryDialog: () => {}, setConfirmation: () => {}, setError: () => {}, setMessage: () => {},
    focusBack: () => { state.focused = true; }, safeError: () => "safe error", busy: false,
    getMarketListingAction: (id) => new Promise((resolve) => pending.push({ id, resolve })),
  };
  const output = ts.transpileModule(names.map((name) => declarations.get(name)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const handlers = new Function(...Object.keys(dependencies), `${output}\nreturn {${names.join(",")}};`)(...Object.values(dependencies));
  return { ...handlers, state, pending, source };
}

test("actual detail handlers release cancelled loading and allow create/edit/close without stale data", async () => {
  const h = detailHandlers();
  assert.match(h.source, /return \(\) => \{ active = false; generationRef\.current \+= 1; cancelListingDetail\(\)/);
  const a = h.openListingDetail({ id: "A" }, {});
  assert.equal(h.state.detailLoading, true);
  h.cancelListingDetail();
  assert.equal(h.state.detailLoading, false);
  h.pending[0].resolve({ id: "A" }); await a;
  assert.equal(h.state.selected, null);
  assert.equal(h.state.busy, false);
  for (const dialog of [{ kind: "listing" }, { kind: "listing", item: { id: "B" } }]) {
    h.openEntry(dialog, {}); assert.equal(h.state.entry, dialog);
    h.closeOverlay(); assert.equal(h.state.entry, undefined); assert.equal(h.state.focused, true);
  }
  const b = h.openListingDetail({ id: "B" }, {});
  h.pending[1].resolve({ id: "B" }); await b;
  assert.deepEqual(h.state.selected, { id: "B" }); assert.equal(h.state.detailLoading, false);
});

test("actual A/B detail race cannot let A finally release B loading", async () => {
  const h = detailHandlers();
  const a = h.openListingDetail({ id: "A" }, {});
  const b = h.openListingDetail({ id: "B" }, {});
  h.pending[0].resolve({ id: "A" }); await a;
  assert.equal(h.state.detailLoading, true); assert.equal(h.state.selected, null);
  h.pending[1].resolve({ id: "B" }); await b;
  assert.equal(h.state.detailLoading, false); assert.deepEqual(h.state.selected, { id: "B" });
});

function moderationActionHarness(dbFailure = false) {
  const source = readFileSync(new URL("../../app/market/manage/listing-reports/actions.ts", import.meta.url), "utf8");
  const calls = { storage: 0, rpc: 0, revalidated: [] };
  const result = { listingId, status: "removed", version: 2, requestId, replayed: false, removedStoragePaths: ["TEST/object"] };
  const unavailableStorage = () => { calls.storage += 1; throw new Error("injected Storage outage"); };
  const modules = {
    "next/cache": { revalidatePath: (path) => calls.revalidated.push(path) },
    "@/lib/supabase/auth": { getAuthenticatedSupabaseContext: async () => ({ supabase: { storage: { from: unavailableStorage } } }) },
    "@/lib/market/storage": { removeMarketStoragePaths: unavailableStorage },
    "@/lib/market/marketListingReports": { MarketListingReportError,
      removeMarketListingForModeration: async () => {
        calls.rpc += 1;
        if (dbFailure) throw new MarketListingReportError("permission", "장터 운영 권한이 없습니다.");
        return result;
      } },
  };
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function("require", "exports", output)((name) => {
    // Catch any reintroduction of a synchronous Storage helper, regardless of its module path.
    if (/storage/i.test(name)) return { removeMarketStoragePaths: unavailableStorage };
    assert.ok(modules[name], `unexpected action dependency: ${name}`); return modules[name];
  }, exports);
  return { action: exports.removeMarketListingForModerationAction, calls, result };
}

test("actual moderation action preserves DB success and revalidates with Storage outage injected", async () => {
  const h = moderationActionHarness();
  const response = await h.action({ listingId, expectedVersion: 1, reason: "TEST 운영 정책 확인", requestId });
  assert.equal(response.ok, true); assert.equal(response.result.status, "removed");
  assert.equal(h.calls.rpc, 1); assert.equal(h.calls.storage, 0);
  assert.deepEqual(h.calls.revalidated, ["/market", "/market/manage/listing-reports"]);
});

test("actual moderation action performs no Storage cleanup or revalidation when RPC fails", async () => {
  const h = moderationActionHarness(true);
  const response = await h.action({ listingId, expectedVersion: 1, reason: "TEST 운영 정책 확인", requestId });
  assert.equal(response.ok, false); assert.equal(h.calls.rpc, 1); assert.equal(h.calls.storage, 0);
  assert.deepEqual(h.calls.revalidated, []);
});

function managementHandlers() {
  const source = readFileSync(new URL("../../components/market/manage/MarketListingReportManagementPage.tsx", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("management.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ["isCurrentDetail", "closeDetail", "loadDetail", "resolve", "moderate"];
  const declarations = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
      declarations.set(node.name.text, `const ${node.name.text} = ${node.initializer.getText(parsed)};`);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(declarations.size, names.length);
  assert.match(source, /onClick=\{closeDetail\}/);
  assert.match(source, /useEffect\(\(\) => \(\) => \{\s*detailGenerationRef\.current \+= 1;\s*detailKeyRef\.current = null;/);
  const state = { detail: null, notice: "", error: "", resolutionNote: "", moderationReason: "", refresh: 0, focus: 0, pending: 0 };
  const requests = [];
  const tasks = [];
  const deferred = (kind, input) => new Promise((resolve, reject) => requests.push({ kind, input, resolve, reject }));
  const shared = {
    detailGenerationRef: { current: 0 }, detailKeyRef: { current: null },
    listTitleRef: { current: { focus: () => { state.focus += 1; } } },
    resolutionRequestRef: { current: "" }, moderationRequestRef: { current: "" },
    setDetail: (value) => { state.detail = typeof value === "function" ? value(state.detail) : value; },
    setNotice: (value) => { state.notice = value; }, setError: (value) => { state.error = value; },
    setResolutionNote: (value) => { state.resolutionNote = value; }, setModerationReason: (value) => { state.moderationReason = value; },
    router: { refresh: () => { state.refresh += 1; } },
    startTransition: (callback) => { state.pending += 1; tasks.push(callback().finally(() => { state.pending -= 1; })); },
    getMarketListingReportDetailAction: (key) => deferred("read", key),
    removeMarketListingForModerationAction: (input) => deferred("moderate", input),
    resolveMarketListingReportAction: (input) => deferred("resolve", input),
  };
  const output = ts.transpileModule(names.map((name) => declarations.get(name)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const render = () => {
    const dependencies = { ...shared, detail: state.detail, isPending: false, resolutionNote: state.resolutionNote, moderationReason: state.moderationReason };
    return new Function(...Object.keys(dependencies), `${output}\nreturn {${names.join(",")}};`)(...Object.values(dependencies));
  };
  const open = async (key) => {
    render().loadDetail(key);
    requests.at(-1).resolve({ ok: true, detail: { reportKey: key, version: 1, listingStatus: "selling", listing: { id: key, version: 1, saleStatus: "selling" } } });
    await tasks.at(-1);
  };
  return { state, requests, tasks, render, open };
}

const moderationSuccess = { ok: true, message: "moderation saved", result: { version: 2 } };

test("management moderation success after close cannot recreate detail or steal focus", async () => {
  const h = managementHandlers(); await h.open("A"); h.render().moderate();
  const request = h.requests.at(-1); h.render().closeDetail();
  assert.equal(h.state.detail, null); assert.equal(h.state.pending, 1);
  request.resolve(moderationSuccess); await h.tasks.at(-1);
  assert.equal(h.state.detail, null); assert.equal(h.state.notice, "");
  assert.equal(h.state.focus, 1); assert.equal(h.state.refresh, 1); assert.equal(h.state.pending, 0);
});

test("management A moderation cannot overwrite B or B pending loading and feedback", async () => {
  const h = managementHandlers(); await h.open("A"); h.render().moderate();
  const a = h.requests.at(-1), taskA = h.tasks.at(-1);
  h.render().loadDetail("B"); const b = h.requests.at(-1), taskB = h.tasks.at(-1);
  h.state.error = "B feedback"; a.resolve(moderationSuccess); await taskA;
  assert.equal(h.state.pending, 1); assert.equal(h.state.error, "B feedback"); assert.equal(h.state.notice, "");
  b.resolve({ ok: true, detail: { reportKey: "B", listing: { id: "B", saleStatus: "selling" } } }); await taskB;
  assert.equal(h.state.detail.reportKey, "B"); assert.equal(h.state.detail.listing.saleStatus, "selling");
});

test("management late A success leaves an already opened B unchanged", async () => {
  const h = managementHandlers(); await h.open("A"); h.render().moderate();
  const a = h.requests.at(-1), task = h.tasks.at(-1); await h.open("B");
  const b = h.state.detail; h.state.resolutionNote = "B note";
  a.resolve(moderationSuccess); await task;
  assert.equal(h.state.detail, b); assert.equal(h.state.resolutionNote, "B note"); assert.equal(h.state.notice, "");
});

test("management current moderation updates only current detail and preserves DB success refresh", async () => {
  const h = managementHandlers(); await h.open("A"); h.render().moderate();
  h.requests.at(-1).resolve(moderationSuccess); await h.tasks.at(-1);
  assert.equal(h.state.detail.reportKey, "A"); assert.equal(h.state.detail.listing.saleStatus, "removed");
  assert.equal(h.state.detail.listing.version, 2); assert.equal(h.state.notice, moderationSuccess.message);
  assert.equal(h.state.refresh, 1); assert.equal(h.state.pending, 0);
});

test("management close and reopen of the same report still invalidates the old generation", async () => {
  const h = managementHandlers(); await h.open("A"); h.render().moderate();
  const a = h.requests.at(-1), task = h.tasks.at(-1); h.render().closeDetail(); await h.open("A");
  const current = h.state.detail; a.resolve(moderationSuccess); await task;
  assert.equal(h.state.detail, current); assert.equal(h.state.detail.listing.saleStatus, "selling"); assert.equal(h.state.notice, "");
});

test("management stale moderation errors and throws do not contaminate closed or B detail", async () => {
  for (const next of [null, "B"]) for (const throws of [false, true]) {
    const h = managementHandlers(); await h.open("A"); h.render().moderate();
    const request = h.requests.at(-1), task = h.tasks.at(-1); h.render().closeDetail();
    if (next) await h.open(next);
    h.state.error = "current feedback";
    if (throws) request.reject(new Error("network")); else request.resolve({ ok: false, message: "stale error", shouldRefresh: true });
    await task; assert.equal(h.state.detail?.reportKey ?? null, next); assert.equal(h.state.error, "current feedback"); assert.equal(h.state.pending, 0);
  }
});

test("management handled and dismissed late successes cannot close B or replace its feedback", async () => {
  for (const resolution of ["handled", "dismissed"]) {
    const h = managementHandlers(); await h.open("A"); h.render().resolve(resolution);
    const a = h.requests.at(-1), task = h.tasks.at(-1); await h.open("B");
    a.resolve({ ok: true, message: "resolved" }); await task;
    assert.equal(h.state.detail.reportKey, "B"); assert.equal(h.state.notice, ""); assert.equal(h.state.refresh, 1);
  }
});

test("management current resolve closes normally while stale resolve errors are ignored", async () => {
  const h = managementHandlers(); await h.open("A"); h.render().resolve("handled");
  h.requests.at(-1).resolve({ ok: true, message: "resolved" }); await h.tasks.at(-1);
  assert.equal(h.state.detail, null); assert.equal(h.state.notice, "resolved"); assert.equal(h.state.focus, 1);
  for (const throws of [false, true]) {
    await h.open("A"); h.render().resolve("dismissed"); const r = h.requests.at(-1), task = h.tasks.at(-1);
    h.render().closeDetail();
    if (throws) r.reject(new Error("network")); else r.resolve({ ok: false, message: "old", shouldRefresh: false });
    await task; assert.equal(h.state.detail, null); assert.equal(h.state.error, "");
  }
});
