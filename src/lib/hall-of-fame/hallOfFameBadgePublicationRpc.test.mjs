import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const precedingMigrationNames = [
  "20260808000100_pul_hall_of_fame_consent_confirmation_rpc.sql",
  "20260808000200_pul_hall_of_fame_evidence_storage_rpc.sql",
  "20260810000100_pul_hall_of_fame_application_submit_rpc.sql",
  "20260810000200_pul_hall_of_fame_review_read_start_rpc.sql",
  "20260811000100_pul_hall_of_fame_additional_info_resubmit_rpc.sql",
  "20260811000200_pul_hall_of_fame_withdrawal_rpc.sql",
  "20260812000100_pul_hall_of_fame_final_decision_rpc.sql",
];

const precedingMigrations = precedingMigrationNames.map((filename) =>
  readFileSync(
    fileURLToPath(
      new URL(`../../../supabase/migrations/${filename}`, import.meta.url),
    ),
    "utf8",
  ),
);

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260813000100_pul_hall_of_fame_badge_publication_projection_rpc.sql",
      import.meta.url,
    ),
  ),
  "utf8",
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

function actorSql(actor, role = "authenticated") {
  return String.raw`
set role ${role};
select pg_catalog.set_config('request.jwt.claim.sub','${actor}',false);
select pg_catalog.set_config('request.jwt.claim.role','${role}',false);
`;
}

function values() {
  return {
    admin: randomUUID(),
    subject: randomUUID(),
    noConsentSubject: randomUUID(),
    raceSubject: randomUUID(),
    outsider: randomUUID(),
    fixtures: [0, 1, 2].map(() => ({
      batch: randomUUID(),
      round: randomUUID(),
      applicationRecord: randomUUID(),
      canonical: randomUUID(),
      fixtureRequest: randomUUID(),
      canonicalRequest: randomUUID(),
    })),
  };
}

