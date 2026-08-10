import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const consentMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260808000100_pul_hall_of_fame_consent_confirmation_rpc.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const evidenceMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260808000200_pul_hall_of_fame_evidence_storage_rpc.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function docker(args, input) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 24 * 1024 * 1024,
  });
}

function sql(container, database, text, user = "supabase_admin") {
  return docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      user,
      "-d",
      database,
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    text,
  );
}

function sqlAsync(container, database, text, user = "supabase_admin") {
  return new Promise((resolve) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        user,
        "-d",
        database,
        "-X",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(text);
  });
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runGatedRace(batchId, leftSql, rightSql) {
  const gateSql =
    "select pg_advisory_lock(pg_catalog.hashtextextended('" +
    batchId +
    "'::text, 8610));\nselect pg_sleep(0.8);\n" +
    "select pg_advisory_unlock(pg_catalog.hashtextextended('" +
    batchId +
    "'::text, 8610));\n";
  const gate = sqlAsync(container, database, gateSql);
  await pause(150);
  const left = sqlAsync(container, database, leftSql);
  const right = sqlAsync(container, database, rightSql);
  const results = await Promise.all([left, right]);
  const gateResult = await gate;
  assert.equal(gateResult.status, 0, gateResult.stdout + gateResult.stderr);
  return results;
}

let container;
let database;

