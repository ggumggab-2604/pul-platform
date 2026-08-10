import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
const submitMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260810000100_pul_hall_of_fame_application_submit_rpc.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function docker(args, input) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 32 * 1024 * 1024,
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

function ids() {
  return {
    actor: randomUUID(),
    companion: randomUUID(),
    target: randomUUID(),
    club: randomUUID(),
    actorMembership: randomUUID(),
    targetMembership: randomUUID(),
    adminAssignment: randomUUID(),
    batch: randomUUID(),
    round: randomUUID(),
    record: randomUUID(),
    fixtureRequest: randomUUID(),
    evidence: randomUUID(),
    pendingEvidence: randomUUID(),
    confirmation: randomUUID(),
  };
}

function actorSql(actor, role = "authenticated") {
  return String.raw`
set local role ${role};
select pg_catalog.set_config('request.jwt.claim.sub','${actor}',true);
`;
}

function fixtureSql({
  applicationType = "direct_application",
  omitRound = false,
  omitRecord = false,
  omitConsent = null,
  omitPublication = false,
  omitConfirmation = false,
  omitEvidence = false,
  unresolvedEvidence = false,
  terminalEvidenceOnly = false,
  values = ids(),
} = {}) {
  const target =
    applicationType === "club_nomination" ? values.target : values.actor;
  const usesClub = applicationType !== "direct_application";
  const targetMembership =
    applicationType === "direct_application"
      ? "null"
      : applicationType === "club_nomination"
        ? `'${values.targetMembership}'`
        : `'${values.actorMembership}'`;
  const consentPurposes = ["application_processing", "evidence_review"];
  if (applicationType === "club_nomination") {
    consentPurposes.push("nomination_acceptance");
  }
  const consentRows = consentPurposes
    .filter((purpose) => purpose !== omitConsent)
    .map(
      (purpose) =>
        `('${randomUUID()}','${values.record}','${values.batch}','${target}',` +
        `'${purpose}','granted','hof-test-v1',1,` +
        `${purpose === "nomination_acceptance" ? "now(),now()+interval '14 days'" : "null,null"},` +
        `now(),null,null,'${values.actor}','${values.fixtureRequest}')`,
    )
    .join(",\n");
  const userRows = [values.actor, values.companion, target]
    .filter((value, index, list) => list.indexOf(value) === index)
    .map(
      (value) =>
        `('${value}','00000000-0000-0000-0000-000000000000','authenticated','authenticated',` +
        `'hof-submit-${value}@example.invalid','',now(),now(),now())`,
    )
    .join(",\n");
  const clubSql = usesClub
    ? String.raw`
insert into public.clubs(id,legacy_key,name,club_status)
values('${values.club}',null,'HOF SUBMIT TEST CLUB','active');
insert into public.club_memberships(id,club_id,user_id,membership_status,joined_at)
values('${values.actorMembership}','${values.club}','${values.actor}','active',now())
${
  applicationType === "club_nomination"
    ? `,('${values.targetMembership}','${values.club}','${target}','active',now())`
    : ""
};
insert into public.club_role_assignments(id,membership_id,role_code,assigned_by)
values('${randomUUID()}','${values.actorMembership}','club_member','${values.actor}')
${
  applicationType === "club_nomination"
    ? `,('${values.adminAssignment}','${values.actorMembership}','club_admin','${values.actor}'),` +
      `('${randomUUID()}','${values.targetMembership}','club_member','${values.actor}')`
    : ""
};
`
    : "";
  const batchIdentity =
    applicationType === "club_nomination"
      ? `'${values.actorMembership}','${values.club}',null`
      : applicationType === "club_admin_vacancy_direct_application"
        ? `'${values.actorMembership}',null,'${values.club}'`
        : "null,null,null";
  const roundSql = omitRound
    ? ""
    : String.raw`
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,
 course_region_snapshot,course_environment,round_type)
values('${values.round}','${values.batch}','2026-08-01','TEST COURSE',
 'TEST REGION','outdoor','practice');
`;
  const recordSql = omitRecord
    ? ""
    : String.raw`
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,target_membership_id,
 record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,
 club_verification_status,member_consent_status,review_status,
 conflict_of_interest,fingerprint_version,duplicate_fingerprint,version)
values('${values.record}','${values.batch}','${values.round}','${target}',${targetMembership},
 'hole_in_one','a',1,3,1,
 '${applicationType === "direct_application" ? "not_applicable" : "pending"}',
 'granted','draft',false,1,
 extensions.digest(pg_catalog.convert_to('${values.record}','UTF8'),'sha256'),1);
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,
 version,actor_user_id,actor_membership_id,action,request_id)
values('record','${values.batch}','${values.record}',null,'draft',1,
 '${values.actor}',${usesClub ? `'${values.actorMembership}'` : "null"},
 'hall_of_fame.fixture.create','${values.fixtureRequest}');
${
  consentRows
    ? `insert into public.hall_of_fame_application_consents(
 id,application_record_id,application_batch_id,subject_user_id,
 consent_purpose,status,policy_version,version,requested_at,expires_at,
 granted_at,declined_at,withdrawn_at,last_actor_user_id,last_request_id)
values
${consentRows};`
    : ""
}
${
  omitPublication
    ? ""
    : `insert into public.hall_of_fame_publication_consents(
 application_record_id,target_user_id,status,display_name_consent,
 avatar_consent,club_name_consent,record_date_consent,course_detail_consent,
 version,consented_at,withdrawn_at,policy_version,
 masked_display_name_consent,full_display_name_consent,badge_consent,
 last_actor_user_id,last_request_id)
values('${values.record}','${target}','granted',true,false,false,true,true,
 1,now(),null,'hof-test-v1',true,false,false,
 '${values.actor}','${values.fixtureRequest}');`
}
${
  omitConfirmation
    ? ""
    : `insert into public.hall_of_fame_record_confirmations(
 id,application_record_id,confirmer_user_id,confirmation_role,status,
 statement,confirmed_at,version,requester_user_id,requested_at,expires_at,
 responded_at,last_actor_user_id,last_request_id)
values('${values.confirmation}','${values.record}','${values.companion}',
 'round_companion','confirmed','TEST CONFIRMATION',now(),1,
 '${values.actor}',now()-interval '1 day',now()+interval '13 days',now(),
 '${values.actor}','${values.fixtureRequest}');`
}
${
  omitEvidence
    ? ""
    : terminalEvidenceOnly
      ? `insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,
 storage_path,mime_type,original_filename,uploaded_by_user_id,status,
 declared_mime_type,declared_byte_size,upload_expires_at,version)
