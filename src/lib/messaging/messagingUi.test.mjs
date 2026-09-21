import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { beforeEach, afterEach, after, test } from "node:test";
import ts from "typescript";

// All identities/data below are synthetic. No remote client or network is used.
const require = createRequire(import.meta.url);
const runtime = process.env.PUL_MESSAGING_TEST_RUNTIME ?? path.join(os.tmpdir(), "pul-messaging-ui-runtime");
const { JSDOM } = createRequire(path.join(runtime, "package.json"))("jsdom");
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost:3300/messages", pretendToBeVisual: true });
for (const name of ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "FormData", "Event", "MouseEvent", "Node"]) Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react"), { act } = React, { createRoot } = require("react-dom/client"), { renderToStaticMarkup } = require("react-dom/server");
const h = React.createElement;
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", C = "33333333-3333-4333-8333-333333333333", M = "44444444-4444-4444-8444-444444444444", R = "55555555-5555-4555-8555-555555555555";
const at = "2026-09-21T01:02:03.123456+00:00", body = '<script>window.privateLeak = true</script> 한글 쪽지';
let actor = B, identity = B, available = true, manager = false, read = false, hidden = new Set(), calls = [], invalidated = [], navigation = [], override = null, authOverride = null;
let blocks = new Map();
const blockRow = (id, display = `차단 회원 ${id.slice(0, 8)}`) => ({ blocked_user_id: id, counterpart_display: display, blocked_at: at });
const listeners = new Set();
const browserErrors = [];
window.addEventListener("error", event => browserErrors.push(event.error));
const auth = {
  getUser: () => authOverride ? authOverride() : Promise.resolve({ data: { user: identity ? { id: identity } : null }, error: null }),
  onAuthStateChange: callback => { listeners.add(callback); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } }; },
};
const router = { refresh: () => navigation.push("refresh"), replace: href => navigation.push(href) };
const summary = who => ({ id: M, counterpart_display: who === A ? "받는 회원" : "보낸 회원", preview: body, at, read_at: who === B && read ? at : null, is_reply: false });
const rawDetail = who => ({ id: M, body, counterpart_user_id: who === A ? B : A, counterpart_display: "상대 회원", created_at: at, reply_to_message_id: null, is_recipient: who === B, read_at: who === B && read ? at : null });
const rawReport = () => ({ id: R, message_id: M, body, sender_display: "보낸 회원", reporter_display: "받은 회원", reason: "spam", detail: "신고 설명", status: "open", created_at: at, message_created_at: at, resolved_at: null });
const good = data => ({ data, error: null }), bad = message => ({ data: null, error: { message } });
async function rpc(name, args = {}) {
  const who = actor; calls.push({ name, args, actor: who });
  if (override) return override(name, args);
  if (!available) return bad("messaging_account_unavailable");
  if (name === "get_messaging_unread_count") return good(who === B && !read && !hidden.has(B) ? 1 : 0);
  if (name === "list_messaging_inbox" || name === "list_messaging_sent") return good({ items: !hidden.has(who) && (name.endsWith("inbox") ? who === B : who === A) ? [summary(who)] : [], has_more: false, next_cursor: null });
  if (name === "get_messaging_message") {
    assert.equal(args.p_mark_read, false, "SSR and action relation lookup must be read-only");
    return [A, B].includes(who) && args.p_message_id === M && !hidden.has(who) ? good(rawDetail(who)) : bad("messaging_not_found");
  }
  if (name === "mark_messaging_message_read") { if (who !== B || args.p_message_id !== M || hidden.has(B)) return bad("messaging_not_found"); read = true; return good({ id: M, read_at: at }); }
  if (name === "hide_messaging_message") { if (![A, B].includes(who)) return bad("messaging_not_found"); hidden.add(who); return good({ id: M, hidden: true }); }
  if (name === "set_messaging_block") {
    const own = blocks.get(who) ?? new Map(); blocks.set(who, own);
    if (args.p_blocked) own.set(args.p_user_id, blockRow(args.p_user_id)); else own.delete(args.p_user_id);
    return good({ blocked: args.p_blocked });
  }
  if (name === "list_messaging_blocks") {
    const rows = [...(blocks.get(who)?.values() ?? [])].sort((a, b) => b.blocked_user_id.localeCompare(a.blocked_user_id))
      .filter(row => !args.p_cursor_id || row.blocked_user_id < args.p_cursor_id);
    const items = rows.slice(0, args.p_limit), more = rows.length > args.p_limit, last = items.at(-1);
    return good({ items, has_more: more, next_cursor: more ? { at: last.blocked_at, id: last.blocked_user_id } : null });
  }
  if (name === "send_messaging_message") return [A, B].includes(args.p_recipient_id) && !blocks.get(who)?.has(args.p_recipient_id) && !blocks.get(args.p_recipient_id)?.has(who) ? good({ id: M, created_at: at }) : bad("messaging_recipient_unavailable");
  if (name === "reply_messaging_message") return [A, B].includes(who) && !hidden.has(who) && args.p_message_id === M ? good({ id: M, created_at: at }) : bad("messaging_not_found");
  if (name === "submit_messaging_report") return who === B ? good({ id: R, duplicate: false }) : bad("messaging_permission");
  if (["list_messaging_reports", "get_messaging_report", "resolve_messaging_report"].includes(name)) {
    if (!manager) return bad("messaging_permission");
    if (name === "list_messaging_reports") return good({ items: [{ id: R, at, reason: "spam", status: "open", body: "MUST NOT LEAK" }], has_more: false, next_cursor: null });
    if (args.p_report_id !== R) return bad("messaging_not_found");
    return good(name === "get_messaging_report" ? rawReport() : { id: R, status: "resolved" });
  }
  throw new Error("Unexpected synthetic RPC " + name);
}
const cache = new Map();
const repo = path.resolve(new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
function load(file) {
  const absolute = path.resolve(repo, file);
  if (cache.has(absolute)) return cache.get(absolute);
  const exports = {}; cache.set(absolute, exports);
  const output = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", "module", output)(name => {
    if (name === "server-only") return {};
    if (name === "@/lib/supabase/auth") return { getAuthenticatedSupabaseContext: async () => actor ? { userId: actor, supabase: { rpc } } : null };
    if (name === "@/lib/supabase/client") return { createClient: () => ({ auth }) };
    if (name === "next/navigation") return { useRouter: () => router, usePathname: () => "/messages", redirect: href => { throw Object.assign(new Error("redirect"), { href }); } };
    if (name === "next/cache") return { revalidatePath: (...args) => invalidated.push(args) };
    if (name === "next/link") return { __esModule: true, default: ({ prefetch, children, ...props }) => h("a", { ...props, "data-prefetch": String(prefetch) }, children) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.join(repo, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
      const target = [base + ".ts", base + ".tsx"].find(existsSync); assert.ok(target, name); return load(target);
    }
    return require(name);
  }, exports, { exports });
  return exports;
}
const ui = load("src/components/messaging/MessagingForms.tsx"), views = load("src/components/messaging/MessagingViews.tsx"), pages = load("src/components/messaging/MessagingPages.tsx"), actions = load("src/app/messages/actions.ts"), domain = load("src/lib/messaging/messaging.ts"), helpers = load("src/lib/messaging/messagingUi.ts");
const { MessagingSessionBoundary } = load("src/components/messaging/MessagingSessionBoundary.tsx"), { MessagingNavLink } = load("src/components/messaging/MessagingNavLink.tsx");
let root; const host = document.getElementById("root");
async function unmount() { if (root) { await act(async () => root.unmount()); root = null; } }
async function mount(element) { await unmount(); root = createRoot(host); await act(async () => root.render(element)); }
const click = element => { assert.ok(element, "button exists"); return act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true }))); };
const button = text => [...host.querySelectorAll("button")].find(x => x.textContent === text);
const submit = () => act(async () => host.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
async function value(element, text) { const prototype = element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype; await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, text); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
const numberOf = name => calls.filter(x => x.name === name).length;
beforeEach(async () => {
  await unmount(); actor = identity = B; available = true; manager = read = false; hidden = new Set(); calls = []; invalidated = []; navigation = []; override = authOverride = null;
  blocks = new Map();
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  window.confirm = () => true;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => { assert.deepEqual(browserErrors.splice(0), [], "No uncaught browser event errors"); });
after(async () => { await unmount(); dom.window.close(); });

test("Inbox/Sent display, plain-text preview, cursor precision, empty and hidden states", async () => {
  const inbox = await domain.listMessageInbox({ rpc });
  await mount(h(views.MailboxView, { page: inbox, box: "inbox" })); assert.match(host.textContent, /안 읽음/); assert.match(host.textContent, /보낸 회원/); assert.equal(host.querySelector("script"), null); assert.equal(host.querySelector("a").dataset.prefetch, "false");
  read = true; await mount(h(views.MailboxView, { page: await domain.listMessageInbox({ rpc }), box: "inbox" })); assert.doesNotMatch(host.textContent, /안 읽음/);
  hidden.add(B); await mount(h(views.MailboxView, { page: await domain.listMessageInbox({ rpc }), box: "inbox" })); assert.match(host.textContent, /받은 쪽지가 없습니다/);
  actor = A; const sent = await domain.listMessageSent({ rpc }); sent.hasMore = true; sent.nextCursor = { at, id: M };
  await mount(h(views.MailboxView, { page: sent, box: "sent" })); assert.match(host.textContent, /받는 회원/); assert.doesNotMatch(host.textContent, /안 읽음|읽음/);
  const next = [...host.querySelectorAll("a")].find(x => x.textContent.includes("20개")); assert.equal(new URL(next.href).searchParams.get("at"), at);
  hidden.add(A); await mount(h(views.MailboxView, { page: await domain.listMessageSent({ rpc }), box: "sent" })); assert.match(host.textContent, /보낸 쪽지가 없습니다/);
});
test("SSR/prefetch detail performs zero read mutations; actual recipient mount invokes exactly one read even in StrictMode", async () => {
  const element = await pages.DetailPage({ params: Promise.resolve({ messageId: M }) });
  renderToStaticMarkup(element); assert.equal(numberOf("mark_messaging_message_read"), 0); assert.equal(read, false);
  await mount(h(React.StrictMode, null, element)); assert.equal(numberOf("mark_messaging_message_read"), 1); assert.equal(read, true); assert.equal(host.querySelector("script"), null); assert.match(host.textContent, /<script>/);
  assert.ok(invalidated.some(([p]) => p === "/messages"));
});
test("Sender detail never marks recipient read; C direct URL denies; anonymous redirects", async () => {
  actor = identity = A; await mount(await pages.DetailPage({ params: Promise.resolve({ messageId: M }) })); assert.match(host.textContent, /보낸 쪽지/); assert.equal(button("신고"), undefined); assert.equal(numberOf("mark_messaging_message_read"), 0);
  actor = identity = C; await mount(await pages.DetailPage({ params: Promise.resolve({ messageId: M }) })); assert.doesNotMatch(host.textContent, /window.privateLeak/); assert.match(host.textContent, /찾을 수 없습니다/);
  actor = null; await assert.rejects(pages.ComposePage(), error => error.href === "/login?next=%2Fmessages%2Fnew");
});
test("Actual read completion refreshes the mounted unread badge from 1 to 0; 100 renders 99+", async () => {
  await mount(h(MessagingNavLink, { variant: "desktop" })); assert.match(host.textContent, /쪽지1/);
  await act(async () => root.render(h(React.Fragment, null, h(MessagingNavLink, { variant: "desktop" }), h(ui.MarkMessageReadOnView, { messageId: M })))); assert.equal(host.textContent, "쪽지");
  assert.equal(helpers.badgeText(99), "99"); assert.equal(helpers.badgeText(100), "99+");
});
test("Compose validates recipient/body, safe unavailable errors and sends allowlisted fields", async () => {
  await mount(h(ui.MessageComposer, { ownCode: B })); await submit(); assert.equal(numberOf("send_messaging_message"), 0);
  await value(host.querySelector("input"), C); await value(host.querySelector("textarea"), "가".repeat(2001)); await submit(); assert.equal(numberOf("send_messaging_message"), 0);
  await value(host.querySelector("textarea"), " 문의 "); await submit(); assert.match(host.textContent, /현재 이 회원에게/);
  await value(host.querySelector("input"), A); await submit(); assert.ok(navigation.includes(`/messages/${M}`));
  const call = calls.filter(x => x.name === "send_messaging_message").at(-1); assert.deepEqual(Object.keys(call.args).sort(), ["p_body", "p_recipient_id", "p_request_id"]); assert.equal(call.args.p_body, "문의");
});
test("Pending double submit is suppressed; ambiguous retry retains request ID and payload", async () => {
  let release; override = () => new Promise(resolve => { release = resolve; });
  await mount(h(ui.MessageComposer)); await value(host.querySelector("input"), A); await value(host.querySelector("textarea"), "재시도 본문");
  await submit(); await submit(); assert.equal(numberOf("send_messaging_message"), 1); assert.equal(button("전송 중…").disabled, true);
  await act(async () => release(bad("unexpected SQL SECRET"))); assert.equal(host.textContent.includes("SECRET"), false); assert.equal(host.querySelector("textarea").disabled, true);
  override = () => good({ id: M, created_at: at }); await submit();
  const sends = calls.filter(x => x.name === "send_messaging_message"); assert.equal(sends.length, 2); assert.deepEqual(sends[0].args, sends[1].args);
});
test("Reply supplies only original ID; nonparticipant/hidden/blocked actions fail safely", async () => {
  await mount(h(ui.MessageComposer, { reply: { id: M, display: "상대" } })); assert.equal(host.querySelector("input"), null); await value(host.querySelector("textarea"), "답장"); await submit();
  assert.deepEqual(Object.keys(calls.find(x => x.name === "reply_messaging_message").args).sort(), ["p_body", "p_message_id", "p_request_id"]);
  for (const who of [C, B]) { actor = who; if (who === B) hidden.add(B); const result = await actions.replyMessageAction({ messageId: M, body: "답장", requestId: R, recipientId: A }); assert.equal(result.ok, false); }
  actor = B; hidden.clear(); override = () => bad("messaging_recipient_unavailable"); const result = await actions.replyMessageAction({ messageId: M, body: "답장", requestId: R }); assert.equal(result.code, "recipient");
});
test("Hide confirmation affects only own box and returns trusted destination", async () => {
  read = true; await mount(h(ui.MessageDetailView, { message: await domain.getMessage({ rpc }, M) }));
  window.confirm = text => { assert.match(text, /상대방의 쪽지함에서는 삭제되지 않습니다/); return false; }; await click(button("내 쪽지함에서 삭제")); assert.equal(numberOf("hide_messaging_message"), 0);
  window.confirm = () => true; await click(button("내 쪽지함에서 삭제")); assert.ok(navigation.includes("/messages")); assert.equal(hidden.has(A), false);
  actor = A; const result = await actions.hideMessageAction(M); assert.equal(result.data.href, "/messages/sent");
});
test("Block/unblock uses DB-derived counterpart, confirmation, and keeps existing-message explanation", async () => {
  read = true; await mount(h(ui.MessageDetailView, { message: await domain.getMessage({ rpc }, M) })); assert.match(host.textContent, /기존 쪽지는 유지/);
  let confirmations = 0; window.confirm = () => { confirmations++; return true; };
  await click(button("이 회원 차단")); await click(button("내 차단 해제")); assert.equal(confirmations, 2);
  assert.deepEqual(calls.filter(x => x.name === "set_messaging_block").map(x => x.args), [{ p_user_id: A, p_blocked: true }, { p_user_id: A, p_blocked: false }]);
  actor = C; assert.equal((await actions.setMessageBlockAction(M, true)).ok, false); assert.equal(numberOf("set_messaging_block"), 2);
});
test("Recipient report form validates detail, acknowledges duplicate and never automatically hides", async () => {
  await mount(h(ui.MessageReportForm, { messageId: M })); await value(host.querySelector("textarea"), "가".repeat(1001)); await submit(); assert.equal(numberOf("submit_messaging_report"), 0);
  await value(host.querySelector("textarea"), "확인 부탁드립니다"); await submit(); assert.match(host.textContent, /신고를 접수했습니다/); assert.equal(numberOf("hide_messaging_message"), 0);
  override = () => good({ id: R, duplicate: true }); await submit(); assert.match(host.textContent, /이미 접수된 신고/);
  override = null; actor = A; assert.equal((await actions.submitMessageReportAction({ messageId: M, reason: "spam" })).ok, false);
});
test("Report page permission, body-free list, prefetch-free audited open and resolve", async () => {
  await mount(await pages.ReportsPage({ searchParams: Promise.resolve({}) })); assert.match(host.textContent, /권한/); assert.equal(numberOf("get_messaging_report"), 0);
  manager = true; await mount(await pages.ReportsPage({ searchParams: Promise.resolve({}) })); assert.doesNotMatch(host.textContent, /MUST NOT LEAK|privateLeak/);
  const element = await pages.ReportDetailPage({ params: Promise.resolve({ reportId: R }) }); renderToStaticMarkup(element); assert.equal(numberOf("get_messaging_report"), 0);
  await mount(h(React.StrictMode, null, element)); assert.equal(numberOf("get_messaging_report"), 1); assert.match(host.textContent, /<script>/); assert.equal(host.querySelector("script"), null);
  await click(button("처리 완료로 표시")); assert.equal(numberOf("resolve_messaging_report"), 1); assert.match(host.textContent, /처리 완료로 표시했습니다/);
  manager = false; assert.equal((await actions.openMessageReportAction(R)).ok, false);
});
test("Suspended/withdrawn-equivalent guard denies compose, list, detail, badge and actions", async () => {
  available = false;
  for (const element of [await pages.ComposePage(), await pages.MailboxPage({ box: "inbox", searchParams: Promise.resolve({}) }), await pages.DetailPage({ params: Promise.resolve({ messageId: M }) })]) { await mount(element); assert.match(host.textContent, /현재 계정/); assert.doesNotMatch(host.textContent, /privateLeak/); }
  assert.equal((await actions.getMessagingBadgeAction()).ok, false);
  assert.equal((await actions.sendMessageAction({ recipientId: A, body: "본문", requestId: R })).ok, false);
});
test("Account switch and late identity replies cannot keep old private DOM or badge", async () => {
  await mount(h(MessagingSessionBoundary, { viewerId: B }, h("p", null, "B PRIVATE BODY"))); assert.match(host.textContent, /B PRIVATE BODY/);
  await act(async () => { identity = actor = A; for (const callback of listeners) callback("SIGNED_IN", { user: { id: A } }); }); assert.doesNotMatch(host.textContent, /B PRIVATE BODY/);
  let release; authOverride = () => new Promise(resolve => { release = resolve; });
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => { for (const callback of listeners) callback("SIGNED_OUT", null); release({ data: { user: { id: B } }, error: null }); }); assert.doesNotMatch(host.textContent, /B PRIVATE BODY/);
  authOverride = null; actor = identity = B; await mount(h(MessagingNavLink, { variant: "desktop" })); assert.match(host.textContent, /쪽지1/);
  await act(async () => { identity = actor = A; for (const callback of listeners) callback("SIGNED_IN", { user: { id: A } }); }); assert.equal(host.textContent, "쪽지");
});
test("Fresh A/B server renders use each request context; no cross-user mailbox/detail reuse", async () => {
  actor = identity = A; await mount(await pages.MailboxPage({ box: "inbox", searchParams: Promise.resolve({}) })); assert.match(host.textContent, /받은 쪽지가 없습니다/);
  actor = identity = B; await mount(await pages.MailboxPage({ box: "inbox", searchParams: Promise.resolve({}) })); assert.match(host.textContent, /보낸 회원/);
  const renders = calls.filter(x => x.name === "list_messaging_inbox"); assert.deepEqual(renders.map(x => x.actor), [A, B]);
  actor = null; const before = calls.length; assert.equal((await actions.markMessageReadAction(M)).code, "login"); assert.equal(calls.length, before);
});
test("Hidden document mount does not mark read or audit report until visible", async () => {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  manager = true; await mount(h(React.Fragment, null, h(ui.MarkMessageReadOnView, { messageId: M }), h(ui.MessageReportDetailView, { reportId: R })));
  assert.equal(numberOf("mark_messaging_message_read"), 0); assert.equal(numberOf("get_messaging_report"), 0);
  await act(async () => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  assert.equal(numberOf("mark_messaging_message_read"), 1); assert.equal(numberOf("get_messaging_report"), 1);
});
test("Only the visible desktop/mobile navigation requests a badge", async () => {
  const mediaListeners = new Set(); let desktop = true;
  window.matchMedia = () => ({ get matches() { return desktop; }, addEventListener: (_name, fn) => mediaListeners.add(fn), removeEventListener: (_name, fn) => mediaListeners.delete(fn) });
  await mount(h(React.Fragment, null, h(MessagingNavLink, { variant: "desktop" }), h(MessagingNavLink, { variant: "mobile" })));
  assert.equal(numberOf("get_messaging_unread_count"), 1);
  await act(async () => { desktop = false; for (const listener of mediaListeners) listener(); });
  assert.equal(numberOf("get_messaging_unread_count"), 2); assert.equal(host.querySelectorAll("a")[0].textContent, "쪽지"); assert.equal(host.querySelectorAll("a")[1].textContent, "쪽지1");
});
test("A completed old compose request cannot navigate after private view unmount/account switch", async () => {
  let release; override = () => new Promise(resolve => { release = resolve; });
  await mount(h(ui.MessageComposer)); await value(host.querySelector("input"), A); await value(host.querySelector("textarea"), "대기 중인 작성"); await submit();
  await unmount(); actor = identity = C;
  await act(async () => release(good({ id: M, created_at: at })));
  assert.equal(navigation.includes(`/messages/${M}`), false);
});

async function visibility(state) {
  await act(async () => {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test("R01-A: compose draft survives same-subject visibility, focus and token refresh", async () => {
  await mount(await pages.ComposePage());
  await value(host.querySelector("input"), A); await value(host.querySelector("textarea"), "작성 중인 본문");
  const original = host.querySelector("textarea");
  await visibility("hidden"); assert.ok(original.closest("[hidden][inert]"));
  await visibility("visible");
  let release; authOverride = () => new Promise(resolve => { release = resolve; });
  await act(async () => window.dispatchEvent(new Event("focus")));
  assert.ok(original.closest("[hidden]"));
  await act(async () => release({ data: { user: { id: B } }, error: null }));
  authOverride = null;
  await act(async () => { for (const callback of listeners) callback("TOKEN_REFRESHED", { user: { id: B } }); });
  assert.equal(host.querySelector("textarea"), original);
  assert.equal(original.value, "작성 중인 본문"); assert.equal(host.querySelector("input").value, A);
  assert.equal(original.closest("[hidden]"), null);
  authOverride = () => Promise.reject(new Error("temporary identity transport failure"));
  await act(async () => window.dispatchEvent(new Event("focus")));
  assert.equal(host.querySelector("textarea"), original); assert.ok(original.closest("[hidden]"));
  authOverride = null; await act(async () => window.dispatchEvent(new Event("focus")));
  assert.equal(original.value, "작성 중인 본문"); assert.equal(original.closest("[hidden]"), null);
});

test("R01-B: reply composer and original message survive a same-subject tab round trip", async () => {
  read = true; await mount(await pages.DetailPage({ params: Promise.resolve({ messageId: M }) }));
  await click(button("답장")); await value(host.querySelector("textarea"), "작성 중인 답장");
  const original = host.querySelector("textarea");
  await visibility("hidden"); await visibility("visible");
  assert.equal(host.querySelector("textarea"), original); assert.equal(original.value, "작성 중인 답장");
  await submit(); assert.equal(calls.find(x => x.name === "reply_messaging_message").args.p_message_id, M);
});

test("R01-C: ambiguous compose and reply retries retain the complete request across visibility changes", async () => {
  for (const replying of [false, true]) {
    override = null;
    await mount(h(MessagingSessionBoundary, { viewerId: B }, h(ui.MessageComposer, replying ? { reply: { id: M, display: "상대" } } : {})));
    if (!replying) await value(host.querySelector("input"), A);
    await value(host.querySelector("textarea"), "같은 요청 내용");
    override = () => bad("unknown transport result"); await submit();
    const name = replying ? "reply_messaging_message" : "send_messaging_message";
    const original = calls.filter(x => x.name === name).at(-1).args;
    await visibility("hidden"); await visibility("visible");
    assert.ok(button("같은 요청 다시 확인")); assert.equal(host.querySelector("textarea").disabled, true);
    override = () => good({ id: M, created_at: at }); await submit();
    assert.deepEqual(calls.filter(x => x.name === name).at(-1).args, original);
    await value(host.querySelector("textarea"), "다음 새 쪽지"); await submit();
    assert.notEqual(calls.filter(x => x.name === name).at(-1).args.p_request_id, original.p_request_id);
  }
});

test("R01-D: logout and a new subject destroy the old draft and retry identity", async () => {
  actor = identity = A; await mount(await pages.ComposePage());
  await value(host.querySelector("input"), B); await value(host.querySelector("textarea"), "A PRIVATE DRAFT");
  override = () => bad("unknown result"); await submit();
  const oldRequest = calls.find(x => x.name === "send_messaging_message").args.p_request_id;
  await act(async () => { actor = identity = null; for (const callback of listeners) callback("SIGNED_OUT", null); });
  assert.equal(host.querySelector("textarea"), null); assert.doesNotMatch(host.textContent, /A PRIVATE DRAFT/);
  actor = identity = B; override = null;
  const nextPage = await pages.ComposePage(); await act(async () => root.render(nextPage));
  assert.equal(host.querySelector("input").value, ""); assert.equal(host.querySelector("textarea").value, "");
  assert.equal(button("같은 요청 다시 확인"), undefined);
  await value(host.querySelector("input"), A); await value(host.querySelector("textarea"), "B NEW DRAFT"); await submit();
  assert.notEqual(calls.filter(x => x.name === "send_messaging_message").at(-1).args.p_request_id, oldRequest);
});

test("R01-E: an old subject's late send cannot alter the new subject's mounted composer", async () => {
  actor = identity = A; await mount(await pages.ComposePage());
  let release; override = name => name === "send_messaging_message" ? new Promise(resolve => { release = resolve; }) : good(0);
  await value(host.querySelector("input"), B); await value(host.querySelector("textarea"), "OLD REQUEST"); await submit();
  await act(async () => { actor = identity = B; for (const callback of listeners) callback("SIGNED_IN", { user: { id: B } }); });
  assert.equal(host.querySelector("textarea"), null);
  const nextPage = await pages.ComposePage(); await act(async () => root.render(nextPage));
  await value(host.querySelector("textarea"), "NEW SUBJECT DRAFT");
  await act(async () => release(good({ id: M, created_at: at })));
  assert.equal(host.querySelector("textarea").value, "NEW SUBJECT DRAFT");
  assert.equal(navigation.includes(`/messages/${M}`), false);
});

test("R01: pending send remains one request across a same-subject tab round trip", async () => {
  await mount(await pages.ComposePage());
  let release; override = () => new Promise(resolve => { release = resolve; });
  await value(host.querySelector("input"), A); await value(host.querySelector("textarea"), "대기 중"); await submit();
  await visibility("hidden"); await visibility("visible");
  assert.equal(button("전송 중…").disabled, true); await submit();
  assert.equal(numberOf("send_messaging_message"), 1);
  await act(async () => release(good({ id: M, created_at: at })));
  assert.ok(navigation.includes(`/messages/${M}`));
});

test("R01: retained read/audit clients wait for identity verification and reuse their requests", async () => {
  manager = true;
  await mount(h(MessagingSessionBoundary, { viewerId: B }, h("p", null, "ready")));
  await visibility("hidden");
  await act(async () => root.render(h(MessagingSessionBoundary, { viewerId: B }, h(React.Fragment, null,
    h(ui.MarkMessageReadOnView, { messageId: M }), h(ui.MessageReportDetailView, { reportId: R })))));
  assert.equal(numberOf("mark_messaging_message_read"), 0); assert.equal(numberOf("get_messaging_report"), 0);
  let release; authOverride = () => new Promise(resolve => { release = resolve; });
  await visibility("visible");
  assert.equal(numberOf("mark_messaging_message_read"), 0); assert.equal(numberOf("get_messaging_report"), 0);
  await act(async () => release({ data: { user: { id: B } }, error: null }));
  assert.equal(numberOf("mark_messaging_message_read"), 1); assert.equal(numberOf("get_messaging_report"), 1);
  authOverride = null; await visibility("hidden"); await visibility("visible");
  assert.equal(numberOf("mark_messaging_message_read"), 1); assert.equal(numberOf("get_messaging_report"), 1);
});

test("R02: final message hide and fresh page retain a persistent unblock path without exposing hidden content", async () => {
  actor = identity = A;
  assert.equal((await actions.setMessageBlockAction(M, true)).ok, true);
  assert.equal((await actions.hideMessageAction(M)).ok, true);
  await mount(await pages.MailboxPage({ box: "sent", searchParams: Promise.resolve({}) }));
  assert.match(host.textContent, /보낸 쪽지가 없습니다/); assert.equal(button("내 차단 해제"), undefined);
  assert.equal((await actions.setMessageBlockAction(M, false)).code, "missing");
  assert.equal(numberOf("set_messaging_block"), 1, "The hidden-message detail path still refuses access");
  await unmount(); calls = [];
  await mount(await pages.BlockedPage({ searchParams: Promise.resolve({}) }));
  assert.match(host.textContent, /차단 회원 22222222/); assert.doesNotMatch(host.textContent, /privateLeak/);
  assert.equal(numberOf("get_messaging_message"), 0);
  await click(button("차단 해제")); assert.equal(button("차단 해제"), undefined); assert.match(host.textContent, /차단한 회원이 없습니다/);
  assert.ok(invalidated.some(([route]) => route === "/messages/blocked"));
  assert.equal((await actions.sendMessageAction({ recipientId: B, body: "새 쪽지", requestId: R })).ok, true);
  actor = B; assert.equal((await actions.sendMessageAction({ recipientId: A, body: "새 답신", requestId: R })).ok, true);
  actor = A; await assert.rejects(domain.getMessage({ rpc }, M), error => error.code === "missing");
});

test("Blocked page renders only own safe DTO, empty state and private navigation without read side effects", async () => {
  actor = identity = A;
  blocks.set(A, new Map([[B, { ...blockRow(B, '<img src=x onerror=alert(1)>'), email: 'PRIVATE EMAIL', body }], [C, blockRow(C)]]));
  blocks.set(C, new Map([[A, blockRow(A)]]));
  const element = await pages.BlockedPage({ searchParams: Promise.resolve({}) });
  renderToStaticMarkup(element); await mount(element);
  assert.equal(host.querySelectorAll("li").length, 2); assert.equal(host.querySelector("img"), null);
  assert.match(host.textContent, /<img src=x/); assert.doesNotMatch(host.textContent, /PRIVATE EMAIL|privateLeak/);
  assert.equal(host.querySelector('a[aria-current="page"]').getAttribute("href"), "/messages/blocked");
  assert.ok([...host.querySelectorAll("a")].every(link => link.dataset.prefetch === "false"));
  assert.deepEqual(calls.map(call => call.name), ["list_messaging_blocks"]);
  assert.deepEqual(calls[0].args, { p_limit: 20, p_cursor_at: null, p_cursor_id: null });
  actor = identity = B; await mount(await pages.BlockedPage({ searchParams: Promise.resolve({}) }));
  assert.match(host.textContent, /차단한 회원이 없습니다/); assert.equal(host.querySelectorAll("li").length, 0);
});

test("Blocked private page and action enforce login/account guard and reject malformed cursor", async () => {
  actor = null; await assert.rejects(pages.BlockedPage({ searchParams: Promise.resolve({}) }), error => error.href === "/login?next=%2Fmessages%2Fblocked");
  assert.equal((await actions.unblockMessageUserAction(A)).code, "login"); assert.equal(calls.length, 0);
  actor = identity = B; available = false;
  await mount(await pages.BlockedPage({ searchParams: Promise.resolve({}) })); assert.match(host.textContent, /현재 계정/);
  assert.equal((await actions.unblockMessageUserAction(A)).code, "account");
  available = true; calls = [];
  for (const query of [{ at }, { at, id: "bad" }, { at: [at], id: A }]) {
    await mount(await pages.BlockedPage({ searchParams: Promise.resolve(query) })); assert.match(host.textContent, /입력을 확인/);
  }
  assert.equal(calls.length, 0);
});

test("Blocked list uses bounded 20-row pages and preserves a microsecond cursor without duplicates", async () => {
  actor = identity = A;
  const targets = Array.from({ length: 23 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`);
  blocks.set(A, new Map(targets.map(id => [id, blockRow(id, `회원 ${id.slice(-2)}`)])));
  await mount(await pages.BlockedPage({ searchParams: Promise.resolve({}) }));
  const first = [...host.querySelectorAll("li p.font-bold")].map(row => row.textContent); assert.equal(first.length, 20);
  const link = [...host.querySelectorAll("a")].find(node => node.textContent === "다음 차단 회원 20명 보기");
  const query = Object.fromEntries(new URL(link.href).searchParams); assert.equal(query.at, at);
  await mount(await pages.BlockedPage({ searchParams: Promise.resolve(query) }));
  const second = [...host.querySelectorAll("li p.font-bold")].map(row => row.textContent);
  assert.equal(second.length, 3); assert.equal(new Set([...first, ...second]).size, 23);
  assert.equal(calls.at(-1).args.p_limit, 20); assert.equal(calls.at(-1).args.p_cursor_at, at);
  assert.equal([...host.querySelectorAll("a")].some(node => node.textContent === "다음 차단 회원 20명 보기"), false);
  for (let i = 0; i < 3; i++) await click(button("차단 해제"));
  assert.match(host.textContent, /이 페이지에 표시할 차단 회원이 없습니다/);
  assert.equal(blocks.get(A).size, 20, "Earlier pages still contain blocks");
});

test("Unblock confirmation, pending guard, accessible labels, safe error and retry preserve the row until success", async () => {
  blocks.set(B, new Map([[A, blockRow(A, "확인할 회원")]]));
  await mount(await pages.BlockedPage({ searchParams: Promise.resolve({}) }));
  const target = button("차단 해제"); target.focus(); assert.equal(document.activeElement, target);
  assert.equal(target.getAttribute("aria-label"), "확인할 회원 차단 해제");
  window.confirm = () => false; await click(target); assert.equal(numberOf("set_messaging_block"), 0);
  window.confirm = () => true; let release; override = () => new Promise(resolve => { release = resolve; });
  await click(target); await click(target); assert.equal(target.disabled, true); assert.equal(numberOf("set_messaging_block"), 1);
  assert.match(host.querySelector('[role="status"]').textContent, /해제 중/);
  await act(async () => release(bad("SQL SECRET"))); assert.ok(button("차단 해제")); assert.doesNotMatch(host.textContent, /SECRET/); assert.ok(host.querySelector('[role="alert"]'));
  override = null; await click(button("차단 해제")); assert.equal(button("차단 해제"), undefined); assert.match(host.textContent, /내 차단을 해제했습니다/);
  assert.ok(navigation.includes("refresh"));
});

test("Unblock action accepts only the target, validates UUID and cannot remove another actor's relation", async () => {
  actor = A; blocks.set(B, new Map([[C, blockRow(C)]]));
  assert.equal((await actions.unblockMessageUserAction("bad")).code, "invalid"); assert.equal(calls.length, 0);
  assert.equal((await actions.unblockMessageUserAction(C, { actorId: B })).ok, true);
  assert.equal(blocks.get(B).has(C), true); assert.deepEqual(calls[0], { name: "set_messaging_block", args: { p_user_id: C, p_blocked: false }, actor: A });
  assert.equal(numberOf("get_messaging_message"), 0);
});

test("Blocked view survives same-account visibility, clears on switch and ignores an old unblock response", async () => {
  actor = identity = A; blocks.set(A, new Map([[B, blockRow(B, "A PRIVATE BLOCK")]]));
  await mount(await pages.BlockedPage({ searchParams: Promise.resolve({}) }));
  const row = host.querySelector("li"); await visibility("hidden"); assert.ok(row.closest("[hidden][inert]"));
  await visibility("visible"); assert.equal(host.querySelector("li"), row);
  let release; override = () => new Promise(resolve => { release = resolve; }); await click(button("차단 해제"));
  await act(async () => { actor = identity = B; for (const callback of listeners) callback("SIGNED_IN", { user: { id: B } }); });
  assert.doesNotMatch(host.textContent, /A PRIVATE BLOCK/); override = null;
  const next = await pages.BlockedPage({ searchParams: Promise.resolve({}) }); await act(async () => root.render(next));
  const refreshes = navigation.length;
  await act(async () => release(good({ blocked: false })));
  assert.equal(navigation.length, refreshes); assert.doesNotMatch(host.textContent, /A PRIVATE BLOCK|내 차단을 해제했습니다/);
  assert.match(host.textContent, /차단한 회원이 없습니다/);
});

// Opt-in actual DB transport for the same mounted components/actions. Uses only
// a new disposable local project and synthetic identities, never the linked DB.
if (process.env.PUL_MESSAGING_DB_FLOW === "1") test("R02 actual UI/action + disposable DB: hide, fresh session, list, unblock, bidirectional send", async () => {
  const { startMarketTestEnvironment, redact } = await import("../market/marketTestEnvironment.mjs");
  const { randomUUID } = await import("node:crypto");
  const env = await startMarketTestEnvironment({ port: 55501 });
  const literal = value => value === null ? "null" : "'" + String(value).replaceAll("'", "''") + "'";
  const checked = query => { const result = env.sql(query); assert.equal(result.status, 0, redact(result.stderr)); return result.stdout.trim(); };
  try {
    for (const filename of ["20261004000100_pul_sec01_public_create_limits.sql", "20261005000100_pul_sec02_content_moderation.sql", "20261006000100_pul_common_messaging_foundation.sql", "20261007000100_pul_messaging_block_list_read.sql"]) {
      checked(`begin; ${readFileSync(path.join(repo, "supabase/migrations", filename), "utf8")} commit;`);
    }
    checked(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
      values ${[A,B,C].map(id => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${id}@example.invalid','',now(),now(),now())`).join(",")};
      insert into public.consent_records(user_id,consent_type,consent_version,decision)
      select u::uuid,t,v,'granted' from unnest(array['${A}','${B}','${C}']) u
      cross join (values('terms_required','terms-dev-v1'),('privacy_required','privacy-dev-v1')) c(t,v);
      update public.user_profiles set nickname='R02 실제 차단 회원',profile_visibility='public' where user_id='${B}';`);
    const signatures = {
      send_messaging_message: { p_recipient_id: "uuid", p_body: "text", p_request_id: "uuid" },
      get_messaging_message: { p_message_id: "uuid", p_mark_read: "boolean" },
      hide_messaging_message: { p_message_id: "uuid" },
      set_messaging_block: { p_user_id: "uuid", p_blocked: "boolean" },
      list_messaging_blocks: { p_limit: "integer", p_cursor_at: "timestamptz", p_cursor_id: "uuid" },
      list_messaging_sent: { p_limit: "integer", p_cursor_at: "timestamptz", p_cursor_id: "uuid" },
    };
    override = (name, args) => {
      assert.ok(Object.hasOwn(signatures, name)); const signature = signatures[name];
      assert.deepEqual(Object.keys(args).sort(), Object.keys(signature).sort());
      // Each env.sql opens a new psql connection. Nothing retains prior auth/body state.
      const result = env.sql(`set request.jwt.claim.sub=${literal(actor)}; set role authenticated;
        select public.${name}(${Object.entries(signature).map(([key,type]) => `${key}=>${literal(args[key])}::${type}`).join(",")});`);
      return result.status === 0 ? good(JSON.parse(result.stdout.trim())) : bad(result.stderr.match(/messaging_[a-z_]+/)?.[0] ?? "local_transport_failure");
    };
    actor = identity = A;
    const sent = await actions.sendMessageAction({ recipientId: B, body: "R02 HIDDEN PRIVATE BODY", requestId: randomUUID() }); assert.equal(sent.ok, true);
    const messageId = sent.data.id;
    await mount(await pages.DetailPage({ params: Promise.resolve({ messageId }) }));
    await click(button("이 회원 차단")); assert.match(host.textContent, /이 회원을 차단했습니다/);
    await click(button("내 쪽지함에서 삭제"));
    await unmount(); calls = []; // Discard the detail DOM/component state before a fresh render.
    await mount(await pages.MailboxPage({ box: "sent", searchParams: Promise.resolve({}) })); assert.match(host.textContent, /보낸 쪽지가 없습니다/);
    await unmount(); calls = [];
    await mount(await pages.BlockedPage({ searchParams: Promise.resolve({}) }));
    assert.match(host.textContent, /R02 실제 차단 회원/); assert.doesNotMatch(host.textContent, /HIDDEN PRIVATE BODY/);
    assert.deepEqual(calls.map(call => call.name), ["list_messaging_blocks"]);
    await click(button("차단 해제")); assert.equal(button("차단 해제"), undefined);
    await mount(await pages.BlockedPage({ searchParams: Promise.resolve({}) })); assert.match(host.textContent, /차단한 회원이 없습니다/);
    await assert.rejects(domain.getMessage({ rpc }, messageId), error => error.code === "missing");
    checked(`update public.messaging_messages set created_at=clock_timestamp()-interval '4 seconds' where id='${messageId}';`);
    const forward = await actions.sendMessageAction({ recipientId: B, body: "R02 새 발신", requestId: randomUUID() }); assert.equal(forward.ok, true);
    actor = identity = B;
    const backward = await actions.sendMessageAction({ recipientId: A, body: "R02 새 회신", requestId: randomUUID() }); assert.equal(backward.ok, true);
    await domain.setMessageBlock({ rpc }, C, true);
    actor = identity = A; assert.equal((await actions.unblockMessageUserAction(C)).ok, true);
    assert.equal((await domain.listMessageBlocks({ rpc })).items.length, 0);
    actor = B; assert.deepEqual((await domain.listMessageBlocks({ rpc })).items.map(row => row.blockedUserId), [C]);
    actor = A; await assert.rejects(domain.getMessage({ rpc }, messageId), error => error.code === "missing");
    assert.equal(checked(`select sender_hidden_at is not null from public.messaging_messages where id='${messageId}';`), "t");
    console.log("R02 mounted UI/actions + official 92 DB: new connections, own-only unblock, hidden body denied, both sends PASS");
  } finally { await unmount(); override = null; await env.stop(); }
});