before(() => {
  const found = docker([
    "ps",
    "--filter",
    "name=supabase_db_",
    "--format",
    "{{.Names}}",
  ]);
  assert.equal(found.status, 0, found.stderr);
  const containers = found.stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(containers.length, 1);
  container = containers[0];
  database = `pul_hof_evidence_${process.pid}_${Date.now()}`;
  assert.match(database, /^[a-z0-9_]+$/);
  const clone = docker([
    "exec",
    container,
    "sh",
    "-lc",
    [
      `createdb -U supabase_admin -O postgres ${database}`,
      `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
      `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    ].join(" && "),
  ]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const baseline = sql(
    container,
    database,
    "select count(*) || ':' || max(version) from supabase_migrations.schema_migrations;",
  );
  assert.equal(baseline.status, 0, baseline.stderr);
  assert.match(baseline.stdout, /27:20260807000200/);
  const applied = sql(
    container,
    database,
    `begin;\n${consentMigration}\n${evidenceMigration}\ncommit;`,
    "postgres",
  );
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
});

after(() => {
  if (!container || !database) return;
  const dropped = docker([
    "exec",
    container,
    "dropdb",
    "--if-exists",
    "--force",
    "-U",
    "supabase_admin",
    database,
  ]);
  assert.equal(dropped.status, 0, dropped.stdout + dropped.stderr);
});

test("direct upload intent is atomic, replay-safe, and direct DML stays blocked", () => {
  const result = sql(
    container,
    database,
    String.raw`
begin;
set local session_replication_role = replica;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('f0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-evidence@example.invalid','',now(),now(),now());
insert into public.user_accounts(id,account_status)
values('f0000000-0000-0000-0000-000000000001','active');
insert into public.hall_of_fame_application_batches(id,application_type,created_by_user_id,status,version)
values('f1000000-0000-0000-0000-000000000001','direct_application','f0000000-0000-0000-0000-000000000001','draft',1);
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,course_region_snapshot,course_environment,round_type)
values('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','2026-08-01','TEST','TEST','outdoor','practice');
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,record_type_code,
 course_segment_snapshot,hole_number,hole_par,strokes,version)
values('f3000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',
 'f2000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001',
 'hole_in_one','a',1,3,1,1);
insert into private.hall_of_fame_mutation_requests(
 actor_user_id,request_id,operation,payload_fingerprint,status,result_payload,completed_at)
values('f0000000-0000-0000-0000-000000000001','f9000000-0000-0000-0000-000000000001',
 'hall_of_fame.fixture.create',decode(repeat('f1',32),'hex'),'completed','{}',now());
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,version,actor_user_id,action,request_id)
values
 ('batch','f1000000-0000-0000-0000-000000000001',null,null,'draft',1,'f0000000-0000-0000-0000-000000000001','hall_of_fame.fixture.create','f9000000-0000-0000-0000-000000000001'),
 ('record','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001',null,'draft',1,'f0000000-0000-0000-0000-000000000001','hall_of_fame.fixture.create','f9000000-0000-0000-0000-000000000001');
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000001',true);
select * from public.create_hall_of_fame_evidence_upload_intent(
 'f3000000-0000-0000-0000-000000000001','scorecard','image/png',8,1,
 'f9000000-0000-0000-0000-000000000101') \gset first_
select * from public.create_hall_of_fame_evidence_upload_intent(
 'f3000000-0000-0000-0000-000000000001','scorecard','image/png',8,1,
 'f9000000-0000-0000-0000-000000000101') \gset replay_
reset role;
select (:'first_replayed' = 'f') and (:'replay_replayed' = 't')
 and (:'first_evidence_id' = :'replay_evidence_id')
 and ((select count(*) from public.hall_of_fame_evidence_files)=1)
 and ((select count(*) from public.hall_of_fame_evidence_file_history)=1)
 and ((select count(*) from public.audit_logs where request_id='f9000000-0000-0000-0000-000000000101')=1)
 and ((select count(*) from private.hall_of_fame_mutation_requests where request_id='f9000000-0000-0000-0000-000000000101' and status='completed')=1);
rollback;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\bt\b/);
});


test("finalize, replacement, withdrawal, read, and cleanup form one versioned lifecycle", () => {
  const result = sql(
    container,
    database,
    String.raw`
begin;
set local session_replication_role = replica;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('e0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hof-evidence-lifecycle@example.invalid','',now(),now(),now());
insert into public.user_accounts(id,account_status)
values('e0000000-0000-0000-0000-000000000002','active');
insert into public.hall_of_fame_application_batches(id,application_type,created_by_user_id,status,version)
values('e1000000-0000-0000-0000-000000000002','direct_application','e0000000-0000-0000-0000-000000000002','draft',1);
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,course_region_snapshot,course_environment,round_type)
values('e2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000002','2026-08-02','TEST','TEST','outdoor','practice');
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,record_type_code,
 course_segment_snapshot,hole_number,hole_par,strokes,version)
values('e3000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000002',
 'e2000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000002',
 'hole_in_one','a',1,3,1,1);
insert into private.hall_of_fame_mutation_requests(
 actor_user_id,request_id,operation,payload_fingerprint,status,result_payload,completed_at)
values('e0000000-0000-0000-0000-000000000002','e9000000-0000-0000-0000-000000000002',
 'hall_of_fame.fixture.create',decode(repeat('e1',32),'hex'),'completed','{}',now());
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,version,actor_user_id,action,request_id)
values
 ('batch','e1000000-0000-0000-0000-000000000002',null,null,'draft',1,'e0000000-0000-0000-0000-000000000002','hall_of_fame.fixture.create','e9000000-0000-0000-0000-000000000002'),
 ('record','e1000000-0000-0000-0000-000000000002','e3000000-0000-0000-0000-000000000002',null,'draft',1,'e0000000-0000-0000-0000-000000000002','hall_of_fame.fixture.create','e9000000-0000-0000-0000-000000000002');
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002',true);
select * from public.create_hall_of_fame_evidence_upload_intent(
 'e3000000-0000-0000-0000-000000000002','scorecard','image/png',8,1,
 'e9000000-0000-0000-0000-000000000102') \gset intent_

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select * from public.get_hall_of_fame_evidence_upload_context_server(
 'e0000000-0000-0000-0000-000000000002', :'intent_evidence_id') \gset upload_
select * from public.finalize_hall_of_fame_evidence_server(
 'e0000000-0000-0000-0000-000000000002', :'intent_evidence_id', 'image/png', 8,
 repeat('ab',32), 1, 2, 'e9000000-0000-0000-0000-000000000103') \gset finalized_
select * from public.get_hall_of_fame_evidence_read_context_server(
 'e0000000-0000-0000-0000-000000000002', :'intent_evidence_id') \gset readable_

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002',true);
select * from public.create_hall_of_fame_evidence_replacement_intent(
 :'intent_evidence_id','image/png',8,3,
 'e9000000-0000-0000-0000-000000000104') \gset replacement_
reset role;
select status = 'available' as stayed_available
from public.hall_of_fame_evidence_files where id = :'intent_evidence_id' \gset old_

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select * from public.finalize_hall_of_fame_evidence_server(
 'e0000000-0000-0000-0000-000000000002', :'replacement_evidence_id', 'image/png', 8,
 repeat('cd',32), 1, 4, 'e9000000-0000-0000-0000-000000000105') \gset replacement_final_

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002',true);
select * from public.withdraw_hall_of_fame_evidence(
 :'replacement_evidence_id',2,5,
 'e9000000-0000-0000-0000-000000000106') \gset withdrawn_

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select count(*) as candidate_count
from public.list_hall_of_fame_evidence_cleanup_candidates_server(100)
where application_batch_id = 'e1000000-0000-0000-0000-000000000002' \gset cleanup_

reset role;
select
  :'intent_status' = 'pending_upload'
  and :'upload_storage_bucket' = 'hall-of-fame-evidence'
  and :'finalized_status' = 'available'
  and :'readable_sha256_hex' = repeat('ab',32)
  and :'old_stayed_available' = 't'
  and :'replacement_final_status' = 'available'
  and (select status = 'replaced' and version = 3
       from public.hall_of_fame_evidence_files where id = :'intent_evidence_id')
  and :'withdrawn_status' = 'deleted'
  and :'withdrawn_evidence_version' = '3'
  and :'withdrawn_batch_version' = '6'
  and :'cleanup_candidate_count' = '2'
  and (select count(*) = 6 from public.hall_of_fame_evidence_file_history
       where application_batch_id = 'e1000000-0000-0000-0000-000000000002')
  and (select count(*) = 5 from public.audit_logs
       where request_id in (
         'e9000000-0000-0000-0000-000000000102','e9000000-0000-0000-0000-000000000103',
         'e9000000-0000-0000-0000-000000000104','e9000000-0000-0000-0000-000000000105',
         'e9000000-0000-0000-0000-000000000106'))
  and (select count(*) = 5 from private.hall_of_fame_mutation_requests
       where request_id in (
         'e9000000-0000-0000-0000-000000000102','e9000000-0000-0000-0000-000000000103',
         'e9000000-0000-0000-0000-000000000104','e9000000-0000-0000-0000-000000000105',
         'e9000000-0000-0000-0000-000000000106') and status = 'completed');
rollback;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\bt\b/);
});