values('${values.evidence}','${values.batch}','${values.record}','scorecard',
 'hall-of-fame-evidence','applications/${values.batch}/${values.evidence}/original',
 'image/png',null,'${values.actor}','failed','image/png',8,now()+interval '15 minutes',1);`
      : `insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,
 storage_path,mime_type,byte_size,sha256,original_filename,
 uploaded_by_user_id,status,finalized_at,declared_mime_type,
 declared_byte_size,version)
values('${values.evidence}','${values.batch}','${values.record}','scorecard',
 'hall-of-fame-evidence','applications/${values.batch}/${values.evidence}/original',
 'image/png',8,decode(repeat('ab',32),'hex'),null,
 '${values.actor}','available',now(),'image/png',8,1);`
}
${
  unresolvedEvidence
    ? `insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,
 storage_path,mime_type,original_filename,uploaded_by_user_id,status,
 declared_mime_type,declared_byte_size,upload_expires_at,version)
values('${values.pendingEvidence}','${values.batch}','${values.record}',
 'supporting_document','hall-of-fame-evidence',
 'applications/${values.batch}/${values.pendingEvidence}/original',
 'image/png',null,'${values.actor}','pending_upload','image/png',8,
 now()+interval '15 minutes',1);`
    : ""
}
`;

  return {
    values,
    target,
    sql: String.raw`
set local session_replication_role = replica;
insert into auth.users(
 id,instance_id,aud,role,email,encrypted_password,
 email_confirmed_at,created_at,updated_at)
values
${userRows};
insert into public.user_accounts(id,account_status)
values
${[values.actor, values.companion, target]
  .filter((value, index, list) => list.indexOf(value) === index)
  .map((value) => `('${value}','active')`)
  .join(",\n")};
${clubSql}
insert into public.hall_of_fame_application_batches(
 id,application_type,created_by_user_id,created_by_membership_id,
 nominating_club_id,vacancy_context_club_id,status,version)
values('${values.batch}','${applicationType}','${values.actor}',${batchIdentity},
 'draft',1);
${roundSql}
insert into private.hall_of_fame_mutation_requests(
 actor_user_id,request_id,operation,application_batch_id,
 payload_fingerprint,status,result_payload,completed_at)
values('${values.actor}','${values.fixtureRequest}','hall_of_fame.fixture.create',
 '${values.batch}',decode(repeat('f1',32),'hex'),'completed','{}',now());
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,
 version,actor_user_id,actor_membership_id,action,request_id)
values('batch','${values.batch}',null,null,'draft',1,'${values.actor}',
 ${usesClub ? `'${values.actorMembership}'` : "null"},
 'hall_of_fame.fixture.create','${values.fixtureRequest}');
${recordSql}
set local session_replication_role = origin;
`,
  };
}


