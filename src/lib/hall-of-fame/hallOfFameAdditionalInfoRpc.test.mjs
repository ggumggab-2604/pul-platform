import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migrationNames = [
  "20260808000100_pul_hall_of_fame_consent_confirmation_rpc.sql",
  "20260808000200_pul_hall_of_fame_evidence_storage_rpc.sql",
  "20260810000100_pul_hall_of_fame_application_submit_rpc.sql",
  "20260810000200_pul_hall_of_fame_review_read_start_rpc.sql",
  "20260811000100_pul_hall_of_fame_additional_info_resubmit_rpc.sql",
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
        "-t",
        "-A",
        "-F",
        "|",
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

async function waitForActivity(applicationName, waitEventType, waitEvent = null) {
  assert.match(applicationName, /^[a-z0-9_]+$/);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = sql(
      container,
      database,
      String.raw`
select pg_catalog.count(*)
from pg_catalog.pg_stat_activity
where application_name = '${applicationName}'
  and wait_event_type = '${waitEventType}'
  ${waitEvent ? `and wait_event = '${waitEvent}'` : ""};
`,
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    if (Number(result.stdout.trim()) > 0) return;
    await pause(25);
  }
  throw new Error(`${applicationName} did not reach ${waitEventType}`);
}

function accountStatusMutationSql(userId, applicationName, status) {
  return String.raw`
set application_name = '${applicationName}';
begin;
set local session_replication_role = replica;
update public.user_accounts
set account_status = '${status}'
where id = '${userId}';
select pg_sleep(1.2);
commit;
`;
}

function actorSql(actor, role = "authenticated") {
  return String.raw`
set role ${role};
select pg_catalog.set_config('request.jwt.claim.sub','${actor}',false);
select pg_catalog.set_config('request.jwt.claim.role','${role}',false);
`;
}

function fixtureIds() {
  return {
    applicant: randomUUID(),
    companion: randomUUID(),
    moderator: randomUUID(),
    ordinary: randomUUID(),
    batch: randomUUID(),
    round: randomUUID(),
    record: randomUUID(),
    evidence: randomUUID(),
    fixtureRequest: randomUUID(),
    club: randomUUID(),
    actorMembership: randomUUID(),
    targetMembership: randomUUID(),
    adminAssignment: randomUUID(),
  };
}

function fixtureSql(values) {
  const users = [
    values.applicant,
    values.companion,
    values.moderator,
    values.ordinary,
  ];
  const authRows = users
    .map(
      (id) =>
        `('${id}','00000000-0000-0000-0000-000000000000',` +
        `'authenticated','authenticated','hof-air-${id}@example.invalid',` +
        `'',now(),now(),now())`,
    )
    .join(",\n");
  const accountRows = [
    [values.applicant, "member"],
    [values.companion, "member"],
    [values.moderator, "platform_moderator"],
    [values.ordinary, "member"],
  ]
    .map(([id, platformRole]) => `('${id}','active','${platformRole}')`)
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
insert into public.hall_of_fame_application_batches(
 id,application_type,created_by_user_id,status,version,submitted_at)
values(
 '${values.batch}','direct_application','${values.applicant}',
 'under_review',3,now()
);
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,
 course_region_snapshot,course_environment,course_layout_snapshot,
 round_type,event_name_snapshot,notes)
values(
 '${values.round}','${values.batch}','2026-08-01','AIR TEST COURSE',
 'AIR TEST REGION','outdoor','A COURSE','practice',
 'AIR TEST EVENT','AIR TEST ROUND'
);
insert into private.hall_of_fame_mutation_requests(
 actor_user_id,request_id,operation,application_batch_id,
 payload_fingerprint,status,result_payload,completed_at)
values(
 '${values.applicant}','${values.fixtureRequest}','hall_of_fame.fixture.create',
 '${values.batch}',decode(repeat('f2',32),'hex'),'completed','{}',now()
);
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,
 record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,
 club_verification_status,member_consent_status,review_status,
 conflict_of_interest,fingerprint_version,duplicate_fingerprint,version)
values(
 '${values.record}','${values.batch}','${values.round}','${values.applicant}',
 'hole_in_one','A',1,3,1,'not_applicable','granted','under_review',
 false,1,extensions.digest(
   pg_catalog.convert_to('${values.record}','UTF8'),'sha256'
 ),3
);
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,
 version,actor_user_id,actor_platform_role,action,request_id)