test("service cleanup survives inactive and revoked uploaders while unauthorized access stays blocked", () => {
  const result = sql(
    container,
    database,
    String.raw`
begin;
set local session_replication_role = replica;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('d0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inactive-evidence@example.invalid','',now(),now(),now()),
 ('d0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-evidence@example.invalid','',now(),now(),now()),
 ('d0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','revoked-evidence@example.invalid','',now(),now(),now()),
 ('d0000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nominee-evidence@example.invalid','',now(),now(),now());
insert into public.user_accounts(id,account_status) values
 ('d0000000-0000-0000-0000-000000000001','suspended'),
 ('d0000000-0000-0000-0000-000000000002','active'),
 ('d0000000-0000-0000-0000-000000000003','active'),
 ('d0000000-0000-0000-0000-000000000004','active');
insert into public.hall_of_fame_application_batches(
 id,application_type,created_by_user_id,created_by_membership_id,nominating_club_id,status,version)
values
 ('d1000000-0000-0000-0000-000000000001','direct_application','d0000000-0000-0000-0000-000000000001',null,null,'draft',1),
 ('d1000000-0000-0000-0000-000000000002','club_nomination','d0000000-0000-0000-0000-000000000003','d4000000-0000-0000-0000-000000000003','d5000000-0000-0000-0000-000000000003','draft',1),
 ('d1000000-0000-0000-0000-000000000003','direct_application','d0000000-0000-0000-0000-000000000002',null,null,'draft',1);
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,course_region_snapshot,course_environment,round_type)
values
 ('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','2026-08-01','TEST','TEST','outdoor','practice'),
 ('d2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002','2026-08-01','TEST','TEST','outdoor','practice'),
 ('d2000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003','2026-08-01','TEST','TEST','outdoor','practice');
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,record_type_code,
 course_segment_snapshot,hole_number,hole_par,strokes,version)
values
 ('d3000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','hole_in_one','a',1,3,1,1),
 ('d3000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000004','hole_in_one','a',2,3,1,1),
 ('d3000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000002','hole_in_one','a',3,3,1,1);
insert into private.hall_of_fame_mutation_requests(
 actor_user_id,request_id,operation,payload_fingerprint,status,result_payload,completed_at)
values
 ('d0000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000001','hall_of_fame.evidence.fixture',decode(repeat('d1',32),'hex'),'completed','{}',now()),
 ('d0000000-0000-0000-0000-000000000003','d9000000-0000-0000-0000-000000000002','hall_of_fame.evidence.fixture',decode(repeat('d2',32),'hex'),'completed','{}',now()),
 ('d0000000-0000-0000-0000-000000000002','d9000000-0000-0000-0000-000000000003','hall_of_fame.evidence.fixture',decode(repeat('d3',32),'hex'),'completed','{}',now());
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,version,actor_user_id,action,request_id)
values
 ('batch','d1000000-0000-0000-0000-000000000001',null,null,'draft',1,'d0000000-0000-0000-0000-000000000001','hall_of_fame.evidence.fixture','d9000000-0000-0000-0000-000000000001'),
 ('record','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001',null,'draft',1,'d0000000-0000-0000-0000-000000000001','hall_of_fame.evidence.fixture','d9000000-0000-0000-0000-000000000001'),
 ('batch','d1000000-0000-0000-0000-000000000002',null,null,'draft',1,'d0000000-0000-0000-0000-000000000003','hall_of_fame.evidence.fixture','d9000000-0000-0000-0000-000000000002'),
 ('record','d1000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000002',null,'draft',1,'d0000000-0000-0000-0000-000000000003','hall_of_fame.evidence.fixture','d9000000-0000-0000-0000-000000000002'),
 ('batch','d1000000-0000-0000-0000-000000000003',null,null,'draft',1,'d0000000-0000-0000-0000-000000000002','hall_of_fame.evidence.fixture','d9000000-0000-0000-0000-000000000003'),
 ('record','d1000000-0000-0000-0000-000000000003','d3000000-0000-0000-0000-000000000003',null,'draft',1,'d0000000-0000-0000-0000-000000000002','hall_of_fame.evidence.fixture','d9000000-0000-0000-0000-000000000003');
insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,storage_path,
 mime_type,byte_size,sha256,original_filename,uploaded_by_user_id,status,
 declared_mime_type,declared_byte_size,upload_expires_at,version,created_at,updated_at,finalized_at)
values
 ('d6000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','scorecard','hall-of-fame-evidence','applications/d1000000-0000-0000-0000-000000000001/d6000000-0000-0000-0000-000000000001/original','image/png',null,null,null,'d0000000-0000-0000-0000-000000000001','pending_upload','image/png',8,now()-interval '1 hour',1,now()-interval '2 hours',now()-interval '2 hours',null),
 ('d6000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000002','scorecard','hall-of-fame-evidence','applications/d1000000-0000-0000-0000-000000000002/d6000000-0000-0000-0000-000000000002/original','image/png',null,null,null,'d0000000-0000-0000-0000-000000000003','pending_upload','image/png',8,now()-interval '1 hour',1,now()-interval '2 hours',now()-interval '2 hours',null),
 ('d6000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003','d3000000-0000-0000-0000-000000000003','scorecard','hall-of-fame-evidence','applications/d1000000-0000-0000-0000-000000000003/d6000000-0000-0000-0000-000000000003/original','image/png',8,decode(repeat('aa',32),'hex'),null,'d0000000-0000-0000-0000-000000000002','available','image/png',8,now()+interval '1 hour',2,now()-interval '2 hours',now(),now()),
 ('d6000000-0000-0000-0000-000000000004','d1000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000002','scorecard','hall-of-fame-evidence','applications/d1000000-0000-0000-0000-000000000002/d6000000-0000-0000-0000-000000000004/original','image/png',8,decode(repeat('cc',32),'hex'),null,'d0000000-0000-0000-0000-000000000003','available','image/png',8,now()+interval '1 hour',2,now()-interval '2 hours',now(),now());
insert into public.hall_of_fame_evidence_file_history(
 evidence_id,application_batch_id,application_record_id,from_status,to_status,evidence_version,
 operation,actor_user_id,request_id)
values
 ('d6000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001',null,'pending_upload',1,'hall_of_fame.evidence.fixture','d0000000-0000-0000-0000-000000000001','d9000000-0000-0000-0000-000000000001'),
 ('d6000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000002',null,'pending_upload',1,'hall_of_fame.evidence.fixture','d0000000-0000-0000-0000-000000000003','d9000000-0000-0000-0000-000000000002'),
 ('d6000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003','d3000000-0000-0000-0000-000000000003',null,'pending_upload',1,'hall_of_fame.evidence.fixture','d0000000-0000-0000-0000-000000000002','d9000000-0000-0000-0000-000000000003'),
 ('d6000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003','d3000000-0000-0000-0000-000000000003','pending_upload','available',2,'hall_of_fame.evidence.fixture','d0000000-0000-0000-0000-000000000002','d9000000-0000-0000-0000-000000000003'),
 ('d6000000-0000-0000-0000-000000000004','d1000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000002',null,'pending_upload',1,'hall_of_fame.evidence.fixture','d0000000-0000-0000-0000-000000000003','d9000000-0000-0000-0000-000000000002'),
 ('d6000000-0000-0000-0000-000000000004','d1000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000002','pending_upload','available',2,'hall_of_fame.evidence.fixture','d0000000-0000-0000-0000-000000000003','d9000000-0000-0000-0000-000000000002');
set local session_replication_role = origin;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select * from public.expire_hall_of_fame_evidence_server(
 'd6000000-0000-0000-0000-000000000001',1,1,
 'd9000000-0000-0000-0000-000000000101') \gset inactive_
select * from public.expire_hall_of_fame_evidence_server(
 'd6000000-0000-0000-0000-000000000001',1,1,
 'd9000000-0000-0000-0000-000000000101') \gset inactive_replay_
select * from public.mark_hall_of_fame_evidence_storage_deleted_server(
 'd6000000-0000-0000-0000-000000000001',true,null,
 'd9000000-0000-0000-0000-000000000102') \gset deleted_
select * from public.expire_hall_of_fame_evidence_server(
 'd6000000-0000-0000-0000-000000000002',1,1,
 'd9000000-0000-0000-0000-000000000103') \gset revoked_
select * from public.get_hall_of_fame_evidence_read_context_server(
 'd0000000-0000-0000-0000-000000000002',
 'd6000000-0000-0000-0000-000000000003') \gset owner_read_
select * from public.get_hall_of_fame_evidence_read_context_server(
 'd0000000-0000-0000-0000-000000000004',
 'd6000000-0000-0000-0000-000000000004') \gset target_read_

do $check$
declare blocked boolean := false;
begin
  begin
    perform public.get_hall_of_fame_evidence_read_context_server(
      'd0000000-0000-0000-0000-000000000003',
      'd6000000-0000-0000-0000-000000000003');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'unrelated read unexpectedly allowed'; end if;
end;
$check$;
do $check$
declare blocked boolean := false;
begin
  begin
    perform public.get_hall_of_fame_evidence_read_context_server(
      'd0000000-0000-0000-0000-000000000002',
      'd6000000-0000-0000-0000-000000000001');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'inactive evidence read unexpectedly allowed'; end if;
end;
$check$;

do $check$
declare blocked boolean := false;
begin
  begin
    perform public.get_hall_of_fame_evidence_read_context_server(
      'd0000000-0000-0000-0000-000000000004',
      'd6000000-0000-0000-0000-000000000003');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'nomination target read another record unexpectedly allowed'; end if;
end;
$check$;
do $check$
declare blocked boolean := false;
begin
  begin
    perform public.get_hall_of_fame_evidence_read_context_server(
      'd0000000-0000-0000-0000-000000000003',
      'd6000000-0000-0000-0000-000000000004');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'revoked nominator read unexpectedly allowed'; end if;
end;
$check$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d0000000-0000-0000-0000-000000000003',true);
do $check$
declare blocked boolean := false;
begin
  begin
    perform public.create_hall_of_fame_evidence_upload_intent(
      'd3000000-0000-0000-0000-000000000002','scorecard','image/png',8,1,
      'd9000000-0000-0000-0000-000000000104');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'revoked creator upload unexpectedly allowed'; end if;
end;
$check$;
select set_config('request.jwt.claim.sub','d0000000-0000-0000-0000-000000000004',true);
do $check$
declare blocked boolean := false;
begin
  begin
    perform public.create_hall_of_fame_evidence_upload_intent(
      'd3000000-0000-0000-0000-000000000002','scorecard','image/png',8,1,
      'd9000000-0000-0000-0000-000000000106');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'nomination target upload unexpectedly allowed'; end if;
end;
$check$;
select set_config('request.jwt.claim.sub','d0000000-0000-0000-0000-000000000003',true);
do $check$
declare blocked boolean := false;
begin
  begin
    perform public.finalize_hall_of_fame_evidence_server(
      'd0000000-0000-0000-0000-000000000003',
      'd6000000-0000-0000-0000-000000000002','image/png',8,repeat('bb',32),1,1,
      'd9000000-0000-0000-0000-000000000105');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'authenticated finalize unexpectedly allowed'; end if;
end;
$check$;
do $check$
declare blocked boolean := false;
begin
  begin
    update public.hall_of_fame_evidence_files set status='deleted'
    where id='d6000000-0000-0000-0000-000000000003';
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'direct evidence update unexpectedly allowed'; end if;
end;
$check$;
do $check$
declare blocked boolean := false;
begin
  begin
    delete from public.hall_of_fame_evidence_files
    where id='d6000000-0000-0000-0000-000000000003';
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'direct evidence delete unexpectedly allowed'; end if;
end;
$check$;

reset role;
select
  :'inactive_status'='expired'
  and :'inactive_replay_replayed'='t'
  and :'deleted_storage_deleted_at' is not null
  and :'revoked_status'='expired'
  and :'owner_read_evidence_id'='d6000000-0000-0000-0000-000000000003'
  and :'target_read_evidence_id'='d6000000-0000-0000-0000-000000000004'
  and (select count(*)=2 from public.hall_of_fame_evidence_file_history
       where evidence_id='d6000000-0000-0000-0000-000000000001')
  and (select count(*)=2 from public.hall_of_fame_evidence_file_history
       where evidence_id='d6000000-0000-0000-0000-000000000002')
  and (select count(*)=2 from public.hall_of_fame_evidence_file_history
       where evidence_id in (
         'd6000000-0000-0000-0000-000000000001',
         'd6000000-0000-0000-0000-000000000002')
       and execution_actor_type='system')
  and (select count(*)=3 from public.audit_logs
       where request_id in (
         'd9000000-0000-0000-0000-000000000101',
         'd9000000-0000-0000-0000-000000000102',
         'd9000000-0000-0000-0000-000000000103')
       and actor_id is null and actor_type='system'
       and metadata->>'execution_actor_type'='service_role_system')
  and (select count(*)=3 from private.hall_of_fame_mutation_requests
       where request_id in (
         'd9000000-0000-0000-0000-000000000101',
         'd9000000-0000-0000-0000-000000000102',
         'd9000000-0000-0000-0000-000000000103')
       and status='completed');
rollback;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\bt\b/);
});

test("evidence mutation races serialize without partial history, audit, or ledger", async () => {
  const setup = sql(
    container,
    database,
    String.raw`
set session_replication_role = replica;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('c0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','evidence-race-one@example.invalid','',now(),now(),now()),
 ('c0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','evidence-race-two@example.invalid','',now(),now(),now()),
 ('c0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','evidence-race-three@example.invalid','',now(),now(),now());
insert into public.user_accounts(id,account_status)
values
 ('c0000000-0000-0000-0000-000000000001','active'),
 ('c0000000-0000-0000-0000-000000000002','active'),
 ('c0000000-0000-0000-0000-000000000003','active');
insert into public.hall_of_fame_application_batches(id,application_type,created_by_user_id,status,version)
values
 ('c1000000-0000-0000-0000-000000000001','direct_application','c0000000-0000-0000-0000-000000000001','draft',1),
 ('c1000000-0000-0000-0000-000000000002','direct_application','c0000000-0000-0000-0000-000000000002','draft',1),
 ('c1000000-0000-0000-0000-000000000003','direct_application','c0000000-0000-0000-0000-000000000003','draft',1);
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,course_region_snapshot,course_environment,round_type)
values
 ('c2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-08-01','RACE','TEST','outdoor','practice'),
 ('c2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','2026-08-01','RACE','TEST','outdoor','practice'),
 ('c2000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000003','2026-08-01','RACE','TEST','outdoor','practice');
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,record_type_code,
 course_segment_snapshot,hole_number,hole_par,strokes,version)
values
 ('c3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','hole_in_one','a',1,3,1,1),
 ('c3000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','hole_in_one','a',2,3,1,1),
 ('c3000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000003','c2000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003','hole_in_one','a',3,3,1,1);
insert into private.hall_of_fame_mutation_requests(
 actor_user_id,request_id,operation,payload_fingerprint,status,result_payload,completed_at)
values
 ('c0000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000001','hall_of_fame.evidence.fixture',decode(repeat('c1',32),'hex'),'completed','{}',now()),
 ('c0000000-0000-0000-0000-000000000002','c9000000-0000-0000-0000-000000000002','hall_of_fame.evidence.fixture',decode(repeat('c2',32),'hex'),'completed','{}',now()),
 ('c0000000-0000-0000-0000-000000000003','c9000000-0000-0000-0000-000000000003','hall_of_fame.evidence.fixture',decode(repeat('c3',32),'hex'),'completed','{}',now());
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,version,actor_user_id,action,request_id)
values
 ('batch','c1000000-0000-0000-0000-000000000001',null,null,'draft',1,'c0000000-0000-0000-0000-000000000001','hall_of_fame.evidence.fixture','c9000000-0000-0000-0000-000000000001'),
 ('record','c1000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001',null,'draft',1,'c0000000-0000-0000-0000-000000000001','hall_of_fame.evidence.fixture','c9000000-0000-0000-0000-000000000001'),
 ('batch','c1000000-0000-0000-0000-000000000002',null,null,'draft',1,'c0000000-0000-0000-0000-000000000002','hall_of_fame.evidence.fixture','c9000000-0000-0000-0000-000000000002'),
 ('record','c1000000-0000-0000-0000-000000000002','c3000000-0000-0000-0000-000000000002',null,'draft',1,'c0000000-0000-0000-0000-000000000002','hall_of_fame.evidence.fixture','c9000000-0000-0000-0000-000000000002'),
 ('batch','c1000000-0000-0000-0000-000000000003',null,null,'draft',1,'c0000000-0000-0000-0000-000000000003','hall_of_fame.evidence.fixture','c9000000-0000-0000-0000-000000000003'),
 ('record','c1000000-0000-0000-0000-000000000003','c3000000-0000-0000-0000-000000000003',null,'draft',1,'c0000000-0000-0000-0000-000000000003','hall_of_fame.evidence.fixture','c9000000-0000-0000-0000-000000000003');
insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,storage_path,
 mime_type,byte_size,sha256,original_filename,uploaded_by_user_id,status,
 declared_mime_type,declared_byte_size,upload_expires_at,version,created_at,updated_at,
 finalized_at,replaces_evidence_id)
values
 ('c6000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001','scorecard','hall-of-fame-evidence','applications/c1000000-0000-0000-0000-000000000001/c6000000-0000-0000-0000-000000000001/original','image/png',null,null,null,'c0000000-0000-0000-0000-000000000001','pending_upload','image/png',8,now()+interval '1 hour',1,now(),now(),null,null),
 ('c6000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','c3000000-0000-0000-0000-000000000002','scorecard','hall-of-fame-evidence','applications/c1000000-0000-0000-0000-000000000002/c6000000-0000-0000-0000-000000000002/original','image/png',8,decode(repeat('a2',32),'hex'),null,'c0000000-0000-0000-0000-000000000002','available','image/png',8,now()+interval '1 hour',2,now()-interval '1 hour',now(),now(),null),
 ('c6000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000002','c3000000-0000-0000-0000-000000000002','scorecard','hall-of-fame-evidence','applications/c1000000-0000-0000-0000-000000000002/c6000000-0000-0000-0000-000000000003/original','image/png',null,null,null,'c0000000-0000-0000-0000-000000000002','pending_upload','image/png',8,now()+interval '1 hour',1,now(),now(),null,'c6000000-0000-0000-0000-000000000002'),
 ('c6000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000003','c3000000-0000-0000-0000-000000000003','scorecard','hall-of-fame-evidence','applications/c1000000-0000-0000-0000-000000000003/c6000000-0000-0000-0000-000000000004/original','image/png',8,decode(repeat('a4',32),'hex'),null,'c0000000-0000-0000-0000-000000000003','available','image/png',8,now()+interval '1 hour',2,now()-interval '1 hour',now(),now(),null);
