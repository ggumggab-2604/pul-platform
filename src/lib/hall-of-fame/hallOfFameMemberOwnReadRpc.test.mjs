import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migrationNames = [
  "20260808000100_pul_hall_of_fame_consent_confirmation_rpc.sql",
  "20260808000200_pul_hall_of_fame_evidence_storage_rpc.sql",
  "20260810000100_pul_hall_of_fame_application_submit_rpc.sql",
  "20260810000200_pul_hall_of_fame_review_read_start_rpc.sql",
  "20260811000100_pul_hall_of_fame_additional_info_resubmit_rpc.sql",
  "20260811000200_pul_hall_of_fame_withdrawal_rpc.sql",
  "20260812000100_pul_hall_of_fame_final_decision_rpc.sql",
  "20260813000100_pul_hall_of_fame_badge_publication_projection_rpc.sql",
  "20260813000200_pul_hall_of_fame_canonical_correction_revoke_rpc.sql",
  "20260815000100_pul_hall_of_fame_dispute_intake_foundation.sql",
  "20260815000200_pul_hall_of_fame_dispute_review_resolution_rpc.sql",
  "20260816000100_pul_hall_of_fame_member_own_read_contract.sql",
];

const migrations = migrationNames.map((filename) =>
  readFileSync(
    fileURLToPath(
      new URL(`../../../supabase/migrations/${filename}`, import.meta.url),
    ),
    "utf8",
  ),
);

function docker(args, input) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function sql(text, user = "supabase_admin") {
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
      "-t",
      "-A",
      "-F",
      "|",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    text,
  );
}

function actorSql(actor, role = "authenticated") {
  return String.raw`
set role ${role};
set request.jwt.claim.sub = '${actor}';
set request.jwt.claim.role = '${role}';
`;
}

function assertSuccess(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

function assertError(result, pattern) {
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, pattern);
}

function rows(result) {
  return result.stdout.trim().split(/\r?\n/).filter(Boolean);
}

function ids() {
  return {
    creator: randomUUID(),
    subject: randomUUID(),
    other: randomUUID(),
    inactive: randomUUID(),
    club: randomUUID(),
    creatorMembership: randomUUID(),
    subjectMembership: randomUUID(),
    rejectedBatch: randomUUID(),
    rejectedRound: randomUUID(),
    rejectedRecord: randomUUID(),
    activeBatch: randomUUID(),
    activeRound: randomUUID(),
    activeRecord: randomUUID(),
    activeCanonical: randomUUID(),
    revokedBatch: randomUUID(),
    revokedRound: randomUUID(),
    revokedRecord: randomUUID(),
    revokedCanonical: randomUUID(),
    inactiveBatch: randomUUID(),
    inactiveRound: randomUUID(),
    inactiveRecord: randomUUID(),
  };
}