function selfTargetNominationFixture() {
  const fixture = fixtureSql({ applicationType: "club_nomination" });
  fixture.sql += String.raw`
set local session_replication_role = replica;
update public.hall_of_fame_application_records
set target_user_id='${fixture.values.actor}',
    target_membership_id='${fixture.values.actorMembership}',
    club_verification_status='conflict_review_required',
    conflict_of_interest=true
where id='${fixture.values.record}';
update public.hall_of_fame_application_consents
set subject_user_id='${fixture.values.actor}'
where application_record_id='${fixture.values.record}';
update public.hall_of_fame_publication_consents
set target_user_id='${fixture.values.actor}'
where application_record_id='${fixture.values.record}';
set local session_replication_role = origin;
`;
  return fixture;
}

function appendReadySelfTargetRecord(fixture) {
  const record = randomUUID();
  const confirmation = randomUUID();
  const evidence = randomUUID();
  return {
    record,
    sql: String.raw`
set local session_replication_role = replica;
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,target_membership_id,
 record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,
 club_verification_status,member_consent_status,review_status,
 conflict_of_interest,fingerprint_version,duplicate_fingerprint,version)
select '${record}',application_batch_id,round_snapshot_id,
 '${fixture.values.actor}','${fixture.values.actorMembership}',
 record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,
 'conflict_review_required',member_consent_status,'draft',true,1,
 extensions.digest(pg_catalog.convert_to('${record}','UTF8'),'sha256'),1
from public.hall_of_fame_application_records
where id='${fixture.values.record}';
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,
 version,actor_user_id,actor_membership_id,action,request_id)
values('record','${fixture.values.batch}','${record}',null,'draft',1,
 '${fixture.values.actor}','${fixture.values.actorMembership}',
 'hall_of_fame.fixture.create','${fixture.values.fixtureRequest}');
insert into public.hall_of_fame_application_consents(
 id,application_record_id,application_batch_id,subject_user_id,
 consent_purpose,status,policy_version,version,requested_at,expires_at,
 granted_at,declined_at,withdrawn_at,last_actor_user_id,last_request_id)
select pg_catalog.gen_random_uuid(),'${record}',application_batch_id,
 '${fixture.values.actor}',consent_purpose,status,policy_version,version,
 requested_at,expires_at,granted_at,declined_at,withdrawn_at,
 last_actor_user_id,last_request_id
from public.hall_of_fame_application_consents
where application_record_id='${fixture.values.record}';
insert into public.hall_of_fame_publication_consents(
 application_record_id,target_user_id,status,display_name_consent,
 avatar_consent,club_name_consent,record_date_consent,course_detail_consent,
 version,consented_at,withdrawn_at,policy_version,
 masked_display_name_consent,full_display_name_consent,badge_consent,
 last_actor_user_id,last_request_id)
select '${record}','${fixture.values.actor}',status,display_name_consent,
 avatar_consent,club_name_consent,record_date_consent,course_detail_consent,
 version,consented_at,withdrawn_at,policy_version,
 masked_display_name_consent,full_display_name_consent,badge_consent,
 last_actor_user_id,last_request_id
from public.hall_of_fame_publication_consents
where application_record_id='${fixture.values.record}';
insert into public.hall_of_fame_record_confirmations(
 id,application_record_id,confirmer_user_id,confirmation_role,status,
 statement,confirmed_at,version,requester_user_id,requested_at,expires_at,
 responded_at,last_actor_user_id,last_request_id)
select '${confirmation}','${record}',confirmer_user_id,confirmation_role,status,
 statement,confirmed_at,version,requester_user_id,requested_at,expires_at,
 responded_at,last_actor_user_id,last_request_id
from public.hall_of_fame_record_confirmations
where application_record_id='${fixture.values.record}';
insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,
 storage_path,mime_type,byte_size,sha256,original_filename,
 uploaded_by_user_id,status,finalized_at,declared_mime_type,
 declared_byte_size,version)
select '${evidence}',application_batch_id,'${record}',evidence_type,storage_bucket,
 'applications/${fixture.values.batch}/${evidence}/original',
 mime_type,byte_size,extensions.digest(pg_catalog.convert_to('${evidence}','UTF8'),'sha256'),
 original_filename,uploaded_by_user_id,status,
 finalized_at,declared_mime_type,declared_byte_size,version
from public.hall_of_fame_evidence_files
where id='${fixture.values.evidence}';
set local session_replication_role = origin;
`,
  };
}
function submitSql(fixture, requestId, expectedVersion = 1) {
  return String.raw`
${actorSql(fixture.values.actor)}
select * from public.submit_hall_of_fame_application(
 '${fixture.values.batch}',${expectedVersion},'${requestId}');
`;
}