insert into public.hall_of_fame_evidence_file_history(
 evidence_id,application_batch_id,application_record_id,from_status,to_status,evidence_version,
 operation,actor_user_id,request_id,replacement_evidence_id)
values
 ('c6000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001',null,'pending_upload',1,'hall_of_fame.evidence.fixture','c0000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000001',null),
 ('c6000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','c3000000-0000-0000-0000-000000000002',null,'pending_upload',1,'hall_of_fame.evidence.fixture','c0000000-0000-0000-0000-000000000002','c9000000-0000-0000-0000-000000000002',null),
 ('c6000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','c3000000-0000-0000-0000-000000000002','pending_upload','available',2,'hall_of_fame.evidence.fixture','c0000000-0000-0000-0000-000000000002','c9000000-0000-0000-0000-000000000002',null),
 ('c6000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000002','c3000000-0000-0000-0000-000000000002',null,'pending_upload',1,'hall_of_fame.evidence.fixture','c0000000-0000-0000-0000-000000000002','c9000000-0000-0000-0000-000000000002','c6000000-0000-0000-0000-000000000002'),
 ('c6000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000003','c3000000-0000-0000-0000-000000000003',null,'pending_upload',1,'hall_of_fame.evidence.fixture','c0000000-0000-0000-0000-000000000003','c9000000-0000-0000-0000-000000000003',null),
 ('c6000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000003','c3000000-0000-0000-0000-000000000003','pending_upload','available',2,'hall_of_fame.evidence.fixture','c0000000-0000-0000-0000-000000000003','c9000000-0000-0000-0000-000000000003',null);
