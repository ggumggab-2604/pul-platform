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
  "20260811000200_pul_hall_of_fame_withdrawal_rpc.sql",
  "20260812000100_pul_hall_of_fame_final_decision_rpc.sql",
  "20260813000100_pul_hall_of_fame_badge_publication_projection_rpc.sql",
  "20260813000200_pul_hall_of_fame_canonical_correction_revoke_rpc.sql",
  "20260815000100_pul_hall_of_fame_dispute_intake_foundation.sql",
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

function sqlAsync(text, user = "supabase_admin") {
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

function actorSql(actor, role = "authenticated") {
  return String.raw`
set role ${role};
select pg_catalog.set_config('request.jwt.claim.sub','${actor}',false);
select pg_catalog.set_config('request.jwt.claim.role','${role}',false);
`;
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function ids() {
  return {
    creator: randomUUID(),
    subject: randomUUID(),
    other: randomUUID(),
    reporter2: randomUUID(),
    inactive: randomUUID(),
    club: randomUUID(),
    creatorMembership: randomUUID(),
    subjectMembership: randomUUID(),
    rejectedBatch: randomUUID(),
    rejectedRound: randomUUID(),
    rejectedRecord: randomUUID(),
    submittedBatch: randomUUID(),
    submittedRound: randomUUID(),
    submittedRecord: randomUUID(),
    withdrawnBatch: randomUUID(),
    withdrawnRound: randomUUID(),
    withdrawnRecord: randomUUID(),
    cancelledBatch: randomUUID(),
    cancelledRound: randomUUID(),
    cancelledRecord: randomUUID(),
    withdrawnRejectedBatch: randomUUID(),
    withdrawnRejectedRound: randomUUID(),
    withdrawnRejectedRecord: randomUUID(),
    activeBatch: randomUUID(),
    activeRound: randomUUID(),
    activeRecord: randomUUID(),
    activeCanonical: randomUUID(),
    correctedBatch: randomUUID(),
    correctedRound: randomUUID(),
    correctedRecord: randomUUID(),
    correctedCanonical: randomUUID(),
    revokedBatch: randomUUID(),
    revokedRound: randomUUID(),
    revokedRecord: randomUUID(),
    revokedCanonical: randomUUID(),
  };
}

function fixtureSql(value) {
  const users = [
    [value.creator, "active"],
    [value.subject, "active"],
    [value.other, "active"],
    [value.reporter2, "active"],
    [value.inactive, "suspended"],
  ];
  const authRows = users
    .map(
      ([userId]) =>
        `('${userId}','00000000-0000-0000-0000-000000000000',` +
        `'authenticated','authenticated','hof-dispute-${userId}@example.invalid',` +
        `'',now(),now(),now())`,
    )
    .join(",\n");
  const accountRows = users
    .map(
      ([userId, status]) =>
        `('${userId}','${status}','member')`,
    )
    .join(",\n");

  const applications = [
    [value.rejectedBatch, value.rejectedRound, value.rejectedRecord, "partially_approved", "rejected", 4],
    [value.submittedBatch, value.submittedRound, value.submittedRecord, "submitted", "submitted", 2],
    [value.withdrawnBatch, value.withdrawnRound, value.withdrawnRecord, "withdrawn", "withdrawn", 3],
    [value.cancelledBatch, value.cancelledRound, value.cancelledRecord, "cancelled", "cancelled", 3],
    [value.withdrawnRejectedBatch, value.withdrawnRejectedRound, value.withdrawnRejectedRecord, "withdrawn", "rejected", 4],
    [value.activeBatch, value.activeRound, value.activeRecord, "approved", "approved", 4],
    [value.correctedBatch, value.correctedRound, value.correctedRecord, "approved", "approved", 4],
    [value.revokedBatch, value.revokedRound, value.revokedRecord, "approved", "approved", 4],
  ];

  const batchRows = applications
    .map(
      ([batchId, , , batchStatus, , version]) =>
        `('${batchId}','club_nomination','${value.creator}',` +
        `'${value.creatorMembership}','${value.club}','${batchStatus}',${version},` +
        `now(),${["submitted"].includes(batchStatus) ? "null" : "now()"})`,
    )
    .join(",\n");
  const roundRows = applications
    .map(
      ([batchId, roundId], index) =>
        `('${roundId}','${batchId}','2026-08-${String(index + 1).padStart(2, "0")}',` +
        `'DISPUTE TEST COURSE ${index}','DISPUTE TEST REGION','outdoor',` +
        `'A','practice')`,
    )
    .join(",\n");
  const recordRows = applications
    .map(
      ([batchId, roundId, recordId, , recordStatus, version], index) =>
        `('${recordId}','${batchId}','${roundId}','${value.subject}',` +
        `'${value.subjectMembership}','hole_in_one','A',${index + 1},3,1,` +
        `'verified','granted','${recordStatus}',false,1,` +
        `extensions.digest(pg_catalog.convert_to('${recordId}','UTF8'),'sha256'),${version})`,
    )
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
values('${value.club}',null,'HOF DISPUTE TEST CLUB','active');
insert into public.club_memberships(
 id,club_id,user_id,membership_status,joined_at)
values
 ('${value.creatorMembership}','${value.club}','${value.creator}','active',now()),
 ('${value.subjectMembership}','${value.club}','${value.subject}','active',now());
insert into public.hall_of_fame_application_batches(
 id,application_type,created_by_user_id,created_by_membership_id,
 nominating_club_id,status,version,submitted_at,finalized_at)
values
${batchRows};
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,
 course_region_snapshot,course_environment,course_layout_snapshot,
 round_type)
values
${roundRows};
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,target_membership_id,
 record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,
 club_verification_status,member_consent_status,review_status,
 conflict_of_interest,fingerprint_version,duplicate_fingerprint,version)
values
${recordRows};
insert into public.hall_of_fame_records(
 id,source_application_record_id,target_user_id,record_type_code,played_on,
 course_name_snapshot,course_region_snapshot,course_environment,
 course_segment_snapshot,hole_number,hole_par,strokes,
 fingerprint_version,record_fingerprint,validity_status,publication_status,
 suppression_reason,approved_by_user_id,approved_at,revoked_at,
 revoked_by_user_id,revocation_reason_code,revocation_reason,version)
values
 ('${value.activeCanonical}','${value.activeRecord}','${value.subject}',
  'hole_in_one','2026-08-05','DISPUTE ACTIVE COURSE','DISPUTE TEST REGION',
  'outdoor','A',5,3,1,1,
  extensions.digest(pg_catalog.convert_to('${value.activeCanonical}','UTF8'),'sha256'),
  'active','hidden',null,'${value.creator}',now(),null,null,null,null,1),
 ('${value.correctedCanonical}','${value.correctedRecord}','${value.subject}',
  'hole_in_one','2026-08-06','DISPUTE CORRECTED COURSE','DISPUTE TEST REGION',
  'outdoor','A',6,3,1,1,
  extensions.digest(pg_catalog.convert_to('${value.correctedCanonical}','UTF8'),'sha256'),
  'corrected','suppressed','Fixture corrected.','${value.creator}',now(),
  null,null,null,null,2),
 ('${value.revokedCanonical}','${value.revokedRecord}','${value.subject}',
  'hole_in_one','2026-08-07','DISPUTE REVOKED COURSE','DISPUTE TEST REGION',
  'outdoor','A',7,3,1,1,
  extensions.digest(pg_catalog.convert_to('${value.revokedCanonical}','UTF8'),'sha256'),
  'revoked','suppressed','Fixture revoked.','${value.creator}',now(),
  now(),'${value.creator}','administrative_error','Fixture revoked.',2);
set session_replication_role = origin;
`;
}

function submitSql(
  actor,
  disputeType,
  category,
  { application = null, canonical = null },
  statement,
  requestId,
  role = "authenticated",
) {
  const disputeTypeExpression =
    disputeType === null ? "null" : quote(disputeType);
  const categoryExpression = category === null ? "null" : quote(category);
  const statementExpression = statement.startsWith("repeat(")
    ? statement
    : quote(statement);
  return String.raw`
${actorSql(actor, role)}
select * from public.submit_hall_of_fame_dispute(
 ${disputeTypeExpression},${categoryExpression},
 ${application ? `'${application}'` : "null"},
 ${canonical ? `'${canonical}'` : "null"},
 ${statementExpression},'${requestId}'
);
`;
}

function withdrawSql(actor, disputeId, expectedVersion, requestId) {
  return String.raw`
${actorSql(actor)}
select * from public.withdraw_hall_of_fame_dispute(
 '${disputeId}',${expectedVersion},'${requestId}'
);
`;
}

function assertSuccess(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

function assertError(result, pattern) {
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, pattern);
}

function outputRow(result) {
  return result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1)
    .split("|");
}

let container;
let database;
let value;
let publicBaseline;
const created = {};

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
  database = `pul_hof_dispute_${process.pid}_${Date.now()}`;
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

  const applied = sql(`begin;\n${migrations.join("\n")}\ncommit;`, "postgres");
  assertSuccess(applied);
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
  const snapshot = sql(String.raw`
select
 (select count(*) from public.hall_of_fame_records),
 (select count(*) from public.hall_of_fame_badge_sources),
 (select count(*) from public.list_hall_of_fame_public_records(100,0));
`);
  assertSuccess(snapshot);
  publicBaseline = snapshot.stdout.trim();
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

test("effective catalog is 37 with authenticated-only RPCs and closed tables", () => {
  const result = sql(String.raw`
select count(*) || ':' || max(version)
from supabase_migrations.schema_migrations;
select c.relname,c.relrowsecurity,c.relforcerowsecurity
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('hall_of_fame_disputes','hall_of_fame_dispute_history')
order by c.relname;
select p.proname,p.prosecdef,p.proconfig,
 pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'submit_hall_of_fame_dispute',
    'withdraw_hall_of_fame_dispute',
    'list_my_hall_of_fame_disputes',
    'get_my_hall_of_fame_dispute'
  )