function fixtureSql(value) {
  const users = [
    [value.creator, "active"],
    [value.subject, "active"],
    [value.other, "active"],
    [value.inactive, "suspended"],
  ];
  const authRows = users
    .map(
      ([userId]) =>
        `('${userId}','00000000-0000-0000-0000-000000000000',` +
        `'authenticated','authenticated','hof-own-${userId}@example.invalid',` +
        `'',now(),now(),now())`,
    )
    .join(",\n");
  const accountRows = users
    .map(([userId, status]) => `('${userId}','${status}','member')`)
    .join(",\n");

  return String.raw`
set session_replication_role = replica;
insert into auth.users(
 id,instance_id,aud,role,email,encrypted_password,
 email_confirmed_at,created_at,updated_at)
values
${authRows};
insert into public.user_accounts(id,account_status,platform_role)
values
${accountRows};
insert into public.clubs(id,legacy_key,name,club_status)
values('${value.club}',null,'HOF OWN READ CLUB','active');
insert into public.club_memberships(
 id,club_id,user_id,membership_status,joined_at)
values
 ('${value.creatorMembership}','${value.club}','${value.creator}','active',now()),
 ('${value.subjectMembership}','${value.club}','${value.subject}','active',now());

insert into public.hall_of_fame_application_batches(
 id,application_type,created_by_user_id,created_by_membership_id,
 nominating_club_id,status,version,submitted_at,finalized_at)
values
 ('${value.rejectedBatch}','club_nomination','${value.creator}',
  '${value.creatorMembership}','${value.club}','partially_approved',4,now(),now()),
 ('${value.activeBatch}','club_nomination','${value.creator}',
  '${value.creatorMembership}','${value.club}','approved',4,now(),now()),
 ('${value.revokedBatch}','club_nomination','${value.creator}',
  '${value.creatorMembership}','${value.club}','approved',4,now(),now()),
 ('${value.inactiveBatch}','direct_application','${value.inactive}',
  null,null,'rejected',3,now(),now());

insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,
 course_region_snapshot,course_environment,course_layout_snapshot,round_type)
values
 ('${value.rejectedRound}','${value.rejectedBatch}','2026-08-01',
  'REJECTED COURSE','TEST REGION','outdoor','A','practice'),
 ('${value.activeRound}','${value.activeBatch}','2026-08-02',
  'ACTIVE COURSE','TEST REGION','outdoor','B','club_event'),
 ('${value.revokedRound}','${value.revokedBatch}','2026-08-03',
  'REVOKED COURSE','TEST REGION','screen','C','tournament'),
 ('${value.inactiveRound}','${value.inactiveBatch}','2026-08-04',
  'INACTIVE COURSE','TEST REGION','outdoor','D','casual');

insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,target_membership_id,
 record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,
 club_verification_status,member_consent_status,review_status,
 conflict_of_interest,fingerprint_version,duplicate_fingerprint,version)
values
 ('${value.rejectedRecord}','${value.rejectedBatch}','${value.rejectedRound}',
  '${value.subject}','${value.subjectMembership}','hole_in_one','A',1,3,1,
  'verified','granted','rejected',false,1,
  extensions.digest(pg_catalog.convert_to('${value.rejectedRecord}','UTF8'),'sha256'),4),
 ('${value.activeRecord}','${value.activeBatch}','${value.activeRound}',
  '${value.subject}','${value.subjectMembership}','albatross','B',2,4,1,
  'verified','granted','approved',false,1,
  extensions.digest(pg_catalog.convert_to('${value.activeRecord}','UTF8'),'sha256'),4),
 ('${value.revokedRecord}','${value.revokedBatch}','${value.revokedRound}',
  '${value.subject}','${value.subjectMembership}','condor','C',3,5,1,
  'verified','granted','approved',false,1,
  extensions.digest(pg_catalog.convert_to('${value.revokedRecord}','UTF8'),'sha256'),4),
 ('${value.inactiveRecord}','${value.inactiveBatch}','${value.inactiveRound}',
  '${value.inactive}',null,'hole_in_one','D',4,3,1,
  'not_applicable','granted','rejected',false,1,
  extensions.digest(pg_catalog.convert_to('${value.inactiveRecord}','UTF8'),'sha256'),3);

insert into public.hall_of_fame_records(
 id,source_application_record_id,target_user_id,record_type_code,played_on,
 course_name_snapshot,course_region_snapshot,course_environment,
 course_layout_snapshot,course_segment_snapshot,hole_number,hole_par,strokes,
 nominating_club_id,fingerprint_version,record_fingerprint,validity_status,
 publication_status,suppression_reason,approved_by_user_id,approved_at,
 revoked_at,revoked_by_user_id,revocation_reason_code,revocation_reason,version)
values
 ('${value.activeCanonical}','${value.activeRecord}','${value.subject}',
  'albatross','2026-08-02','ACTIVE COURSE','TEST REGION','outdoor','B','B',
  2,4,1,'${value.club}',1,
  extensions.digest(pg_catalog.convert_to('${value.activeCanonical}','UTF8'),'sha256'),
  'active','hidden',null,'${value.creator}',now(),null,null,null,null,1),
 ('${value.revokedCanonical}','${value.revokedRecord}','${value.subject}',
  'condor','2026-08-03','REVOKED COURSE','TEST REGION','screen','C','C',
  3,5,1,'${value.club}',1,
  extensions.digest(pg_catalog.convert_to('${value.revokedCanonical}','UTF8'),'sha256'),
  'revoked','suppressed','revoked by test','${value.creator}',now(),now(),
  '${value.creator}','factual_error','test revocation',2);

insert into public.hall_of_fame_badge_sources(
 target_user_id,badge_code,record_id,status,activated_at,
 deactivated_at,deactivation_reason)
values
 ('${value.subject}','albatross','${value.activeCanonical}','active',now(),null,null),
 ('${value.subject}','hall_of_fame_inductee','${value.activeCanonical}',
  'active',now(),null,null),
 ('${value.subject}','condor','${value.revokedCanonical}',
  'inactive',now(),now(),'record revoked'),
 ('${value.subject}','hall_of_fame_inductee','${value.revokedCanonical}',
  'inactive',now(),now(),'record revoked');
set session_replication_role = origin;
`;
}

