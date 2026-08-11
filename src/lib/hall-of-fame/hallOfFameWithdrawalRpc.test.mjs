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

function actorSql(actor, role = "authenticated") {
  return String.raw`
set role ${role};
select pg_catalog.set_config('request.jwt.claim.sub','${actor}',false);
select pg_catalog.set_config('request.jwt.claim.role','${role}',false);
`;
}

function ids() {
  return {
    creator: randomUUID(),
    targetA: randomUUID(),
    targetB: randomUUID(),
    other: randomUUID(),
    moderator: randomUUID(),
    batch: randomUUID(),
    round: randomUUID(),
    recordA: randomUUID(),
    recordB: randomUUID(),
    club: randomUUID(),
    creatorMembership: randomUUID(),
    targetMembershipA: randomUUID(),
    targetMembershipB: randomUUID(),
    fixtureRequest: randomUUID(),
    consentA: randomUUID(),
    consentB: randomUUID(),
    evidence: randomUUID(),
  };
}

function statusHistorySql(value, status, version, recordIds) {
  const transitions = [
    [null, "draft", 1],
    ["draft", "submitted", 2],
  ];
  if (version >= 3) transitions.push(["submitted", "under_review", 3]);
  if (version >= 4) {
    transitions.push(["under_review", "additional_info_required", 4]);
  }
  assert.equal(transitions.at(-1)[1], status);

  const rows = [];
  for (const [from, to, historyVersion] of transitions) {
    rows.push(
      `('batch','${value.batch}',null,${from ? `'${from}'` : "null"},` +
        `'${to}',${historyVersion},'${value.creator}',null,` +
        `'hall_of_fame.fixture.create','${value.fixtureRequest}')`,
    );
    for (const recordId of recordIds) {
      rows.push(
        `('record','${value.batch}','${recordId}',` +
          `${from ? `'${from}'` : "null"},'${to}',${historyVersion},` +
          `'${value.creator}',null,'hall_of_fame.fixture.create',` +
          `'${value.fixtureRequest}')`,
      );
    }
  }
  return rows.join(",\n");
}