order by p.proname;
select count(*)
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
where n.nspname='private'
  and p.proname like '%hall_of_fame_dispute%'
  and not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
  and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
  and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
`);
  assertSuccess(result);
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.equal(lines[0], "37:20260815000100");
  assert.deepEqual(lines.slice(1, 3), [
    "hall_of_fame_dispute_history|t|t",
    "hall_of_fame_disputes|t|t",
  ]);
  for (const line of lines.slice(3, 7)) {
    const columns = line.split("|");
    assert.equal(columns[1], "t");
    assert.match(columns[2], /search_path/);
    assert.deepEqual(columns.slice(3), ["t", "f", "f"]);
  }
  assert.equal(lines[7], "5");
});

test("type targets and submitter eligibility follow the four policy matrices", () => {
  const subjectCorrectionRequest = randomUUID();
  const subjectCorrection = sql(
    submitSql(
      value.subject,
      "correction_request",
      "factual_error",
      { canonical: value.activeCanonical },
      "정정",
      subjectCorrectionRequest,
    ),
  );
  assertSuccess(subjectCorrection);
  created.subjectCorrection = outputRow(subjectCorrection)[2];
  created.subjectCorrectionRequest = subjectCorrectionRequest;

  const creatorCorrection = sql(
    submitSql(
      value.creator,
      "correction_request",
      "evidence_clarification",
      { canonical: value.correctedCanonical },
      "원 제출자 정정 요청",
      randomUUID(),
    ),
  );
  assertSuccess(creatorCorrection);

  assertError(
    sql(
      submitSql(
        value.other,
        "correction_request",
        "factual_error",
        { canonical: value.revokedCanonical },
        "권한 없는 정정",
        randomUUID(),
      ),
    ),
    /HOF_DISPUTE_SUBMITTER_NOT_ELIGIBLE/,
  );

  const creatorAppeal = sql(
    submitSql(
      value.creator,
      "decision_appeal",
      "decision_error",
      { application: value.rejectedRecord },
      "추천 제출자 이의 신청",
      randomUUID(),
    ),
  );
  assertSuccess(creatorAppeal);
  const subjectAppeal = sql(
    submitSql(
      value.subject,
      "decision_appeal",
      "overlooked_evidence",
      { application: value.rejectedRecord },
      "추천 대상자 이의 신청",
      randomUUID(),
    ),
  );
  assertSuccess(subjectAppeal);

  for (const application of [
    value.submittedRecord,
    value.withdrawnRecord,
    value.cancelledRecord,
    value.withdrawnRejectedRecord,
    value.activeRecord,
  ]) {
    assertError(
      sql(
        submitSql(
          value.creator,
          "decision_appeal",
          "procedural_error",
          { application },
          "최종 반려가 아닌 신청",
          randomUUID(),
        ),
      ),
      /HOF_DISPUTE_TARGET_INVALID/,
    );
  }

  const revokedAppeal = sql(
    submitSql(
      value.subject,
      "decision_appeal",
      "procedural_error",
      { canonical: value.revokedCanonical },
      "revoked canonical 재심",
      randomUUID(),
    ),
  );
  assertSuccess(revokedAppeal);
  assertError(
    sql(
      submitSql(
        value.subject,
        "decision_appeal",
        "decision_error",
        { canonical: value.activeCanonical },
        "active canonical 재심",
        randomUUID(),
      ),
    ),
    /HOF_DISPUTE_SUBMITTER_NOT_ELIGIBLE/,
  );

  const objection = sql(
    submitSql(
      value.subject,
      "subject_objection",
      "wrong_subject",
      { canonical: value.correctedCanonical },
      "본인 귀속 이의",
      randomUUID(),
    ),
  );
  assertSuccess(objection);
  created.subjectObjection = outputRow(objection)[2];
  assertError(
    sql(
      submitSql(
        value.other,
        "subject_objection",
        "wrong_subject",
        { canonical: value.activeCanonical },
        "타인 귀속 이의",
        randomUUID(),
      ),
    ),
    /HOF_DISPUTE_SUBMITTER_NOT_ELIGIBLE/,
  );

  const fraudOne = sql(
    submitSql(
      value.other,
      "fraud_report",
      "invalid_evidence",
      { canonical: value.activeCanonical },
      "제삼자 증빙 신고",
      randomUUID(),
    ),
  );
  const fraudTwo = sql(
    submitSql(
      value.reporter2,
      "fraud_report",
      "invalid_evidence",
      { canonical: value.activeCanonical },
      "다른 제삼자 증빙 신고",
      randomUUID(),
    ),
  );
  assertSuccess(fraudOne);
  assertSuccess(fraudTwo);
  assertError(
    sql(
      submitSql(
        value.subject,
        "fraud_report",
        "false_record",
        { canonical: value.activeCanonical },
        "자기 기록 신고",
        randomUUID(),
      ),
    ),
    /HOF_DISPUTE_SUBMITTER_NOT_ELIGIBLE/,
  );

  assertError(
    sql(
      submitSql(
        value.inactive,
        "fraud_report",
        "false_record",
        { canonical: value.activeCanonical },
        "비활성 계정 신고",
        randomUUID(),
      ),
    ),
    /HOF_ACTIVE_ACCOUNT_REQUIRED/,
  );
  assertError(
    sql(
      submitSql(
        value.other,
        "fraud_report",
        "false_record",
        { canonical: value.correctedCanonical },
        "익명 신고",
        randomUUID(),
        "anon",
      ),
    ),
    /permission denied for function submit_hall_of_fame_dispute/,
  );
});

test("normalization boundaries, exact replay, mismatch, and business duplicate are distinct", () => {
  const invalidRequestIds = [];
  for (const statement of ["  ", "\n\n", "\t\t", "\r\n\t ", " \n a \t "]) {
    const requestId = randomUUID();
    invalidRequestIds.push(requestId);
    assertError(
      sql(
        submitSql(
          value.other,
          "fraud_report",
          "other",
          { canonical: value.revokedCanonical },
          statement,
          requestId,
        ),
      ),
      /HOF_INVALID_DISPUTE_REQUEST/,
    );
  }

  const nullTypeRequest = randomUUID();
  invalidRequestIds.push(nullTypeRequest);
  assertError(
    sql(
      submitSql(
        value.other,
        null,
        "other",
        { canonical: value.revokedCanonical },
        "NULL type",
        nullTypeRequest,
      ),
    ),
    /HOF_INVALID_DISPUTE_REQUEST/,
  );

  const nullCategoryRequest = randomUUID();
  invalidRequestIds.push(nullCategoryRequest);
  assertError(
    sql(
      submitSql(
        value.other,
        "fraud_report",
        null,
        { canonical: value.revokedCanonical },
        "NULL category",
        nullCategoryRequest,
      ),
    ),
    /HOF_INVALID_DISPUTE_REQUEST/,
  );

  const invalidRequestList = invalidRequestIds
    .map((requestId) => quote(requestId))
    .join(",");
  const invalidState = sql(String.raw`