let container;
let database;
let value;

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
  database = `pul_hof_member_read_${process.pid}_${Date.now()}`;
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
    "select count(*) || ':' || max(version) from supabase_migrations.schema_migrations;",
  );
  assertSuccess(baseline);
  assert.match(baseline.stdout, /27:20260807000200/);

  assertSuccess(sql(`begin;\n${migrations.join("\n")}\ncommit;`, "postgres"));
  const historyValues = migrationNames
    .map((filename) => {
      const version = filename.slice(0, 14);
      const name = filename.slice(15, -4);
      return `('${version}',array[]::text[],'${name}')`;
    })
    .join(",\n");
  assertSuccess(
    sql(
      `insert into supabase_migrations.schema_migrations(version,statements,name) values\n${historyValues};`,
      "postgres",
    ),
  );

  value = ids();
  assertSuccess(sql(fixtureSql(value), "postgres"));
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

test("effective catalog is 39 and both own-read RPCs are authenticated-only", () => {
  const result = sql(String.raw`
select count(*) || ':' || max(version)
from supabase_migrations.schema_migrations;
select p.proname,p.prosecdef,p.proconfig,
 pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'list_my_hall_of_fame_applications',
    'list_my_hall_of_fame_records'
  )
order by p.proname;
select pg_catalog.has_function_privilege(
 'authenticated',
 'private.hall_of_fame_allowed_dispute_types(uuid,text,uuid,uuid,uuid,text,text)',
 'EXECUTE'
);
select pg_catalog.has_table_privilege(
 'authenticated','public.hall_of_fame_application_records','SELECT'
),pg_catalog.has_table_privilege(
 'authenticated','public.hall_of_fame_records','SELECT'
);
`);
  assertSuccess(result);
  const output = rows(result);
  assert.equal(output[0], "39:20260816000100");
  for (const line of output.slice(1, 3)) {
    const columns = line.split("|");
    assert.equal(columns[1], "t");
    assert.match(columns[2], /search_path/);
    assert.deepEqual(columns.slice(3), ["t", "f", "f"]);
  }
  assert.equal(output[3], "f");
  assert.equal(output[4], "f|f");
});

test("unauthenticated and non-executable roles cannot use private member reads", () => {
  assertError(
    sql(String.raw`
set role authenticated;
select * from public.list_my_hall_of_fame_applications(50,0);
`),
    /HOF_AUTHENTICATION_REQUIRED/,
  );
  for (const role of ["anon", "service_role"]) {
    assertError(
      sql(String.raw`
set role ${role};
select * from public.list_my_hall_of_fame_records(50,0);
`),
      /permission denied for function list_my_hall_of_fame_records/,
    );
  }
});

test("submitter and subject see only related application action targets", () => {
  for (const actor of [value.creator, value.subject]) {
    const result = sql(String.raw`
${actorSql(actor)}
select application_record_id,record_status,record_type_code,club_name,
 array_to_string(allowed_dispute_types,','),can_submit_dispute,
 is_submitter,is_subject
from public.list_my_hall_of_fame_applications(50,0)
order by played_on;
`);
    assertSuccess(result);
    const output = rows(result);
    assert.equal(output.length, 3);
    const rejected = output.find((line) => line.startsWith(value.rejectedRecord));
    assert.ok(rejected);
    assert.match(rejected, /\|rejected\|hole_in_one\|HOF OWN READ CLUB\|decision_appeal\|t\|/);
    assert.ok(output.some((line) => line.startsWith(value.activeRecord)));
    assert.ok(output.some((line) => line.startsWith(value.revokedRecord)));
  }

  const unrelated = sql(String.raw`
${actorSql(value.other)}
select count(*) from public.list_my_hall_of_fame_applications(50,0);
select count(*) from public.list_my_hall_of_fame_records(50,0);
`);
  assertSuccess(unrelated);
  assert.deepEqual(rows(unrelated), ["0", "0"]);

  const inactive = sql(String.raw`
${actorSql(value.inactive)}
select application_record_id,array_to_string(allowed_dispute_types,','),
 can_submit_dispute
from public.list_my_hall_of_fame_applications(50,0);
`);
  assertSuccess(inactive);
  assert.equal(rows(inactive)[0], `${value.inactiveRecord}||f`);
});