function baseFixtureSql(
  value,
  { applicationType = "direct_application", recordCount = 1, status = "under_review", version = 3 } = {},
) {
  const recordIds = [value.recordA];
  if (recordCount === 2) recordIds.push(value.recordB);
  const users = [
    [value.creator, "member"],
    [value.targetA, "member"],
    [value.targetB, "member"],
    [value.other, "member"],
    [value.moderator, "platform_moderator"],
  ];
  const authRows = users
    .map(
      ([userId]) =>
        `('${userId}','00000000-0000-0000-0000-000000000000',` +
        `'authenticated','authenticated','hof-withdraw-${userId}@example.invalid',` +
        `'',now(),now(),now())`,
    )
    .join(",\n");
  const accountRows = users
    .map(
      ([userId, platformRole]) =>
        `('${userId}','active','${platformRole}')`,
    )
    .join(",\n");
  const targetForA =
    applicationType === "club_nomination" ? value.targetA : value.creator;
  const targetForB = value.targetB;
  const membershipForA =
    applicationType === "club_nomination"
      ? `'${value.targetMembershipA}'`
      : "null";
  const membershipForB = `'${value.targetMembershipB}'`;
  const recordRows = [
    `('${value.recordA}','${value.batch}','${value.round}','${targetForA}',` +
      `${membershipForA},'hole_in_one','A',1,3,1,` +
      `'pending','granted','${status}',false,1,` +
      `extensions.digest(pg_catalog.convert_to('${value.recordA}','UTF8'),'sha256'),${version})`,
  ];
  if (recordCount === 2) {
    recordRows.push(
      `('${value.recordB}','${value.batch}','${value.round}','${targetForB}',` +
        `${membershipForB},'hole_in_one','A',2,3,1,` +
        `'pending','granted','${status}',false,1,` +
        `extensions.digest(pg_catalog.convert_to('${value.recordB}','UTF8'),'sha256'),${version})`,
    );
  }

  const nominationColumns =
    applicationType === "club_nomination"
      ? `,'${value.creatorMembership}','${value.club}'`
      : ",null,null";

  const nominationSetup =
    applicationType === "club_nomination"
      ? String.raw`
insert into public.clubs(id,legacy_key,name,club_status)
values('${value.club}',null,'HOF WITHDRAW TEST CLUB','active');
insert into public.club_memberships(id,club_id,user_id,membership_status,joined_at)
values
 ('${value.creatorMembership}','${value.club}','${value.creator}','active',now()),
 ('${value.targetMembershipA}','${value.club}','${value.targetA}','active',now()),
 ('${value.targetMembershipB}','${value.club}','${value.targetB}','active',now());
insert into public.club_role_assignments(membership_id,role_code,assigned_by)
values
 ('${value.creatorMembership}','club_member','${value.creator}'),
 ('${value.creatorMembership}','club_admin','${value.creator}'),
 ('${value.targetMembershipA}','club_member','${value.creator}'),
 ('${value.targetMembershipB}','club_member','${value.creator}');
`
      : "";

  const nominationConsents =
    applicationType === "club_nomination"
      ? [
          [value.consentA, value.recordA, value.targetA],
          ...(recordCount === 2
            ? [[value.consentB, value.recordB, value.targetB]]
            : []),
        ]
          .map(
            ([consentId, recordId, targetId]) => String.raw`
insert into public.hall_of_fame_application_consents(
 id,application_record_id,application_batch_id,subject_user_id,
 consent_purpose,status,policy_version,version,requested_at,expires_at,
 granted_at,last_actor_user_id,last_request_id)
values(
 '${consentId}','${recordId}','${value.batch}','${targetId}',
 'nomination_acceptance','granted','hof-withdraw-v1',1,now(),
 now()+interval '14 days',now(),'${targetId}','${value.fixtureRequest}');
insert into public.hall_of_fame_application_consent_history(
 application_consent_id,application_record_id,application_batch_id,
 subject_user_id,consent_purpose,policy_version,from_status,to_status,
 version,actor_user_id,request_id,requested_at,expires_at)
select id,application_record_id,application_batch_id,subject_user_id,
 consent_purpose,policy_version,null,'granted',version,subject_user_id,
 last_request_id,requested_at,expires_at
from public.hall_of_fame_application_consents
where id='${consentId}';
`,
          )
          .join("\n")
      : "";

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
${nominationSetup}
insert into private.hall_of_fame_mutation_requests(
 actor_user_id,request_id,operation,application_batch_id,
 payload_fingerprint,status,result_payload,completed_at)
values(
 '${value.creator}','${value.fixtureRequest}','hall_of_fame.fixture.create',
 '${value.batch}',decode(repeat('f4',32),'hex'),'completed','{}',now());
insert into public.hall_of_fame_application_batches(
 id,application_type,created_by_user_id,status,version,submitted_at,
 created_by_membership_id,nominating_club_id)
values(
 '${value.batch}','${applicationType}','${value.creator}','${status}',${version},now()
 ${nominationColumns}
);
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,
 course_region_snapshot,course_environment,course_layout_snapshot,
 round_type,event_name_snapshot,notes)
values(
 '${value.round}','${value.batch}','2026-08-10','WITHDRAW TEST COURSE',
 'WITHDRAW TEST REGION','outdoor','A COURSE','practice',
 'WITHDRAW TEST EVENT','WITHDRAW TEST ROUND'
);
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,target_membership_id,
 record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,
 club_verification_status,member_consent_status,review_status,
 conflict_of_interest,fingerprint_version,duplicate_fingerprint,version)
values
${recordRows.join(",\n")};
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,
 version,actor_user_id,actor_platform_role,action,request_id)
values
${statusHistorySql(value, status, version, recordIds)};
${nominationConsents}
set session_replication_role = origin;
`;
}

function readinessFixtureSql(value) {
  const rows = [
    [value.recordA, value.targetA],
    [value.recordB, value.targetB],
  ];
  return (
    "set session_replication_role = replica;\n" +
    rows
      .map(([recordId, targetId], index) => {
        const processingConsent = randomUUID();
        const evidenceConsent = randomUUID();
        const confirmation = randomUUID();
        const evidence = randomUUID();
        const shaByte = index === 0 ? "c1" : "c2";
        return String.raw`
insert into public.hall_of_fame_application_consents(
 id,application_record_id,application_batch_id,subject_user_id,
 consent_purpose,status,policy_version,version,granted_at,
 last_actor_user_id,last_request_id)
values
 ('${processingConsent}','${recordId}','${value.batch}','${targetId}',
  'application_processing','granted','hof-withdraw-v1',1,now(),
  '${targetId}','${value.fixtureRequest}'),
 ('${evidenceConsent}','${recordId}','${value.batch}','${targetId}',
  'evidence_review','granted','hof-withdraw-v1',1,now(),
  '${targetId}','${value.fixtureRequest}');