select count(*) from public.hall_of_fame_disputes
where submitted_by_user_id='${value.other}'
  and dispute_type='fraud_report'
  and canonical_record_id='${value.revokedCanonical}';
select count(*) from public.hall_of_fame_dispute_history
where request_id in (${invalidRequestList});
select count(*) from public.audit_logs
where request_id in (${invalidRequestList});
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${value.other}'
  and request_id in (${invalidRequestList});
`);
  assertSuccess(invalidState);
  assert.deepEqual(invalidState.stdout.trim().split(/\r?\n/), ["0", "0", "0", "0"]);

  const normalizedRequest = randomUUID();
  const normalized = sql(
    submitSql(
      value.other,
      "fraud_report",
      "other",
      { canonical: value.revokedCanonical },
      " \n ab \t ",
      normalizedRequest,
    ),
  );
  assertSuccess(normalized);
  assert.match(normalized.stdout, /\|open\|1\|t\|f/);
  const normalizedId = outputRow(normalized)[2];
  const normalizedReplay = sql(
    submitSql(
      value.other,
      "fraud_report",
      "other",
      { canonical: value.revokedCanonical },
      "ab",
      normalizedRequest,
    ),
  );
  assertSuccess(normalizedReplay);
  assert.equal(outputRow(normalizedReplay)[2], normalizedId);
  assert.match(normalizedReplay.stdout, /\|open\|1\|t\|t/);

  const multilineRequest = randomUUID();
  const multiline = sql(
    submitSql(
      value.reporter2,
      "fraud_report",
      "other",
      { canonical: value.revokedCanonical },
      "line one\nline two",
      multilineRequest,
    ),
  );
  assertSuccess(multiline);
  const multilineId = outputRow(multiline)[2];
  assertError(
    sql(
      submitSql(
        value.reporter2,
        "fraud_report",
        "other",
        { canonical: value.revokedCanonical },
        "line one line two",
        multilineRequest,
      ),
    ),
    /HOF_REQUEST_ID_PAYLOAD_MISMATCH/,
  );

  const normalizedStorage = sql(String.raw`