set session_replication_role = origin;
`,
  );
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);

  const raceOne = await runGatedRace(
    "c1000000-0000-0000-0000-000000000001",
    String.raw`
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select * from public.finalize_hall_of_fame_evidence_server(
 'c0000000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-000000000001',
 'image/png',8,repeat('b1',32),1,1,'c9000000-0000-0000-0000-000000000101');
commit;
`,
    String.raw`
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000001',true);
select * from public.withdraw_hall_of_fame_evidence(
 'c6000000-0000-0000-0000-000000000001',1,1,
 'c9000000-0000-0000-0000-000000000102');
commit;
`,
  );
  assert.equal(raceOne.filter((entry) => entry.status === 0).length, 1);
  assert.doesNotMatch(
    raceOne.map((entry) => entry.stderr).join("\n"),
    /deadlock|duplicate key|unique constraint/i,
  );
  const raceOneState = sql(
    container,
    database,
    String.raw`
select status || '|' || version || '|' ||
 (select version from public.hall_of_fame_application_batches where id='c1000000-0000-0000-0000-000000000001') || '|' ||
 (select version from public.hall_of_fame_application_records where id='c3000000-0000-0000-0000-000000000001') || '|' ||
 (select count(*) from public.hall_of_fame_evidence_file_history where evidence_id='c6000000-0000-0000-0000-000000000001') || '|' ||
 (select count(*) from public.audit_logs where request_id in ('c9000000-0000-0000-0000-000000000101','c9000000-0000-0000-0000-000000000102')) || '|' ||
 (select count(*) from private.hall_of_fame_mutation_requests where request_id in ('c9000000-0000-0000-0000-000000000101','c9000000-0000-0000-0000-000000000102'))