values
 ('batch','${values.batch}',null,null,'draft',1,'${values.applicant}',null,
  'hall_of_fame.fixture.create','${values.fixtureRequest}'),
 ('batch','${values.batch}',null,'draft','submitted',2,'${values.applicant}',null,
  'hall_of_fame.application.submit','${values.fixtureRequest}'),
 ('batch','${values.batch}',null,'submitted','under_review',3,
  '${values.moderator}','platform_moderator',
  'hall_of_fame.application.review.start','${values.fixtureRequest}'),
 ('record','${values.batch}','${values.record}',null,'draft',1,
  '${values.applicant}',null,'hall_of_fame.fixture.create','${values.fixtureRequest}'),
 ('record','${values.batch}','${values.record}','draft','submitted',2,
  '${values.applicant}',null,'hall_of_fame.application.submit','${values.fixtureRequest}'),
 ('record','${values.batch}','${values.record}','submitted','under_review',3,
  '${values.moderator}','platform_moderator',
  'hall_of_fame.application.review.start','${values.fixtureRequest}');
insert into public.hall_of_fame_application_consents(
 id,application_record_id,application_batch_id,subject_user_id,
 consent_purpose,status,policy_version,version,granted_at,
 last_actor_user_id,last_request_id)
values
 ('${randomUUID()}','${values.record}','${values.batch}','${values.applicant}',
  'application_processing','granted','hof-air-v1',1,now(),
  '${values.applicant}','${values.fixtureRequest}'),
 ('${randomUUID()}','${values.record}','${values.batch}','${values.applicant}',
  'evidence_review','granted','hof-air-v1',1,now(),
  '${values.applicant}','${values.fixtureRequest}');
insert into public.hall_of_fame_publication_consents(
 application_record_id,target_user_id,status,display_name_consent,
 avatar_consent,club_name_consent,record_date_consent,course_detail_consent,
 version,consented_at,policy_version,masked_display_name_consent,
 full_display_name_consent,badge_consent,last_actor_user_id,last_request_id)
values(
 '${values.record}','${values.applicant}','granted',true,false,false,true,true,
 1,now(),'hof-air-v1',true,false,false,
 '${values.applicant}','${values.fixtureRequest}'
);
insert into public.hall_of_fame_record_confirmations(
 id,application_record_id,confirmer_user_id,confirmation_role,status,
 statement,confirmed_at,version,requester_user_id,requested_at,expires_at,
 responded_at,last_actor_user_id,last_request_id)
values(
 '${randomUUID()}','${values.record}','${values.companion}',
 'round_companion','confirmed','AIR TEST CONFIRMATION',now(),1,
 '${values.applicant}',now()-interval '1 day',now()+interval '13 days',now(),
 '${values.applicant}','${values.fixtureRequest}'
);
insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,
 storage_path,mime_type,byte_size,sha256,uploaded_by_user_id,status,
 finalized_at,declared_mime_type,declared_byte_size,version)
values(
 '${values.evidence}','${values.batch}','${values.record}','scorecard',
 'hall-of-fame-evidence',
 'applications/${values.batch}/${values.evidence}/original',
 'image/png',8,decode(repeat('ab',32),'hex'),'${values.applicant}',
 'available',now(),'image/png',8,1
);
set session_replication_role = origin;
`;
}

function nominationFixtureSql(values) {
  return (
    fixtureSql(values) +
    String.raw`
set session_replication_role = replica;
insert into public.clubs(id,legacy_key,name,club_status)
values('${values.club}',null,'HOF AIR NOMINATION TEST CLUB','active');
insert into public.club_memberships(
  id,club_id,user_id,membership_status,joined_at
) values
 ('${values.actorMembership}','${values.club}','${values.applicant}','active',now()),
 ('${values.targetMembership}','${values.club}','${values.ordinary}','active',now());
insert into public.club_role_assignments(
  id,membership_id,role_code,assigned_by
) values
 ('${randomUUID()}','${values.actorMembership}','club_member','${values.applicant}'),
 ('${values.adminAssignment}','${values.actorMembership}','club_admin','${values.applicant}'),
 ('${randomUUID()}','${values.targetMembership}','club_member','${values.applicant}');