select statement='ab'
from public.hall_of_fame_disputes where id='${normalizedId}';
select statement=${quote("line one\nline two")},
       pg_catalog.strpos(statement, pg_catalog.chr(10)) > 0
from public.hall_of_fame_disputes where id='${multilineId}';
`);
  assertSuccess(normalizedStorage);
  assert.deepEqual(normalizedStorage.stdout.trim().split(/\r?\n/), ["t", "t|t"]);

  const replayRequest = randomUUID();
  const first = sql(
    submitSql(
      value.subject,
      "correction_request",
      "administrative_error",
      { canonical: value.revokedCanonical },
      "  행정 오류 정정  ",
      replayRequest,
    ),
  );
  assertSuccess(first);
  assert.match(first.stdout, /\|open\|1\|t\|f/);
  const replay = sql(
    submitSql(
      value.subject,
      "correction_request",
      "administrative_error",
      { canonical: value.revokedCanonical },
      "행정 오류 정정",
      replayRequest,
    ),
  );
  assertSuccess(replay);
  assert.equal(outputRow(replay)[2], outputRow(first)[2]);
  assert.match(replay.stdout, /\|open\|1\|t\|t/);

  assertError(
    sql(
      submitSql(
        value.subject,
        "correction_request",
        "administrative_error",
        { canonical: value.revokedCanonical },
        "다른 정정 내용",
        replayRequest,
      ),
    ),
    /HOF_REQUEST_ID_PAYLOAD_MISMATCH/,
  );
  assertError(
    sql(
      submitSql(
        value.subject,
        "correction_request",
        "administrative_error",
        { canonical: value.revokedCanonical },
        "행정 오류 정정",
        randomUUID(),
      ),
    ),
    /HOF_OPEN_DISPUTE_ALREADY_EXISTS/,
  );

  assertSuccess(
    sql(
      submitSql(
        value.creator,
        "correction_request",
        "factual_error",
        { canonical: value.revokedCanonical },
        "repeat('가',2000)",
        randomUUID(),
      ),
    ),
  );
  for (const [statement, pattern] of [
    ["한", /HOF_INVALID_DISPUTE_REQUEST/],
    ["repeat('가',2001)", /HOF_INVALID_DISPUTE_REQUEST/],
  ]) {
    assertError(
      sql(
        submitSql(
          value.other,
          "fraud_report",
          "other",
          { canonical: value.correctedCanonical },
          statement,
          randomUUID(),
        ),
      ),
      pattern,
    );
  }

  assertError(
    sql(
      submitSql(
        value.other,
        "fraud_report",
        "decision_error",
        { canonical: value.correctedCanonical },
        "잘못된 category",
        randomUUID(),
      ),
    ),
    /HOF_DISPUTE_CATEGORY_INVALID/,
  );
  assertError(
    sql(
      submitSql(
        value.subject,
        "decision_appeal",
        "decision_error",
        {
          application: value.rejectedRecord,
          canonical: value.revokedCanonical,
        },
        "XOR 위반",
        randomUUID(),
      ),
    ),
    /HOF_INVALID_DISPUTE_REQUEST/,
  );
});

test("own list and detail keep statements private from other authenticated users", () => {
  const ownerList = sql(String.raw`