test("canonical own-read exposes explicit terminal badges and exact policy actions", () => {
  const subject = sql(String.raw`
${actorSql(value.subject)}
select canonical_record_id,validity_status,publication_status,
 badges::text,array_to_string(allowed_dispute_types,','),can_submit_dispute,
 is_submitter,is_subject
from public.list_my_hall_of_fame_records(50,0)
order by played_on;
`);
  assertSuccess(subject);
  const subjectRows = rows(subject);
  assert.equal(subjectRows.length, 2);
  const active = subjectRows.find((line) => line.startsWith(value.activeCanonical));
  const revoked = subjectRows.find((line) => line.startsWith(value.revokedCanonical));
  assert.ok(active);
  assert.ok(revoked);
  assert.match(active, /\|active\|hidden\|.*"status": "active"/);
  assert.match(active, /\|correction_request,subject_objection\|t\|f\|t$/);
  assert.match(revoked, /\|revoked\|suppressed\|.*"status": "inactive"/);
  assert.match(
    revoked,
    /\|correction_request,decision_appeal,subject_objection\|t\|f\|t$/,
  );

  const creator = sql(String.raw`
${actorSql(value.creator)}
select canonical_record_id,array_to_string(allowed_dispute_types,','),
 is_submitter,is_subject
from public.list_my_hall_of_fame_records(50,0)
order by played_on;
`);
  assertSuccess(creator);
  for (const line of rows(creator)) {
    assert.match(line, /\|correction_request,fraud_report\|t\|f$/);
  }
});

test("returned targets work with submit and open duplicates disappear from availability", () => {
  const appealRequest = randomUUID();
  const appeal = sql(String.raw`
${actorSql(value.subject)}
select request_id,operation,dispute_type,status,version,changed,replayed
from public.submit_hall_of_fame_dispute(
 'decision_appeal','decision_error','${value.rejectedRecord}',null,
 'member own-read application target contract','${appealRequest}'
);
`);
  assertSuccess(appeal);
  assert.match(
    rows(appeal).at(-1),
    new RegExp(`^${appealRequest}\\|hall_of_fame\\.dispute\\.submit\\|decision_appeal\\|open\\|1\\|t\\|f$`),
  );

  const correctionRequest = randomUUID();
  const correction = sql(String.raw`
${actorSql(value.subject)}
select request_id,operation,dispute_type,status,version,changed,replayed
from public.submit_hall_of_fame_dispute(
 'correction_request','factual_error',null,'${value.activeCanonical}',
 'member own-read canonical target contract','${correctionRequest}'
);
`);
  assertSuccess(correction);

  const availability = sql(String.raw`
${actorSql(value.subject)}
select array_to_string(allowed_dispute_types,','),can_submit_dispute
from public.list_my_hall_of_fame_applications(50,0)
where application_record_id='${value.rejectedRecord}';
select array_to_string(allowed_dispute_types,','),can_submit_dispute
from public.list_my_hall_of_fame_records(50,0)
where canonical_record_id='${value.activeCanonical}';
`);
  assertSuccess(availability);
  assert.deepEqual(rows(availability), ["|f", "subject_objection|t"]);
});

test("own-read calls do not mutate HOF, dispute, audit, or ledger state", () => {
  const result = sql(String.raw`
select concat_ws('|',
 (select count(*) from public.hall_of_fame_application_records),
 (select count(*) from public.hall_of_fame_records),
 (select count(*) from public.hall_of_fame_badge_sources),
 (select count(*) from public.hall_of_fame_publication_consents),
 (select count(*) from public.hall_of_fame_disputes),
 (select count(*) from public.audit_logs),
 (select count(*) from private.hall_of_fame_mutation_requests)
);
${actorSql(value.subject)}
select count(*) from public.list_my_hall_of_fame_applications(100,0);
select count(*) from public.list_my_hall_of_fame_records(100,0);
reset role;
select concat_ws('|',
 (select count(*) from public.hall_of_fame_application_records),
 (select count(*) from public.hall_of_fame_records),
 (select count(*) from public.hall_of_fame_badge_sources),
 (select count(*) from public.hall_of_fame_publication_consents),
 (select count(*) from public.hall_of_fame_disputes),
 (select count(*) from public.audit_logs),
 (select count(*) from private.hall_of_fame_mutation_requests)
);
`);
  assertSuccess(result);
  const output = rows(result);
  assert.equal(output[0], output.at(-1));
  assert.equal(output[1], "3");
  assert.equal(output[2], "2");
});

test("pagination is bounded and public projection remains identifier-free", () => {
  const invalid = sql(String.raw`
${actorSql(value.subject)}
select * from public.list_my_hall_of_fame_records(101,0);
`);
  assertError(invalid, /HOF_INVALID_PAGINATION/);

  const publicColumns = sql(String.raw`
select pg_catalog.pg_get_function_result(p.oid)
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='list_hall_of_fame_public_records';
`);
  assertSuccess(publicColumns);
  assert.doesNotMatch(rows(publicColumns)[0], /uuid|record_id|application_id|target_id/);
});