async function runGatedRace(batchId, namespace, leftSql, rightSql) {
  const gateSql = String.raw`
select pg_advisory_lock(
 pg_catalog.hashtextextended('${batchId}'::text,${namespace})
);
select pg_sleep(0.8);
select pg_advisory_unlock(
 pg_catalog.hashtextextended('${batchId}'::text,${namespace})
);
`;
  const gate = sqlAsync(container, database, gateSql);
  await pause(150);
  const results = await Promise.all([
    sqlAsync(container, database, leftSql),
    sqlAsync(container, database, rightSql),
  ]);
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
  database = `pul_hof_submit_${process.pid}_${Date.now()}`;
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
    `begin;\n${consentMigration}\n${evidenceMigration}\n${submitMigration}\ncommit;`,
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

test("full migration apply exposes only the approved submit RPC", () => {
  const result = sql(
    container,
    database,
    String.raw`
select
  p.prosecdef,
  p.proconfig = array['search_path=""']::text[],
  pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
  pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
  coalesce(p.proacl::text,'') !~ '(^|,)=[^,]*X',
  pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
from pg_proc as p
join pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='submit_hall_of_fame_application'
  and pg_get_function_identity_arguments(p.oid)=
    'p_application_batch_id uuid, p_expected_batch_version integer, p_request_id uuid';
select count(*) from pg_proc as p join pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='submit_hall_of_fame_application';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /t\s*\|\s*t\s*\|\s*t\s*\|\s*f\s*\|\s*t\s*\|\s*f/);
  assert.match(result.stdout, /\n\s*1\s*\n\(1 row\)/);
});

test("direct submission is atomic and identical replay is side-effect free", () => {
  const fixture = fixtureSql();
  const requestId = randomUUID();
  const result = sql(
    container,
    database,
    String.raw`
begin;
${fixture.sql}
${actorSql(fixture.values.actor)}
select * from public.submit_hall_of_fame_application(
 '${fixture.values.batch}',1,'${requestId}') \gset first_
select * from public.submit_hall_of_fame_application(
 '${fixture.values.batch}',1,'${requestId}') \gset replay_
reset role;
select
  :'first_status'='submitted'
  and :'first_batch_version'='2'
  and :'first_submitted_record_count'='1'
  and :'first_replayed'='f'
  and :'replay_replayed'='t'
  and :'first_submitted_at'=:'replay_submitted_at'
  and (select status='submitted' and version=2 and submitted_at is not null
       from public.hall_of_fame_application_batches where id='${fixture.values.batch}')
  and (select review_status='submitted' and version=2
       from public.hall_of_fame_application_records where id='${fixture.values.record}')
  and (select count(*)=2 from public.hall_of_fame_application_history
       where application_batch_id='${fixture.values.batch}' and scope='batch')
  and (select count(*)=2 from public.hall_of_fame_application_history
       where application_record_id='${fixture.values.record}' and scope='record')
  and (select count(*)=1 from public.audit_logs where request_id='${requestId}')
  and (select count(*)=1 from private.hall_of_fame_mutation_requests
       where request_id='${requestId}' and status='completed');
rollback;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /t/);
});

for (const applicationType of [
  "club_admin_vacancy_direct_application",
  "club_nomination",
]) {
  test(`${applicationType} revalidates its actor and submits`, () => {
    const fixture = fixtureSql({ applicationType });
    const result = sql(
      container,
      database,
      String.raw`
begin;
${fixture.sql}
${submitSql(fixture, randomUUID())}
reset role;
select (select status='submitted' and version=2
        from public.hall_of_fame_application_batches
        where id='${fixture.values.batch}')
   and (select review_status='submitted' and version=2
        from public.hall_of_fame_application_records
        where id='${fixture.values.record}');
rollback;
`,
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /t/);
  });
}


test("fully ready self-target nomination is rejected atomically", () => {
  const fixture = selfTargetNominationFixture();
  const requestId = randomUUID();
  const setup = sql(container, database, `begin;\n${fixture.sql}\ncommit;`);
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);
  const result = sql(
    container,
    database,
    `begin;\n${submitSql(fixture, requestId)}\ncommit;`,
  );
  assert.notEqual(result.status, 0);
  assert.match(
    result.stdout + result.stderr,
    /HOF_NOMINATION_SELF_TARGET_NOT_ALLOWED/,
  );
  const state = sql(
    container,
    database,
    String.raw`select
      (select status='draft' and version=1 and submitted_at is null
       from public.hall_of_fame_application_batches
       where id='${fixture.values.batch}')
      and
      (select review_status='draft' and version=1
       from public.hall_of_fame_application_records
       where id='${fixture.values.record}')
      and not exists (
        select 1 from public.hall_of_fame_application_history
        where application_batch_id='${fixture.values.batch}'
          and action='hall_of_fame.application.submit'
      )
      and not exists (select 1 from public.audit_logs where request_id='${requestId}')
      and not exists (
        select 1 from private.hall_of_fame_mutation_requests
        where actor_user_id='${fixture.values.actor}' and request_id='${requestId}'
      );`,
  );
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.match(state.stdout, /t/);
});