${actorSql(value.subject)}
select dispute_id,dispute_type,target_kind,statement,status,version
from public.list_my_hall_of_fame_disputes(100,0)
where dispute_id='${created.subjectCorrection}';
select dispute_id,dispute_type,target_kind,statement,status,version
from public.get_my_hall_of_fame_dispute('${created.subjectCorrection}');
`);
  assertSuccess(ownerList);
  const ownerLines = ownerList.stdout.trim().split(/\r?\n/).slice(-2);
  assert.equal(ownerLines.length, 2);
  assert.match(ownerLines[0], /correction_request\|canonical_record\|정정\|open\|1/);
  assert.equal(ownerLines[1], ownerLines[0]);

  const crossUser = sql(String.raw`
${actorSql(value.other)}
select count(*) from public.list_my_hall_of_fame_disputes(100,0)
where dispute_id='${created.subjectCorrection}';
select count(*) from public.get_my_hall_of_fame_dispute('${created.subjectCorrection}');
`);
  assertSuccess(crossUser);
  assert.deepEqual(crossUser.stdout.trim().split(/\r?\n/).slice(-2), ["0", "0"]);
});

test("own withdrawal changes once, replays exactly, and new-request no-op is ledger-only", () => {
  const withdrawalRequest = randomUUID();
  const first = sql(
    withdrawSql(value.subject, created.subjectCorrection, 1, withdrawalRequest),
  );
  assertSuccess(first);
  assert.match(first.stdout, /\|withdrawn\|2\|t\|f/);
  const replay = sql(
    withdrawSql(value.subject, created.subjectCorrection, 1, withdrawalRequest),
  );
  assertSuccess(replay);
  assert.match(replay.stdout, /\|withdrawn\|2\|t\|t/);

  const noOpRequest = randomUUID();
  const noOp = sql(
    withdrawSql(value.subject, created.subjectCorrection, 2, noOpRequest),
  );
  assertSuccess(noOp);
  assert.match(noOp.stdout, /\|withdrawn\|2\|f\|f/);

  assertError(
    sql(withdrawSql(value.subject, created.subjectCorrection, 1, randomUUID())),
    /HOF_STALE_DISPUTE_VERSION/,
  );
  assertError(
    sql(withdrawSql(value.other, created.subjectCorrection, 2, randomUUID())),
    /HOF_DISPUTE_NOT_FOUND/,
  );

  const state = sql(String.raw`