update public.hall_of_fame_application_batches
set application_type = 'club_nomination',
    created_by_membership_id = '${values.actorMembership}',
    nominating_club_id = '${values.club}'
where id = '${values.batch}';
update public.hall_of_fame_application_records
set target_user_id = '${values.ordinary}',
    target_membership_id = '${values.targetMembership}',
    club_verification_status = 'pending'
where id = '${values.record}';
update public.hall_of_fame_application_consents
set subject_user_id = '${values.ordinary}'
where application_record_id = '${values.record}';
insert into public.hall_of_fame_application_consents(
 id,application_record_id,application_batch_id,subject_user_id,
 consent_purpose,status,policy_version,version,requested_at,expires_at,
 granted_at,last_actor_user_id,last_request_id
) values(
 '${randomUUID()}','${values.record}','${values.batch}','${values.ordinary}',
 'nomination_acceptance','granted','hof-air-v1',1,now(),
 now()+interval '14 days',now(),'${values.ordinary}','${values.fixtureRequest}'
);
update public.hall_of_fame_publication_consents
set target_user_id = '${values.ordinary}'
where application_record_id = '${values.record}';
set session_replication_role = origin;
`
  );
}

function requestSql(
  fixture,
  actor,
  requestId,
  {
    expectedVersion = 3,
    recipient = fixture.applicant,
    record = null,
    kind = "text_response",
    evidenceType = null,
    message = "TEST additional information request",
  } = {},
) {
  return String.raw`
${actorSql(actor)}
select * from public.request_hall_of_fame_additional_info(
 '${fixture.batch}',${expectedVersion},'${recipient}',
 ${record ? `'${record}'` : "null"},'${kind}',
 ${evidenceType ? `'${evidenceType}'` : "null"},'${message}','${requestId}'
);
`;
}

function responseSql(fixture, actor, messageId, requestId, version = 4) {
  return String.raw`
${actorSql(actor)}
select * from public.respond_to_hall_of_fame_additional_info(
 '${messageId}',${version},'TEST applicant response','${requestId}'
);
`;
}

function resubmitSql(fixture, actor, requestId, version = 4) {
  return String.raw`
${actorSql(actor)}
select * from public.resubmit_hall_of_fame_application(
 '${fixture.batch}',${version},'${requestId}'
);
`;
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
  database = `pul_hof_air_${process.pid}_${Date.now()}`;
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
    `begin;\n${migrations.join("\n")}\ncommit;`,
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

test("migration chain exposes strict authenticated RPC and service ACLs", () => {
  const result = sql(
    container,
    database,
    String.raw`
select count(*)
from pg_proc as p
join pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'request_hall_of_fame_additional_info',
    'respond_to_hall_of_fame_additional_info',
    'create_hall_of_fame_supplemental_evidence_upload_intent',
    'resubmit_hall_of_fame_application'
  )
  and p.prosecdef
  and p.proconfig = array['search_path=""']::text[]
  and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
  and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
  and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
select
 pg_catalog.has_function_privilege(
   'service_role',
   'public.finalize_hall_of_fame_evidence_server(uuid,uuid,text,bigint,text,integer,integer,uuid)',
   'EXECUTE'
 )
 and not pg_catalog.has_function_privilege(
   'authenticated',
   'public.finalize_hall_of_fame_evidence_server(uuid,uuid,text,bigint,text,integer,integer,uuid)',
   'EXECUTE'
 );
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "4\nt");
});