test("mixed nomination batch rejects all records without partial submission", () => {
  const fixture = fixtureSql({ applicationType: "club_nomination" });
  const selfTarget = appendReadySelfTargetRecord(fixture);
  const requestId = randomUUID();
  const setup = sql(
    container,
    database,
    `begin;\n${fixture.sql}\n${selfTarget.sql}\ncommit;`,
  );
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);
  const result = sql(
    container,
    database,
    `begin;\n${submitSql(fixture, requestId)}\ncommit;`,
  );
  assert.notEqual(result.status, 0);
  assert.match(
    result.stdout + result.stderr,
    /HOF_NOMINATION_SELF_TARGET_NOT_ALLOWED/,
  );
  const state = sql(
    container,
    database,
    String.raw`select
      (select status='draft' and version=1 and submitted_at is null
       from public.hall_of_fame_application_batches
       where id='${fixture.values.batch}')
      and (select count(*)=2 from public.hall_of_fame_application_records
           where application_batch_id='${fixture.values.batch}'
             and review_status='draft' and version=1)
      and not exists (select 1 from public.hall_of_fame_application_records
                      where application_batch_id='${fixture.values.batch}'
                        and review_status='submitted')
      and not exists (select 1 from public.hall_of_fame_application_history
                      where application_batch_id='${fixture.values.batch}'
                        and action='hall_of_fame.application.submit')
      and not exists (select 1 from public.audit_logs where request_id='${requestId}')
      and not exists (select 1 from private.hall_of_fame_mutation_requests
                      where actor_user_id='${fixture.values.actor}'
                        and request_id='${requestId}');`,
  );
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.match(state.stdout, /t/);
});