insert into public.hall_of_fame_publication_consents(
 application_record_id,target_user_id,status,display_name_consent,
 avatar_consent,club_name_consent,record_date_consent,course_detail_consent,
 version,consented_at,policy_version,masked_display_name_consent,
 full_display_name_consent,badge_consent,last_actor_user_id,last_request_id)
values(
 '${recordId}','${targetId}','granted',true,false,false,true,true,
 1,now(),'hof-withdraw-v1',true,false,false,
 '${targetId}','${value.fixtureRequest}'
);
insert into public.hall_of_fame_record_confirmations(
 id,application_record_id,confirmer_user_id,confirmation_role,status,
 statement,confirmed_at,version,requester_user_id,requested_at,expires_at,
 responded_at,last_actor_user_id,last_request_id)
values(
 '${confirmation}','${recordId}','${value.other}',
 'round_companion','confirmed','WITHDRAW TEST CONFIRMATION',now(),1,
 '${value.creator}',now()-interval '1 day',now()+interval '13 days',now(),
 '${value.other}','${value.fixtureRequest}'
);
insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,
 storage_path,mime_type,byte_size,sha256,uploaded_by_user_id,status,
 finalized_at,declared_mime_type,declared_byte_size,version)
values(
 '${evidence}','${value.batch}','${recordId}','scorecard',
 'hall-of-fame-evidence','applications/${value.batch}/${evidence}/original',
 'image/png',8,decode(repeat('${shaByte}',32),'hex'),'${targetId}',
 'available',now(),'image/png',8,1
);
`;
      })
      .join("\n") +
    "set session_replication_role = origin;\n"
  );
}

function wholeWithdrawalSql(value, actor, requestId, expectedVersion) {
  return String.raw`
${actorSql(actor)}
select * from public.withdraw_hall_of_fame_application(
 '${value.batch}',${expectedVersion},'${requestId}'
);
`;
}

function targetWithdrawalSql(
  value,
  actor,
  recordId,
  requestId,
  expectedBatchVersion,
  expectedRecordVersion,
) {
  return String.raw`
