import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";

import { createClient } from "@supabase/supabase-js";

const container = "supabase_db_pul-platform";
const apiUrl = "http://127.0.0.1:54321";
const fixtureRequestId = randomUUID();
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const cases = Object.fromEntries(
  ["success", "future", "staleEvidence", "staleBatch", "retry"].map(
    (name) => [
      name,
      {
        actorId: randomUUID(),
        batchId: randomUUID(),
        roundId: randomUUID(),
        recordId: randomUUID(),
        evidenceId: randomUUID(),
      },
    ],
  ),
);
const requestIds = {
  successExpire: randomUUID(),
  successStorage: randomUUID(),
  futureExpire: randomUUID(),
  staleEvidence: randomUUID(),
  staleBatch: randomUUID(),
  retryExpire: randomUUID(),
  retryFailure: randomUUID(),
  retrySuccess: randomUUID(),
};

let service;
const uploadedPaths = new Set();

function command(file, args, input) {
  return spawnSync(file, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function sql(text) {
  return command(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    text,
  );
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function serviceToken(secret) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(
    JSON.stringify({
      aud: "authenticated",
      exp: now + 3600,
      iat: now,
      iss: "supabase-demo",
      role: "service_role",
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", secret)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

function storagePath(fixture) {
  return `applications/${fixture.batchId}/${fixture.evidenceId}/original`;
}

function fixtureRows() {
  return Object.values(cases)
    .map(
      (fixture) => `
insert into public.hall_of_fame_application_batches(
  id,application_type,created_by_user_id,created_by_membership_id,
  nominating_club_id,status,version
) values (
  '${fixture.batchId}','direct_application','${fixture.actorId}',null,null,'draft',1
);
insert into public.hall_of_fame_round_snapshots(
  id,application_batch_id,played_on,course_name_snapshot,
  course_region_snapshot,course_environment,round_type
) values (
  '${fixture.roundId}','${fixture.batchId}','2026-08-28',
  'TEST cleanup course','TEST','outdoor','practice'
);
insert into public.hall_of_fame_application_records(
  id,application_batch_id,round_snapshot_id,target_user_id,record_type_code,
  course_segment_snapshot,hole_number,hole_par,strokes,version
) values (
  '${fixture.recordId}','${fixture.batchId}','${fixture.roundId}','${fixture.actorId}',
  'hole_in_one','TEST',1,3,1,1
);
insert into public.hall_of_fame_application_history(
  scope,application_batch_id,application_record_id,from_status,to_status,
  version,actor_user_id,action,request_id
) values
  ('batch','${fixture.batchId}',null,null,'draft',1,'${fixture.actorId}',
   'hall_of_fame.evidence.cleanup.fixture','${fixtureRequestId}'),
  ('record','${fixture.batchId}','${fixture.recordId}',null,'draft',1,'${fixture.actorId}',
   'hall_of_fame.evidence.cleanup.fixture','${fixtureRequestId}');
insert into public.hall_of_fame_evidence_files(
  id,application_batch_id,application_record_id,evidence_type,storage_bucket,
  storage_path,mime_type,byte_size,sha256,original_filename,
  uploaded_by_user_id,status,declared_mime_type,declared_byte_size,
  upload_expires_at,version,created_at,updated_at,finalized_at
) values (
  '${fixture.evidenceId}','${fixture.batchId}','${fixture.recordId}',
  'scorecard','hall-of-fame-evidence','${storagePath(fixture)}','image/png',
  null,null,null,'${fixture.actorId}','pending_upload','image/png',${png.byteLength},
  ${fixture === cases.future ? "now() + interval '1 hour'" : "now() - interval '1 hour'"},
  1,now() - interval '2 hours',now() - interval '2 hours',null
);
insert into public.hall_of_fame_evidence_file_history(
  evidence_id,application_batch_id,application_record_id,from_status,to_status,
  evidence_version,operation,actor_user_id,request_id
) values (
  '${fixture.evidenceId}','${fixture.batchId}','${fixture.recordId}',null,
  'pending_upload',1,'hall_of_fame.evidence.cleanup_fixture','${fixture.actorId}',
  '${fixtureRequestId}'
);`,
    )
    .join("\n");
}

before(async () => {
  const baseline = sql(
    "select count(*) || '|' || max(version) from supabase_migrations.schema_migrations;",
  );
  assert.equal(baseline.status, 0, baseline.stderr);
  assert.equal(baseline.stdout.trim(), "76|20260922000100");

  const secretResult = command("docker", [
    "exec",
    "supabase_auth_pul-platform",
    "printenv",
    "GOTRUE_JWT_SECRET",
  ]);
  assert.equal(secretResult.status, 0, "local JWT secret must be available");
  let secret = secretResult.stdout.trim();
  assert.ok(secret.length >= 32);
  let token = serviceToken(secret);
  service = createClient(apiUrl, token, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  secret = "";
  token = "";
  secretResult.stdout = "";

  const fixture = sql(`
begin;
set local session_replication_role = replica;
insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  created_at,updated_at
) values
${Object.values(cases).map((item) => `  ('${item.actorId}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-cleanup-${item.actorId}@example.invalid','',now(),now(),now())`).join(",\n")};
insert into public.user_accounts(id,account_status) values
${Object.values(cases).map((item) => `  ('${item.actorId}','active')`).join(",\n")};
insert into private.hall_of_fame_mutation_requests(
  actor_user_id,request_id,operation,payload_fingerprint,status,
  result_payload,completed_at
) values
${Object.values(cases).map((item) => `  ('${item.actorId}','${fixtureRequestId}','hall_of_fame.evidence.cleanup.fixture',decode(repeat('ab',32),'hex'),'completed','{}',now())`).join(",\n")};
${fixtureRows()}
commit;
`);
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);

  for (const fixtureCase of [cases.success, cases.retry]) {
    const path = storagePath(fixtureCase);
    const uploaded = await service.storage
      .from("hall-of-fame-evidence")
      .upload(path, png, { contentType: "image/png", upsert: false });
    assert.equal(uploaded.error, null, "local TEST Storage upload must succeed");
    uploadedPaths.add(path);
  }
});

after(async () => {
  if (service) {
    for (const path of uploadedPaths) {
      await service.storage.from("hall-of-fame-evidence").remove([path]);
    }
  }
  const allRequestIds = [fixtureRequestId, ...Object.values(requestIds)];
  const ids = Object.values(cases);
  const cleanup = sql(`
begin;
set local session_replication_role = replica;
delete from public.audit_logs where request_id in (${allRequestIds.map((id) => `'${id}'`).join(",")});
delete from public.hall_of_fame_evidence_file_history where evidence_id in (${ids.map((item) => `'${item.evidenceId}'`).join(",")});
delete from public.hall_of_fame_application_history where application_batch_id in (${ids.map((item) => `'${item.batchId}'`).join(",")});
delete from private.hall_of_fame_mutation_requests where actor_user_id in (${ids.map((item) => `'${item.actorId}'`).join(",")});
delete from public.hall_of_fame_evidence_files where application_batch_id in (${ids.map((item) => `'${item.batchId}'`).join(",")});
delete from public.hall_of_fame_application_records where application_batch_id in (${ids.map((item) => `'${item.batchId}'`).join(",")});
delete from public.hall_of_fame_round_snapshots where application_batch_id in (${ids.map((item) => `'${item.batchId}'`).join(",")});
delete from public.hall_of_fame_application_batches where id in (${ids.map((item) => `'${item.batchId}'`).join(",")});
delete from public.user_accounts where id in (${ids.map((item) => `'${item.actorId}'`).join(",")});
delete from auth.users where id in (${ids.map((item) => `'${item.actorId}'`).join(",")});
commit;
  `);
  assert.equal(cleanup.status, 0, cleanup.stdout + cleanup.stderr);
  const finalState = sql(`
select
  (select count(*) from public.hall_of_fame_application_batches
   where id in (${ids.map((item) => `'${item.batchId}'`).join(",")})) || '|' ||
  (select count(*) from public.user_accounts
   where id in (${ids.map((item) => `'${item.actorId}'`).join(",")})) || '|' ||
  (select count(*) from storage.objects
   where bucket_id='hall-of-fame-evidence'
     and name in (${ids.map((item) => `'${storagePath(item)}'`).join(",")}));
`);
  assert.equal(finalState.status, 0, finalState.stderr);
  assert.equal(finalState.stdout.trim(), "0|0|0", "local TEST fixture must leave no orphan");
  uploadedPaths.clear();
  service = undefined;
});

test("local canonical cleanup covers success, early rejection, stale versions, replay, failure and retry", async () => {
  const listBefore = await service.rpc(
    "list_hall_of_fame_evidence_cleanup_candidates_server",
    { p_limit: 500 },
  );
  assert.equal(listBefore.error, null);
  const fixtureCandidateIds = new Set(Object.values(cases).map((item) => item.evidenceId));
  assert.equal(
    listBefore.data.filter((row) => fixtureCandidateIds.has(row.evidence_id)).length,
    4,
    "future pending upload must not be a cleanup candidate",
  );

  const future = await service.rpc("expire_hall_of_fame_evidence_server", {
    p_evidence_id: cases.future.evidenceId,
    p_expected_evidence_version: 1,
    p_expected_batch_version: 1,
    p_request_id: requestIds.futureExpire,
  });
  assert.notEqual(future.error, null, "not-yet-expired evidence must be rejected");

  const staleEvidence = await service.rpc("expire_hall_of_fame_evidence_server", {
    p_evidence_id: cases.staleEvidence.evidenceId,
    p_expected_evidence_version: 2,
    p_expected_batch_version: 1,
    p_request_id: requestIds.staleEvidence,
  });
  assert.match(staleEvidence.error?.message ?? "", /VERSION_CONFLICT/);

  const staleBatch = await service.rpc("expire_hall_of_fame_evidence_server", {
    p_evidence_id: cases.staleBatch.evidenceId,
    p_expected_evidence_version: 1,
    p_expected_batch_version: 2,
    p_request_id: requestIds.staleBatch,
  });
  assert.match(staleBatch.error?.message ?? "", /VERSION_CONFLICT/);

  const expired = await service.rpc("expire_hall_of_fame_evidence_server", {
    p_evidence_id: cases.success.evidenceId,
    p_expected_evidence_version: 1,
    p_expected_batch_version: 1,
    p_request_id: requestIds.successExpire,
  });
  assert.equal(expired.error, null);
  assert.equal(expired.data[0].status, "expired");
  const expiredReplay = await service.rpc("expire_hall_of_fame_evidence_server", {
    p_evidence_id: cases.success.evidenceId,
    p_expected_evidence_version: 1,
    p_expected_batch_version: 1,
    p_request_id: requestIds.successExpire,
  });
  assert.equal(expiredReplay.error, null);
  assert.equal(expiredReplay.data[0].replayed, true);

  const successPath = storagePath(cases.success);
  const removed = await service.storage
    .from("hall-of-fame-evidence")
    .remove([successPath]);
  assert.equal(removed.error, null);
  uploadedPaths.delete(successPath);
  const marked = await service.rpc(
    "mark_hall_of_fame_evidence_storage_deleted_server",
    {
      p_evidence_id: cases.success.evidenceId,
      p_deleted: true,
      p_error_code: null,
      p_request_id: requestIds.successStorage,
    },
  );
  assert.equal(marked.error, null);
  assert.ok(marked.data[0].storage_deleted_at);
  const markedReplay = await service.rpc(
    "mark_hall_of_fame_evidence_storage_deleted_server",
    {
      p_evidence_id: cases.success.evidenceId,
      p_deleted: true,
      p_error_code: null,
      p_request_id: requestIds.successStorage,
    },
  );
  assert.equal(markedReplay.error, null);
  assert.equal(markedReplay.data[0].replayed, true);
  const missing = await service.storage
    .from("hall-of-fame-evidence")
    .download(successPath);
  assert.notEqual(missing.error, null, "success object must be absent");

  const retryExpired = await service.rpc("expire_hall_of_fame_evidence_server", {
    p_evidence_id: cases.retry.evidenceId,
    p_expected_evidence_version: 1,
    p_expected_batch_version: 1,
    p_request_id: requestIds.retryExpire,
  });
  assert.equal(retryExpired.error, null);
  const failure = await service.rpc(
    "mark_hall_of_fame_evidence_storage_deleted_server",
    {
      p_evidence_id: cases.retry.evidenceId,
      p_deleted: false,
      p_error_code: "HOF_STORAGE_DELETE_FAILED",
      p_request_id: requestIds.retryFailure,
    },
  );
  assert.equal(failure.error, null);
  assert.equal(failure.data[0].storage_deleted_at, null);
  assert.equal(
    failure.data[0].storage_delete_error_code,
    "HOF_STORAGE_DELETE_FAILED",
  );
  const retryContext = await service.rpc(
    "get_hall_of_fame_evidence_cleanup_context_server",
    { p_evidence_id: cases.retry.evidenceId },
  );
  assert.equal(retryContext.error, null);
  assert.equal(retryContext.data.length, 1, "failed deletion remains retryable");

  const retryPath = storagePath(cases.retry);
  const retryRemoval = await service.storage
    .from("hall-of-fame-evidence")
    .remove([retryPath]);
  assert.equal(retryRemoval.error, null);
  uploadedPaths.delete(retryPath);
  const retrySuccess = await service.rpc(
    "mark_hall_of_fame_evidence_storage_deleted_server",
    {
      p_evidence_id: cases.retry.evidenceId,
      p_deleted: true,
      p_error_code: null,
      p_request_id: requestIds.retrySuccess,
    },
  );
  assert.equal(retrySuccess.error, null);
  assert.ok(retrySuccess.data[0].storage_deleted_at);

  const state = sql(`
select
  (select count(*) from public.hall_of_fame_evidence_file_history
   where evidence_id='${cases.success.evidenceId}') || '|' ||
  (select count(*) from public.audit_logs
   where request_id in ('${requestIds.successExpire}','${requestIds.successStorage}')) || '|' ||
  (select count(*) from private.hall_of_fame_mutation_requests
   where request_id in ('${requestIds.successExpire}','${requestIds.successStorage}')) || '|' ||
  (select count(*) from public.audit_logs
   where request_id in ('${requestIds.staleEvidence}','${requestIds.staleBatch}','${requestIds.futureExpire}')) || '|' ||
  (select count(*) from private.hall_of_fame_mutation_requests
   where request_id in ('${requestIds.staleEvidence}','${requestIds.staleBatch}','${requestIds.futureExpire}')) || '|' ||
  (select count(*) from public.audit_logs
   where request_id in ('${requestIds.retryFailure}','${requestIds.retrySuccess}')) || '|' ||
  (select count(*) from private.hall_of_fame_mutation_requests
   where request_id in ('${requestIds.retryFailure}','${requestIds.retrySuccess}'));
`);
  assert.equal(state.status, 0, state.stderr);
  assert.equal(state.stdout.trim(), "2|2|2|0|0|2|2");

  const afterSuccess = await service.rpc(
    "get_hall_of_fame_evidence_cleanup_context_server",
    { p_evidence_id: cases.success.evidenceId },
  );
  const afterRetry = await service.rpc(
    "get_hall_of_fame_evidence_cleanup_context_server",
    { p_evidence_id: cases.retry.evidenceId },
  );
  assert.equal(afterSuccess.data.length, 0);
  assert.equal(afterRetry.data.length, 0);
});
