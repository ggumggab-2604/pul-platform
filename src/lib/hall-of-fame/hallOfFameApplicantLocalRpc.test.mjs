// Only the named PUL local Docker database is used. All test writes go to a disposable clone.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, after, test } from "node:test";
import ts from "typescript";
import * as adapter from "./hallOfFameApplicant.ts";
import * as evidenceValidation from "./hallOfFameEvidenceValidation.ts";

const require = createRequire(import.meta.url);
const container = "supabase_db_pul-platform";
const database = `pul_b5_${process.pid}_${Date.now()}`;
const users = { applicant: randomUUID(), companion: randomUUID(), other: randomUUID(), inactive: randomUUID(), admin: randomUUID() };
let actor = users.applicant;
let batch;
let record;
let confirmation;
let action;
let created = false;
function docker(args, input) { return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); }
function sql(text) { return docker(["exec", "-i", container, "psql", "-U", "supabase_admin", "-d", database, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], text); }
function success(result) { assert.equal(result.status, 0, result.stdout + result.stderr); return result.stdout.trim(); }
function literal(value) {
  if (value == null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}
function rpc(userId, name, args = {}, role = "authenticated") {
  assert.match(name, /^[a-z_]+$/);
  const params = Object.entries(args).map(([key, value]) => { assert.match(key, /^[a-z_][a-z0-9_]*$/); return `${key} => ${literal(value)}`; }).join(",");
  const scalar = name === "get_my_hall_of_fame_application_workspace";
  const expression = scalar ? `public.${name}(${params})` : `coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.${name}(${params}) x`;
  const result = sql(`set role ${role}; set request.jwt.claim.sub = '${userId}'; set request.jwt.claim.role = '${role}'; select ${expression};`);
  if (result.status !== 0) return { data: null, error: { message: result.stderr } };
  return { data: JSON.parse(result.stdout.trim()), error: null };
}
const client = { rpc: async (name, args) => rpc(actor, name, args) };
function current() { const result = rpc(users.applicant, "get_my_hall_of_fame_application_workspace", { p_application_batch_id: batch }); assert.equal(result.error, null, JSON.stringify(result.error)); return result.data.applications[0]; }
async function command(operation, extra = {}) { return action({ operation, sessionUserId: actor, requestId: randomUUID(), batchId: batch, expectedVersion: batch ? current().version : undefined, ...extra }); }
const fields = { played_on: "2026-09-01", course_name: "B5 LOCAL COURSE", course_region: "서울", course_environment: "outdoor", round_type: "casual", record_type_code: "hole_in_one", course_segment: "A", hole_number: 1, hole_par: 3, strokes: 1 };

before(() => {
  assert.match(database, /^pul_b5_\d+_\d+$/);
  success(docker(["exec", container, "createdb", "-U", "supabase_admin", "-O", "postgres", database]));
  created = true;
  success(docker(["exec", container, "sh", "-lc", `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`]));
  success(docker(["exec", container, "sh", "-lc", `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`]));
  // The local development container may predate the official B4 migration.
  // Bring only the disposable clone to that schema before testing the candidate.
  if (success(sql("select exists(select 1 from supabase_migrations.schema_migrations where version='20260930000100');")) === "f") {
    success(sql("set role postgres;\n" + readFileSync(new URL("../../../supabase/migrations/20260930000100_pul_community_reports.sql", import.meta.url), "utf8")));
  }
  success(sql("set role postgres;\n" + readFileSync(new URL("../../../supabase/migrations/20261001000100_pul_hall_of_fame_applicant_workspace_read.sql", import.meta.url), "utf8")));
  const userRows = Object.values(users).map(id => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${id}@example.invalid','',now(),now(),now())`).join(",");
  const accounts = Object.entries(users).map(([key, id]) => `('${id}','${key === "inactive" ? "suspended" : "active"}','${key === "admin" ? "platform_admin" : "member"}')`).join(",");
  success(sql(`set session_replication_role=replica; insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${userRows}; insert into public.user_accounts(id,account_status,platform_role) values ${accounts}; set session_replication_role=origin;`));
  const source = readFileSync(new URL("../../app/hall-of-fame/apply/actions.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  const storage = {
    createHallOfFameEvidenceUploadIntent: async () => { throw new Error("Storage transport is tested separately"); },
    finalizeHallOfFameEvidence: async () => { throw new Error("Storage transport is tested separately"); },
    withdrawHallOfFameEvidence: async () => { throw new Error("Storage transport is tested separately"); },
  };
  new Function("require", "module", "exports", compiled)(name => {
    if (name === "next/cache") return { revalidatePath() {} };
    if (name === "@/lib/supabase/auth") return { getAuthenticatedSupabaseContext: async () => ({ userId: actor, supabase: client }) };
    if (name.endsWith("hallOfFameApplicant")) return adapter;
    if (name.endsWith("hallOfFameEvidenceStorage")) return storage;
    if (name.endsWith("hallOfFameEvidenceValidation")) return evidenceValidation;
    return require(name);
  }, compiledModule, compiledModule.exports);
  action = compiledModule.exports.performApplicantAction;
});
after(() => { if (created) success(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database])); });

test("workspace requires active authentication, rejects anon and keeps table access revoked", () => {
  assert.ok(rpc(users.inactive, "get_my_hall_of_fame_application_workspace").error);
  assert.ok(rpc(users.applicant, "get_my_hall_of_fame_application_workspace", {}, "anon").error);
  assert.equal(success(sql("select has_table_privilege('authenticated','public.hall_of_fame_application_batches','select');")), "f");
  assert.deepEqual(rpc(users.applicant, "get_my_hall_of_fame_application_workspace").data.record_types.map(t => t.code), ["hole_in_one", "albatross", "condor"]);
});
test("create action derives the applicant and replays the same request once", async () => {
  const id = randomUUID();
  const result = await command("create", { requestId: id });
  assert.equal(result.ok, true, result.message); batch = result.batchId;
  const replay = await command("create", { requestId: id });
  assert.equal(replay.batchId, batch);
  assert.equal(success(sql(`select created_by_user_id from public.hall_of_fame_application_batches where id='${batch}'`)), users.applicant);
  assert.equal(current().records.length, 0);
});
test("session swaps and foreign batches fail without a write", async () => {
  const result = await command("save", { sessionUserId: users.other, fields });
  assert.equal(result.ok, false); assert.match(result.message, /로그인/);
  actor = users.other;
  assert.equal((await command("save", { fields })).ok, false);
  actor = users.applicant;
  assert.equal(current().records.length, 0);
});
test("record saving uses auth identity and creates a resumable private record", async () => {
  const result = await command("save", { fields: { ...fields, target_user_id: users.other } });
  assert.equal(result.ok, true, result.message);
  record = current().records[0].id;
  assert.equal(success(sql(`select target_user_id from public.hall_of_fame_application_records where id='${record}'`)), users.applicant);
  assert.equal(current().round.course_name, fields.course_name);
  assert.equal(rpc(users.other, "get_my_hall_of_fame_application_workspace", { p_application_batch_id: batch }).data.applications.length, 0);
});
test("stale versions and absent consent block submission", async () => {
  const stale = await command("consent", { expectedVersion: 1, consents: [true, true, true] });
  assert.equal(stale.ok, false);
  assert.equal((await command("consent", { consents: [true, false, true] })).ok, false);
  assert.equal((await command("submit")).ok, false);
  assert.equal(current().status, "draft");
});
test("consent action preserves minimal publication scope", async () => {
  const result = await command("consent", { consents: [true, true, true] });
  assert.equal(result.ok, true, result.message);
  const r = current().records[0]; assert.ok(r.processing_consent && r.review_consent && r.publication_consent);
  assert.equal(success(sql(`select full_display_name_consent or avatar_consent or club_name_consent or badge_consent from public.hall_of_fame_publication_consents where application_record_id='${record}'`)), "f");
});
test("self confirmation is rejected and only designated companion receives minimal context", async () => {
  assert.equal((await command("requestConfirmation", { confirmerCode: users.applicant })).ok, false);
  const result = await command("requestConfirmation", { confirmerCode: users.companion });
  assert.equal(result.ok, true, result.message);
  const incoming = rpc(users.companion, "get_my_hall_of_fame_application_workspace").data.incoming_confirmations;
  assert.equal(incoming.length, 1); confirmation = incoming[0].id;
  assert.equal(incoming[0].course_name, fields.course_name);
  assert.doesNotMatch(JSON.stringify(incoming), /evidence|storage|reviewer|user_id|consent|internal/);
  assert.equal(rpc(users.other, "get_my_hall_of_fame_application_workspace").data.incoming_confirmations.length, 0);
  assert.equal((await command("submit")).ok, false);
});
test("only the designated companion may confirm, and scorecard remains required", async () => {
  actor = users.other;
  assert.equal((await command("respond", { confirmationId: confirmation, response: "confirm" })).ok, false);
  actor = users.companion;
  const result = await command("respond", { confirmationId: confirmation, response: "confirm" });
  assert.equal(result.ok, true, result.message);
  actor = users.applicant;
  assert.ok(current().records[0].confirmations[0].active);
  assert.equal((await command("submit")).ok, false);
});
test("existing evidence intent/finalize RPCs satisfy the server-verified scorecard contract", () => {
  const intent = rpc(actor, "create_hall_of_fame_evidence_upload_intent", { p_application_record_id: record, p_evidence_type: "scorecard", p_declared_mime_type: "image/png", p_declared_size_bytes: 8, p_expected_batch_version: current().version, p_request_id: randomUUID() });
  assert.equal(intent.error, null, JSON.stringify(intent.error));
  const e = current().records[0].evidence[0];
  const finalized = rpc(actor, "finalize_hall_of_fame_evidence_server", { p_actor_user_id: actor, p_evidence_id: e.id, p_verified_mime_type: "image/png", p_verified_size_bytes: 8, p_verified_sha256_hex: "aa".repeat(32), p_expected_evidence_version: e.version, p_expected_batch_version: current().version, p_request_id: randomUUID() }, "service_role");
  assert.equal(finalized.error, null, JSON.stringify(finalized.error));
  assert.equal(current().records[0].evidence[0].status, "available");
});
test("submit action reaches own status and existing review queue without creating canonical records", async () => {
  const result = await command("submit");
  assert.equal(result.ok, true, result.message); assert.ok(result.submitted);
  assert.equal(current().status, "submitted");
  const own = rpc(actor, "list_my_hall_of_fame_applications").data;
  assert.ok(own.some(r => r.application_record_id === record && r.record_status === "submitted"));
  assert.equal(rpc(users.other, "list_my_hall_of_fame_applications").data.length, 0);
  const queue = rpc(users.admin, "list_hall_of_fame_review_queue"); assert.equal(queue.error, null, JSON.stringify(queue.error));
  assert.ok(queue.data.some(b => b.application_batch_id === batch));
  assert.ok(rpc(users.other, "list_hall_of_fame_review_queue").error);
  assert.equal(success(sql(`select count(*) from public.hall_of_fame_records where source_application_record_id='${record}'`)), "0");
});
test("duplicate records and ineligible accounts remain blocked by DB", async () => {
  const original = batch;
  const next = await command("create"); assert.ok(next.ok); batch = next.batchId;
  assert.equal((await command("save", { fields })).ok, true);
  const duplicate = await command("submit"); assert.equal(duplicate.ok, false); assert.match(duplicate.message, /같은 기록/);
  actor = users.inactive;
  assert.equal((await command("create")).ok, false);
  actor = users.applicant; batch = original;
});

test("same-round applicants share each request ID only with its designated confirmer", async () => {
  const requestIds = [];
  try {
    for (const userId of [users.applicant, users.other]) {
      actor = userId;
      const workspace = () => rpc(userId, "get_my_hall_of_fame_application_workspace").data;
      let draft = workspace().applications.find(b => b.status === "draft");
      if (!draft) {
        const created = await action({ operation: "create", sessionUserId: userId, requestId: randomUUID() });
        assert.equal(created.ok, true, created.message);
        draft = workspace().applications.find(b => b.id === created.batchId);
      }
      if (!draft.records.length) {
        const saved = await action({ operation: "save", sessionUserId: userId, requestId: randomUUID(), batchId: draft.id, expectedVersion: draft.version, fields });
        assert.equal(saved.ok, true, saved.message);
        draft = workspace().applications.find(b => b.id === draft.id);
      }
      const requested = await action({ operation: "requestConfirmation", sessionUserId: userId, requestId: randomUUID(), batchId: draft.id, expectedVersion: draft.version, confirmerCode: users.companion });
      assert.equal(requested.ok, true, requested.message);
      const own = workspace().applications.find(b => b.id === draft.id).records[0].confirmations;
      assert.equal(own.length, 1);
      assert.deepEqual(Object.keys(own[0]).sort(), ["active", "id", "status"]);
      requestIds.push(own[0].id);
    }
    assert.notEqual(requestIds[0], requestIds[1]);
    const incoming = rpc(users.companion, "get_my_hall_of_fame_application_workspace").data.incoming_confirmations;
    assert.deepEqual(incoming.map(c => c.id).sort(), [...requestIds].sort());
    const context = c => [c.played_on, c.course_name, c.course_segment, c.hole_number, c.hole_par, c.strokes, c.record_type_code];
    assert.deepEqual(context(incoming[0]), context(incoming[1]));
    for (const c of incoming) {
      assert.deepEqual(Object.keys(c).sort(), ["batch_version", "course_name", "course_segment", "expires_at", "hole_number", "hole_par", "id", "played_on", "record_type_code", "status", "strokes"]);
    }
    assert.equal(rpc(users.admin, "get_my_hall_of_fame_application_workspace").data.incoming_confirmations.length, 0);
    actor = users.applicant;
    const denied = await action({ operation: "respond", sessionUserId: actor, requestId: randomUUID(), confirmationId: incoming[1].id, expectedVersion: incoming[1].batch_version, response: "confirm" });
    assert.equal(denied.ok, false);
    actor = users.companion;
    const selected = incoming.find(c => c.id === requestIds[1]);
    const accepted = await action({ operation: "respond", sessionUserId: actor, requestId: randomUUID(), confirmationId: selected.id, expectedVersion: selected.batch_version, response: "confirm" });
    assert.equal(accepted.ok, true, accepted.message);
    const remaining = rpc(users.companion, "get_my_hall_of_fame_application_workspace").data.incoming_confirmations;
    assert.deepEqual(remaining.map(c => c.id), [requestIds[0]]);
  } finally { actor = users.applicant; }
});