${actorSql(actor)}
select * from public.withdraw_hall_of_fame_nomination_participation(
 '${value.batch}','${recordId}',${expectedBatchVersion},
 ${expectedRecordVersion},'${requestId}'
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
  database = `pul_hof_withdraw_${process.pid}_${Date.now()}`;
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

test("catalog exposes only the two authenticated withdrawal RPCs", () => {
  const result = sql(
    container,
    database,
    String.raw`
select p.proname,p.prosecdef,p.proconfig,
 pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'withdraw_hall_of_fame_application',
    'withdraw_hall_of_fame_nomination_participation'
  )
order by p.proname;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const rows = result.stdout.trim().split(/\r?\n/);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const columns = row.split("|");
    assert.equal(columns[1], "t");
    assert.match(columns[2], /search_path/);
    assert.deepEqual(columns.slice(3), ["t", "f", "f"]);
  }
});

test("creator whole withdrawal is atomic, replayable, and non-destructive", () => {
  const value = ids();
  let result = sql(container, database, baseFixtureSql(value));
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const wrongRequest = randomUUID();
  result = sql(
    container,
    database,
    wholeWithdrawalSql(value, value.other, wrongRequest, 3),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_APPLICATION_WITHDRAWAL_NOT_AUTHORIZED/);

  const requestId = randomUUID();
  result = sql(
    container,
    database,
    wholeWithdrawalSql(value, value.creator, requestId, 3),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|withdrawn\|4\|1\|.*\|f\s*$/);

  result = sql(
    container,
    database,
    wholeWithdrawalSql(value, value.creator, requestId, 3),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|withdrawn\|4\|1\|.*\|t\s*$/);

  result = sql(
    container,
    database,
    wholeWithdrawalSql(value, value.creator, requestId, 2),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_REQUEST_ID_PAYLOAD_MISMATCH/);

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,record.review_status,record.version,
 (select count(*) from public.hall_of_fame_application_history h
  where h.application_batch_id=batch.id and h.action='hall_of_fame.application.withdraw'),
 (select count(*) from public.audit_logs a where a.request_id='${requestId}'),
 (select count(*) from private.hall_of_fame_mutation_requests l
  where l.actor_user_id='${value.creator}' and l.request_id='${requestId}'
    and l.status='completed')
from public.hall_of_fame_application_batches batch
join public.hall_of_fame_application_records record
  on record.application_batch_id=batch.id
where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "withdrawn|4|withdrawn|4|2|1|1");
});

test("AIR whole withdrawal is not blocked by pending Evidence and preserves it", () => {
  const value = ids();
  let result = sql(
    container,
    database,
    baseFixtureSql(value, {
      status: "additional_info_required",
      version: 4,
    }) +
      String.raw`
set session_replication_role = replica;
insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,
 storage_path,mime_type,uploaded_by_user_id,status,declared_mime_type,
 declared_byte_size,upload_expires_at,version)
values(
 '${value.evidence}','${value.batch}','${value.recordA}','scorecard',
 'hall-of-fame-evidence','applications/${value.batch}/${value.evidence}/original',
 'image/png','${value.creator}','pending_upload','image/png',8,
 now()+interval '15 minutes',1
);
set session_replication_role = origin;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const requestId = randomUUID();
  result = sql(
    container,
    database,
    wholeWithdrawalSql(value, value.creator, requestId, 4),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,record.review_status,record.version,
 evidence.status,evidence.version,evidence.deleted_at is null
from public.hall_of_fame_application_batches batch
join public.hall_of_fame_application_records record
  on record.application_batch_id=batch.id
join public.hall_of_fame_evidence_files evidence
  on evidence.application_record_id=record.id
where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    result.stdout.trim(),
    "withdrawn|5|withdrawn|5|pending_upload|1|t",
  );
});

test("target partial and last withdrawals preserve exact consent history", () => {
  const value = ids();
  let result = sql(
    container,
    database,
    baseFixtureSql(value, {
      applicationType: "club_nomination",
      recordCount: 2,
    }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  result = sql(
    container,
    database,
    targetWithdrawalSql(
      value,
      value.creator,
      value.recordA,
      randomUUID(),
      3,
      3,
    ),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_NOMINATION_WITHDRAWAL_NOT_AUTHORIZED/);

  const requestA = randomUUID();
  result = sql(
    container,
    database,
    targetWithdrawalSql(
      value,
      value.targetA,
      value.recordA,
      requestA,
      3,
      3,
    ),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /\|under_review\|4\|withdrawn\|4\|withdrawn\|2\|1\|.*\|f\s*$/,
  );

  result = sql(
    container,
    database,
    targetWithdrawalSql(
      value,
      value.targetA,
      value.recordA,
      requestA,
      3,
      3,
    ),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|1\|.*\|t\s*$/);

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,
 a.review_status,a.version,b.review_status,b.version,
 consent.status,consent.version,consent.granted_at is not null,
 consent.withdrawn_at is not null,
 (select count(*) from public.hall_of_fame_application_history h
  where h.application_batch_id=batch.id and h.scope='batch'
    and h.action='hall_of_fame.nomination.participation.withdraw'),
 (select count(*) from public.hall_of_fame_application_consent_history ch
  where ch.application_consent_id=consent.id and ch.to_status='withdrawn'),
 (select count(*) from public.audit_logs audit where audit.request_id='${requestA}')
from public.hall_of_fame_application_batches batch
join public.hall_of_fame_application_records a on a.id='${value.recordA}'
join public.hall_of_fame_application_records b on b.id='${value.recordB}'
join public.hall_of_fame_application_consents consent
  on consent.application_record_id=a.id
 and consent.consent_purpose='nomination_acceptance'
where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    result.stdout.trim(),
    "under_review|4|withdrawn|4|under_review|3|withdrawn|2|t|t|0|1|1",
  );

  const requestB = randomUUID();
  result = sql(
    container,
    database,
    targetWithdrawalSql(
      value,
      value.targetB,
      value.recordB,
      requestB,
      4,
      3,
    ),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /\|withdrawn\|5\|withdrawn\|4\|withdrawn\|2\|0\|.*\|f\s*$/,
  );

  result = sql(
    container,
    database,
    String.raw`
select status,version,finalized_at is not null,
 (select count(*) from public.hall_of_fame_application_history h
  where h.application_batch_id=batch.id and h.scope='batch'
    and h.action='hall_of_fame.nomination.participation.withdraw'),
 (select count(*) from public.hall_of_fame_application_history h
  where h.application_batch_id=batch.id and h.scope='record'
    and h.action='hall_of_fame.nomination.participation.withdraw')
from public.hall_of_fame_application_batches batch
where id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "withdrawn|5|t|1|2");
});

test("stale calls and authenticated direct DML leave no mutation residue", () => {
  const value = ids();
  let result = sql(
    container,
    database,
    baseFixtureSql(value, { applicationType: "club_nomination" }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const staleRequest = randomUUID();
  result = sql(
    container,
    database,
    targetWithdrawalSql(
      value,
      value.targetA,
      value.recordA,
      staleRequest,
      2,
      3,
    ),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_STALE_VERSION/);

  result = sql(
    container,
    database,
    String.raw`
${actorSql(value.targetA)}
update public.hall_of_fame_application_records
set review_status='withdrawn',version=version+1
where id='${value.recordA}';
`,
  );
  assert.notEqual(result.status, 0);

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,record.review_status,record.version,
 (select count(*) from private.hall_of_fame_mutation_requests ledger
  where ledger.actor_user_id='${value.targetA}'
    and ledger.request_id='${staleRequest}'),
 (select count(*) from public.audit_logs audit
  where audit.request_id='${staleRequest}')
from public.hall_of_fame_application_batches batch
join public.hall_of_fame_application_records record
 on record.application_batch_id=batch.id
where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "under_review|3|under_review|3|0|0");
});

test("two concurrent target withdrawals have exactly one state winner", async () => {
  const value = ids();
  let result = sql(
    container,
    database,
    baseFixtureSql(value, { applicationType: "club_nomination" }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const requestOne = randomUUID();
  const requestTwo = randomUUID();
  const calls = await Promise.all([
    sqlAsync(
      container,
      database,
      targetWithdrawalSql(
        value,
        value.targetA,
        value.recordA,
        requestOne,
        3,
        3,
      ),
    ),
    sqlAsync(
      container,
      database,
      targetWithdrawalSql(
        value,
        value.targetA,
        value.recordA,
        requestTwo,
        3,
        3,
      ),
    ),
  ]);
  assert.equal(calls.filter((call) => call.status === 0).length, 1);
  assert.equal(calls.filter((call) => call.status !== 0).length, 1);
  assert.match(
    calls.find((call) => call.status !== 0).stderr,
    /HOF_(STALE_VERSION|NOMINATION_WITHDRAWAL_NOT_ALLOWED)/,
  );

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,record.review_status,record.version,
 (select count(*) from public.audit_logs audit
  where audit.request_id in ('${requestOne}','${requestTwo}')),
 (select count(*) from private.hall_of_fame_mutation_requests ledger
  where ledger.request_id in ('${requestOne}','${requestTwo}')
    and ledger.status='completed'),
 (select count(*) from public.hall_of_fame_application_history history
  where history.application_batch_id=batch.id
    and history.action='hall_of_fame.nomination.participation.withdraw')
from public.hall_of_fame_application_batches batch
join public.hall_of_fame_application_records record
 on record.application_batch_id=batch.id
where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "withdrawn|4|withdrawn|4|1|1|2");
});

test("target withdrawal and additional-info request serialize safely", async () => {
  const value = ids();
  let result = sql(
    container,
    database,
    baseFixtureSql(value, {
      applicationType: "club_nomination",
      recordCount: 2,
    }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const withdrawalRequest = randomUUID();
  const informationRequest = randomUUID();
  const calls = await Promise.all([
    sqlAsync(
      container,
      database,
      targetWithdrawalSql(
        value,
        value.targetA,
        value.recordA,
        withdrawalRequest,
        3,
        3,
      ),
    ),
    sqlAsync(
      container,
      database,
      String.raw`
${actorSql(value.moderator)}
select * from public.request_hall_of_fame_additional_info(
 '${value.batch}',3,'${value.targetA}','${value.recordA}',
 'text_response',null,'WITHDRAW RACE TEST REQUEST','${informationRequest}'
);
`,
    ),
  ]);
  assert.equal(calls.filter((call) => call.status === 0).length, 1);
  assert.equal(calls.filter((call) => call.status !== 0).length, 1);

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,a.review_status,a.version,
 b.review_status,b.version,
 (select count(*) from public.audit_logs audit
  where audit.request_id in ('${withdrawalRequest}','${informationRequest}')),
 (select count(*) from private.hall_of_fame_mutation_requests ledger
  where ledger.request_id in ('${withdrawalRequest}','${informationRequest}')
    and ledger.status='completed')
from public.hall_of_fame_application_batches batch
join public.hall_of_fame_application_records a on a.id='${value.recordA}'
join public.hall_of_fame_application_records b on b.id='${value.recordB}'
where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const row = result.stdout.trim().split("|");
  assert.ok(["under_review", "additional_info_required"].includes(row[0]));
  assert.equal(row[1], "4");
  if (row[0] === "under_review") {
    assert.deepEqual(row.slice(2, 6), ["withdrawn", "4", "under_review", "3"]);
  } else {
    assert.deepEqual(row.slice(2, 6), [
      "additional_info_required",
      "4",
      "additional_info_required",
      "4",
    ]);
  }
  assert.deepEqual(row.slice(6), ["1", "1"]);
});

test("target withdrawal and ready resubmit serialize safely", async () => {
  const value = ids();
  let result = sql(
    container,
    database,
    baseFixtureSql(value, {
      applicationType: "club_nomination",
      recordCount: 2,
      status: "additional_info_required",
      version: 4,
    }) + readinessFixtureSql(value),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const withdrawalRequest = randomUUID();
  const resubmitRequest = randomUUID();
  const calls = await Promise.all([
    sqlAsync(
      container,
      database,
      targetWithdrawalSql(
        value,
        value.targetA,
        value.recordA,
        withdrawalRequest,
        4,
        4,
      ),
    ),
    sqlAsync(
      container,
      database,
      String.raw`
${actorSql(value.creator)}
select * from public.resubmit_hall_of_fame_application(
 '${value.batch}',4,'${resubmitRequest}'
);
`,
    ),
  ]);
  assert.equal(calls.filter((call) => call.status === 0).length, 1);
  assert.equal(calls.filter((call) => call.status !== 0).length, 1);

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,a.review_status,a.version,
 b.review_status,b.version,
 (select count(*) from public.audit_logs audit
  where audit.request_id in ('${withdrawalRequest}','${resubmitRequest}')),
 (select count(*) from private.hall_of_fame_mutation_requests ledger
  where ledger.request_id in ('${withdrawalRequest}','${resubmitRequest}')
    and ledger.status='completed')
from public.hall_of_fame_application_batches batch
join public.hall_of_fame_application_records a on a.id='${value.recordA}'
join public.hall_of_fame_application_records b on b.id='${value.recordB}'
where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const row = result.stdout.trim().split("|");
  assert.ok(["additional_info_required", "submitted"].includes(row[0]));
  assert.equal(row[1], "5");
  if (row[0] === "additional_info_required") {
    assert.deepEqual(row.slice(2, 6), [
      "withdrawn",
      "5",
      "additional_info_required",
      "4",
    ]);
  } else {
    assert.deepEqual(row.slice(2, 6), ["submitted", "5", "submitted", "5"]);
  }
  assert.deepEqual(row.slice(6), ["1", "1"]);
});

test("whole withdrawal and review start serialize to one consistent winner", async () => {
  const value = ids();
  let result = sql(
    container,
    database,
    baseFixtureSql(value, { status: "submitted", version: 2 }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const withdrawalRequest = randomUUID();
  const reviewRequest = randomUUID();
  const calls = await Promise.all([
    sqlAsync(
      container,
      database,
      wholeWithdrawalSql(value, value.creator, withdrawalRequest, 2),
    ),
    sqlAsync(
      container,
      database,
      String.raw`
${actorSql(value.moderator)}
select * from public.start_hall_of_fame_application_review(
 '${value.batch}',2,'${reviewRequest}'
);
`,
    ),
  ]);
  assert.equal(calls.filter((call) => call.status === 0).length, 1);
  assert.equal(calls.filter((call) => call.status !== 0).length, 1);

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,record.review_status,record.version,
 (select count(*) from public.audit_logs audit
  where audit.request_id in ('${withdrawalRequest}','${reviewRequest}')),
 (select count(*) from private.hall_of_fame_mutation_requests ledger
  where ledger.request_id in ('${withdrawalRequest}','${reviewRequest}')
    and ledger.status='completed')
from public.hall_of_fame_application_batches batch
join public.hall_of_fame_application_records record
 on record.application_batch_id=batch.id
where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const row = result.stdout.trim().split("|");
  assert.ok(["withdrawn", "under_review"].includes(row[0]));
  assert.equal(row[0], row[2]);
  assert.equal(row[1], "3");
  assert.equal(row[3], "3");
  assert.equal(row[4], "1");
  assert.equal(row[5], "1");
});