test("withdrawn self-target does not block a normal nomination submission", () => {
  const fixture = fixtureSql({ applicationType: "club_nomination" });
  const selfTarget = appendReadySelfTargetRecord(fixture);
  const withdrawRequest = randomUUID();
  const submitRequest = randomUUID();
  const setup = sql(
    container,
    database,
    `begin;\n${fixture.sql}\n${selfTarget.sql}\ncommit;`,
  );
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);
  const withdrawn = sql(
    container,
    database,
    String.raw`begin;
${actorSql(fixture.values.actor)}
select * from public.withdraw_hall_of_fame_application_record(
 '${selfTarget.record}',1,1,'TEST SELF-TARGET WITHDRAWAL','${withdrawRequest}');
commit;`,
  );
  assert.equal(withdrawn.status, 0, withdrawn.stdout + withdrawn.stderr);
  const submitted = sql(
    container,
    database,
    String.raw`begin;
${actorSql(fixture.values.actor)}
select * from public.submit_hall_of_fame_application(
 '${fixture.values.batch}',2,'${submitRequest}') \gset submitted_
reset role;
select :'submitted_status'='submitted'
  and :'submitted_batch_version'='3'
  and :'submitted_submitted_record_count'='1';
commit;`,
  );
  assert.equal(submitted.status, 0, submitted.stdout + submitted.stderr);
  assert.match(submitted.stdout, /t/);
  const state = sql(
    container,
    database,
    String.raw`select
      (select status='submitted' and version=3 and submitted_at is not null
       from public.hall_of_fame_application_batches
       where id='${fixture.values.batch}')
      and (select review_status='submitted' and version=2
           from public.hall_of_fame_application_records
           where id='${fixture.values.record}')
      and (select review_status='withdrawn' and version=2
           from public.hall_of_fame_application_records
           where id='${selfTarget.record}')
      and (select count(*)=1 from public.hall_of_fame_application_history
           where application_batch_id='${fixture.values.batch}'
             and scope='record' and action='hall_of_fame.application.submit')
      and not exists (select 1 from public.hall_of_fame_application_history
                      where application_record_id='${selfTarget.record}'
                        and action='hall_of_fame.application.submit')
      and (select count(*)=1 from public.audit_logs where request_id='${submitRequest}')
      and (select count(*)=1 from private.hall_of_fame_mutation_requests
           where actor_user_id='${fixture.values.actor}'
             and request_id='${submitRequest}' and status='completed');`,
  );
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.match(state.stdout, /t/);
});
test("representative missing submission conditions are rejected atomically", () => {
  const cases = [
    [{ omitRound: true, omitRecord: true }, /HOF_ROUND_SNAPSHOT_REQUIRED/],
    [{ omitRecord: true }, /HOF_ACTIVE_APPLICATION_RECORD_REQUIRED/],
    [
      { omitConsent: "application_processing" },
      /HOF_REQUIRED_APPLICATION_CONSENT_MISSING/,
    ],
    [
      { omitConsent: "evidence_review" },
      /HOF_REQUIRED_APPLICATION_CONSENT_MISSING/,
    ],
    [
      {
        applicationType: "club_nomination",
        omitConsent: "nomination_acceptance",
      },
      /HOF_REQUIRED_APPLICATION_CONSENT_MISSING/,
    ],
    [{ omitPublication: true }, /HOF_PUBLICATION_CONSENT_REQUIRED/],
    [{ omitConfirmation: true }, /HOF_MEMBER_COMPANION_CONFIRMATION_REQUIRED/],
    [{ omitEvidence: true }, /HOF_SCORECARD_EVIDENCE_REQUIRED/],
    [{ unresolvedEvidence: true }, /HOF_UNRESOLVED_EVIDENCE/],
    [{ terminalEvidenceOnly: true }, /HOF_SCORECARD_EVIDENCE_REQUIRED/],
  ];

  for (const [options, expected] of cases) {
    const fixture = fixtureSql(options);
    const requestId = randomUUID();
    const result = sql(
      container,
      database,
      String.raw`
begin;
${fixture.sql}
${submitSql(fixture, requestId)}
commit;
`,
    );
    assert.notEqual(result.status, 0, "unexpected submit success");
    assert.match(result.stdout + result.stderr, expected);
    const residue = sql(
      container,
      database,
      `select count(*) from private.hall_of_fame_mutation_requests where request_id='${requestId}';`,
    );
    assert.equal(residue.status, 0, residue.stderr);
    assert.match(residue.stdout, /0/);
  }
});