function fixtureSql(value) {
  const subjects = [
    value.subject,
    value.noConsentSubject,
    value.raceSubject,
  ];
  const authUsers = [value.admin, ...subjects, value.outsider]
    .map(
      (userId) =>
        `('${userId}','00000000-0000-0000-0000-000000000000',` +
        `'authenticated','authenticated','hof-projection-${userId}@example.invalid',` +
        `'',now(),now(),now())`,
    )
    .join(",\n");
  const accounts = [
    [value.admin, "platform_admin"],
    [value.subject, "member"],
    [value.noConsentSubject, "member"],
    [value.raceSubject, "member"],
    [value.outsider, "member"],
  ]
    .map(([userId, role]) => `('${userId}','${role}','active')`)
    .join(",\n");
  const profiles = subjects
    .map((userId) => `('${userId}','Private Test Name','private')`)
    .join(",\n");
  const batches = value.fixtures
    .map(
      (fixture, index) =>
        `('${fixture.batch}','direct_application','${subjects[index]}',` +
        `'approved',4,now(),now(),now(),now())`,
    )
    .join(",\n");
  const rounds = value.fixtures
    .map(
      (fixture, index) =>
        `('${fixture.round}','${fixture.batch}',date '2026-08-${10 + index}',` +
        `'TEST Course ${index + 1}','TEST Region','outdoor','A-B','casual',now(),now())`,
    )
    .join(",\n");
  const applicationRecords = value.fixtures
    .map(
      (fixture, index) =>
        `('${fixture.applicationRecord}','${fixture.batch}','${fixture.round}',` +
        `'${subjects[index]}','hole_in_one','A',${index + 1},4,1,` +
        `'not_applicable','granted','approved',false,1,` +
        `decode('${String(index + 1).padStart(2, "0").repeat(32)}','hex'),4,now(),now())`,
    )
    .join(",\n");
  const fixtureLedgers = value.fixtures
    .flatMap((fixture, index) => [
      `('${subjects[index]}','${fixture.fixtureRequest}',` +
        `'hall_of_fame.fixture.consent','${fixture.batch}',` +
        `'${fixture.applicationRecord}','${subjects[index]}',` +
        `decode('${"a1".repeat(32)}','hex'),'completed','{}'::jsonb,now(),now())`,
      `('${value.admin}','${fixture.canonicalRequest}',` +
        `'hall_of_fame.fixture.canonical','${fixture.batch}',` +
        `'${fixture.applicationRecord}','${subjects[index]}',` +
        `decode('${"b2".repeat(32)}','hex'),'completed','{}'::jsonb,now(),now())`,
    ])
    .join(",\n");
  const canonicals = value.fixtures
    .map(
      (fixture, index) =>
        `('${fixture.canonical}','${fixture.applicationRecord}','${subjects[index]}',` +
        `'hole_in_one',date '2026-08-${10 + index}','TEST Course ${index + 1}',` +
        `'TEST Region','outdoor','A-B','A',${index + 1},4,1,1,` +
        `decode('${String(index + 1).padStart(2, "0").repeat(32)}','hex'),` +
        `'active','hidden','${value.admin}',now(),1,now(),now())`,
    )
    .join(",\n");
  const canonicalHistory = value.fixtures
    .map(
      (fixture) =>
        `('${fixture.canonical}',1,null,'active',null,'hidden',` +
        `'hall_of_fame.record.approved',null,'${value.admin}',` +
        `'${fixture.canonicalRequest}',now())`,
    )
    .join(",\n");
  const consentFixtures = [
    [value.fixtures[0], value.subject],
    [value.fixtures[2], value.raceSubject],
  ];
  const consents = consentFixtures
    .map(
      ([fixture, subject]) =>
        `('${fixture.applicationRecord}','${subject}','granted',true,true,false,` +
        `false,false,true,true,true,1,now(),null,now(),now(),` +
        `'hof-publication-test-v1','${subject}','${fixture.fixtureRequest}')`,
    )
    .join(",\n");
  const consentHistory = consentFixtures
    .map(
      ([fixture, subject]) =>
        `('${fixture.applicationRecord}','${subject}',true,true,false,false,false,` +
        `true,true,true,'hof-publication-test-v1',null,'granted',1,` +
        `'${subject}','${fixture.fixtureRequest}',now())`,
    )
    .join(",\n");

  return String.raw`
set session_replication_role = replica;
insert into auth.users(
 id,instance_id,aud,role,email,encrypted_password,
 email_confirmed_at,created_at,updated_at
) values ${authUsers};
insert into public.user_accounts(id,platform_role,account_status)
values ${accounts};
insert into public.user_profiles(user_id,display_name,profile_visibility)
values ${profiles};
insert into public.hall_of_fame_application_batches(
 id,application_type,created_by_user_id,status,version,
 submitted_at,finalized_at,created_at,updated_at
) values ${batches};
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,
 course_region_snapshot,course_environment,course_layout_snapshot,
 round_type,created_at,updated_at
) values ${rounds};
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,
 record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,
 club_verification_status,member_consent_status,review_status,
 conflict_of_interest,fingerprint_version,duplicate_fingerprint,
 version,created_at,updated_at
) values ${applicationRecords};
insert into private.hall_of_fame_mutation_requests(
 actor_user_id,request_id,operation,application_batch_id,
 application_record_id,target_user_id,payload_fingerprint,status,
 result_payload,completed_at,created_at
) values ${fixtureLedgers};
insert into public.hall_of_fame_records(
 id,source_application_record_id,target_user_id,record_type_code,played_on,
 course_name_snapshot,course_region_snapshot,course_environment,
 course_layout_snapshot,course_segment_snapshot,hole_number,hole_par,strokes,
 fingerprint_version,record_fingerprint,validity_status,publication_status,
 approved_by_user_id,approved_at,version,created_at,updated_at
) values ${canonicals};
insert into public.hall_of_fame_record_history(
 record_id,version,from_validity_status,to_validity_status,
 from_publication_status,to_publication_status,action,reason,
 actor_user_id,request_id,created_at
) values ${canonicalHistory};
insert into public.hall_of_fame_publication_consents(
 application_record_id,target_user_id,status,display_name_consent,
 masked_display_name_consent,full_display_name_consent,avatar_consent,
 club_name_consent,record_date_consent,course_detail_consent,badge_consent,
 version,consented_at,withdrawn_at,created_at,updated_at,policy_version,
 last_actor_user_id,last_request_id
) values ${consents};
insert into public.hall_of_fame_publication_consent_history(
 application_record_id,target_user_id,display_name_consent,
 masked_display_name_consent,full_display_name_consent,avatar_consent,
 club_name_consent,record_date_consent,course_detail_consent,badge_consent,
 policy_version,from_status,to_status,version,actor_user_id,request_id,created_at
) values ${consentHistory};
set session_replication_role = origin;
`;
}