test("request, response, supplemental evidence, resubmit, and review restart form one safe cycle", () => {
  const fixture = fixtureIds();
  let result = sql(container, database, fixtureSql(fixture));
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const textRequestId = randomUUID();
  result = sql(
    container,
    database,
    requestSql(fixture, fixture.moderator, textRequestId),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const textRequest = result.stdout.trim().split("|");
  assert.equal(textRequest[4], "additional_info_required");
  assert.equal(textRequest[5], "4");
  assert.equal(textRequest[8], "1");
  assert.equal(textRequest[10], "f");
  const textMessageId = textRequest[6];

  result = sql(
    container,
    database,
    requestSql(fixture, fixture.moderator, textRequestId),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|t\s*$/);

  const requestMismatch = sql(
    container,
    database,
    requestSql(fixture, fixture.moderator, textRequestId, {
      message: "TEST mismatched additional information request",
    }),
  );
  assert.notEqual(requestMismatch.status, 0);
  assert.match(requestMismatch.stderr, /HOF_REQUEST_ID_PAYLOAD_MISMATCH/);

  const evidenceRequestId = randomUUID();
  result = sql(
    container,
    database,
    requestSql(fixture, fixture.moderator, evidenceRequestId, {
      expectedVersion: 4,
      record: fixture.record,
      kind: "supplemental_evidence",
      evidenceType: "scorecard",
      message: "TEST supplemental scorecard request",
    }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const evidenceRequest = result.stdout.trim().split("|");
  assert.equal(evidenceRequest[4], "additional_info_required");
  assert.equal(evidenceRequest[5], "4");
  const evidenceMessageId = evidenceRequest[6];

  const responseRequestId = randomUUID();
  result = sql(
    container,
    database,
    responseSql(
      fixture,
      fixture.applicant,
      textMessageId,
      responseRequestId,
    ),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|additional_info_required\|4\|/);

  const duplicateResponse = sql(
    container,
    database,
    responseSql(fixture, fixture.applicant, textMessageId, randomUUID()),
  );
  assert.notEqual(duplicateResponse.status, 0);
  assert.match(
    duplicateResponse.stderr,
    /HOF_ADDITIONAL_INFO_ALREADY_RESPONDED/,
  );

  const intentRequestId = randomUUID();
  result = sql(
    container,
    database,
    String.raw`
${actorSql(fixture.applicant)}
select *
from public.create_hall_of_fame_supplemental_evidence_upload_intent(
 '${evidenceMessageId}','scorecard','image/png',8,4,'${intentRequestId}'
);
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const intent = result.stdout.trim().split("|");
  assert.equal(intent[4], "pending_upload");
  assert.equal(intent[6], "4");
  const supplementalEvidenceId = intent[3];

  const blockedResubmit = sql(
    container,
    database,
    resubmitSql(fixture, fixture.applicant, randomUUID()),
  );
  assert.notEqual(blockedResubmit.status, 0);
  assert.match(
    blockedResubmit.stderr,
    /HOF_UNRESOLVED_EVIDENCE|HOF_ADDITIONAL_INFO_INCOMPLETE/,
  );

  const finalizeRequestId = randomUUID();
  result = sql(
    container,
    database,
    String.raw`
${actorSql(fixture.applicant, "service_role")}
select * from public.finalize_hall_of_fame_evidence_server(
 '${fixture.applicant}','${supplementalEvidenceId}','image/png',8,
 '${"cd".repeat(32)}',1,4,'${finalizeRequestId}'
);
`,
    "postgres",
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|available\|2\|4\|4\|/);

  const resubmitRequestId = randomUUID();
  result = sql(
    container,
    database,
    resubmitSql(fixture, fixture.applicant, resubmitRequestId),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|submitted\|5\|/);
  assert.match(result.stdout, /\|f\s*$/);

  result = sql(
    container,
    database,
    resubmitSql(fixture, fixture.applicant, resubmitRequestId),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|t\s*$/);

  const reviewRequestId = randomUUID();
  result = sql(
    container,
    database,
    String.raw`
${actorSql(fixture.moderator)}
select * from public.start_hall_of_fame_application_review(
 '${fixture.batch}',5,'${reviewRequestId}'
);
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|under_review\|6\|/);

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,record.review_status,record.version,
 (select count(*) from public.hall_of_fame_application_messages
  where application_batch_id=batch.id and message_type='additional_info_request'),
 (select count(*) from public.hall_of_fame_application_messages
  where application_batch_id=batch.id and message_type='applicant_response'),
 (select count(*) from public.hall_of_fame_application_reviews
  where application_batch_id=batch.id
    and review_action='additional_info_requested'),
 (select count(*) from public.hall_of_fame_evidence_files
  where application_batch_id=batch.id
    and additional_info_request_message_id='${evidenceMessageId}'
    and status='available'),
 (select count(*) from public.hall_of_fame_application_history
  where application_batch_id=batch.id and scope='batch'
    and action='hall_of_fame.application.resubmit'),
 (select count(*) from public.audit_logs
  where action in (
      'hall_of_fame.application.additional_info.request',
      'hall_of_fame.application.additional_info.respond',
      'hall_of_fame.application.resubmit'
    )
    and (
      target_id=batch.id::text
      or metadata ->> 'application_batch_id'=batch.id::text
    )),
 (select count(*) from private.hall_of_fame_mutation_requests
  where application_batch_id=batch.id
    and operation in (
      'hall_of_fame.application.additional_info.request',
      'hall_of_fame.application.additional_info.respond',
      'hall_of_fame.application.resubmit'
    ) and status='completed')
from public.hall_of_fame_application_batches as batch
join public.hall_of_fame_application_records as record
  on record.application_batch_id=batch.id
where batch.id='${fixture.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "under_review|6|under_review|6|2|1|2|1|1|4|4");
});

test("authorization, recipient scope, and direct DML remain closed", () => {
  const fixture = fixtureIds();
  let result = sql(container, database, fixtureSql(fixture));
  assert.equal(result.status, 0, result.stdout + result.stderr);

  result = sql(
    container,
    database,
    requestSql(fixture, fixture.ordinary, randomUUID()),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_REVIEW_NOT_AUTHORIZED/);

  result = sql(
    container,
    database,
    requestSql(fixture, fixture.moderator, randomUUID(), {
      recipient: fixture.ordinary,
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_ADDITIONAL_INFO_RECIPIENT_INVALID/);

  result = sql(
    container,
    database,
    String.raw`
${actorSql(fixture.applicant)}
insert into public.hall_of_fame_application_messages(
 application_batch_id,message_type,body,created_by_user_id,request_id)
values(
 '${fixture.batch}','applicant_response','forged',
 '${fixture.applicant}','${randomUUID()}'
);
`,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /permission denied|row-level security/i);
});

test("nomination recipients remain creator-or-exact-record scoped in the database", () => {
  const fixture = fixtureIds();
  const other = fixtureIds();
  let result = sql(
    container,
    database,
    nominationFixtureSql(fixture) + nominationFixtureSql(other),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const rejected = [
    requestSql(fixture, fixture.moderator, randomUUID(), {
      recipient: fixture.ordinary,
    }),
    requestSql(fixture, fixture.moderator, randomUUID(), {
      recipient: other.ordinary,
      record: fixture.record,
    }),
    requestSql(fixture, fixture.moderator, randomUUID(), {
      recipient: fixture.ordinary,
      record: other.record,
    }),
    requestSql(fixture, fixture.moderator, randomUUID(), {
      recipient: fixture.companion,
      record: fixture.record,
    }),
  ];
  for (const statement of rejected) {
    result = sql(container, database, statement);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /HOF_ADDITIONAL_INFO_(RECIPIENT|RECORD)_INVALID/,
    );
  }

  result = sql(
    container,
    database,
    requestSql(fixture, fixture.moderator, randomUUID()),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|additional_info_required\|4\|/);

  result = sql(
    container,
    database,
    requestSql(fixture, fixture.moderator, randomUUID(), {
      expectedVersion: 4,
      recipient: fixture.ordinary,
      record: fixture.record,
    }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|additional_info_required\|4\|/);

  result = sql(
    container,
    database,
    String.raw`
select count(*)
from public.hall_of_fame_application_messages
where application_batch_id = '${fixture.batch}'
  and message_type = 'additional_info_request';
`,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "2");
});

test("recipient, target, and confirmer account status races are serialized", async () => {
  const recipientFirst = fixtureIds();
  let result = sql(container, database, fixtureSql(recipientFirst));
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const requestApp = `air_req_first_${Date.now()}`;
  const mutationApp = `air_status_after_${Date.now()}`;
  const request = sqlAsync(
    container,
    database,
    String.raw`
set application_name = '${requestApp}';
begin;
${requestSql(
  recipientFirst,
  recipientFirst.moderator,
  randomUUID(),
)}
select pg_sleep(1.2);
commit;
`,
  );
  await waitForActivity(requestApp, "Timeout", "PgSleep");
  const statusAfter = sqlAsync(
    container,
    database,
    accountStatusMutationSql(
      recipientFirst.applicant,
      mutationApp,
      "suspended",
    ),
  );
  await waitForActivity(mutationApp, "Lock");
  const [requestResult, statusAfterResult] = await Promise.all([
    request,
    statusAfter,
  ]);
  assert.equal(
    requestResult.status,
    0,
    requestResult.stdout + requestResult.stderr,
  );
  assert.equal(
    statusAfterResult.status,
    0,
    statusAfterResult.stdout + statusAfterResult.stderr,
  );
  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,account.account_status,
 (select count(*) from public.hall_of_fame_application_messages
  where application_batch_id=batch.id
    and message_type='additional_info_request')
from public.hall_of_fame_application_batches as batch
join public.user_accounts as account on account.id='${recipientFirst.applicant}'
where batch.id='${recipientFirst.batch}';
`,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "additional_info_required|4|suspended|1");

  const statusFirst = fixtureIds();
  result = sql(container, database, fixtureSql(statusFirst));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const blockerApp = `air_status_first_${Date.now()}`;
  const blockedRequestApp = `air_req_after_${Date.now()}`;
  const blocker = sqlAsync(
    container,
    database,
    accountStatusMutationSql(statusFirst.applicant, blockerApp, "suspended"),
  );
  await waitForActivity(blockerApp, "Timeout", "PgSleep");
  const blockedRequest = sqlAsync(
    container,
    database,
    String.raw`
set application_name = '${blockedRequestApp}';
${requestSql(statusFirst, statusFirst.moderator, randomUUID())}
`,
  );
  await waitForActivity(blockedRequestApp, "Lock");
  const [blockerResult, blockedRequestResult] = await Promise.all([
    blocker,
    blockedRequest,
  ]);
  assert.equal(blockerResult.status, 0, blockerResult.stderr);
  assert.notEqual(blockedRequestResult.status, 0);
  assert.match(
    blockedRequestResult.stderr,
    /HOF_ADDITIONAL_INFO_RECIPIENT_INVALID/,
  );
  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,
 (select count(*) from public.hall_of_fame_application_messages
  where application_batch_id=batch.id),
 (select count(*) from public.audit_logs
  where request_id is not null
    and metadata ->> 'application_batch_id'=batch.id::text),
 (select count(*) from private.hall_of_fame_mutation_requests
  where application_batch_id=batch.id)
from public.hall_of_fame_application_batches as batch
where batch.id='${statusFirst.batch}';
`,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "under_review|3|0|0|1");

  const targetRace = fixtureIds();
  result = sql(container, database, nominationFixtureSql(targetRace));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = sql(
    container,
    database,
    requestSql(targetRace, targetRace.moderator, randomUUID(), {
      recipient: targetRace.ordinary,
      record: targetRace.record,
    }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const targetMessageId = result.stdout.trim().split("|")[6];
  result = sql(
    container,
    database,
    responseSql(
      targetRace,
      targetRace.ordinary,
      targetMessageId,
      randomUUID(),
    ),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const targetBlockerApp = `air_target_first_${Date.now()}`;
  const targetResubmitApp = `air_target_resubmit_${Date.now()}`;
  const targetBlocker = sqlAsync(
    container,
    database,
    accountStatusMutationSql(
      targetRace.ordinary,
      targetBlockerApp,
      "suspended",
    ),
  );
  await waitForActivity(targetBlockerApp, "Timeout", "PgSleep");
  const targetResubmit = sqlAsync(
    container,
    database,
    String.raw`
set application_name = '${targetResubmitApp}';
${resubmitSql(targetRace, targetRace.applicant, randomUUID())}
`,
  );
  await waitForActivity(targetResubmitApp, "Lock");
  const [targetBlockerResult, targetResubmitResult] = await Promise.all([
    targetBlocker,
    targetResubmit,
  ]);
  assert.equal(targetBlockerResult.status, 0, targetBlockerResult.stderr);
  assert.notEqual(targetResubmitResult.status, 0);
  assert.match(targetResubmitResult.stderr, /HOF_TARGET_NOT_ACTIVE_MEMBER/);

  const confirmerRace = fixtureIds();
  result = sql(container, database, fixtureSql(confirmerRace));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = sql(
    container,
    database,
    requestSql(confirmerRace, confirmerRace.moderator, randomUUID()),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const confirmerMessageId = result.stdout.trim().split("|")[6];
  result = sql(
    container,
    database,
    responseSql(
      confirmerRace,
      confirmerRace.applicant,
      confirmerMessageId,
      randomUUID(),
    ),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const confirmerBlockerApp = `air_confirmer_first_${Date.now()}`;
  const confirmerResubmitApp = `air_confirmer_resubmit_${Date.now()}`;
  const confirmerBlocker = sqlAsync(
    container,
    database,
    accountStatusMutationSql(
      confirmerRace.companion,
      confirmerBlockerApp,
      "suspended",
    ),
  );
  await waitForActivity(confirmerBlockerApp, "Timeout", "PgSleep");
  const confirmerResubmit = sqlAsync(
    container,
    database,
    String.raw`
set application_name = '${confirmerResubmitApp}';
${resubmitSql(confirmerRace, confirmerRace.applicant, randomUUID())}
`,
  );
  await waitForActivity(confirmerResubmitApp, "Lock");
  const [confirmerBlockerResult, confirmerResubmitResult] = await Promise.all([
    confirmerBlocker,
    confirmerResubmit,
  ]);
  assert.equal(confirmerBlockerResult.status, 0, confirmerBlockerResult.stderr);
  assert.notEqual(confirmerResubmitResult.status, 0);
  assert.match(
    confirmerResubmitResult.stderr,
    /HOF_MEMBER_COMPANION_CONFIRMATION_REQUIRED/,
  );

  result = sql(
    container,
    database,
    String.raw`
select batch.id,batch.status,batch.version,
 (select count(*) from public.hall_of_fame_application_history
  where application_batch_id=batch.id
    and action='hall_of_fame.application.resubmit'),
 (select count(*) from public.audit_logs
  where action='hall_of_fame.application.resubmit'
    and target_id=batch.id::text),
 (select count(*) from private.hall_of_fame_mutation_requests
  where application_batch_id=batch.id
    and operation='hall_of_fame.application.resubmit')
from public.hall_of_fame_application_batches as batch
where batch.id in ('${targetRace.batch}','${confirmerRace.batch}')
order by batch.id;
`,
  );
  assert.equal(result.status, 0, result.stderr);
  for (const row of result.stdout.trim().split(/\r?\n/)) {
    assert.match(row, /^[^|]+\|additional_info_required\|4\|0\|0\|0$/);
  }
});

test("concurrent responses produce one canonical response without duplicate effects", async () => {
  const fixture = fixtureIds();
  let result = sql(container, database, fixtureSql(fixture));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = sql(
    container,
    database,
    requestSql(fixture, fixture.moderator, randomUUID()),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const messageId = result.stdout.trim().split("|")[6];

  const gate = sqlAsync(
    container,
    database,
    String.raw`
select pg_advisory_lock(
 pg_catalog.hashtextextended('${fixture.batch}'::text,8608)
);
select pg_sleep(0.8);
select pg_advisory_unlock(
 pg_catalog.hashtextextended('${fixture.batch}'::text,8608)
);
`,
  );
  await pause(150);
  const responses = await Promise.all([
    sqlAsync(
      container,
      database,
      responseSql(fixture, fixture.applicant, messageId, randomUUID()),
    ),
    sqlAsync(
      container,
      database,
      responseSql(fixture, fixture.applicant, messageId, randomUUID()),
    ),
  ]);
  const gateResult = await gate;
  assert.equal(gateResult.status, 0, gateResult.stdout + gateResult.stderr);
  assert.equal(responses.filter((response) => response.status === 0).length, 1);
  assert.match(
    responses.find((response) => response.status !== 0).stderr,
    /HOF_ADDITIONAL_INFO_ALREADY_RESPONDED/,
  );

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,record.review_status,record.version,
 (select count(*) from public.hall_of_fame_application_messages
  where reply_to_message_id='${messageId}'
    and message_type='applicant_response'),
 (select count(*) from public.audit_logs
  where action='hall_of_fame.application.additional_info.respond'
    and metadata ->> 'additional_info_request_message_id'='${messageId}'),
 (select count(*) from private.hall_of_fame_mutation_requests
  where application_batch_id=batch.id
    and operation='hall_of_fame.application.additional_info.respond'
    and status='completed'),
 (select count(*) from public.hall_of_fame_application_history
  where application_batch_id=batch.id
    and action='hall_of_fame.application.additional_info.respond')
from public.hall_of_fame_application_batches as batch
join public.hall_of_fame_application_records as record
  on record.application_batch_id=batch.id
where batch.id='${fixture.batch}';
`,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    "additional_info_required|4|additional_info_required|4|1|1|1|0",
  );
});

test("supplemental finalize and resubmit serialize without accepting pending evidence", async () => {
  const fixture = fixtureIds();
  let result = sql(container, database, fixtureSql(fixture));
  assert.equal(result.status, 0, result.stdout + result.stderr);

  result = sql(
    container,
    database,
    requestSql(fixture, fixture.moderator, randomUUID(), {
      record: fixture.record,
      kind: "text_and_evidence",
      evidenceType: "supporting_document",
      message: "TEST text and evidence request",
    }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const requestMessageId = result.stdout.trim().split("|")[6];

  result = sql(
    container,
    database,
    responseSql(fixture, fixture.applicant, requestMessageId, randomUUID()),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  result = sql(
    container,
    database,
    String.raw`
${actorSql(fixture.applicant)}
select *
from public.create_hall_of_fame_supplemental_evidence_upload_intent(
 '${requestMessageId}','supporting_document','image/png',8,4,
 '${randomUUID()}'
);
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const evidenceId = result.stdout.trim().split("|")[3];

  const outcomes = await Promise.all([
    sqlAsync(
      container,
      database,
      String.raw`
${actorSql(fixture.applicant, "service_role")}
select * from public.finalize_hall_of_fame_evidence_server(
 '${fixture.applicant}','${evidenceId}','image/png',8,
 '${"ef".repeat(32)}',1,4,'${randomUUID()}'
);
`,
      "postgres",
    ),
    sqlAsync(
      container,
      database,
      resubmitSql(fixture, fixture.applicant, randomUUID()),
    ),
  ]);

  assert.equal(outcomes[0].status, 0, outcomes[0].stdout + outcomes[0].stderr);
  assert.match(outcomes[0].stdout, /\|available\|2\|4\|4\|/);
  if (outcomes[1].status !== 0) {
    assert.match(outcomes[1].stderr, /HOF_UNRESOLVED_EVIDENCE/);
    result = sql(
      container,
      database,
      resubmitSql(fixture, fixture.applicant, randomUUID()),
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,record.review_status,record.version,
 evidence.status,evidence.version,
 (select count(*) from public.hall_of_fame_application_history
  where application_batch_id=batch.id
    and action='hall_of_fame.application.resubmit')
from public.hall_of_fame_application_batches as batch
join public.hall_of_fame_application_records as record
  on record.application_batch_id=batch.id
join public.hall_of_fame_evidence_files as evidence
  on evidence.application_batch_id=batch.id
 and evidence.id='${evidenceId}'
where batch.id='${fixture.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "submitted|5|submitted|5|available|2|2");
});

test("request and resubmit race has one consistent winner", async () => {
  const fixture = fixtureIds();
  let result = sql(container, database, fixtureSql(fixture));
  assert.equal(result.status, 0, result.stdout + result.stderr);

  result = sql(
    container,
    database,
    requestSql(fixture, fixture.moderator, randomUUID()),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const requestMessageId = result.stdout.trim().split("|")[6];
  result = sql(
    container,
    database,
    responseSql(fixture, fixture.applicant, requestMessageId, randomUUID()),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const outcomes = await Promise.all([
    sqlAsync(
      container,
      database,
      requestSql(fixture, fixture.moderator, randomUUID(), {
        expectedVersion: 4,
        message: "TEST concurrent request",
      }),
    ),
    sqlAsync(
      container,
      database,
      resubmitSql(fixture, fixture.applicant, randomUUID()),
    ),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 0).length, 1);
  assert.match(
    outcomes.find((outcome) => outcome.status !== 0).stderr,
    /HOF_ADDITIONAL_INFO_(INCOMPLETE|STATE_INVALID)|HOF_APPLICATION_NOT_ADDITIONAL_INFO_REQUIRED|HOF_STALE_VERSION/,
  );

  result = sql(
    container,
    database,
    String.raw`
select status,version,
 (select count(*) from public.hall_of_fame_application_messages
  where application_batch_id='${fixture.batch}'
    and message_type='additional_info_request')
from public.hall_of_fame_application_batches
where id='${fixture.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout.trim(),
    /^(additional_info_required\|4\|2|submitted\|5\|1)$/,
  );
});