from public.hall_of_fame_evidence_files where id='c6000000-0000-0000-0000-000000000001';
`,
  );
  assert.equal(raceOneState.status, 0, raceOneState.stderr);
  assert.match(raceOneState.stdout, /(?:available|deleted)\|2\|2\|2\|2\|1\|1/);

  const raceTwo = await runGatedRace(
    "c1000000-0000-0000-0000-000000000002",
    String.raw`
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select * from public.finalize_hall_of_fame_evidence_server(
 'c0000000-0000-0000-0000-000000000002','c6000000-0000-0000-0000-000000000003',
 'image/png',8,repeat('b2',32),1,1,'c9000000-0000-0000-0000-000000000201');
commit;
`,
    String.raw`
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000002',true);
select * from public.withdraw_hall_of_fame_evidence(
 'c6000000-0000-0000-0000-000000000002',2,1,
 'c9000000-0000-0000-0000-000000000202');
commit;
`,
  );
  assert.equal(raceTwo.filter((entry) => entry.status === 0).length, 1);
  assert.doesNotMatch(
    raceTwo.map((entry) => entry.stderr).join("\n"),
    /deadlock|duplicate key|unique constraint/i,
  );
  const raceTwoState = sql(
    container,
    database,
    String.raw`
select
 (select status || '|' || version from public.hall_of_fame_evidence_files where id='c6000000-0000-0000-0000-000000000002') || '|' ||
 (select status || '|' || version from public.hall_of_fame_evidence_files where id='c6000000-0000-0000-0000-000000000003') || '|' ||
 (select count(*) from public.hall_of_fame_evidence_file_history where evidence_id in ('c6000000-0000-0000-0000-000000000002','c6000000-0000-0000-0000-000000000003')) || '|' ||
 (select count(*) from public.audit_logs where request_id in ('c9000000-0000-0000-0000-000000000201','c9000000-0000-0000-0000-000000000202')) || '|' ||
 (select count(*) from private.hall_of_fame_mutation_requests where request_id in ('c9000000-0000-0000-0000-000000000201','c9000000-0000-0000-0000-000000000202'));
