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
    companion: randomUUID(),
    targetA: randomUUID(),
    targetB: randomUUID(),
    admin: randomUUID(),
    adminTwo: randomUUID(),
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
  };
}

function fixtureSql(
  value,
  { ready = true, secondWithdrawn = false, nomination = false } = {},
) {
  const users = [
    [value.creator, "member"],
    [value.companion, "member"],
    [value.targetA, "member"],
    [value.targetB, "member"],
    [value.admin, "platform_admin"],
    [value.adminTwo, "platform_admin"],
    [value.moderator, "platform_moderator"],
  ];
  const authRows = users
    .map(
      ([userId]) =>
        `('${userId}','00000000-0000-0000-0000-000000000000',` +
        `'authenticated','authenticated','hof-final-${userId}@example.invalid',` +
        `'',now(),now(),now())`,
    )
    .join(",\n");
  const accountRows = users
    .map(([userId, role]) => `('${userId}','active','${role}')`)
    .join(",\n");
  const batchVersion = secondWithdrawn ? 4 : 3;
  const recordBStatus = secondWithdrawn ? "withdrawn" : "under_review";
  const recordBVersion = secondWithdrawn ? 4 : 3;
  const recordTargets = nomination
    ? [
        [value.recordA, value.targetA],
        [value.recordB, value.targetB],
      ]
    : [
        [value.recordA, value.creator],
        [value.recordB, value.creator],
      ];
  const historyRows = [
    ["batch", null, null, "draft", 1],
    ["record", value.recordA, null, "draft", 1],
    ["record", value.recordB, null, "draft", 1],
    ["batch", null, "draft", "submitted", 2],
    ["record", value.recordA, "draft", "submitted", 2],
    ["record", value.recordB, "draft", "submitted", 2],
    ["batch", null, "submitted", "under_review", 3],
    ["record", value.recordA, "submitted", "under_review", 3],
    ["record", value.recordB, "submitted", "under_review", 3],
    ...(secondWithdrawn
      ? [["record", value.recordB, "under_review", "withdrawn", 4]]
      : []),
  ]
    .map(
      ([scope, recordId, from, to, version]) =>
        `('${scope}','${value.batch}',${recordId ? `'${recordId}'` : "null"},` +
        `${from ? `'${from}'` : "null"},'${to}',${version},'${value.creator}',` +
        `null,null,'hall_of_fame.fixture.create',null,'${value.fixtureRequest}')`,
    )
    .join(",\n");

  const readiness = ready
    ? recordTargets
        .filter(([recordId]) => !secondWithdrawn || recordId !== value.recordB)
        .map(([recordId, targetId], index) => {
          const processing = randomUUID();
          const evidenceReview = randomUUID();
          const acceptance = randomUUID();
          const confirmation = randomUUID();
          const evidence = randomUUID();
          const sha = index === 0 ? "d1" : "d2";
          const acceptanceValue = nomination
            ? String.raw`,
 ('${acceptance}','${recordId}','${value.batch}','${targetId}',
  'nomination_acceptance','granted','hof-final-v1',1,now(),
  '${targetId}','${value.fixtureRequest}',now(),now()+interval '14 days')`
            : "";
          return String.raw`
insert into public.hall_of_fame_application_consents(
 id,application_record_id,application_batch_id,subject_user_id,
 consent_purpose,status,policy_version,version,granted_at,
 last_actor_user_id,last_request_id,requested_at,expires_at)
values
 ('${processing}','${recordId}','${value.batch}','${targetId}',
  'application_processing','granted','hof-final-v1',1,now(),
  '${targetId}','${value.fixtureRequest}',null,null),
 ('${evidenceReview}','${recordId}','${value.batch}','${targetId}',
  'evidence_review','granted','hof-final-v1',1,now(),
  '${targetId}','${value.fixtureRequest}',null,null)
 ${acceptanceValue};
insert into public.hall_of_fame_record_confirmations(
 id,application_record_id,confirmer_user_id,confirmation_role,status,
 statement,confirmed_at,version,requester_user_id,requested_at,expires_at,
 responded_at,last_actor_user_id,last_request_id)
values(
 '${confirmation}','${recordId}','${value.companion}',
 'round_companion','confirmed','FINAL TEST CONFIRMATION',now(),1,
 '${value.creator}',now()-interval '1 day',now()+interval '13 days',now(),
 '${value.companion}','${value.fixtureRequest}'
);
insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,
 storage_path,mime_type,byte_size,sha256,uploaded_by_user_id,status,
 finalized_at,declared_mime_type,declared_byte_size,version)
values(
 '${evidence}','${value.batch}','${recordId}','scorecard',
 'hall-of-fame-evidence','applications/${value.batch}/${evidence}/original',
 'image/png',8,decode(repeat('${sha}',32),'hex'),'${targetId}',
 'available',now(),'image/png',8,1
);
`;
        })
        .join("\n")
    : "";

  const nominationSetup = nomination
    ? String.raw`
insert into public.clubs(id,legacy_key,name,club_status)
values('${value.club}',null,'HOF FINAL TEST CLUB','active');
insert into public.club_memberships(id,club_id,user_id,membership_status,joined_at)
values
 ('${value.creatorMembership}','${value.club}','${value.creator}','active',now()),
 ('${value.targetMembershipA}','${value.club}','${value.targetA}','active',now()),
 ('${value.targetMembershipB}','${value.club}','${value.targetB}','active',now());
insert into public.club_role_assignments(membership_id,role_code,assigned_by)
values
 ('${value.creatorMembership}','club_member','${value.creator}'),
 ('${value.targetMembershipA}','club_member','${value.creator}'),
 ('${value.targetMembershipB}','club_member','${value.creator}');
`
    : "";
  const batchColumns = nomination
    ? ",created_by_membership_id,nominating_club_id"
    : "";
  const batchValues = nomination
    ? `,'${value.creatorMembership}','${value.club}'`
    : "";
  const targetA = nomination ? value.targetA : value.creator;
  const targetB = nomination ? value.targetB : value.creator;
  const membershipA = nomination ? `'${value.targetMembershipA}'` : "null";
  const membershipB = nomination ? `'${value.targetMembershipB}'` : "null";
  const applicationType = nomination ? "club_nomination" : "direct_application";

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
 '${value.batch}',decode(repeat('f7',32),'hex'),'completed','{}',now()
);
insert into public.hall_of_fame_application_batches(
 id,application_type,created_by_user_id,status,version,submitted_at${batchColumns})
