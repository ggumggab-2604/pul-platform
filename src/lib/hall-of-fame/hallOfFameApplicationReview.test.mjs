import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import * as review from "./hallOfFameApplicationReview.ts";
import * as applicant from "./hallOfFameApplicant.ts";
import * as evidenceValidation from "./hallOfFameEvidenceValidation.ts";
import { installDom } from "./applicationReviewTestDom.mjs";

const require = createRequire(import.meta.url);
const id = n => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000001`;
const A = id(1), B = id(2), USER = id(3), REQUEST = id(4), RECORD = id(5), EVIDENCE = id(6), CANONICAL = id(7);
const admin = { canRead: true, canReview: true, canDecide: true };
const moderator = { canRead: true, canReview: true, canDecide: false };
const source = path => readFileSync(new URL(path, import.meta.url), "utf8");
function compile(path, stubs) {
  const output = ts.transpileModule(source(path), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", output)(name => name in stubs ? stubs[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
function fixture(batchId = A, status = "submitted", batchVersion = 7) {
  return {
    application_batch: { application_batch_id: batchId, application_type: "direct_application", review_status: status, batch_version: batchVersion, submitted_at: "2026-09-01T09:00:00Z", nominating_club_id: null, vacancy_context_club_id: null },
    round_snapshot: { round_snapshot_id: id(20), played_on: "2026-09-01", started_at: null, course_name: batchId === A ? "신청 A 구장" : "신청 B 구장", course_region: "서울", course_environment: "outdoor", course_layout: null, round_type: "casual", event_name: null, notes: null },
    application_records: [{ application_record_id: RECORD, target_user_id: USER, record_type_code: "hole_in_one", course_segment: "A", hole_number: 1, hole_par: 3, strokes: 1, club_verification_status: "not_applicable", member_consent_status: "granted", review_status: status, conflict_of_interest: false, record_version: 3,
      application_consents: [{ consent_purpose: "evidence_review", status: "granted", policy_version: "v1", version: 2 }],
      publication_consent: { status: "granted", policy_version: "v1", version: 2, ...Object.fromEntries(["display_name_consent", "masked_display_name_consent", "full_display_name_consent", "avatar_consent", "club_name_consent", "record_date_consent", "course_detail_consent", "badge_consent"].map(k => [k, true])) },
      valid_companion_count: 1, confirmation_status_summary: { pending: 0, confirmed: 1, declined: 0, withdrawn: 0, expired: 0 },
      evidence: [{ evidence_id: EVIDENCE, application_record_id: RECORD, evidence_type: "scorecard", status: "available", verified_mime_type: "image/png", verified_size_bytes: 2000, created_at: "2026-09-01T09:00:00Z", finalized_at: "2026-09-01T09:01:00Z" }],
    }], review_events: [],
  };
}
const queueRow = f => ({ ...f.application_batch, active_record_count: f.application_records.filter(r => r.review_status !== "withdrawn").length, review_started_at: null });
const decision = (patch = {}) => ({ application_record_id: RECORD, expected_record_version: 3, decision: "approve", rejection_reason: null, ...patch });
const command = (operation = "start", patch = {}) => ({ operation, batchId: A, expectedVersion: 7, requestId: REQUEST, ...(operation === "decide" ? { decisions: [decision()] } : {}), ...patch });
function resultFor(c) {
  const identity = { request_id: c.requestId, application_batch_id: c.batchId, batch_version: c.expectedVersion + 1, replayed: false };
  if (c.operation === "start") return { ...identity, operation: "hall_of_fame.application.review.start", status: "under_review", transitioned_record_count: 1, review_started_at: "2026-09-01T09:30:00Z" };
  const approved = c.decisions.filter(d => d.decision === "approve").length, rejected = c.decisions.length - approved;
  return { ...identity, operation: "hall_of_fame.application.final_decision", status: !rejected ? "approved" : !approved ? "rejected" : "partially_approved", approved_count: approved, rejected_count: rejected,
    decisions: c.decisions.map(d => ({ application_record_id: d.application_record_id, record_version: d.expected_record_version + 1, status: d.decision === "approve" ? "approved" : "rejected", canonical_record_id: d.decision === "approve" ? CANONICAL : null })), finalized_at: "2026-09-01T09:40:00Z" };
}

test("queue validates identities, status, counts and versions instead of trusting arbitrary rows", () => {
  assert.equal(review.parseApplicationQueue([queueRow(fixture())])[0].id, A);
  for (const patch of [{ application_batch_id: "bad" }, { review_status: "approved" }, { batch_version: 0 }, { active_record_count: -1 }, { submitted_at: null }]) assert.throws(() => review.parseApplicationQueue([{ ...queueRow(fixture()), ...patch }]));
  assert.throws(() => review.parseApplicationQueue([queueRow(fixture()), queueRow(fixture())]));
  assert.throws(() => review.parseApplicationQueue(null));
});
test("detail binds the selected batch, projects only UI fields and separates application version", () => {
  const f = fixture(); f.private_secret = "never show";
  f.review_events = [{ review_event_id: id(22), review_action: "review_started", created_at: "2026-09-01T09:00:00Z", reviewer_user_id: USER }];
  const detail = review.parseApplicationDetail([f], A);
  assert.equal(detail.batch.version, 7); assert.equal(detail.records[0].version, 3);
  assert.equal(detail.records[0].evidence[0].id, EVIDENCE);
  assert.doesNotMatch(JSON.stringify(detail), /private_secret|reviewer_user_id|canonicalVersion|storage_path/);
  assert.throws(() => review.parseApplicationDetail([f], B));
});
test("malformed detail, cross-record evidence and finalized state fail closed", () => {
  for (const change of [f => f.application_records[0].evidence[0].application_record_id = B, f => f.application_batch.review_status = "approved", f => f.application_records[0].record_version = "3", f => f.application_records[0].publication_consent.badge_consent = "true", f => f.application_records.push(f.application_records[0]), f => f.round_snapshot.played_on = "2026-02-30", f => f.application_records[0].confirmation_status_summary.pending = -1]) {
    const f = fixture(); change(f); assert.throws(() => review.parseApplicationDetail([f], A));
  }
  for (const value of [null, [], [{ application_batch: null }]]) assert.throws(() => review.parseApplicationDetail(value, A));
});
test("commands reject client authority, unknown fields and invalid UUID/int4 versions", () => {
  assert.deepEqual(review.parseReviewCommand(command()), command());
  for (const patch of [{ role: "platform_admin" }, { permission: true }, { requestId: "bad" }, { batchId: "bad" }, { expectedVersion: 0 }, { expectedVersion: 2147483648 }, { expectedVersion: 1.5 }, { expectedVersion: "7" }, { operation: "projection" }]) assert.throws(() => review.parseReviewCommand(command("start", patch)));
});
test("decision reasons use the RPC null/length/Unicode rules and cannot duplicate records", () => {
  for (const d of [decision({ decision: "reject", rejection_reason: " " }), decision({ rejection_reason: "reason" }), decision({ decision: "reject", rejection_reason: "가".repeat(2001) }), decision({ expected_record_version: 0 }), decision({ decision: "other" }), { ...decision(), owner: true }]) assert.throws(() => review.parseReviewCommand(command("decide", { decisions: [d] })));
  assert.throws(() => review.parseReviewCommand(command("decide", { decisions: [] })));
  assert.throws(() => review.parseReviewCommand(command("decide", { decisions: [decision(), decision()] })));
  assert.equal(review.parseReviewCommand(command("decide", { decisions: [decision({ decision: "reject", rejection_reason: " 😀 " })] })).decisions[0].rejection_reason, "😀");
  assert.doesNotThrow(() => review.parseReviewCommand(command("decide", { decisions: [decision({ decision: "reject", rejection_reason: "😀".repeat(2000) })] })));
});
test("UI decisions require all active records, omit withdrawn records and preserve each version", () => {
  const f = fixture(A, "under_review"); f.application_records.push({ ...structuredClone(f.application_records[0]), application_record_id: B, review_status: "withdrawn", evidence: [] });
  const detail = review.parseApplicationDetail([f], A);
  assert.throws(() => review.decisionsForDetail(detail, {}));
  assert.deepEqual(review.decisionsForDetail(detail, { [RECORD]: { decision: "approve", reason: "" } }), [decision()]);
  assert.throws(() => review.decisionsForDetail(review.parseApplicationDetail([fixture()], A), {}));
});
test("review and decision response validators bind IDs, versions, coverage and canonical results", () => {
  for (const c of [command(), command("decide"), command("decide", { decisions: [decision({ decision: "reject", rejection_reason: "증빙 불충분" })] })]) {
    assert.equal(review.parseReviewResult([resultFor(c)], c).batchId, A);
    for (const patch of [{ request_id: B }, { application_batch_id: B }, { batch_version: 7 }, { operation: "wrong" }]) assert.throws(() => review.parseReviewResult([{ ...resultFor(c), ...patch }], c));
  }
  const c = command("decide");
  for (const change of [r => r.decisions[0].canonical_record_id = null, r => r.decisions[0].record_version = 1, r => r.decisions[0].application_record_id = B, r => r.approved_count = 2, r => r.decisions = []]) {
    const r = resultFor(c); change(r); assert.throws(() => review.parseReviewResult([r], c));
  }
  assert.equal("canonicalVersion" in review.parseReviewResult([resultFor(c)], c).decisions[0], false);
});
for (const message of ["HOF_STALE_VERSION", "HOF_STALE_RECORD_VERSION", "HOF_APPLICATION_NOT_SUBMITTED", "HOF_FINAL_DECISION_STATE_INVALID", "HOF_REVIEW_APPLICATION_NOT_FOUND"]) test(`safe conflict mapping: ${message}`, () => {
  const result = review.reviewFailure({ message }); assert.equal(result.shouldRefresh, true); assert.doesNotMatch(result.message, /HOF_/);
});
test("unknown DB errors never disclose private diagnostics", () => {
  assert.doesNotMatch(review.reviewFailure({ message: "password secret table sql" }).message, /password|secret|table|sql/);
});

function server(role, options = {}) {
  const calls = [], refreshed = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (name === "current_user_has_platform_permission") return { data: options.permissionError ? null : role === "admin" || role === "moderator" && args.p_permission_code !== review.APPLICATION_PERMISSIONS.decide, error: options.permissionError ? { message: "private" } : null };
    if (options.rpcError) return { data: null, error: options.rpcError };
    const c = { operation: name.startsWith("start_") ? "start" : "decide", batchId: args.p_application_batch_id, expectedVersion: args.p_expected_batch_version, requestId: args.p_request_id, ...(args.p_decisions ? { decisions: args.p_decisions } : {}) };
    return { data: [options.result ? options.result(c) : resultFor(c)], error: null };
  };
  const action = compile("../../app/hall-of-fame/manage/applicationActions.ts", { "next/cache": { revalidatePath: p => refreshed.push(p) }, "@/lib/supabase/auth": { getAuthenticatedSupabaseContext: async () => role === "signedOut" ? null : { userId: USER, supabase: { rpc } } }, "@/lib/hall-of-fame/hallOfFameApplicationReview": review }).performApplicationReviewAction;
  return { action, calls, refreshed };
}
for (const role of ["signedOut", "member", "moderator"]) test(`${role} cannot call final-decision endpoint directly`, async () => {
  const s = server(role); const result = await s.action(command("decide")); assert.equal(result.ok, false);
  assert.equal(s.calls.some(c => c.name === "decide_hall_of_fame_application"), false); assert.deepEqual(s.refreshed, []);
});
for (const role of ["moderator", "admin"]) test(`${role} starts review through authenticated permission checks and exact RPC params`, async () => {
  const s = server(role); assert.equal((await s.action(command())).ok, true);
  assert.deepEqual(s.calls.at(-1), { name: "start_hall_of_fame_application_review", args: { p_application_batch_id: A, p_expected_batch_version: 7, p_request_id: REQUEST } });
  assert.deepEqual(s.refreshed, ["/hall-of-fame/manage", "/hall-of-fame/apply", "/hall-of-fame"]);
});
for (const choice of ["approve", "reject"]) test(`admin ${choice} preserves record decision contract`, async () => {
  const s = server("admin"), c = command("decide", { decisions: [decision({ decision: choice, rejection_reason: choice === "reject" ? "자료 확인 불가" : null })] });
  const response = await s.action(c); assert.equal(response.ok, true); assert.equal(response.result.status, choice === "approve" ? "approved" : "rejected");
  assert.deepEqual(s.calls.at(-1).args.p_decisions, c.decisions);
});
test("admin mixed decisions and idempotent replay retain the RPC result", async () => {
  const c = command("decide", { decisions: [decision(), decision({ application_record_id: B, decision: "reject", rejection_reason: "확인 불가" })] });
  const s = server("admin", { result: c => ({ ...resultFor(c), replayed: true }) });
  assert.equal((await s.action(c)).result.status, "partially_approved");
  assert.equal(s.calls.some(c => c.name === "get_hall_of_fame_review_detail"), false);
});
for (const error of [{ code: "PT409", message: "HOF_STALE_VERSION" }, { code: "PT409", message: "HOF_STALE_RECORD_VERSION" }, { code: "22023", message: "HOF_FINAL_DECISION_COVERAGE_MISMATCH" }, { code: "42501", message: "HOF_REVIEW_NOT_AUTHORIZED" }]) test(`DB refusal remains a failure: ${error.message}`, async () => {
  const s = server("admin", { rpcError: error }); const result = await s.action(command("decide")); assert.equal(result.ok, false); assert.deepEqual(s.refreshed, []); assert.doesNotMatch(result.message, /HOF_/);
});
test("failed permissions, malformed result and injected role cannot yield success", async () => {
  assert.equal((await server("admin", { permissionError: true }).action(command())).ok, false);
  assert.equal((await server("admin", { result: c => ({ ...resultFor(c), application_batch_id: B }) }).action(command())).ok, false);
  const s = server("admin"); assert.equal((await s.action({ ...command(), role: "admin" })).ok, false); assert.equal(s.calls.length, 0);
});

function resolver(role, dispute = false, malformed = false) {
  return compile("./resolveHallOfFameOperatorManagement.ts", { "server-only": {}, "@/lib/hall-of-fame/hallOfFameApplicationReview": review, "@/lib/supabase/auth": { getAuthenticatedSupabaseContext: async () => role === "signedOut" ? null : { userId: USER, supabase: { rpc: async (_name, args) => ({ data: malformed ? "true" : args.p_permission_code.includes("applications.") ? role === "admin" || role === "moderator" && !args.p_permission_code.endsWith("decide") : dispute, error: null }) } } } }).resolveHallOfFameOperatorManagement();
}
for (const [role, expected] of [["member", { canRead: false, canReview: false, canDecide: false }], ["moderator", moderator], ["admin", admin]]) test(`resolver separates application capabilities for ${role}`, async () => {
  const result = await resolver(role); assert.deepEqual(result.applicationPermissions, expected); assert.equal(result.permissions.canRead, false);
});
test("resolver preserves dispute capability and fails closed on malformed permission", async () => {
  assert.equal((await resolver("admin", true)).permissions.canRevoke, true);
  assert.equal((await resolver("admin", true, true)).availability, "loadFailed");
  assert.equal((await resolver("signedOut")).authenticationStatus, "signedOut");
});
test("page allows application-only reader, keeps dispute reader and blocks member", async () => {
  const App = () => null, Provider = () => null;
  const find = (value, type) => value?.type === type || React.Children.toArray(value?.props?.children).some(v => find(v, type));
  for (const [role, dispute, appVisible, disputeVisible] of [["moderator", false, true, false], ["member", true, false, true], ["member", false, false, false], ["admin", true, true, true]]) {
    const stubs = { "next/navigation": { redirect() { throw new Error("redirect"); } }, "next/link": { __esModule: true, default: "a" }, "lucide-react": { ShieldAlert: () => null }, "@/components/ui/Container": { Container: () => null }, "@/lib/hall-of-fame/resolveHallOfFameOperatorManagement": { resolveHallOfFameOperatorManagement: () => resolver(role, dispute) } };
    for (const n of ["HallOfFameOperatorProvider", "HallOfFameOperatorDetail", "HallOfFameOperatorQueue", "HallOfFameApplicationQueue"]) stubs[`@/components/hall-of-fame/manage/${n}`] = { [n]: n === "HallOfFameApplicationQueue" ? App : n === "HallOfFameOperatorProvider" ? Provider : () => null };
    const tree = await compile("../../app/hall-of-fame/manage/page.tsx", stubs).default();
    assert.equal(Boolean(find(tree, App)), appVisible); assert.equal(Boolean(find(tree, Provider)), disputeVisible);
  }
});
test("DB foundation still enforces full coverage, versions and decision permission; review never invokes projection", () => {
  const sql = source("../../../supabase/migrations/20260812000100_pul_hall_of_fame_final_decision_rpc.sql");
  for (const token of ["hall_of_fame.applications.decide", "HOF_FINAL_DECISION_COVERAGE_MISMATCH", "HOF_STALE_RECORD_VERSION", "HOF_STALE_VERSION", "'active','hidden'", "HOF_INVALID_FINAL_DECISION_PAYLOAD"]) assert.ok(sql.includes(token));
  const actions = source("../../app/hall-of-fame/manage/applicationActions.ts");
  assert.doesNotMatch(actions, /\.from\(|service_role/);
  const reviewAction = actions.slice(actions.indexOf("export async function performApplicationReviewAction"), actions.indexOf("export async function performApplicationProjectionAction"));
  assert.match(reviewAction, /start_hall_of_fame_application_review/);
  assert.match(reviewAction, /decide_hall_of_fame_application/);
  assert.doesNotMatch(reviewAction, /sync_hall_of_fame_record_projection/);
  assert.match(actions, /export async function performApplicationProjectionAction/);
});

const dom = installDom();
let environment;
const uiStubs = {
  "@/lib/hall-of-fame/hallOfFameApplicationReview": review, "@/lib/hall-of-fame/hallOfFameApplicant": applicant,
  "@/app/hall-of-fame/manage/applicationActions": { performApplicationReviewAction: c => { environment.actions.push(c); return environment.action(c); } },
  "@/app/hall-of-fame/evidence/actions": { createEvidenceSignedReadAction: id => { environment.evidenceCalls.push(id); return environment.evidence(id); } },
  "@/lib/supabase/client": { createClient: () => environment.client },
};
const detailModule = compile("../../components/hall-of-fame/manage/HallOfFameApplicationDetail.tsx", uiStubs);
const Queue = compile("../../components/hall-of-fame/manage/HallOfFameApplicationQueue.tsx", { ...uiStubs, "./HallOfFameApplicationDetail": detailModule }).HallOfFameApplicationQueue;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function settle() { await act(async () => { await new Promise(r => setImmediate(r)); }); }
async function mount(t, options = {}) {
  const env = { queue: [fixture(), fixture(B)], calls: [], actions: [], evidenceCalls: [], permissions: admin, ...options };
  env.client = { auth: { getSession: async () => ({ data: { session: { user: { id: USER } } } }), onAuthStateChange: cb => { env.auth = cb; return { data: { subscription: { unsubscribe() {} } } }; } }, rpc: async (name, args) => {
    env.calls.push({ name, args });
    if (env.rpc) return env.rpc(name, args);
    if (name === "list_hall_of_fame_review_queue") return { data: env.queue.slice(args.p_offset, args.p_offset + args.p_limit).map(queueRow), error: null };
    return { data: [env.queue.find(f => f.application_batch.application_batch_id === args.p_application_batch_id)], error: null };
  } };
  env.action ??= async c => {
    const f = env.queue.find(f => f.application_batch.application_batch_id === c.batchId);
    if (c.operation === "start") { f.application_batch.review_status = "under_review"; f.application_batch.batch_version++; f.application_records.forEach(r => { r.review_status = "under_review"; r.record_version++; }); }
    else env.queue = env.queue.filter(item => item !== f);
    return { ok: true, result: review.parseReviewResult([resultFor(c)], c) };
  };
  env.evidence ??= async id => ({ evidenceId: id, signedUrl: "https://evidence.invalid/signed", expiresInSeconds: 60 });
  environment = env;
  const container = dom.document.createElement("div"); dom.document.body.appendChild(container);
  const root = createRoot(container); env.container = container;
  t.after(async () => { await act(async () => root.unmount()); container.parentNode.removeChild(container); });
  await act(async () => root.render(React.createElement(Queue, { userId: USER, permissions: env.permissions })));
  await settle(); return env;
}
const buttons = env => env.container.querySelectorAll("button");
const button = (env, label) => buttons(env).find(b => b.textContent === label);
const selectRow = env => buttons(env).filter(b => b.getAttribute("aria-pressed") !== null);
async function click(node) { assert.ok(node); await act(async () => node.click()); await settle(); }
function props(node) { return node[Object.keys(node).find(k => k.startsWith("__reactProps$"))]; }
async function change(node, value, checked) { assert.ok(node); await act(async () => props(node).onChange({ target: { value, checked } })); await settle(); }

test("UI selects exact batch and clears stale detail on deselect and refresh", async t => {
  const env = await mount(t); await click(selectRow(env)[1]);
  assert.equal(env.calls.at(-1).args.p_application_batch_id, B); assert.match(env.container.textContent, /신청 B 구장/);
  await click(button(env, "선택 해제")); assert.doesNotMatch(env.container.textContent, /신청 B 구장/);
  await click(selectRow(env)[0]); await click(button(env, "신청 목록 새로고침")); assert.doesNotMatch(env.container.textContent, /신청 A 구장/);
});
test("UI pagination clears selection and uses bounded queue offset", async t => {
  const env = await mount(t, { queue: Array.from({ length: 11 }, (_, i) => fixture(id(i + 30))) });
  await click(selectRow(env)[0]); await click(button(env, "다음"));
  assert.equal(env.calls.at(-1).args.p_offset, 10); assert.equal(selectRow(env).length, 1);
  assert.equal(button(env, "선택 해제"), undefined);
  await click(button(env, "이전")); assert.equal(env.calls.at(-1).args.p_offset, 0);
});
test("late detail from A cannot replace selected B", async t => {
  const pending = deferred();
  const env = await mount(t, { rpc: async (name, args) => name.startsWith("list_") ? { data: [queueRow(fixture()), queueRow(fixture(B))] } : args.p_application_batch_id === A ? pending.promise : { data: [fixture(B)] } });
  await click(selectRow(env)[0]); await click(selectRow(env)[1]);
  await act(async () => pending.resolve({ data: [fixture()] })); await settle();
  assert.match(env.container.textContent, /신청 B 구장/); assert.doesNotMatch(env.container.textContent, /신청 A 구장/);
});
for (const invalid of [{ data: [] }, { data: [fixture(B)] }, { error: { code: "42501" } }]) test("detail failure exposes no controls or other batch content", async t => {
  const env = await mount(t, { rpc: async name => name.startsWith("list_") ? { data: [queueRow(fixture())] } : invalid });
  await click(selectRow(env)[0]); assert.equal(button(env, "심사 시작"), undefined); assert.doesNotMatch(env.container.textContent, /신청 B 구장/); assert.ok(env.container.querySelectorAll("p").some(p => p.getAttribute("role") === "alert"));
});
test("moderator UI starts review, refreshes versions and has no final decision controls", async t => {
  const env = await mount(t, { permissions: moderator }); await click(selectRow(env)[0]); await click(button(env, "심사 시작"));
  assert.equal(env.actions[0].batchId, A); assert.equal(env.actions[0].expectedVersion, 7); assert.match(env.actions[0].requestId, /^[0-9a-f-]{36}$/);
  assert.match(env.container.textContent, /버전 8/); assert.equal(button(env, "최종 결정 확정"), undefined); assert.equal(button(env, "심사 시작"), undefined);
});
test("UI admin rejects incomplete coverage then approves and shows canonical separate from publication", async t => {
  const env = await mount(t, { queue: [fixture(A, "under_review")] }); await click(selectRow(env)[0]);
  await change(env.container.querySelectorAll("input")[0], undefined, true); await click(button(env, "최종 결정 확정")); assert.equal(env.actions.length, 0);
  await change(env.container.querySelectorAll("select")[0], "approve"); await change(env.container.querySelectorAll("input")[0], undefined, true); await click(button(env, "최종 결정 확정"));
  assert.deepEqual(env.actions[0].decisions, [decision()]); assert.match(env.container.textContent, /승인 기록 번호/); assert.match(env.container.textContent, /공개 게시 처리는 별도/); assert.equal(button(env, "최종 결정 확정"), undefined);
});
test("UI reject requires reason and submits it only after confirmation", async t => {
  const env = await mount(t, { queue: [fixture(A, "under_review")] }); await click(selectRow(env)[0]);
  await change(env.container.querySelectorAll("select")[0], "reject"); await change(env.container.querySelectorAll("input")[0], undefined, true); await click(button(env, "최종 결정 확정")); assert.equal(env.actions.length, 0);
  await change(env.container.querySelectorAll("textarea")[0], "증빙 확인 불가"); await change(env.container.querySelectorAll("input")[0], undefined, true); await click(button(env, "최종 결정 확정"));
  assert.equal(env.actions[0].decisions[0].rejection_reason, "증빙 확인 불가"); assert.match(env.container.textContent, /반려 1건/); assert.doesNotMatch(env.container.textContent, /승인 기록 번호/);
});
test("UI stale response disables write until current detail is loaded", async t => {
  const env = await mount(t, { action: async () => review.reviewFailure({ code: "PT409" }) }); await click(selectRow(env)[0]); await click(button(env, "심사 시작"));
  assert.equal(button(env, "심사 시작").disabled, true); assert.match(env.container.textContent, /최신 목록/);
  await click(button(env, "상세 새로고침")); assert.equal(button(env, "심사 시작").disabled, false);
});
test("late action response after changing selection cannot overwrite B or show A receipt", async t => {
  const pending = deferred(); const env = await mount(t, { action: () => pending.promise });
  await click(selectRow(env)[0]); await click(button(env, "심사 시작")); await click(selectRow(env)[1]);
  await act(async () => pending.resolve({ ok: true, result: review.parseReviewResult([resultFor(env.actions[0])], env.actions[0]) })); await settle();
  assert.match(env.container.textContent, /신청 B 구장/); assert.doesNotMatch(env.container.textContent, /신청 A 구장/);
});
test("evidence uses existing signed read, clears link on selection and handles unauthorized safely", async t => {
  const env = await mount(t); await click(selectRow(env)[0]); await click(button(env, "증빙 확인"));
  assert.deepEqual(env.evidenceCalls, [EVIDENCE]); assert.ok(env.container.querySelectorAll("a").some(a => a.getAttribute("href") === "https://evidence.invalid/signed"));
  await click(selectRow(env)[1]); assert.equal(env.container.querySelectorAll("a").length, 0);
  env.evidence = async () => { throw new Error("service secret unauthorized"); }; await click(button(env, "증빙 확인"));
  assert.match(env.container.textContent, /증빙을 열지 못했습니다/); assert.doesNotMatch(env.container.textContent, /service secret/);
});
test("no evidence cannot start signed read", async t => {
  const f = fixture(); f.application_records[0].evidence = [];
  const env = await mount(t, { queue: [f] }); await click(selectRow(env)[0]); assert.match(env.container.textContent, /등록된 증빙이 없습니다/); assert.equal(button(env, "증빙 확인"), undefined); assert.deepEqual(env.evidenceCalls, []);
});

test("unavailable evidence is visible but cannot start signed read", async t => {
  const f = fixture(); f.application_records[0].evidence[0].status = "pending_upload";
  const env = await mount(t, { queue: [f] }); await click(selectRow(env)[0]);
  assert.match(env.container.textContent, /첨부 미완료/); assert.equal(button(env, "증빙 확인").disabled, true);
  await click(button(env, "증빙 확인")); assert.deepEqual(env.evidenceCalls, []);
});

test("member cannot render application queue or start review directly", async t => {
  const env = await mount(t, { permissions: { canRead: false, canReview: false, canDecide: false } });
  assert.equal(env.container.textContent, ""); assert.deepEqual(env.calls, []);
  const s = server("member"); assert.equal((await s.action(command())).ok, false);
  assert.equal(s.calls.some(c => c.name === "start_hall_of_fame_application_review"), false);
});
test("account change/logout clears all private UI and rejects late reads", async t => {
  const pending = deferred(); const env = await mount(t, { evidence: () => pending.promise });
  await click(selectRow(env)[0]); await click(button(env, "증빙 확인"));
  await act(async () => env.auth("SIGNED_OUT", null)); await settle(); assert.equal(env.container.textContent, "");
  await act(async () => pending.resolve({ evidenceId: EVIDENCE, signedUrl: "https://evidence.invalid/old", expiresInSeconds: 60 })); await settle(); assert.equal(env.container.textContent, "");
});

for (const status of ["under_review", "approved", "rejected", "partially_approved"]) test(`existing applicant workspace and form show ${status} after refresh`, async t => {
  const router = { refresh() {} };
  const batch = { id: A, version: 8, status, records: [], round: null };
  const workspace = { applications: [batch], incoming_confirmations: [], record_types: [] };
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: workspace, error: null }; }, auth: {
    getSession: async () => ({ data: { session: { user: { id: USER } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } };
  const loaded = await applicant.loadApplicantWorkspace(client, A);
  assert.deepEqual(calls, [{ name: "get_my_hall_of_fame_application_workspace", args: { p_application_batch_id: A, p_offset: 0 } }]);
  const Form = compile("../../components/hall-of-fame/HallOfFameApplicationForm.tsx", {
    "next/link": { __esModule: true, default: "a" }, "next/navigation": { useRouter: () => router },
    "@/lib/supabase/client": { createClient: () => client }, "@/app/hall-of-fame/apply/actions": { performApplicantAction() { throw new Error("unexpected mutation"); } },
    "@/lib/hall-of-fame/hallOfFameApplicant": applicant, "@/lib/hall-of-fame/hallOfFameEvidenceValidation": evidenceValidation,
  }).HallOfFameApplicationForm;
  const container = dom.document.createElement("div"); dom.document.body.appendChild(container); const root = createRoot(container);
  t.after(async () => { await act(async () => root.unmount()); container.parentNode.removeChild(container); });
  await act(async () => root.render(React.createElement(Form, { userId: USER, workspace: loaded, eligibility: { can_create_direct_application: true, vacant_context_clubs: [] }, selectedBatchId: A, offset: 0 })));
  await settle(); assert.ok(container.textContent.includes(`내 신청 · ${applicant.HOF_APPLICANT_STATUS[status]}`));
  assert.doesNotMatch(container.textContent, /기록 저장|신청 제출/);
});