select status,version,withdrawn_at is not null
from public.hall_of_fame_disputes where id='${created.subjectCorrection}';
select count(*) from public.hall_of_fame_dispute_history
where dispute_id='${created.subjectCorrection}';
select count(*) from public.audit_logs
where target_type='hall_of_fame_dispute'
  and target_id='${created.subjectCorrection}';
select count(*) from public.audit_logs where request_id='${noOpRequest}';
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${value.subject}' and request_id='${noOpRequest}'
  and status='completed' and result_payload->>'changed'='false';
`);
  assertSuccess(state);
  assert.deepEqual(state.stdout.trim().split(/\r?\n/), [
    "withdrawn|2|t",
    "2",
    "2",
    "0",
    "1",
  ]);
});

test("concurrent semantic duplicate submit and withdrawal converge without partial state", async () => {
  const submitOne = randomUUID();
  const submitTwo = randomUUID();
  const submitStatement = "동시 fraud 신고";
  const [left, right] = await Promise.all([
    sqlAsync(
      submitSql(
        value.creator,
        "fraud_report",
        "duplicate",
        { canonical: value.activeCanonical },
        submitStatement,
        submitOne,
      ),
    ),
    sqlAsync(
      submitSql(
        value.creator,
        "fraud_report",
        "duplicate",
        { canonical: value.activeCanonical },
        submitStatement,
        submitTwo,
      ),
    ),
  ]);
  const submitResults = [left, right];
  assert.equal(submitResults.filter((item) => item.status === 0).length, 1);
  const submitLoser = submitResults.find((item) => item.status !== 0);
  assert.match(submitLoser.stderr, /HOF_OPEN_DISPUTE_ALREADY_EXISTS/);

  const duplicateState = sql(String.raw`