values(
 '${value.batch}','${applicationType}','${value.creator}',
 'under_review',${batchVersion},now()${batchValues}
);
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,
 course_region_snapshot,course_environment,course_layout_snapshot,
 round_type,event_name_snapshot,notes)
values(
 '${value.round}','${value.batch}','2026-08-12','FINAL TEST COURSE',
 'FINAL TEST REGION','outdoor','A COURSE','practice',
 'FINAL TEST EVENT','FINAL TEST ROUND'
);
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,target_membership_id,
 record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,
 club_verification_status,member_consent_status,review_status,
 conflict_of_interest,fingerprint_version,duplicate_fingerprint,version)
values
 ('${value.recordA}','${value.batch}','${value.round}','${targetA}',${membershipA},
  'hole_in_one','A',1,3,1,'pending','granted','under_review',false,1,
  extensions.digest(pg_catalog.convert_to('${value.recordA}','UTF8'),'sha256'),3),
 ('${value.recordB}','${value.batch}','${value.round}','${targetB}',${membershipB},
  'hole_in_one','A',2,3,1,'pending','granted','${recordBStatus}',false,1,
  extensions.digest(pg_catalog.convert_to('${value.recordB}','UTF8'),'sha256'),${recordBVersion});
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,
 version,actor_user_id,actor_membership_id,actor_platform_role,action,reason,request_id)
values
${historyRows};
${readiness}
set session_replication_role = origin;
`;
}

function decisions(value, left, right, secondWithdrawn = false) {
  const entries = [
    {
      application_record_id: value.recordA,
      expected_record_version: 3,
      decision: left,
      rejection_reason: left === "reject" ? "TEST rejection A" : null,
    },
  ];
  if (!secondWithdrawn) {
    entries.push({
      application_record_id: value.recordB,
      expected_record_version: 3,
      decision: right,
      rejection_reason: right === "reject" ? "TEST rejection B" : null,
    });
  }
  return JSON.stringify(entries).replaceAll("'", "''");
}

function decideSql(value, actor, requestId, payload, batchVersion = 3) {
  return String.raw`