function syncSql(value, actor, fixture, expectedVersion, requestId) {
  return String.raw`
${actorSql(actor)}
select * from public.sync_hall_of_fame_record_projection(
 '${fixture.canonical}',${expectedVersion},'${requestId}'
);
`;
}

function withdrawSql(value, actor, fixture, expectedVersion, requestId) {
  return String.raw`
${actorSql(actor)}
select * from public.withdraw_hall_of_fame_publication_consent_after_approval(
 '${fixture.canonical}',${expectedVersion},'${requestId}'
);
`;
}

let container;
let database;
let value;
let publishRequest;
let noOpRequest;
let withdrawalRequest;
let convergedWithdrawalRequest;

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
  database = `pul_hof_projection_${process.pid}_${Date.now()}`;
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
    `begin;\n${precedingMigrations.join("\n")}\n${migration}\ncommit;`,
    "postgres",
  );
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);

  value = values();
  const fixture = sql(container, database, fixtureSql(value), "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
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

test("catalog exposes two authenticated mutations and one anonymous read RPC", () => {
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
where n.nspname='public' and p.proname in (
 'sync_hall_of_fame_record_projection',
 'withdraw_hall_of_fame_publication_consent_after_approval',
 'list_hall_of_fame_public_records'
)
order by p.proname;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const rows = result.stdout.trim().split(/\r?\n/).map((line) => line.split("|"));
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row[1], "t");
    assert.match(row[2], /search_path/);
    assert.equal(row[5], "f");
  }
  const read = rows.find(([name]) => name === "list_hall_of_fame_public_records");
  assert.deepEqual(read.slice(3, 5), ["t", "t"]);
  for (const name of [
    "sync_hall_of_fame_record_projection",
    "withdraw_hall_of_fame_publication_consent_after_approval",
  ]) {
    const mutation = rows.find(([rowName]) => rowName === name);
    assert.deepEqual(mutation.slice(3, 5), ["t", "f"]);
  }
});

test("admin sync creates exactly two badge sources and publishes effective consent", () => {
  publishRequest = randomUUID();
  const result = sql(
    container,
    database,
    syncSql(value, value.admin, value.fixtures[0], 1, publishRequest),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|published\|2\|2\|2\|t\|f/);
  const state = sql(
    container,
    database,
    String.raw`
select canonical.publication_status,canonical.version,
 count(source.id) filter(where source.status='active'),
 count(distinct source.badge_code),
 (select count(*) from public.hall_of_fame_record_history h
  where h.record_id=canonical.id),
 (select count(*) from public.audit_logs a where a.request_id='${publishRequest}'),
 (select count(*) from private.hall_of_fame_mutation_requests l
  where l.actor_user_id='${value.admin}' and l.request_id='${publishRequest}' and l.status='completed')
from public.hall_of_fame_records canonical
left join public.hall_of_fame_badge_sources source on source.record_id=canonical.id
where canonical.id='${value.fixtures[0].canonical}'
group by canonical.id;
`,
  );
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.equal(state.stdout.trim(), "published|2|2|2|2|1|1");
});

test("same request replays without duplicate badge, history, audit, or ledger rows", () => {
  const replay = sql(
    container,
    database,
    syncSql(value, value.admin, value.fixtures[0], 1, publishRequest),
  );
  assert.equal(replay.status, 0, replay.stdout + replay.stderr);
  assert.match(replay.stdout, /\|published\|2\|2\|2\|t\|t/);
  const counts = sql(
    container,
    database,
    String.raw`
select
 (select count(*) from public.hall_of_fame_badge_sources where record_id='${value.fixtures[0].canonical}'),
 (select count(*) from public.hall_of_fame_record_history where record_id='${value.fixtures[0].canonical}'),
 (select count(*) from public.audit_logs where request_id='${publishRequest}'),
 (select count(*) from private.hall_of_fame_mutation_requests
  where actor_user_id='${value.admin}' and request_id='${publishRequest}');
`,
  );
  assert.equal(counts.stdout.trim(), "2|2|1|1");
});