test("changed direct, vacancy, and nomination eligibility is rejected", () => {
  const direct = fixtureSql();
  const directClub = randomUUID();
  const directMembership = randomUUID();
  const directChange = String.raw`
set local session_replication_role=replica;
insert into public.clubs(id,name,club_status) values('${directClub}','DIRECT CHANGE','active');
insert into public.club_memberships(id,club_id,user_id,membership_status,joined_at)
values('${directMembership}','${directClub}','${direct.values.actor}','active',now());
set local session_replication_role=origin;
`;

  const vacancy = fixtureSql({
    applicationType: "club_admin_vacancy_direct_application",
  });
  const vacancyAdmin = randomUUID();
  const vacancyAdminMembership = randomUUID();
  const vacancyChange = String.raw`
set local session_replication_role=replica;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('${vacancyAdmin}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vacancy-admin@example.invalid','',now(),now(),now());
insert into public.user_accounts(id,account_status) values('${vacancyAdmin}','active');
insert into public.club_memberships(id,club_id,user_id,membership_status,joined_at)
values('${vacancyAdminMembership}','${vacancy.values.club}','${vacancyAdmin}','active',now());
insert into public.club_role_assignments(membership_id,role_code,assigned_by)
values('${vacancyAdminMembership}','club_admin','${vacancyAdmin}');
set local session_replication_role=origin;
`;

  const nomination = fixtureSql({ applicationType: "club_nomination" });
  const nominationChange = String.raw`
set local session_replication_role=replica;
update public.club_role_assignments set revoked_at=now(),revoked_by='${nomination.values.actor}'
where id='${nomination.values.adminAssignment}';
set local session_replication_role=origin;
`;

  for (const [fixture, change] of [
    [direct, directChange],
    [vacancy, vacancyChange],
    [nomination, nominationChange],
  ]) {
    const result = sql(
      container,
      database,
      String.raw`
begin;
${fixture.sql}
${change}
${submitSql(fixture, randomUUID())}
commit;
`,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /HOF_(ELIGIBILITY_CHANGED|PERMISSION_DENIED)/);
  }
});

test("submitted applications freeze edits while finalized evidence read remains allowed", () => {
  const fixture = fixtureSql();
  const submitRequest = randomUUID();
  const roundRequest = randomUUID();
  const consentRequest = randomUUID();
  const evidenceRequest = randomUUID();
  const submitted = sql(
    container,
    database,
    String.raw`
begin;
${fixture.sql}
${submitSql(fixture, submitRequest)}
commit;
`,
  );
  assert.equal(submitted.status, 0, submitted.stdout + submitted.stderr);

  const editCalls = [
    String.raw`select * from public.set_hall_of_fame_round_snapshot(
      '${fixture.values.batch}',2,'2026-08-01',null,'TEST COURSE','TEST REGION',
      'outdoor',null,'practice',null,null,'${roundRequest}');`,
    String.raw`select * from public.set_hall_of_fame_application_consent(
      '${fixture.values.record}','application_processing','withdraw','hof-test-v1',
      2,'${consentRequest}');`,
    String.raw`select * from public.create_hall_of_fame_evidence_upload_intent(
      '${fixture.values.record}','scorecard','image/png',8,2,'${evidenceRequest}');`,
  ];
  for (const call of editCalls) {
    const result = sql(
      container,
      database,
      `begin;\n${actorSql(fixture.values.actor)}\n${call}\ncommit;`,
    );
    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout + result.stderr,
      /HOF_APPLICATION_(NOT_EDITABLE|NOT_DRAFT)/,
    );
  }

  const read = sql(
    container,
    database,
    String.raw`
begin;
set local role service_role;
select evidence_id='${fixture.values.evidence}'::uuid
from public.get_hall_of_fame_evidence_read_context_server(
 '${fixture.values.actor}','${fixture.values.evidence}');
rollback;
`,
  );
  assert.equal(read.status, 0, read.stdout + read.stderr);
  assert.match(read.stdout, /t/);
});

test("request mismatch and stale version use controlled errors", () => {
  const fixture = fixtureSql();
  const requestId = randomUUID();
  const success = sql(
    container,
    database,
    `begin;\n${fixture.sql}\n${submitSql(fixture, requestId)}\ncommit;`,
  );
  assert.equal(success.status, 0, success.stdout + success.stderr);
  const mismatch = sql(
    container,
    database,
    `begin;\n${submitSql(fixture, requestId, 2)}\ncommit;`,
  );
  assert.notEqual(mismatch.status, 0);
  assert.match(
    mismatch.stdout + mismatch.stderr,
    /HOF_REQUEST_ID_PAYLOAD_MISMATCH/,
  );

  const staleFixture = fixtureSql();
  const stale = sql(
    container,
    database,
    `begin;\n${staleFixture.sql}\n${submitSql(staleFixture, randomUUID(), 2)}\ncommit;`,
  );
  assert.notEqual(stale.status, 0);
  assert.match(stale.stdout + stale.stderr, /HOF_STALE_VERSION/);
});