select count(*) from public.hall_of_fame_disputes
where submitted_by_user_id='${value.creator}'
  and dispute_type='fraud_report'
  and canonical_record_id='${value.activeCanonical}'
  and status='open';
select count(*) from public.hall_of_fame_dispute_history as history
join public.hall_of_fame_disputes as dispute on dispute.id=history.dispute_id
where dispute.submitted_by_user_id='${value.creator}'
  and dispute.dispute_type='fraud_report'
  and dispute.canonical_record_id='${value.activeCanonical}';
select count(*) from public.audit_logs
where actor_id='${value.creator}' and action='hall_of_fame.dispute.submit'
  and metadata->>'dispute_type'='fraud_report';
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${value.creator}'
  and request_id in ('${submitOne}','${submitTwo}');
`);
  assertSuccess(duplicateState);
  assert.deepEqual(duplicateState.stdout.trim().split(/\r?\n/), ["1", "1", "1", "1"]);

  const withdrawOne = randomUUID();
  const withdrawTwo = randomUUID();
  const [withdrawLeft, withdrawRight] = await Promise.all([
    sqlAsync(withdrawSql(value.subject, created.subjectObjection, 1, withdrawOne)),
    sqlAsync(withdrawSql(value.subject, created.subjectObjection, 1, withdrawTwo)),
  ]);
  const withdrawResults = [withdrawLeft, withdrawRight];
  assert.equal(withdrawResults.filter((item) => item.status === 0).length, 1);
  const withdrawLoser = withdrawResults.find((item) => item.status !== 0);
  assert.match(withdrawLoser.stderr, /HOF_STALE_DISPUTE_VERSION/);

  const withdrawalState = sql(String.raw`
select status,version from public.hall_of_fame_disputes
where id='${created.subjectObjection}';
select count(*) from public.hall_of_fame_dispute_history
where dispute_id='${created.subjectObjection}' and action='hall_of_fame.dispute.withdrawn';
select count(*) from public.audit_logs
where target_id='${created.subjectObjection}' and action='hall_of_fame.dispute.withdraw';
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${value.subject}'
  and request_id in ('${withdrawOne}','${withdrawTwo}');
`);
  assertSuccess(withdrawalState);
  assert.deepEqual(withdrawalState.stdout.trim().split(/\r?\n/), [
    "withdrawn|2",
    "1",
    "1",
    "1",
  ]);
});

test("DB constraints bind subjects and XOR even when only user guards are disabled", () => {
  const spoofId = randomUUID();
  const xorId = randomUUID();
  const result = sql(String.raw`
do $guard_test$
declare
  v_subject_blocked boolean := false;
  v_xor_blocked boolean := false;
  v_statement_blocked integer := 0;
  v_invalid_statement text;