`,
  );
  assert.equal(raceTwoState.status, 0, raceTwoState.stderr);
  assert.match(raceTwoState.stdout, /replaced\|3\|available\|2\|5\|1\|1/);

  const raceThree = await runGatedRace(
    "c1000000-0000-0000-0000-000000000003",
    String.raw`
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000003',true);
select * from public.create_hall_of_fame_evidence_replacement_intent(
 'c6000000-0000-0000-0000-000000000004','image/png',8,1,
 'c9000000-0000-0000-0000-000000000301');
commit;
`,
    String.raw`
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000003',true);
select * from public.create_hall_of_fame_evidence_replacement_intent(
 'c6000000-0000-0000-0000-000000000004','image/png',8,1,
 'c9000000-0000-0000-0000-000000000302');
commit;
`,
  );
  assert.equal(raceThree.filter((entry) => entry.status === 0).length, 1);
  const raceThreeErrors = raceThree
    .filter((entry) => entry.status !== 0)
    .map((entry) => entry.stderr)
    .join("\n");
  assert.match(raceThreeErrors, /HOF_APPLICATION_VERSION_CONFLICT/);
  assert.doesNotMatch(
    raceThree.map((entry) => entry.stderr).join("\n"),
    /deadlock|duplicate key|unique constraint/i,
  );
  const raceThreeState = sql(
    container,
    database,
    String.raw`
select
 (select count(*) from public.hall_of_fame_evidence_files
  where replaces_evidence_id='c6000000-0000-0000-0000-000000000004'
    and status in ('pending_upload','uploaded_unverified','available')) || '|' ||
 (select version from public.hall_of_fame_application_batches where id='c1000000-0000-0000-0000-000000000003') || '|' ||
 (select version from public.hall_of_fame_application_records where id='c3000000-0000-0000-0000-000000000003') || '|' ||
 (select count(*) from public.hall_of_fame_evidence_file_history
  where replacement_evidence_id='c6000000-0000-0000-0000-000000000004') || '|' ||
 (select count(*) from public.audit_logs where request_id in ('c9000000-0000-0000-0000-000000000301','c9000000-0000-0000-0000-000000000302')) || '|' ||
 (select count(*) from private.hall_of_fame_mutation_requests where request_id in ('c9000000-0000-0000-0000-000000000301','c9000000-0000-0000-0000-000000000302'));
`,
  );
  assert.equal(raceThreeState.status, 0, raceThreeState.stderr);
  assert.match(raceThreeState.stdout, /1\|2\|2\|1\|1\|1/);
});

test("catalog exposes authenticated intent RPCs and service-only finalize", () => {
  const result = sql(
    container,
    database,
    String.raw`
select
 has_function_privilege('authenticated','public.create_hall_of_fame_evidence_upload_intent(uuid,text,text,bigint,integer,uuid)','execute')
 and not has_function_privilege('authenticated','public.finalize_hall_of_fame_evidence_server(uuid,uuid,text,bigint,text,integer,integer,uuid)','execute')
 and has_function_privilege('service_role','public.finalize_hall_of_fame_evidence_server(uuid,uuid,text,bigint,text,integer,integer,uuid)','execute')
 and not has_function_privilege('authenticated','public.mark_hall_of_fame_evidence_failed_server(uuid,integer,integer,uuid)','execute')
 and has_function_privilege('service_role','public.mark_hall_of_fame_evidence_failed_server(uuid,integer,integer,uuid)','execute')
 and not has_function_privilege('authenticated','public.expire_hall_of_fame_evidence_server(uuid,integer,integer,uuid)','execute')
 and has_function_privilege('service_role','public.expire_hall_of_fame_evidence_server(uuid,integer,integer,uuid)','execute')
 and not has_function_privilege('authenticated','public.mark_hall_of_fame_evidence_storage_deleted_server(uuid,boolean,text,uuid)','execute')
 and has_function_privilege('service_role','public.mark_hall_of_fame_evidence_storage_deleted_server(uuid,boolean,text,uuid)','execute')
 and to_regprocedure('public.mark_hall_of_fame_evidence_failed_server(uuid,uuid,integer,integer,uuid)') is null
 and to_regprocedure('public.expire_hall_of_fame_evidence_server(uuid,uuid,integer,integer,uuid)') is null
 and to_regprocedure('public.mark_hall_of_fame_evidence_storage_deleted_server(uuid,uuid,boolean,text,uuid)') is null
 and not has_table_privilege('authenticated','public.hall_of_fame_evidence_files','INSERT,UPDATE,DELETE')
 and not has_table_privilege('authenticated','public.hall_of_fame_evidence_file_history','INSERT,UPDATE,DELETE')
 and (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.hall_of_fame_evidence_file_history'::regclass)
 and (select count(*)=0 from pg_policies where schemaname='storage' and tablename='objects'
      and (qual like '%hall-of-fame-evidence%' or with_check like '%hall-of-fame-evidence%'));
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\bt\b/);
});