${actorSql(actor)}
select * from public.decide_hall_of_fame_application(
 '${value.batch}',${batchVersion},'${payload}'::jsonb,'${requestId}'
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
  database = `pul_hof_final_${process.pid}_${Date.now()}`;
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

test("catalog exposes one authenticated-only SECURITY DEFINER RPC", () => {
  const result = sql(
    container,
    database,
    String.raw`
select p.prosecdef,p.proconfig,
 pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE'),
 pg_catalog.pg_get_function_identity_arguments(p.oid)
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='decide_hall_of_fame_application';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const columns = result.stdout.trim().split("|");
  assert.equal(columns[0], "t");
  assert.match(columns[1], /search_path/);
  assert.deepEqual(columns.slice(2, 5), ["t", "f", "f"]);
  assert.match(
    columns[5],
    /p_application_batch_id uuid, p_expected_batch_version integer, p_decisions jsonb, p_request_id uuid/,
  );
});

test("catalog keeps final helpers private and guarded tables RLS-forced", () => {
  let result = sql(
    container,
    database,
    String.raw`
select p.proname,p.prosecdef,p.proconfig,
 pg_catalog.has_function_privilege('public',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
where n.nspname='private' and p.proname in (
 'enforce_guarded_hall_of_fame_final_decision_mutation',
 'enforce_hall_of_fame_final_application_history_append',
 'enforce_hall_of_fame_final_review_append',
 'enforce_hall_of_fame_final_message_append',
 'enforce_hall_of_fame_canonical_insert',
 'enforce_hall_of_fame_canonical_history_append',
 'validate_hall_of_fame_final_approval'
)
order by p.proname;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const helperRows = result.stdout.trim().split(/\r?\n/);
  assert.equal(helperRows.length, 7);
  for (const row of helperRows) {
    const columns = row.split("|");
    assert.equal(columns[1], "t");
    assert.match(columns[2], /search_path/);
    assert.deepEqual(columns.slice(3), ["f", "f", "f", "f"]);
  }

  result = sql(
    container,
    database,
    String.raw`
select c.relname,c.relrowsecurity,c.relforcerowsecurity,
 pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT'),
 pg_catalog.has_table_privilege('authenticated',c.oid,'UPDATE'),
 pg_catalog.has_table_privilege('authenticated',c.oid,'DELETE')
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
 'hall_of_fame_application_batches','hall_of_fame_application_records',
 'hall_of_fame_application_history','hall_of_fame_application_reviews',
 'hall_of_fame_application_messages','hall_of_fame_records',
 'hall_of_fame_record_history'
)
order by c.relname;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const tableRows = result.stdout.trim().split(/\r?\n/);
  assert.equal(tableRows.length, 7);
  for (const row of tableRows) {
    assert.deepEqual(row.split("|").slice(1), ["t", "t", "f", "f", "f"]);
  }
});

test("all-approved decision creates canonical rows and exact append-only effects", () => {
  const value = ids();
  let result = sql(container, database, fixtureSql(value));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const requestId = randomUUID();
  const payload = decisions(value, "approve", "approve");
  result = sql(container, database, decideSql(value, value.admin, requestId, payload));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|approved\|4\|2\|0\|.*\|f\s*$/);

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,
 (select count(*) from public.hall_of_fame_application_records r where r.application_batch_id=batch.id and r.review_status='approved'),
 (select count(*) from public.hall_of_fame_records c join public.hall_of_fame_application_records r on r.id=c.source_application_record_id where r.application_batch_id=batch.id and c.validity_status='active' and c.publication_status='hidden'),
 (select count(*) from public.hall_of_fame_record_history h join public.hall_of_fame_records c on c.id=h.record_id join public.hall_of_fame_application_records r on r.id=c.source_application_record_id where r.application_batch_id=batch.id),
 (select count(*) from public.hall_of_fame_application_reviews x where x.application_batch_id=batch.id and x.request_id='${requestId}'),
 (select count(*) from public.hall_of_fame_application_messages m where m.application_batch_id=batch.id and m.request_id='${requestId}'),
 (select count(*) from public.hall_of_fame_application_history h where h.application_batch_id=batch.id and h.request_id='${requestId}'),
 (select count(*) from public.audit_logs a where a.request_id='${requestId}'),
 (select count(*) from private.hall_of_fame_mutation_requests l where l.actor_user_id='${value.admin}' and l.request_id='${requestId}' and l.status='completed')
from public.hall_of_fame_application_batches batch where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "approved|4|2|2|2|2|2|3|1|1");

  result = sql(container, database, decideSql(value, value.admin, requestId, payload));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|approved\|4\|2\|0\|.*\|t\s*$/);

  result = sql(
    container,
    database,
    decideSql(value, value.admin, requestId, decisions(value, "reject", "reject")),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_REQUEST_ID_PAYLOAD_MISMATCH/);
});

test("mixed decision aggregates and keeps rejection reasons applicant-only", () => {
  const value = ids();
  let result = sql(container, database, fixtureSql(value));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const requestId = randomUUID();
  result = sql(
    container,
    database,
    decideSql(value, value.admin, requestId, decisions(value, "approve", "reject")),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|partially_approved\|4\|1\|1\|.*\|f\s*$/);

  result = sql(
    container,
    database,
    String.raw`
select
 (select count(*) from public.hall_of_fame_records c join public.hall_of_fame_application_records r on r.id=c.source_application_record_id where r.application_batch_id='${value.batch}'),
 (select count(*) from public.hall_of_fame_application_messages m where m.application_batch_id='${value.batch}' and m.body like '%TEST rejection B%'),
 (select count(*) from public.audit_logs a where a.request_id='${requestId}' and (a.before_summary::text||a.after_summary::text||a.metadata::text) like '%TEST rejection B%'),
 (select count(*) from private.hall_of_fame_mutation_requests l where l.actor_user_id='${value.admin}' and l.request_id='${requestId}' and l.result_payload::text like '%TEST rejection B%'),
 (select count(*) from public.hall_of_fame_application_reviews r where r.request_id='${requestId}' and r.internal_note is not null);
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "1|1|0|0|0");
});

test("all-rejected decision needs no approval-specific evidence", () => {
  const value = ids();
  let result = sql(container, database, fixtureSql(value, { ready: false }));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const requestId = randomUUID();
  result = sql(
    container,
    database,
    decideSql(value, value.admin, requestId, decisions(value, "reject", "reject")),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|rejected\|4\|0\|2\|.*\|f\s*$/);
});

test("approval-specific readiness failure rolls back every final effect", () => {
  const value = ids();
  let result = sql(container, database, fixtureSql(value, { ready: false }));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const requestId = randomUUID();
  result = sql(
    container,
    database,
    decideSql(value, value.admin, requestId, decisions(value, "approve", "approve")),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_SCORECARD_EVIDENCE_REQUIRED/);
  const unchanged = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,
 (select count(*) from public.hall_of_fame_records c join public.hall_of_fame_application_records r on r.id=c.source_application_record_id where r.application_batch_id=batch.id),
 (select count(*) from public.audit_logs where request_id='${requestId}'),
 (select count(*) from private.hall_of_fame_mutation_requests where actor_user_id='${value.admin}' and request_id='${requestId}')
from public.hall_of_fame_application_batches batch where batch.id='${value.batch}';
`,
  );
  assert.equal(unchanged.stdout.trim(), "under_review|3|0|0|0");
});

test("withdrawn records are excluded from exact active-record coverage", () => {
  const value = ids();
  let result = sql(
    container,
    database,
    fixtureSql(value, { ready: true, secondWithdrawn: true }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const requestId = randomUUID();
  result = sql(
    container,
    database,
    decideSql(
      value,
      value.admin,
      requestId,
      decisions(value, "approve", "reject", true),
      4,
    ),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|approved\|5\|1\|0\|.*\|f\s*$/);
  const check = sql(
    container,
    database,
    `select review_status,version from public.hall_of_fame_application_records where id='${value.recordB}';`,
  );
  assert.equal(check.stdout.trim(), "withdrawn|4");
});

test("moderator, stale, malformed, and incomplete requests roll back", () => {
  const value = ids();
  let result = sql(container, database, fixtureSql(value));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const payload = decisions(value, "approve", "approve");

  result = sql(
    container,
    database,
    decideSql(value, value.moderator, randomUUID(), payload),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_REVIEW_NOT_AUTHORIZED/);

  result = sql(
    container,
    database,
    decideSql(value, value.admin, randomUUID(), payload, 2),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_STALE_VERSION/);

  const incomplete = JSON.stringify([
    {
      application_record_id: value.recordA,
      expected_record_version: 3,
      decision: "approve",
      rejection_reason: null,
    },
  ]).replaceAll("'", "''");
  result = sql(
    container,
    database,
    decideSql(value, value.admin, randomUUID(), incomplete),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_FINAL_DECISION_COVERAGE_MISMATCH/);

  const malformed = JSON.stringify([
    {
      application_record_id: value.recordA,
      expected_record_version: 3,
      decision: "approve",
      rejection_reason: null,
      extra: true,
    },
  ]).replaceAll("'", "''");
  result = sql(
    container,
    database,
    decideSql(value, value.admin, randomUUID(), malformed),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_INVALID_FINAL_DECISION_PAYLOAD/);

  const unchanged = sql(
    container,
    database,
    `select status,version from public.hall_of_fame_application_batches where id='${value.batch}';`,
  );
  assert.equal(unchanged.stdout.trim(), "under_review|3");
});

test("decision enum and reason shape reject non-exact input without effects", () => {
  const value = ids();
  let result = sql(container, database, fixtureSql(value));
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const invalidPayloads = [
    ["Approve", null, "reject", "TEST rejection B"],
    ["APPROVE", null, "reject", "TEST rejection B"],
    [" approve ", null, "reject", "TEST rejection B"],
    [" approve", null, "reject", "TEST rejection B"],
    ["approve ", null, "reject", "TEST rejection B"],
    ["approve", null, "Reject", "TEST rejection B"],
    ["reject", "TEST rejection A", "REJECT", "TEST rejection B"],
    ["reject", "TEST rejection A", " reject", "TEST rejection B"],
    ["reject", "TEST rejection A", "reject ", "TEST rejection B"],
    ["", null, "reject", "TEST rejection B"],
    ["reject", "", "reject", "TEST rejection B"],
    ["reject", "   ", "reject", "TEST rejection B"],
    ["approve", "unexpected reason", "reject", "TEST rejection B"],
  ];

  for (const [leftDecision, leftReason, rightDecision, rightReason] of
    invalidPayloads) {
    const payload = JSON.stringify([
      {
        application_record_id: value.recordA,
        expected_record_version: 3,
        decision: leftDecision,
        rejection_reason: leftReason,
      },
      {
        application_record_id: value.recordB,
        expected_record_version: 3,
        decision: rightDecision,
        rejection_reason: rightReason,
      },
    ]).replaceAll("'", "''");
    result = sql(
      container,
      database,
      decideSql(value, value.admin, randomUUID(), payload),
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /HOF_INVALID_FINAL_DECISION_PAYLOAD/);
  }

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,
 (select count(*) from public.hall_of_fame_application_records record
   where record.application_batch_id=batch.id
     and (record.review_status<>'under_review' or record.version<>3)),
 (select count(*) from public.hall_of_fame_records canonical
   join public.hall_of_fame_application_records record
     on record.id=canonical.source_application_record_id
   where record.application_batch_id=batch.id),
 (select count(*) from public.hall_of_fame_record_history history
   join public.hall_of_fame_records canonical on canonical.id=history.record_id
   join public.hall_of_fame_application_records record
     on record.id=canonical.source_application_record_id
   where record.application_batch_id=batch.id),
 (select count(*) from public.hall_of_fame_application_history history
   where history.application_batch_id=batch.id
     and history.action='hall_of_fame.application.final_decision'),
 (select count(*) from public.hall_of_fame_application_reviews review
   where review.application_batch_id=batch.id
     and review.review_action in ('final_approved','final_rejected')),
 (select count(*) from public.hall_of_fame_application_messages message
   where message.application_batch_id=batch.id
     and message.message_type='final_decision_notice'),
 (select count(*) from public.audit_logs audit
   where audit.action='hall_of_fame.application.final_decision'
     and audit.target_id=batch.id::text),
 (select count(*) from private.hall_of_fame_mutation_requests ledger
   where ledger.actor_user_id='${value.admin}'
     and ledger.operation='hall_of_fame.application.final_decision'
     and ledger.status='completed')
from public.hall_of_fame_application_batches batch
where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "under_review|3|0|0|0|0|0|0|0|0");
});

test("rejection reason accepts 2000 characters and rejects 2001", () => {
  const accepted = ids();
  let result = sql(container, database, fixtureSql(accepted));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const acceptedReason = "가".repeat(2000);
  const acceptedRequest = randomUUID();
  const acceptedPayload = JSON.stringify([
    {
      application_record_id: accepted.recordA,
      expected_record_version: 3,
      decision: "reject",
      rejection_reason: acceptedReason,
    },
    {
      application_record_id: accepted.recordB,
      expected_record_version: 3,
      decision: "reject",
      rejection_reason: "TEST rejection B",
    },
  ]).replaceAll("'", "''");
  result = sql(
    container,
    database,
    decideSql(
      accepted,
      accepted.admin,
      acceptedRequest,
      acceptedPayload,
    ),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|rejected\|4\|0\|2\|.*\|f\s*$/);

  result = sql(
    container,
    database,
    String.raw`
select pg_catalog.char_length(message.body),message.body,
 (select count(*) from public.audit_logs audit
   where audit.request_id='${acceptedRequest}'
     and (audit.before_summary::text||audit.after_summary::text||audit.metadata::text)
       like '%'||message.body||'%'),
 (select count(*) from private.hall_of_fame_mutation_requests ledger
   where ledger.actor_user_id='${accepted.admin}'
     and ledger.request_id='${acceptedRequest}'
     and ledger.result_payload::text like '%'||message.body||'%'),
 (select count(*) from public.hall_of_fame_application_reviews review
   where review.request_id='${acceptedRequest}'
     and review.internal_note is not null),
 (select count(*) from public.hall_of_fame_records canonical
   where canonical.source_application_record_id='${accepted.recordA}')
from public.hall_of_fame_application_messages message
where message.application_record_id='${accepted.recordA}'
  and message.request_id='${acceptedRequest}'
  and message.message_type='final_decision_notice';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const acceptedColumns = result.stdout.trim().split("|");
  assert.equal(acceptedColumns[0], "2000");
  assert.equal(acceptedColumns[1], acceptedReason);
  assert.deepEqual(acceptedColumns.slice(2), ["0", "0", "0", "0"]);

  const rejected = ids();
  result = sql(container, database, fixtureSql(rejected));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const rejectedRequest = randomUUID();
  const rejectedPayload = JSON.stringify([
    {
      application_record_id: rejected.recordA,
      expected_record_version: 3,
      decision: "reject",
      rejection_reason: "가".repeat(2001),
    },
    {
      application_record_id: rejected.recordB,
      expected_record_version: 3,
      decision: "reject",
      rejection_reason: "TEST rejection B",
    },
  ]).replaceAll("'", "''");
  result = sql(
    container,
    database,
    decideSql(rejected, rejected.admin, rejectedRequest, rejectedPayload),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOF_INVALID_FINAL_DECISION_PAYLOAD/);

  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,
 (select count(*) from public.hall_of_fame_application_records record
   where record.application_batch_id=batch.id
     and (record.review_status<>'under_review' or record.version<>3)),
 (select count(*) from public.hall_of_fame_records canonical
   join public.hall_of_fame_application_records record
     on record.id=canonical.source_application_record_id
   where record.application_batch_id=batch.id),
 (select count(*) from public.hall_of_fame_application_history history
   where history.application_batch_id=batch.id
     and history.action='hall_of_fame.application.final_decision'),
 (select count(*) from public.hall_of_fame_application_reviews review
   where review.application_batch_id=batch.id
     and review.review_action in ('final_approved','final_rejected')),
 (select count(*) from public.hall_of_fame_application_messages message
   where message.application_batch_id=batch.id
     and message.message_type='final_decision_notice'),
 (select count(*) from public.audit_logs audit
   where audit.request_id='${rejectedRequest}'),
 (select count(*) from private.hall_of_fame_mutation_requests ledger
   where ledger.actor_user_id='${rejected.admin}'
     and ledger.request_id='${rejectedRequest}'
     and ledger.status='completed')
from public.hall_of_fame_application_batches batch
where batch.id='${rejected.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "under_review|3|0|0|0|0|0|0|0");
});

test("historical eligibility survives a later target account suspension", () => {
  const value = ids();
  let result = sql(container, database, fixtureSql(value));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = sql(
    container,
    database,
    String.raw`
set session_replication_role=replica;
update public.user_accounts set account_status='suspended' where id='${value.creator}';
set session_replication_role=origin;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = sql(
    container,
    database,
    decideSql(value, value.admin, randomUUID(), decisions(value, "approve", "approve")),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|approved\|4\|2\|0\|/);
});

test("manual GUC spoof and direct authenticated DML remain blocked", () => {
  const value = ids();
  let result = sql(container, database, fixtureSql(value));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = sql(
    container,
    database,
    String.raw`
${actorSql(value.admin)}
select pg_catalog.set_config('pul.hall_of_fame.actor_user_id','${value.admin}',false);
select pg_catalog.set_config('pul.hall_of_fame.request_id','${randomUUID()}',false);
select pg_catalog.set_config('pul.hall_of_fame.application_batch_id','${value.batch}',false);
select pg_catalog.set_config('pul.hall_of_fame.operation','hall_of_fame.application.final_decision',false);
select pg_catalog.set_config('pul.hall_of_fame.payload_fingerprint',repeat('0',64),false);
update public.hall_of_fame_application_records set review_status='approved' where id='${value.recordA}';
`,
  );
  assert.notEqual(result.status, 0);
  const unchanged = sql(
    container,
    database,
    `select review_status,version from public.hall_of_fame_application_records where id='${value.recordA}';`,
  );
  assert.equal(unchanged.stdout.trim(), "under_review|3");
});

test("same-request concurrency permits one mutation and later replay", async () => {
  const value = ids();
  let result = sql(container, database, fixtureSql(value));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const requestId = randomUUID();
  const statement = decideSql(
    value,
    value.admin,
    requestId,
    decisions(value, "approve", "approve"),
  );
  const results = await Promise.all([
    sqlAsync(container, database, statement),
    sqlAsync(container, database, statement),
  ]);
  assert.equal(results.filter((item) => item.status === 0).length >= 1, true);
  assert.equal(
    results.every(
      (item) => item.status === 0 || /HOF_REQUEST_IN_PROGRESS/.test(item.stderr),
    ),
    true,
  );
  const replay = sql(container, database, statement);
  assert.equal(replay.status, 0, replay.stdout + replay.stderr);
  assert.equal(replay.stdout.trim().split("|").at(-1), "t");
  const counts = sql(
    container,
    database,
    String.raw`
select
 (select count(*) from public.audit_logs where request_id='${requestId}'),
 (select count(*) from private.hall_of_fame_mutation_requests where actor_user_id='${value.admin}' and request_id='${requestId}'),
 (select count(*) from public.hall_of_fame_records c join public.hall_of_fame_application_records r on r.id=c.source_application_record_id where r.application_batch_id='${value.batch}');
`,
  );
  assert.equal(counts.stdout.trim(), "1|1|2");
});

test("two administrators racing a batch produce one complete winner", async () => {
  const value = ids();
  let result = sql(container, database, fixtureSql(value));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const payload = decisions(value, "approve", "approve");
  const results = await Promise.all([
    sqlAsync(
      container,
      database,
      decideSql(value, value.admin, randomUUID(), payload),
    ),
    sqlAsync(
      container,
      database,
      decideSql(value, value.adminTwo, randomUUID(), payload),
    ),
  ]);
  assert.equal(results.filter((item) => item.status === 0).length, 1);
  assert.equal(results.filter((item) => item.status !== 0).length, 1);
  const counts = sql(
    container,
    database,
    String.raw`
select
 (select count(*) from public.hall_of_fame_records c join public.hall_of_fame_application_records r on r.id=c.source_application_record_id where r.application_batch_id='${value.batch}'),
 (select count(*) from public.audit_logs where action='hall_of_fame.application.final_decision' and target_id='${value.batch}');
`,
  );
  assert.equal(counts.stdout.trim(), "2|1");
});

test("final decision and whole withdrawal serialize to one atomic winner", async () => {
  const value = ids();
  let result = sql(container, database, fixtureSql(value));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const finalRequest = randomUUID();
  const withdrawalRequest = randomUUID();
  const [finalResult, withdrawalResult] = await Promise.all([
    sqlAsync(
      container,
      database,
      decideSql(
        value,
        value.admin,
        finalRequest,
        decisions(value, "approve", "approve"),
      ),
    ),
    sqlAsync(
      container,
      database,
      String.raw`
${actorSql(value.creator)}
select * from public.withdraw_hall_of_fame_application(
 '${value.batch}',3,'${withdrawalRequest}'
);
`,
    ),
  ]);
  assert.equal(
    [finalResult, withdrawalResult].filter((item) => item.status === 0).length,
    1,
  );
  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,
 (select count(*) from public.hall_of_fame_records c join public.hall_of_fame_application_records r on r.id=c.source_application_record_id where r.application_batch_id=batch.id),
 (select count(*) from public.audit_logs where request_id in ('${finalRequest}','${withdrawalRequest}'))
from public.hall_of_fame_application_batches batch where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const [status, version, canonicalCount, auditCount] = result.stdout.trim().split("|");
  assert.ok(status === "approved" || status === "withdrawn");
  assert.equal(version, "4");
  assert.equal(canonicalCount, status === "approved" ? "2" : "0");
  assert.equal(auditCount, "1");
});

test("final decision and target withdrawal serialize to one atomic winner", async () => {
  const value = ids();
  let result = sql(
    container,
    database,
    fixtureSql(value, { nomination: true }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const finalRequest = randomUUID();
  const withdrawalRequest = randomUUID();
  const [finalResult, withdrawalResult] = await Promise.all([
    sqlAsync(
      container,
      database,
      decideSql(
        value,
        value.admin,
        finalRequest,
        decisions(value, "approve", "approve"),
      ),
    ),
    sqlAsync(
      container,
      database,
      String.raw`
${actorSql(value.targetB)}
select * from public.withdraw_hall_of_fame_nomination_participation(
 '${value.batch}','${value.recordB}',3,3,'${withdrawalRequest}'
);
`,
    ),
  ]);
  assert.equal(
    [finalResult, withdrawalResult].filter((item) => item.status === 0).length,
    1,
  );
  result = sql(
    container,
    database,
    String.raw`
select batch.status,batch.version,record.review_status,record.version,
 (select count(*) from public.hall_of_fame_records c join public.hall_of_fame_application_records r on r.id=c.source_application_record_id where r.application_batch_id=batch.id),
 (select count(*) from public.audit_logs where request_id in ('${finalRequest}','${withdrawalRequest}'))
from public.hall_of_fame_application_batches batch
join public.hall_of_fame_application_records record on record.id='${value.recordB}'
where batch.id='${value.batch}';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const [status, batchVersion, recordStatus, recordVersion, canonicalCount, auditCount] =
    result.stdout.trim().split("|");
  if (status === "approved") {
    assert.deepEqual(
      [batchVersion, recordStatus, recordVersion, canonicalCount],
      ["4", "approved", "4", "2"],
    );
  } else {
    assert.deepEqual(
      [status, batchVersion, recordStatus, recordVersion, canonicalCount],
      ["under_review", "4", "withdrawn", "4", "0"],
    );
  }
  assert.equal(auditCount, "1");
});