begin
  execute 'alter table public.hall_of_fame_disputes disable trigger hall_of_fame_disputes_guard_before_mutation';
  begin
    insert into public.hall_of_fame_disputes(
      id,dispute_type,category,submitted_by_user_id,subject_user_id,
      canonical_record_id,statement,status,version,last_actor_user_id,last_request_id)
    values(
      '${spoofId}','subject_objection','wrong_subject','${value.subject}',
      '${value.other}','${value.activeCanonical}','subject spoof',
      'open',1,'${value.subject}','${created.subjectCorrectionRequest}');
  exception when foreign_key_violation then
    v_subject_blocked := true;
  end;
  begin
    insert into public.hall_of_fame_disputes(
      id,dispute_type,category,submitted_by_user_id,subject_user_id,
      application_record_id,canonical_record_id,statement,status,version,
      last_actor_user_id,last_request_id)
    values(
      '${xorId}','decision_appeal','decision_error','${value.subject}',
      '${value.subject}','${value.rejectedRecord}','${value.activeCanonical}',
      'target xor','open',1,'${value.subject}','${created.subjectCorrectionRequest}');
  exception when check_violation then
    v_xor_blocked := true;
  end;
  foreach v_invalid_statement in array array[E'\n\n', E'\t\t', E'\r\n\t '] loop
    begin
      insert into public.hall_of_fame_disputes(
        id,dispute_type,category,submitted_by_user_id,subject_user_id,
        canonical_record_id,statement,status,version,last_actor_user_id,last_request_id)
      values(
        pg_catalog.gen_random_uuid(),'correction_request','factual_error',
        '${value.subject}','${value.subject}','${value.activeCanonical}',
        v_invalid_statement,'open',1,'${value.subject}',
        '${created.subjectCorrectionRequest}');
    exception when check_violation then
      v_statement_blocked := v_statement_blocked + 1;
    end;
  end loop;
  execute 'alter table public.hall_of_fame_disputes enable trigger hall_of_fame_disputes_guard_before_mutation';
  if not v_subject_blocked
     or not v_xor_blocked
     or v_statement_blocked <> 3 then
    raise exception 'HOF_DISPUTE_CONSTRAINT_TEST_FAILED';
  end if;
end
$guard_test$;
select count(*) from public.hall_of_fame_disputes
where id in ('${spoofId}','${xorId}');
` , "postgres");
  assertSuccess(result);
  assert.equal(result.stdout.trim(), "0");
});

test("direct DML and append-only history mutations are blocked", () => {
  assertError(
    sql(String.raw`
${actorSql(value.subject)}
select count(*) from public.hall_of_fame_disputes;
`),
    /permission denied for table hall_of_fame_disputes/,
  );
  assertError(
    sql(
      `update public.hall_of_fame_disputes set status='resolved' ` +
        `where id='${created.subjectCorrection}';`,
      "postgres",
    ),
    /HOF_DISPUTE_NOT_AUTHORIZED/,
  );
  assertError(
    sql(
      `update public.hall_of_fame_dispute_history set to_status='resolved' ` +
        `where dispute_id='${created.subjectCorrection}';`,
      "postgres",
    ),
    /HOF_APPEND_ONLY_MUTATION_FORBIDDEN/,
  );
});

test("history, audit, ledger, canonical, badge, and public projection stay consistent", () => {
  const result = sql(String.raw`
select count(*)
from public.hall_of_fame_disputes as dispute
where (select count(*) from public.hall_of_fame_dispute_history as history
       where history.dispute_id=dispute.id) <> dispute.version;
select count(*)
from public.audit_logs
where target_type='hall_of_fame_dispute'
  and metadata::text like '%statement%';
select count(*)
from private.hall_of_fame_mutation_requests as ledger
where ledger.operation in ('hall_of_fame.dispute.submit','hall_of_fame.dispute.withdraw')
  and ledger.status <> 'completed';
select
 (select count(*) from public.hall_of_fame_records),
 (select count(*) from public.hall_of_fame_badge_sources),
 (select count(*) from public.list_hall_of_fame_public_records(100,0));
`);
  assertSuccess(result);
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.deepEqual(lines.slice(0, 3), ["0", "0", "0"]);
  assert.equal(lines[3], publicBaseline);
});