test("submit and draft withdrawal serialize to one complete outcome", async () => {
  const fixture = fixtureSql();
  const setup = sql(container, database, `begin;\n${fixture.sql}\ncommit;`);
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);
  const submitRequest = randomUUID();
  const withdrawRequest = randomUUID();
  const [submit, withdraw] = await runGatedRace(
    fixture.values.batch,
    8608,
    `begin;\n${submitSql(fixture, submitRequest)}\ncommit;`,
    String.raw`begin;
${actorSql(fixture.values.actor)}
select * from public.withdraw_hall_of_fame_application_draft(
 '${fixture.values.batch}',1,'TEST RACE','${withdrawRequest}');
commit;`,
  );
  assert.equal([submit, withdraw].filter((result) => result.status === 0).length, 1);
  assert.doesNotMatch(
    submit.stdout + submit.stderr + withdraw.stdout + withdraw.stderr,
    /deadlock detected/i,
  );
  const state = sql(
    container,
    database,
    `select status,count(*) over() from public.hall_of_fame_application_batches where id='${fixture.values.batch}';`,
  );
  assert.equal(state.status, 0, state.stderr);
  assert.match(state.stdout, /(submitted|withdrawn)/);
});

test("submit and consent withdrawal cannot produce withdrawn consent plus submitted batch", async () => {
  const fixture = fixtureSql();
  const setup = sql(container, database, `begin;\n${fixture.sql}\ncommit;`);
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);
  const [submit, withdraw] = await runGatedRace(
    fixture.values.batch,
    8608,
    `begin;\n${submitSql(fixture, randomUUID())}\ncommit;`,
    String.raw`begin;
${actorSql(fixture.values.actor)}
select * from public.set_hall_of_fame_application_consent(
 '${fixture.values.record}','application_processing','withdraw','hof-test-v1',
 1,'${randomUUID()}');
commit;`,
  );
  assert.equal([submit, withdraw].filter((result) => result.status === 0).length, 1);
  assert.doesNotMatch(
    submit.stdout + submit.stderr + withdraw.stdout + withdraw.stderr,
    /deadlock detected/i,
  );
  const invalid = sql(
    container,
    database,
    String.raw`select exists(
      select 1 from public.hall_of_fame_application_batches as batch
      join public.hall_of_fame_application_consents as consent
        on consent.application_batch_id=batch.id
      where batch.id='${fixture.values.batch}'
        and batch.status='submitted' and consent.status='withdrawn'
    );`,
  );
  assert.equal(invalid.status, 0, invalid.stderr);
  assert.match(invalid.stdout, /f/);
});

test("evidence finalize and submit serialize without pending evidence submission", async () => {
  const fixture = fixtureSql({ omitEvidence: true });
  const pending = fixture.values.pendingEvidence;
  fixture.sql += String.raw`
set local session_replication_role=replica;
insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,
 storage_path,mime_type,original_filename,uploaded_by_user_id,status,
 declared_mime_type,declared_byte_size,upload_expires_at,version)
values('${pending}','${fixture.values.batch}','${fixture.values.record}','scorecard',
 'hall-of-fame-evidence','applications/${fixture.values.batch}/${pending}/original',
 'image/png',null,'${fixture.values.actor}','pending_upload','image/png',8,
 now()+interval '15 minutes',1);
set local session_replication_role=origin;
`;
  const setup = sql(container, database, `begin;\n${fixture.sql}\ncommit;`);
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);
  const [submit, finalize] = await runGatedRace(
    fixture.values.batch,
    8610,
    `begin;\n${submitSql(fixture, randomUUID())}\ncommit;`,
    String.raw`begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select * from public.finalize_hall_of_fame_evidence_server(
 '${fixture.values.actor}','${pending}','image/png',8,repeat('cd',32),1,1,
 '${randomUUID()}');
commit;`,
  );
  assert.equal(finalize.status, 0, finalize.stdout + finalize.stderr);
  assert.notEqual(submit.status, 0);
  assert.doesNotMatch(
    submit.stdout + submit.stderr + finalize.stdout + finalize.stderr,
    /deadlock detected/i,
  );
  const state = sql(
    container,
    database,
    String.raw`select
      (select status='draft' and version=2
       from public.hall_of_fame_application_batches
       where id='${fixture.values.batch}')
      and
      (select status='available' from public.hall_of_fame_evidence_files
       where id='${pending}');`,
  );
  assert.equal(state.status, 0, state.stderr);
  assert.match(state.stdout, /t/);
  const latestSubmit = sql(
    container,
    database,
    `begin;\n${submitSql(fixture, randomUUID(), 2)}\ncommit;`,
  );
  assert.equal(
    latestSubmit.status,
    0,
    latestSubmit.stdout + latestSubmit.stderr,
  );
});