test("new-request converged sync is a ledger-only no-op", () => {
  noOpRequest = randomUUID();
  const result = sql(
    container,
    database,
    syncSql(value, value.admin, value.fixtures[0], 2, noOpRequest),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|published\|2\|2\|0\|f\|f/);
  const counts = sql(
    container,
    database,
    String.raw`
select
 (select count(*) from public.hall_of_fame_record_history where record_id='${value.fixtures[0].canonical}'),
 (select count(*) from public.audit_logs where request_id='${noOpRequest}'),
 (select count(*) from private.hall_of_fame_mutation_requests
  where actor_user_id='${value.admin}' and request_id='${noOpRequest}' and status='completed');
`,
  );
  assert.equal(counts.stdout.trim(), "2|0|1");
});

test("completed request ID reuse with a different payload is rejected", () => {
  const mismatch = sql(
    container,
    database,
    syncSql(value, value.admin, value.fixtures[0], 3, noOpRequest),
  );
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /HOF_REQUEST_ID_PAYLOAD_MISMATCH/);
  const counts = sql(
    container,
    database,
    String.raw`
select
 (select count(*) from public.hall_of_fame_badge_sources where record_id='${value.fixtures[0].canonical}'),
 (select count(*) from public.hall_of_fame_record_history where record_id='${value.fixtures[0].canonical}'),
 (select count(*) from private.hall_of_fame_mutation_requests
  where actor_user_id='${value.admin}' and request_id='${noOpRequest}');
`,
  );
  assert.equal(counts.stdout.trim(), "2|2|1");
});

