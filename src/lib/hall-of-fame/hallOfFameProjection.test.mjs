import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import * as review from "./hallOfFameApplicationReview.ts";
import * as applicant from "./hallOfFameApplicant.ts";
import { installDom } from "./applicationReviewTestDom.mjs";

const require = createRequire(import.meta.url);
const source = path => readFileSync(new URL(path, import.meta.url), "utf8");
const id = n => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000001`;
const BATCH = id(1), APPLICATION = id(2), CANONICAL = id(3), REQUEST = id(4), USER = id(5), OTHER = id(6);
const command = { batchId: BATCH, applicationRecordId: APPLICATION, recordId: CANONICAL };
const admin = { canRead: true, canReview: true, canDecide: true };
const contextRow = (patch = {}) => ({ record_id: CANONICAL, source_application_record_id: APPLICATION, source_application_batch_id: BATCH, record_version: 17, validity_status: "active", publication_status: "hidden", ...patch });
const parsedContext = patch => review.parseProjectionContext([contextRow(patch)], command);
const syncRow = (patch = {}) => ({ request_id: REQUEST, operation: "hall_of_fame.record.projection.sync", record_id: CANONICAL, record_version: 18, publication_status: "published", badge_source_count: 2, badges_created: 2, changed: true, replayed: false, ...patch });
function compile(path, stubs) {
  const output = ts.transpileModule(source(path), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", output)(name => name in stubs ? stubs[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const migration = source("../../../supabase/migrations/20261002000100_pul_hall_of_fame_record_projection_context_read.sql");
const projectionSql = source("../../../supabase/migrations/20260813000100_pul_hall_of_fame_badge_publication_projection_rpc.sql");
test("SQL contract: one exact uuid read RPC and only the six minimal columns", () => {
  assert.equal((migration.match(/create function/gi) ?? []).length, 1);
  assert.match(migration, /create function public\.get_hall_of_fame_record_projection_context\(\s*p_record_id uuid\s*\)/);
  const columns = migration.match(/returns table \(([\s\S]+?)\)/)[1].split(",").map(c => c.trim().replace(/\s+/g, " "));
  assert.deepEqual(columns, ["record_id uuid", "source_application_record_id uuid", "source_application_batch_id uuid", "record_version integer", "validity_status text", "publication_status text"]);
});
test("SQL contract: stable definer with empty search_path and exact authenticated grant", () => {
  assert.match(migration, /language plpgsql\s+stable\s+security definer\s+set search_path = ''/);
  assert.match(migration, /revoke all on function public\.get_hall_of_fame_record_projection_context\(uuid\)\s+from public, anon, authenticated, service_role;/);
  assert.match(migration, /grant execute on function public\.get_hall_of_fame_record_projection_context\(uuid\)\s+to authenticated;/);
  assert.equal((migration.match(/grant execute/gi) ?? []).length, 1);
});
test("SQL contract: auth.uid actor and existing exact active admin guard precede every read", () => {
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
  const guardCallIndex = migration.indexOf("perform private.require_hall_of_fame_projection_admin(v_actor)");
  const firstReadIndex = migration.search(/\bselect\s+(?:canonical|source)\b/i);
  assert.ok(guardCallIndex >= 0, "projection admin guard must exist");
  assert.ok(firstReadIndex >= 0, "canonical/source SELECT must exist");
  assert.ok(guardCallIndex < firstReadIndex, "projection admin guard must precede the first canonical/source SELECT");
  const guard = projectionSql.slice(0, projectionSql.indexOf("comment on function private.require_hall_of_fame_projection_admin"));
  assert.match(guard, /account\.id = p_actor_user_id/);
  assert.match(guard, /account\.account_status = 'active'/);
  assert.match(guard, /if not found or v_platform_role <> 'platform_admin' then/);
  assert.match(guard, /errcode = '42501'/);
});
test("SQL contract: null/missing canonical and mismatched or unapproved source fail closed", () => {
  for (const pattern of [/if p_record_id is null/, /HOF_CANONICAL_RECORD_NOT_FOUND.*errcode = 'P0002'/,
    /source\.id = v_record\.source_application_record_id/, /source\.target_user_id = v_record\.target_user_id/,
    /join public\.hall_of_fame_application_batches as batch on batch\.id = source\.application_batch_id/,
    /if not found or v_batch_id is null or v_review_status is distinct from 'approved'/,
    /HOF_CANONICAL_SOURCE_INTEGRITY_INVALID.*errcode = '23514'/]) assert.match(migration, pattern);
});
test("SQL contract: current canonical version returned without guessing source version", () => {
  assert.match(migration, /canonical\.version, canonical\.validity_status, canonical\.publication_status/);
  assert.match(migration, /v_record\.version is null or v_record\.version < 1/);
  assert.match(migration, /return query select v_record\.id, v_record\.source_application_record_id, v_batch_id,\s*v_record\.version, v_record\.validity_status, v_record\.publication_status/);
  assert.doesNotMatch(migration, /source\.version|coalesce|version\s*\+\s*1/i);
});
test("SQL contract: no business DML, heavy locks, sensitive data or alternate publication logic", () => {
  const body = migration.match(/as \$\$([\s\S]+?)\$\$/)[1].replace(/--[^\n]*/g, "");
  assert.doesNotMatch(body, /\b(insert|update|delete|merge|truncate|execute)\b|for share|advisory|\.\*/i);
  assert.doesNotMatch(migration, /evidence|signed_url|contact|reviewer|history|consent_is_effective/);
  assert.deepEqual([...body.matchAll(/\b(?:from|join)\s+(\S+)\s+as\b/gi)].map(m => m[1]), ["public.hall_of_fame_records", "public.hall_of_fame_application_records", "public.hall_of_fame_application_batches"]);
});
test("existing sync SQL content is unchanged and retains final version check and idempotent replay", () => {
  // Normalize checkout line endings only; the release audit separately compares all 86 byte hashes.
  assert.equal(createHash("sha256").update(projectionSql.replace(/\r\n/g, "\n")).digest("hex"), "1f082f3be60517e44f864a28636b18720cdda83ba48436f88a863587059d1982");
  assert.match(projectionSql, /v_record\.version <> p_expected_record_version/);
  assert.match(projectionSql, /HOF_STALE_RECORD_VERSION.*errcode = 'PT409'/);
  assert.match(projectionSql, /if v_claim\.replayed then/);
});

test("valid context strips non-DTO fields and obtains version 17 from canonical", () => {
  assert.deepEqual(review.parseProjectionCommand(command), command);
  assert.deepEqual(parsedContext({ private_note: "secret" }), { ...command, recordVersion: 17, validityStatus: "active", publicationStatus: "hidden" });
});
for (const field of ["batchId", "applicationRecordId", "recordId"]) test(`command rejects invalid ${field}`, () => {
  assert.throws(() => review.parseProjectionCommand({ ...command, [field]: "invalid" }));
});
test("command rejects fake client version, role, actor and request ID rather than using them", () => {
  for (const patch of [{ expectedVersion: 1 }, { recordVersion: 1 }, { p_expected_record_version: 1 }, { role: "platform_admin" }, { userId: USER }, { requestId: REQUEST }]) assert.throws(() => review.parseProjectionCommand({ ...command, ...patch }));
});
for (const field of ["record_id", "source_application_record_id", "source_application_batch_id"]) test(`context binds ${field} to the selected receipt`, () => {
  for (const value of [OTHER, "bad", null]) assert.throws(() => parsedContext({ [field]: value }));
});
test("context rejects absent, multiple, malformed and missing-field responses", () => {
  for (const value of [null, {}, [], [null], [contextRow(), contextRow()], [{}]]) assert.throws(() => review.parseProjectionContext(value, command));
  for (const field of Object.keys(contextRow())) { const r = contextRow(); delete r[field]; assert.throws(() => review.parseProjectionContext([r], command)); }
});
for (const version of [0, -1, 1.5, "17", null, 2147483648]) test(`context rejects invalid canonical version ${JSON.stringify(version)}`, () => {
  assert.throws(() => parsedContext({ record_version: version }));
});
test("context validates validity and publication states without assuming approval implies publication", () => {
  for (const validity_status of ["active", "revoked"]) for (const publication_status of ["hidden", "published", "suppressed"]) assert.equal(parsedContext({ validity_status, publication_status }).publicationStatus, publication_status);
  for (const patch of [{ validity_status: "approved" }, { publication_status: "public" }]) assert.throws(() => parsedContext(patch));
});
test("sync result binds operation, UUID, canonical and valid versions", () => {
  for (const patch of [{ request_id: OTHER }, { record_id: OTHER }, { record_id: "bad" }, { operation: "other" }, { record_version: 0 }, { record_version: 19 }, { publication_status: "other" }]) assert.throws(() => review.parseProjectionResult([syncRow(patch)], parsedContext(), REQUEST));
  for (const data of [[], null, [syncRow(), syncRow()]]) assert.throws(() => review.parseProjectionResult(data, parsedContext(), REQUEST));
});
test("sync result accepts publication changed true and idempotent replay", () => {
  const result = review.parseProjectionResult([syncRow({ replayed: true })], parsedContext(), REQUEST);
  assert.deepEqual(result, { ...command, recordVersion: 18, publicationStatus: "published", changed: true, replayed: true });
});
for (const status of ["hidden", "published", "suppressed"]) test(`sync result accepts ${status} changed=false and same canonical version`, () => {
  const result = review.parseProjectionResult([syncRow({ publication_status: status, record_version: 17, badges_created: 0, changed: false })], parsedContext({ publication_status: status }), REQUEST);
  assert.equal(result.changed, false); assert.equal(result.recordVersion, 17); assert.equal(result.publicationStatus, status);
});
test("badge-only changed=true keeps canonical version; suppression advances exactly once", () => {
  assert.equal(review.parseProjectionResult([syncRow({ publication_status: "hidden", record_version: 17 })], parsedContext(), REQUEST).changed, true);
  assert.equal(review.parseProjectionResult([syncRow({ publication_status: "suppressed", badges_created: 0 })], parsedContext({ publication_status: "published" }), REQUEST).recordVersion, 18);
});
test("sync rejects inconsistent boolean/count/version combinations and impossible transitions", () => {
  for (const patch of [{ changed: false }, { changed: "true" }, { replayed: 1 }, { badges_created: 3 }, { badges_created: -1 }, { badge_source_count: 1 }, { badge_source_count: "2" }, { publication_status: "suppressed" }, { record_version: 17 }]) assert.throws(() => review.parseProjectionResult([syncRow(patch)], parsedContext(), REQUEST));
  assert.throws(() => review.parseProjectionResult([syncRow()], parsedContext({ validity_status: "revoked" }), REQUEST));
});

function server(role = "admin", options = {}) {
  const calls = [], refreshed = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (name === "current_user_has_platform_permission") return { data: options.permissionValue ?? (role === "admin" || role === "moderator" && args.p_permission_code === review.APPLICATION_PERMISSIONS.read), error: options.permissionError };
    if (name === "get_hall_of_fame_record_projection_context") return { data: options.readData ?? [contextRow()], error: options.readError };
    if (name === "sync_hall_of_fame_record_projection") return { data: [syncRow({ request_id: args.p_request_id, ...options.syncPatch })], error: options.syncError };
    throw new Error(`Unexpected RPC ${name}`);
  };
  const action = compile("../../app/hall-of-fame/manage/applicationActions.ts", { "next/cache": { revalidatePath: p => refreshed.push(p) }, "@/lib/supabase/auth": { getAuthenticatedSupabaseContext: async () => role === "anon" ? null : { userId: USER, supabase: { rpc } } }, "@/lib/hall-of-fame/hallOfFameApplicationReview": review }).performApplicationProjectionAction;
  return { action, calls, refreshed };
}
for (const role of ["anon", "member", "clubOnly", "moderator", "inactiveAdmin"]) test(`direct server action denies ${role} before context or sync`, async () => {
  const s = server(role); assert.equal((await s.action(command)).ok, false);
  assert.equal(s.calls.some(c => c.name !== "current_user_has_platform_permission"), false); assert.deepEqual(s.refreshed, []);
});
test("admin server flow reads current canonical version and sends only exact sync arguments", async () => {
  const s = server(); const result = await s.action(command); assert.equal(result.ok, true);
  assert.deepEqual(s.calls.map(c => c.name), ["current_user_has_platform_permission", "current_user_has_platform_permission", "get_hall_of_fame_record_projection_context", "sync_hall_of_fame_record_projection"]);
  assert.deepEqual(s.calls.slice(0, 2).map(c => c.args.p_permission_code), [review.APPLICATION_PERMISSIONS.read, review.APPLICATION_PERMISSIONS.decide]);
  assert.deepEqual(s.calls[2].args, { p_record_id: CANONICAL });
  assert.deepEqual(s.calls[3].args, { p_record_id: CANONICAL, p_expected_record_version: 17, p_request_id: s.calls[3].args.p_request_id });
  assert.match(s.calls[3].args.p_request_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(s.refreshed, ["/hall-of-fame/manage", "/hall-of-fame/apply", "/hall-of-fame"]);
});
test("fake client version never reaches DB; explicit later attempts read again with a fresh request", async () => {
  const s = server(); assert.equal((await s.action({ ...command, expectedVersion: 1 })).ok, false); assert.equal(s.calls.length, 0);
  await s.action(command); await s.action(command);
  const writes = s.calls.filter(c => c.name === "sync_hall_of_fame_record_projection");
  assert.equal(s.calls.filter(c => c.name === "get_hall_of_fame_record_projection_context").length, 2);
  assert.notEqual(writes[0].args.p_request_id, writes[1].args.p_request_id);
  assert.deepEqual(writes.map(c => c.args.p_expected_record_version), [17, 17]);
});
test("DB exact-admin refusal overrides earlier permission success and prevents sync", async () => {
  const s = server("admin", { readError: { code: "42501", message: "HOF_PROJECTION_ADMIN_REQUIRED" } });
  const response = await s.action(command); assert.equal(response.ok, false); assert.match(response.message, /플랫폼 관리자/);
  assert.equal(s.calls.some(c => c.name === "sync_hall_of_fame_record_projection"), false);
});
test("malformed permissions, mismatched context and missing canonical never trigger a write", async () => {
  for (const options of [{ permissionValue: "true" }, { permissionError: { code: "42501" } }, { readData: [] }, { readData: [contextRow({ source_application_record_id: OTHER })] }, { readData: [contextRow({ record_id: OTHER })] }, { readError: { code: "P0002" } }, { readError: { code: "23514" } }]) {
    const s = server("admin", options); assert.equal((await s.action(command)).ok, false); assert.equal(s.calls.some(c => c.name === "sync_hall_of_fame_record_projection"), false); assert.deepEqual(s.refreshed, []);
  }
});
test("PT409 after context read returns safe Korean retry guidance without auto retry or version increment", async () => {
  const s = server("admin", { syncError: { code: "PT409", message: "HOF_STALE_RECORD_VERSION private diagnostics" } });
  const response = await s.action(command); assert.equal(response.ok, false); assert.match(response.message, /최신 공개 상태를 조회/); assert.doesNotMatch(response.message, /HOF_|diagnostics/);
  assert.equal(s.calls.length, 4); assert.equal(s.calls.at(-1).args.p_expected_record_version, 17); assert.deepEqual(s.refreshed, []);
});
test("sync rejects revoked admin or malformed result without reporting success or revalidating", async () => {
  for (const options of [{ syncError: { code: "42501" } }, { syncPatch: { request_id: OTHER } }, { syncPatch: { record_id: OTHER } }, { syncPatch: { replayed: "true" } }]) {
    const s = server("admin", options); assert.equal((await s.action(command)).ok, false); assert.deepEqual(s.refreshed, []);
  }
});
test("server preserves valid replay and no-change outcome", async () => {
  const s = server("admin", { syncPatch: { publication_status: "hidden", record_version: 17, changed: false, badges_created: 0, replayed: true } });
  const r = await s.action(command); assert.equal(r.ok, true); assert.equal(r.result.replayed, true); assert.equal(r.result.changed, false);
});

const dom = installDom();
let environment;
const stubs = {
  "@/lib/hall-of-fame/hallOfFameApplicationReview": review, "@/lib/hall-of-fame/hallOfFameApplicant": applicant,
  "@/app/hall-of-fame/manage/applicationActions": { performApplicationReviewAction: c => environment.review(c), performApplicationProjectionAction: c => { environment.calls.push(c); return environment.project(c); } },
  "@/app/hall-of-fame/evidence/actions": { createEvidenceSignedReadAction: () => { throw new Error("unexpected evidence read"); } },
  "@/lib/supabase/client": { createClient: () => environment.client },
};
const detailModule = compile("../../components/hall-of-fame/manage/HallOfFameApplicationDetail.tsx", stubs);
const Queue = compile("../../components/hall-of-fame/manage/HallOfFameApplicationQueue.tsx", { ...stubs, "./HallOfFameApplicationDetail": detailModule }).HallOfFameApplicationQueue;
const receipt = (patch = {}) => ({ operation: "decide", batchId: BATCH, batchVersion: 9, status: "approved", approved: 1, rejected: 0, decisions: [{ id: APPLICATION, status: "approved", canonicalId: CANONICAL }], ...patch });
const success = (c = command, patch = {}) => ({ ok: true, result: { ...c, publicationStatus: "published", recordVersion: 18, changed: true, replayed: false, ...patch } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function settle() { await act(async () => { await new Promise(r => setImmediate(r)); }); }
const buttons = env => env.container.querySelectorAll("button");
const button = (env, label) => buttons(env).find(b => b.textContent === label);
async function click(node) { assert.ok(node); await act(async () => node.click()); await settle(); }
async function change(node, value, checked) {
  assert.ok(node); const p = node[Object.keys(node).find(k => k.startsWith("__reactProps$"))];
  await act(async () => p.onChange({ target: { value, checked } })); await settle();
}
function detail(batchId) {
  return { application_batch: { application_batch_id: batchId, application_type: "direct_application", review_status: "under_review", batch_version: 8, submitted_at: "2026-09-01T09:00:00Z" },
    round_snapshot: { played_on: "2026-09-01", course_name: batchId === BATCH ? "A 구장" : "B 구장", course_region: "서울", course_environment: "outdoor", course_layout: null, round_type: "casual", event_name: null, notes: null },
    application_records: [{ application_record_id: batchId === BATCH ? APPLICATION : OTHER, target_user_id: USER, record_version: 4, review_status: "under_review", record_type_code: "hole_in_one", course_segment: "A", hole_number: 1, hole_par: 3, strokes: 1, club_verification_status: "not_applicable", member_consent_status: "granted", conflict_of_interest: false, application_consents: [], publication_consent: null, valid_companion_count: 0, confirmation_status_summary: { pending: 0, confirmed: 0, declined: 0, withdrawn: 0, expired: 0 }, evidence: [] }], review_events: [] };
}
async function mount(t, options = {}) {
  const env = { calls: [], project: async c => success(c), permissions: admin, ...options };
  environment = env;
  const queue = [BATCH, OTHER];
  env.client = { auth: { getSession: async () => ({ data: { session: { user: { id: USER } } } }), onAuthStateChange: cb => { env.auth = cb; return { data: { subscription: { unsubscribe() {} } } }; } }, rpc: async (name, args) => name.startsWith("list_") ? { data: queue.map(b => ({ ...detail(b).application_batch, active_record_count: 1 })) } : { data: [detail(args.p_application_batch_id)] } };
  env.review = async () => { queue.splice(queue.indexOf(BATCH), 1); return { ok: true, result: receipt() }; };
  env.container = dom.document.createElement("div"); dom.document.body.appendChild(env.container);
  const root = createRoot(env.container);
  env.render = async (r = receipt(), permissions = env.permissions) => { await act(async () => root.render(options.queue ? React.createElement(Queue, { userId: USER, permissions }) : React.createElement(detailModule.HallOfFameApplicationDecisionReceipt, { receipt: r, permissions }))); await settle(); };
  t.after(async () => { await act(async () => root.unmount()); env.container.parentNode.removeChild(env.container); });
  await env.render(options.receipt); return env;
}
async function approve(env) {
  await click(buttons(env).find(b => b.getAttribute("aria-pressed") !== null));
  await change(env.container.querySelectorAll("select")[0], "approve");
  await change(env.container.querySelectorAll("input")[0], undefined, true);
  await click(button(env, "최종 결정 확정"));
}
test("approved receipt separates approval/canonical/publication and submits IDs only", async t => {
  const env = await mount(t); assert.match(env.container.textContent, /승인이 완료/); assert.match(env.container.textContent, /승인 기록 번호/); assert.match(env.container.textContent, /동기화가 필요/);
  await click(button(env, "공개 상태 동기화")); assert.deepEqual(env.calls, [command]); assert.match(env.container.textContent, /동기화 완료 · 공개 · 변경 반영/);
});
test("rejected records have no projection action even if a malformed receipt includes canonical ID", async t => {
  const env = await mount(t, { receipt: receipt({ status: "rejected", approved: 0, rejected: 1, decisions: [{ id: APPLICATION, status: "rejected", canonicalId: CANONICAL }] }) });
  assert.equal(button(env, "공개 상태 동기화"), undefined);
});
for (const permissions of [{ canRead: false, canReview: false, canDecide: false }, { canRead: true, canReview: true, canDecide: false }]) test("member/moderator receipt has no projection action", async t => {
  const env = await mount(t, { permissions }); assert.equal(button(env, "공개 상태 동기화"), undefined);
});
test("pending projection blocks duplicate clicks and shows processing status", async t => {
  const d = deferred(), env = await mount(t, { project: () => d.promise });
  await click(button(env, "공개 상태 동기화")); assert.equal(button(env, "동기화 중…").disabled, true);
  await click(button(env, "동기화 중…")); assert.equal(env.calls.length, 1);
  await act(async () => d.resolve(success())); await settle(); assert.match(env.container.textContent, /동기화 완료/);
});
for (const [status, label] of [["hidden", "비공개"], ["published", "공개"], ["suppressed", "공개 중단"]]) test(`UI shows ${status}, no-change and replay without implying a new publication`, async t => {
  const env = await mount(t, { project: async c => success(c, { publicationStatus: status, changed: false, replayed: true }) });
  await click(button(env, "공개 상태 동기화")); assert.match(env.container.textContent, new RegExp(`동기화 완료 · ${label} · 변경 없음 · 이전 요청 결과 확인`));
});
test("stale UI needs an explicit retry; retry succeeds with fresh server action", async t => {
  const env = await mount(t, { project: async () => review.projectionFailure({ code: "PT409" }) });
  await click(button(env, "공개 상태 동기화")); assert.match(env.container.textContent, /최신 공개 상태를 조회/); assert.equal(env.calls.length, 1);
  env.project = async c => success(c); await click(button(env, "공개 상태 동기화")); assert.equal(env.calls.length, 2); assert.match(env.container.textContent, /동기화 완료/);
});
for (const field of ["recordId", "applicationRecordId", "batchId"]) test(`UI rejects another ${field} in late/malformed result`, async t => {
  const env = await mount(t, { project: async c => success(c, { [field]: OTHER }) });
  await click(button(env, "공개 상태 동기화")); assert.doesNotMatch(env.container.textContent, /동기화 완료/); assert.match(env.container.textContent, /결과를 확인할 수 없습니다/);
});
test("different canonical control cannot receive an earlier result", async t => {
  const d = deferred(), env = await mount(t, { project: () => d.promise });
  await click(button(env, "공개 상태 동기화")); await env.render(receipt({ decisions: [{ id: OTHER, status: "approved", canonicalId: OTHER }] }));
  await act(async () => d.resolve(success())); await settle(); assert.doesNotMatch(env.container.textContent, /동기화 완료/); assert.match(env.container.textContent, /동기화가 필요/);
});
test("actual approval receipt connects projection; selecting B discards pending A response", async t => {
  const d = deferred(), env = await mount(t, { queue: true, project: () => d.promise });
  await approve(env); await click(button(env, "공개 상태 동기화"));
  await click(buttons(env).find(b => b.getAttribute("aria-pressed") !== null));
  await act(async () => d.resolve(success())); await settle();
  assert.match(env.container.textContent, /B 구장/); assert.doesNotMatch(env.container.textContent, /동기화 완료|승인 기록 번호/);
});
for (const kind of ["logoutEvent", "signedOut", "accountSwitch"]) test(`${kind} removes pending projection receipt and ignores the late response`, async t => {
  const d = deferred(), env = await mount(t, { queue: true, project: () => d.promise });
  await approve(env); await click(button(env, "공개 상태 동기화"));
  await act(async () => { if (kind === "logoutEvent") dom.window.dispatchEvent(new Event("pul-auth-signed-out")); else env.auth("SIGNED_OUT", kind === "accountSwitch" ? { user: { id: OTHER } } : null); });
  await settle(); assert.equal(env.container.textContent, "");
  await act(async () => d.resolve(success())); await settle(); assert.equal(env.container.textContent, "");
  await act(async () => env.auth("SIGNED_IN", { user: { id: USER } })); await settle(); assert.doesNotMatch(env.container.textContent, /동기화 완료|승인 기록 번호/);
});