test("anonymous public projection is privacy-minimized and badge aggregated", () => {
  const result = sql(
    container,
    database,
    String.raw`
set role anon;
select record_type_code,display_name,avatar_url,club_name,
 pg_catalog.jsonb_array_length(badges),badges::text
from public.list_hall_of_fame_public_records(100,0);
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^hole_in_one\|PUL member\|\|\|2\|/m);
  assert.doesNotMatch(result.stdout, /Private Test Name/);
  assert.doesNotMatch(
    result.stdout,
    new RegExp(
      [
        value.fixtures[0].canonical,
        value.fixtures[0].applicationRecord,
        value.subject,
      ].join("|"),
      "i",
    ),
  );
});

test("concurrent duplicate sync creates one badge pair and keeps missing consent hidden", async () => {
  const requestOne = randomUUID();
  const requestTwo = randomUUID();
  const results = await Promise.all([
    sqlAsync(
      container,
      database,
      syncSql(value, value.admin, value.fixtures[1], 1, requestOne),
    ),
    sqlAsync(
      container,
      database,
      syncSql(value, value.admin, value.fixtures[1], 1, requestTwo),
    ),
  ]);
  for (const result of results) {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /\|hidden\|1\|2\|[02]\|[tf]\|f/);
  }
  const state = sql(
    container,
    database,
    String.raw`
select canonical.publication_status,canonical.version,count(source.id),
 (select count(*) from public.hall_of_fame_record_history h where h.record_id=canonical.id)
from public.hall_of_fame_records canonical
left join public.hall_of_fame_badge_sources source on source.record_id=canonical.id
where canonical.id='${value.fixtures[1].canonical}' group by canonical.id;
`,
  );
  assert.equal(state.stdout.trim(), "hidden|1|2|1");
  const effects = sql(
    container,
    database,
    String.raw`
select
 (select count(*) from public.audit_logs where request_id in ('${requestOne}','${requestTwo}')),
 (select count(*) from private.hall_of_fame_mutation_requests
  where actor_user_id='${value.admin}' and request_id in ('${requestOne}','${requestTwo}') and status='completed');
`,
  );
  assert.equal(effects.stdout.trim(), "1|2");
});

test("unauthorized mutations and direct table DML are blocked without durable ledger rows", () => {
  const unauthorizedRequest = randomUUID();
  const unauthorized = sql(
    container,
    database,
    syncSql(
      value,
      value.outsider,
      value.fixtures[1],
      1,
      unauthorizedRequest,
    ),
  );
  assert.notEqual(unauthorized.status, 0);
  assert.match(unauthorized.stderr, /HOF_PROJECTION_ADMIN_REQUIRED/);
  const directBadge = sql(
    container,
    database,
    String.raw`
${actorSql(value.subject)}
insert into public.hall_of_fame_badge_sources(target_user_id,badge_code,record_id)
values('${value.subject}','hole_in_one','${value.fixtures[0].canonical}');
`,
  );
  assert.notEqual(directBadge.status, 0);
  const directRecord = sql(
    container,
    database,
    String.raw`
${actorSql(value.subject)}
update public.hall_of_fame_records set publication_status='hidden'
where id='${value.fixtures[0].canonical}';
`,
  );
  assert.notEqual(directRecord.status, 0);
  const ledger = sql(
    container,
    database,
    `select count(*) from private.hall_of_fame_mutation_requests where request_id='${unauthorizedRequest}';`,
  );
  assert.equal(ledger.stdout.trim(), "0");
});

test("subject withdrawal suppresses publication and preserves badge provenance", () => {
  withdrawalRequest = randomUUID();
  const result = sql(
    container,
    database,
    withdrawSql(
      value,
      value.subject,
      value.fixtures[0],
      1,
      withdrawalRequest,
    ),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|withdrawn\|2\|suppressed\|3\|f/);
  const state = sql(
    container,
    database,
    String.raw`
select consent.status,consent.version,canonical.publication_status,canonical.version,
 (select count(*) from public.hall_of_fame_badge_sources source
  where source.record_id=canonical.id and source.status='active'),
 (select count(*) from public.hall_of_fame_publication_consent_history history
  where history.application_record_id=consent.application_record_id),
 (select count(*) from public.hall_of_fame_record_history history
  where history.record_id=canonical.id),
 (select count(*) from public.audit_logs audit where audit.request_id='${withdrawalRequest}'),
 (select count(*) from private.hall_of_fame_mutation_requests ledger
  where ledger.actor_user_id='${value.subject}' and ledger.request_id='${withdrawalRequest}' and ledger.status='completed')
from public.hall_of_fame_records canonical
join public.hall_of_fame_publication_consents consent
 on consent.application_record_id=canonical.source_application_record_id
where canonical.id='${value.fixtures[0].canonical}';
`,
  );
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.equal(state.stdout.trim(), "withdrawn|2|suppressed|3|2|2|3|1|1");
  const publicRows = sql(
    container,
    database,
    "set role anon; select count(*) from public.list_hall_of_fame_public_records(100,0);",
  );
  assert.equal(publicRows.stdout.trim(), "0");
});

test("same withdrawal request replays without duplicate history, audit, or ledger", () => {
  const replay = sql(
    container,
    database,
    withdrawSql(
      value,
      value.subject,
      value.fixtures[0],
      1,
      withdrawalRequest,
    ),
  );
  assert.equal(replay.status, 0, replay.stdout + replay.stderr);
  assert.match(replay.stdout, /\|withdrawn\|2\|suppressed\|3\|t/);
  const counts = sql(
    container,
    database,
    String.raw`
select
 (select count(*) from public.hall_of_fame_publication_consent_history where application_record_id='${value.fixtures[0].applicationRecord}'),
 (select count(*) from public.hall_of_fame_record_history where record_id='${value.fixtures[0].canonical}'),
 (select count(*) from public.audit_logs where request_id='${withdrawalRequest}'),
 (select count(*) from private.hall_of_fame_mutation_requests
  where actor_user_id='${value.subject}' and request_id='${withdrawalRequest}');
`,
  );
  assert.equal(counts.stdout.trim(), "2|3|1|1");
});

test("new withdrawal request on converged state is a ledger-only no-op", () => {
  convergedWithdrawalRequest = randomUUID();
  const result = sql(
    container,
    database,
    withdrawSql(
      value,
      value.subject,
      value.fixtures[0],
      2,
      convergedWithdrawalRequest,
    ),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\|withdrawn\|2\|suppressed\|3\|f/);
  const counts = sql(
    container,
    database,
    String.raw`
select
 (select count(*) from public.hall_of_fame_publication_consent_history where application_record_id='${value.fixtures[0].applicationRecord}'),
 (select count(*) from public.hall_of_fame_record_history where record_id='${value.fixtures[0].canonical}'),
 (select count(*) from public.audit_logs where request_id='${convergedWithdrawalRequest}'),
 (select count(*) from private.hall_of_fame_mutation_requests
  where actor_user_id='${value.subject}' and request_id='${convergedWithdrawalRequest}' and status='completed');
`,
  );
  assert.equal(counts.stdout.trim(), "2|3|0|1");
});

test("converged withdrawal request ID reuse with a different payload is rejected", () => {
  const mismatch = sql(
    container,
    database,
    withdrawSql(
      value,
      value.subject,
      value.fixtures[0],
      3,
      convergedWithdrawalRequest,
    ),
  );
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /HOF_REQUEST_ID_PAYLOAD_MISMATCH/);
  const counts = sql(
    container,
    database,
    String.raw`
select
 (select count(*) from public.hall_of_fame_publication_consent_history where application_record_id='${value.fixtures[0].applicationRecord}'),
 (select count(*) from public.hall_of_fame_record_history where record_id='${value.fixtures[0].canonical}'),
 (select count(*) from public.audit_logs where request_id='${convergedWithdrawalRequest}'),
 (select count(*) from private.hall_of_fame_mutation_requests
  where actor_user_id='${value.subject}' and request_id='${convergedWithdrawalRequest}');
`,
  );
  assert.equal(counts.stdout.trim(), "2|3|0|1");
});

test("withdrawal-first projection race converges to withdrawn plus suppressed", async () => {
  const syncRequest = randomUUID();
  const withdrawRequest = randomUUID();
  const retryRequest = randomUUID();
  const suffix = `${process.pid}_${Date.now()}`;
  const blockerName = `hof_projection_blocker_${suffix}`;
  const withdrawName = `hof_projection_withdraw_${suffix}`;
  const syncName = `hof_projection_sync_${suffix}`;
  const blocker = sqlAsync(
    container,
    database,
    String.raw`
set application_name = '${blockerName}';
begin;
select pg_catalog.pg_advisory_xact_lock(
 pg_catalog.hashtextextended('${value.fixtures[2].canonical}'::text, 8612)
);
select pg_catalog.pg_sleep(5);
commit;
`,
  );
  await waitForActivity(blockerName, "Timeout", "PgSleep");
  const withdrawal = sqlAsync(
    container,
    database,
    `set application_name = '${withdrawName}';\n${withdrawSql(
      value,
      value.raceSubject,
      value.fixtures[2],
      1,
      withdrawRequest,
    )}`,
  );
  await waitForActivity(withdrawName, "Lock", "advisory");
  const sync = sqlAsync(
    container,
    database,
    `set application_name = '${syncName}';\n${syncSql(
      value,
      value.admin,
      value.fixtures[2],
      1,
      syncRequest,
    )}`,
  );
  await waitForActivity(syncName, "Lock", "advisory");
  const blockerResult = await blocker;
  assert.equal(
    blockerResult.status,
    0,
    blockerResult.stdout + blockerResult.stderr,
  );
  const [withdrawResult, syncResult] = await Promise.all([withdrawal, sync]);
  assert.equal(
    withdrawResult.status,
    0,
    withdrawResult.stdout + withdrawResult.stderr,
  );
  assert.notEqual(syncResult.status, 0);
  assert.match(syncResult.stderr, /HOF_STALE_RECORD_VERSION/);
  const state = sql(
    container,
    database,
    String.raw`
select consent.status,canonical.publication_status,
 count(source.id) filter(where source.status='active'),
 count(distinct source.badge_code)
from public.hall_of_fame_records canonical
join public.hall_of_fame_publication_consents consent
 on consent.application_record_id=canonical.source_application_record_id
left join public.hall_of_fame_badge_sources source on source.record_id=canonical.id
where canonical.id='${value.fixtures[2].canonical}'
group by consent.status,canonical.publication_status;
`,
  );
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.equal(state.stdout.trim(), "withdrawn|suppressed|0|0");

  const retry = sql(
    container,
    database,
    syncSql(value, value.admin, value.fixtures[2], 2, retryRequest),
  );
  assert.equal(retry.status, 0, retry.stdout + retry.stderr);
  assert.match(retry.stdout, /\|suppressed\|2\|2\|2\|t\|f/);
  const converged = sql(
    container,
    database,
    String.raw`
select consent.status,canonical.publication_status,canonical.version,
 count(source.id) filter(where source.status='active'),
 count(distinct source.badge_code),
 (select count(*) from public.hall_of_fame_record_history history where history.record_id=canonical.id),
 (select count(*) from public.list_hall_of_fame_public_records(100,0))
from public.hall_of_fame_records canonical
join public.hall_of_fame_publication_consents consent
 on consent.application_record_id=canonical.source_application_record_id
left join public.hall_of_fame_badge_sources source on source.record_id=canonical.id
where canonical.id='${value.fixtures[2].canonical}'
group by consent.status,canonical.id;
`,
  );
  assert.equal(converged.status, 0, converged.stdout + converged.stderr);
  assert.equal(converged.stdout.trim(), "withdrawn|suppressed|2|2|2|2|0");
});
