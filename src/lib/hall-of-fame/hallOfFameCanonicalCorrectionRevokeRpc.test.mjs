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

function ids() {
  return {
    admin: randomUUID(),
    moderator: randomUUID(),
    target: randomUUID(),
    batch: randomUUID(),
    round: randomUUID(),
    applicationRecord: randomUUID(),
    canonical: randomUUID(),
    fixtureRequest: randomUUID(),
  };
}

function fingerprintSql(value, overrides = {}) {
  const fact = {
    target: value.target,
    recordType: "hole_in_one",
    playedOn: "2026-08-13",
    courseName: "CORRECTION TEST COURSE",
    courseRegion: "CORRECTION TEST REGION",
    environment: "outdoor",
    segment: "A",
    hole: 1,
    ...overrides,
  };
  return String.raw`extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'target_user_id','${fact.target}'::uuid,
        'record_type_code','${fact.recordType}',
        'played_on','${fact.playedOn}'::date,
        'course_name',pg_catalog.lower('${fact.courseName}'),
        'course_region',pg_catalog.lower('${fact.courseRegion}'),
        'course_environment','${fact.environment}',
        'course_segment','${fact.segment}',
        'hole_number',${fact.hole}
      )::text,
      'UTF8'
    ),
    'sha256'
  )`;
}

function fixtureSql(
  value,
  {
    publication = "hidden",
    fingerprint,
    includeTarget = true,
    consent = false,
  } = {},
) {
  const publicationValues = {
    hidden: "'hidden',null,null",
    published: "'published',now(),null",
    suppressed: "'suppressed',null,'Publication consent withdrawn by subject.'",
  };
  const canonicalFingerprint = fingerprint ?? fingerprintSql(value);
  return String.raw`
set session_replication_role = replica;
insert into auth.users(
 id,instance_id,aud,role,email,encrypted_password,
 email_confirmed_at,created_at,updated_at)
values
 ('${value.admin}','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','admin-${value.admin}@example.invalid','',now(),now(),now()),
 ('${value.moderator}','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','moderator-${value.moderator}@example.invalid','',now(),now(),now())
 ${includeTarget ? `,('${value.target}','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','target-${value.target}@example.invalid','',now(),now(),now())` : ""};
insert into public.user_accounts(id,account_status,platform_role)
values
 ('${value.admin}','active','platform_admin'),
 ('${value.moderator}','active','platform_moderator')
 ${includeTarget ? `,('${value.target}','active','member')` : ""};
insert into private.hall_of_fame_mutation_requests(
 actor_user_id,request_id,operation,application_batch_id,
 payload_fingerprint,status,result_payload,completed_at)
values(
 '${value.admin}','${value.fixtureRequest}','hall_of_fame.fixture.create',
 '${value.batch}',decode(repeat('f8',32),'hex'),'completed','{}',now()
);
insert into public.hall_of_fame_application_batches(
 id,application_type,created_by_user_id,status,version,
 submitted_at,finalized_at)
values(
 '${value.batch}','direct_application','${value.target}',
 'approved',4,now(),now()
);
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,
 course_region_snapshot,course_environment,course_layout_snapshot,
 round_type,event_name_snapshot,notes)
values(
 '${value.round}','${value.batch}','2026-08-13','CORRECTION TEST COURSE',
 'CORRECTION TEST REGION','outdoor','ORIGINAL LAYOUT','practice',
 'CORRECTION TEST EVENT','CORRECTION TEST ROUND'
);
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,
 record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,
 club_verification_status,member_consent_status,review_status,
 conflict_of_interest,fingerprint_version,duplicate_fingerprint,version)
values(
 '${value.applicationRecord}','${value.batch}','${value.round}','${value.target}',
 'hole_in_one','A',1,3,1,'not_applicable','granted','approved',false,1,
 extensions.digest(pg_catalog.convert_to('${value.applicationRecord}','UTF8'),'sha256'),4
);
insert into public.hall_of_fame_records(
 id,source_application_record_id,target_user_id,record_type_code,played_on,
 course_name_snapshot,course_region_snapshot,course_environment,
 course_layout_snapshot,course_segment_snapshot,hole_number,hole_par,strokes,
 fingerprint_version,record_fingerprint,validity_status,publication_status,
 published_at,suppression_reason,approved_by_user_id,approved_at,version)
values(
 '${value.canonical}','${value.applicationRecord}','${value.target}',
 'hole_in_one','2026-08-13','CORRECTION TEST COURSE',
 'CORRECTION TEST REGION','outdoor','ORIGINAL LAYOUT','A',1,3,1,
 1,${canonicalFingerprint},'active',${publicationValues[publication]},
 '${value.admin}',now(),1
);
insert into public.hall_of_fame_record_history(
 record_id,version,from_validity_status,to_validity_status,
 from_publication_status,to_publication_status,action,reason,
 actor_user_id,request_id)
values(
 '${value.canonical}',1,null,'active',null,'${publication}',
 'hall_of_fame.record.fixture_created',null,'${value.admin}','${value.fixtureRequest}'
);
insert into public.hall_of_fame_badge_sources(
 target_user_id,badge_code,record_id,status,activated_at,created_at)
values
 ('${value.target}','hole_in_one','${value.canonical}','active',now(),now()),
 ('${value.target}','hall_of_fame_inductee','${value.canonical}','active',now(),now());
${
  consent
    ? String.raw`
insert into public.hall_of_fame_publication_consents(
 application_record_id,target_user_id,status,display_name_consent,
 masked_display_name_consent,full_display_name_consent,avatar_consent,
 club_name_consent,record_date_consent,course_detail_consent,badge_consent,
 version,consented_at,withdrawn_at,policy_version,last_actor_user_id,last_request_id)
values(
 '${value.applicationRecord}','${value.target}','granted',true,true,false,false,
 false,true,true,true,1,now(),null,'hof-correction-test-v1',
 '${value.admin}','${value.fixtureRequest}'
);
insert into public.hall_of_fame_publication_consent_history(
 application_record_id,target_user_id,display_name_consent,
 masked_display_name_consent,full_display_name_consent,avatar_consent,
 club_name_consent,record_date_consent,course_detail_consent,badge_consent,
 policy_version,from_status,to_status,version,actor_user_id,request_id)
values(
 '${value.applicationRecord}','${value.target}',true,true,false,false,false,
 true,true,true,'hof-correction-test-v1',null,'granted',1,
 '${value.admin}','${value.fixtureRequest}'
);`
    : ""
}
set session_replication_role = origin;
`;
}

function correctionSql(value, requestId, options = {}) {
  const {
    actor = value.admin,
    expectedVersion = 1,
    recordType = "albatross",
    playedOn = "2026-08-14",
    courseName = "CORRECTED TEST COURSE",
    courseRegion = "CORRECTED TEST REGION",
    environment = "outdoor",
    layout = "CORRECTED LAYOUT",
    segment = "B",
    hole = 2,
    par = 5,
    strokes = 2,
    reasonCode = "wrong_record_type",
    reason = "TEST factual correction",
  } = options;
  return String.raw`
${actorSql(actor)}
select * from public.correct_hall_of_fame_canonical_record(
 '${value.canonical}',${expectedVersion},'${recordType}','${playedOn}',
 '${courseName}','${courseRegion}','${environment}','${layout}',
 '${segment}',${hole},${par},${strokes},null,
 '${reasonCode}',${reason.startsWith("repeat(") ? reason : `'${reason}'`},'${requestId}'
);
`;
}

function revokeSql(value, requestId, options = {}) {
  const {
    actor = value.admin,
    expectedVersion = 1,
    reasonCode = "administrative_error",
    reason = "TEST canonical revocation",
  } = options;
  return String.raw`
${actorSql(actor)}
select * from public.revoke_hall_of_fame_canonical_record(
 '${value.canonical}',${expectedVersion},'${reasonCode}',
 ${reason.startsWith("repeat(") ? reason : `'${reason}'`},'${requestId}'
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
  database = `pul_hof_lifecycle_${process.pid}_${Date.now()}`;
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

test("catalog exposes two authenticated-only SECURITY DEFINER RPCs and private helpers", () => {
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
    'correct_hall_of_fame_canonical_record',
    'revoke_hall_of_fame_canonical_record'
  )
order by p.proname;
select pg_catalog.count(*)
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
where n.nspname='private'
  and p.proname in (
    'enforce_hall_of_fame_canonical_lineage',
    'enforce_guarded_hall_of_fame_canonical_lifecycle_mutation',
    'enforce_hall_of_fame_canonical_lifecycle_history_append'
  )
  and not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
  and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
  and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
`);
  assertSuccess(result);
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 4);
  assert.equal(lines[0], "36:20260813000200");
  for (const line of lines.slice(1, 3)) {
    const columns = line.split("|");
    assert.equal(columns[1], "t");
    assert.match(columns[2], /search_path/);
    assert.deepEqual(columns.slice(3), ["t", "f", "f"]);
  }
  assert.equal(lines[3], "3");
});

test("basic correction preserves predecessor facts and creates one hidden successor badge pair", () => {
  const value = ids();
  const requestId = randomUUID();
  assertSuccess(sql(fixtureSql(value)));
  const corrected = sql(correctionSql(value, requestId));
  assertSuccess(corrected);
  assert.match(corrected.stdout, /\|2\|corrected\|[0-9a-f-]+\|1\|active\|hidden\|2\|t\|f/);

  const state = sql(String.raw`
select record_type_code,played_on,course_name_snapshot,validity_status,
 publication_status,version
from public.hall_of_fame_records where id='${value.canonical}';
select source_application_record_id='${value.applicationRecord}',
 target_user_id='${value.target}',record_type_code,played_on,
 course_name_snapshot,validity_status,publication_status,version,
 corrected_from_record_id='${value.canonical}'
from public.hall_of_fame_records
where corrected_from_record_id='${value.canonical}';
select status,count(*) from public.hall_of_fame_badge_sources
where record_id='${value.canonical}' group by status;
select status,count(*) from public.hall_of_fame_badge_sources
where record_id=(select id from public.hall_of_fame_records
 where corrected_from_record_id='${value.canonical}') group by status;
select count(*) from public.hall_of_fame_record_history
where request_id='${requestId}';
select count(*) from public.audit_logs where request_id='${requestId}';
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${value.admin}' and request_id='${requestId}'
 and status='completed';
`);
  assertSuccess(state);
  const lines = state.stdout.trim().split(/\r?\n/);
  assert.equal(
    lines[0],
    "hole_in_one|2026-08-13|CORRECTION TEST COURSE|corrected|suppressed|2",
  );
  assert.equal(
    lines[1],
    "t|t|albatross|2026-08-14|CORRECTED TEST COURSE|active|hidden|1|t",
  );
  assert.equal(lines[2], "inactive|2");
  assert.equal(lines[3], "active|2");
  assert.deepEqual(lines.slice(4), ["2", "1", "1"]);
});

test("correction replay is mutation-free and mismatched request reuse is rejected", () => {
  const value = ids();
  const requestId = randomUUID();
  assertSuccess(sql(fixtureSql(value)));
  assertSuccess(sql(correctionSql(value, requestId)));
  const replay = sql(correctionSql(value, requestId));
  assertSuccess(replay);
  assert.match(replay.stdout, /\|t\s*$/m);
  const mismatch = sql(
    correctionSql(value, requestId, { reason: "DIFFERENT TEST correction" }),
  );
  assertError(mismatch, /HOF_REQUEST_ID_PAYLOAD_MISMATCH/);
  const counts = sql(String.raw`
select
 (select count(*) from public.hall_of_fame_records
   where source_application_record_id='${value.applicationRecord}'),
 (select count(*) from public.hall_of_fame_record_history
   where request_id='${requestId}'),
 (select count(*) from public.audit_logs where request_id='${requestId}'),
 (select count(*) from private.hall_of_fame_mutation_requests
   where actor_user_id='${value.admin}' and request_id='${requestId}');
`);
  assertSuccess(counts);
  assert.equal(counts.stdout.trim(), "2|2|1|1");
});

test("published successors start hidden and suppressed successors remain suppressed", () => {
  for (const [publication, expected] of [
    ["published", "hidden"],
    ["suppressed", "suppressed"],
  ]) {
    const value = ids();
    assertSuccess(sql(fixtureSql(value, { publication })));
    assertSuccess(sql(correctionSql(value, randomUUID())));
    const state = sql(String.raw`
select publication_status,published_at is null,
 suppression_reason is not null
from public.hall_of_fame_records
where corrected_from_record_id='${value.canonical}';
`);
    assertSuccess(state);
    assert.equal(
      state.stdout.trim(),
      expected === "hidden" ? "hidden|t|f" : "suppressed|t|t",
    );
  }
});

test("reason boundaries accept 2 and 1000 and reject 1 and 1001", () => {
  for (const [length, succeeds] of [
    [2, true],
    [1000, true],
    [1, false],
    [1001, false],
  ]) {
    const value = ids();
    assertSuccess(sql(fixtureSql(value)));
    const result = sql(
      correctionSql(value, randomUUID(), { reason: `repeat('x',${length})` }),
    );
    if (succeeds) assertSuccess(result);
    else assertError(result, /HOF_INVALID_CORRECTION_REQUEST/);
  }
});

test("no factual change and active fingerprint conflicts roll back completely", () => {
  const unchanged = ids();
  const unchangedRequest = randomUUID();
  assertSuccess(sql(fixtureSql(unchanged)));
  const noChange = sql(
    correctionSql(unchanged, unchangedRequest, {
      recordType: "hole_in_one",
      playedOn: "2026-08-13",
      courseName: "CORRECTION TEST COURSE",
      courseRegion: "CORRECTION TEST REGION",
      layout: "ORIGINAL LAYOUT",
      segment: "A",
      hole: 1,
      par: 3,
      strokes: 1,
      reasonCode: "factual_error",
    }),
  );
  assertError(noChange, /HOF_CORRECTION_NO_FACTUAL_CHANGE/);

  const first = ids();
  const second = ids();
  second.target = first.target;
  const candidateFingerprint = fingerprintSql(first, {
    recordType: "albatross",
    playedOn: "2026-08-14",
    courseName: "CORRECTED TEST COURSE",
    courseRegion: "CORRECTED TEST REGION",
    segment: "B",
    hole: 2,
  });
  assertSuccess(sql(fixtureSql(first)));
  assertSuccess(
    sql(
      fixtureSql(second, {
        fingerprint: candidateFingerprint,
        includeTarget: false,
      }),
    ),
  );
  const conflictRequest = randomUUID();
  const conflict = sql(correctionSql(first, conflictRequest));
  assertError(conflict, /HOF_CORRECTION_CONFLICT/);
  const rollback = sql(String.raw`
select validity_status,publication_status,version from public.hall_of_fame_records
where id='${first.canonical}';
select status,count(*) from public.hall_of_fame_badge_sources
where record_id='${first.canonical}' group by status;
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${first.admin}' and request_id='${conflictRequest}';
`);
  assertSuccess(rollback);
  assert.deepEqual(rollback.stdout.trim().split(/\r?\n/), [
    "active|hidden|1",
    "active|2",
    "0",
  ]);
});

test("concurrent correction requests serialize to one successor", async () => {
  const value = ids();
  assertSuccess(sql(fixtureSql(value)));
  const results = await Promise.all([
    sqlAsync(correctionSql(value, randomUUID())),
    sqlAsync(
      correctionSql(value, randomUUID(), {
        courseName: "SECOND CONCURRENT COURSE",
      }),
    ),
  ]);
  assert.equal(results.filter((result) => result.status === 0).length, 1);
  assert.equal(results.filter((result) => result.status !== 0).length, 1);
  assert.match(
    results.find((result) => result.status !== 0).stderr,
    /HOF_STALE_RECORD_VERSION|HOF_CANONICAL_TERMINAL_STATE/,
  );
  const state = sql(String.raw`
select
 count(*) filter(where validity_status='active'),
 count(*) filter(where corrected_from_record_id='${value.canonical}')
from public.hall_of_fame_records
where source_application_record_id='${value.applicationRecord}';
`);
  assertSuccess(state);
  assert.equal(state.stdout.trim(), "1|1");
});

test("correction versus revocation serializes without partial terminal states", async () => {
  const value = ids();
  assertSuccess(sql(fixtureSql(value)));
  const results = await Promise.all([
    sqlAsync(correctionSql(value, randomUUID())),
    sqlAsync(revokeSql(value, randomUUID())),
  ]);
  assert.equal(results.filter((result) => result.status === 0).length, 1);
  assert.equal(results.filter((result) => result.status !== 0).length, 1);
  const state = sql(String.raw`
select validity_status,publication_status from public.hall_of_fame_records
where id='${value.canonical}';
select count(*) from public.hall_of_fame_records
where corrected_from_record_id='${value.canonical}';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${value.canonical}' and status='active';
`);
  assertSuccess(state);
  const lines = state.stdout.trim().split(/\r?\n/);
  assert.match(lines[0], /^(corrected|revoked)\|suppressed$/);
  assert.equal(lines[1], lines[0].startsWith("corrected") ? "1" : "0");
  assert.equal(lines[2], "0");
});

test("correction versus projection sync converges on one hidden active successor", async () => {
  const value = ids();
  assertSuccess(sql(fixtureSql(value)));
  const correction = sqlAsync(correctionSql(value, randomUUID()));
  const projection = sqlAsync(String.raw`
${actorSql(value.admin)}
select pg_catalog.pg_sleep(0.15);
select * from public.sync_hall_of_fame_record_projection(
 '${value.canonical}',1,'${randomUUID()}'
);
`);
  const [correctionResult, projectionResult] = await Promise.all([
    correction,
    projection,
  ]);
  assertSuccess(correctionResult);
  if (projectionResult.status !== 0) {
    assert.match(
      projectionResult.stderr,
      /HOF_PROJECTION_CONTEXT_MISMATCH|HOF_CANONICAL_SOURCE_INTEGRITY_INVALID|HOF_STALE_RECORD_VERSION/,
    );
  }
  const state = sql(String.raw`
select validity_status,publication_status from public.hall_of_fame_records
where id='${value.canonical}';
select validity_status,publication_status from public.hall_of_fame_records
where corrected_from_record_id='${value.canonical}';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${value.canonical}' and status='active';
select count(*) from public.hall_of_fame_badge_sources
where record_id=(select id from public.hall_of_fame_records
 where corrected_from_record_id='${value.canonical}') and status='active';
`);
  assertSuccess(state);
  assert.deepEqual(state.stdout.trim().split(/\r?\n/), [
    "corrected|suppressed",
    "active|hidden",
    "0",
    "2",
  ]);
});

test("revocation versus projection and badge sync converges on terminal suppression", async () => {
  const value = ids();
  assertSuccess(sql(fixtureSql(value, { publication: "published" })));
  const revoke = sqlAsync(revokeSql(value, randomUUID()));
  const projection = sqlAsync(String.raw`
${actorSql(value.admin)}
select pg_catalog.pg_sleep(0.15);
select * from public.sync_hall_of_fame_record_projection(
 '${value.canonical}',1,'${randomUUID()}'
);
`);
  const [revokeResult, projectionResult] = await Promise.all([
    revoke,
    projection,
  ]);
  assertSuccess(revokeResult);
  if (projectionResult.status !== 0) {
    assert.match(
      projectionResult.stderr,
      /HOF_PROJECTION_CONTEXT_MISMATCH|HOF_CANONICAL_SOURCE_INTEGRITY_INVALID|HOF_STALE_RECORD_VERSION/,
    );
  }
  const state = sql(String.raw`
select validity_status,publication_status from public.hall_of_fame_records
where id='${value.canonical}';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${value.canonical}' and status='active';
`);
  assertSuccess(state);
  assert.deepEqual(state.stdout.trim().split(/\r?\n/), [
    "revoked|suppressed",
    "0",
  ]);
});

test("revocation versus consent withdrawal converges without reviving facts", async () => {
  const value = ids();
  assertSuccess(
    sql(fixtureSql(value, { publication: "published", consent: true })),
  );
  const revoke = sqlAsync(revokeSql(value, randomUUID()));
  const withdrawal = sqlAsync(String.raw`
${actorSql(value.target)}
select pg_catalog.pg_sleep(0.15);
select * from public.withdraw_hall_of_fame_publication_consent_after_approval(
 '${value.canonical}',1,'${randomUUID()}'
);
`);
  const [revokeResult, withdrawalResult] = await Promise.all([
    revoke,
    withdrawal,
  ]);
  assertSuccess(revokeResult);
  assert.notEqual(withdrawalResult.status, 0);
  assert.match(
    withdrawalResult.stderr,
    /HOF_PROJECTION_CONTEXT_MISMATCH|HOF_CANONICAL_SOURCE_INTEGRITY_INVALID|HOF_STALE_RECORD_VERSION/,
  );
  const state = sql(String.raw`
select validity_status,publication_status from public.hall_of_fame_records
where id='${value.canonical}';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${value.canonical}' and status='active';
select status from public.hall_of_fame_publication_consents
where application_record_id='${value.applicationRecord}';
`);
  assertSuccess(state);
  const lines = state.stdout.trim().split(/\r?\n/);
  assert.equal(lines[0], "revoked|suppressed");
  assert.equal(lines[1], "0");
  assert.match(lines[2], /^(granted|withdrawn)$/);
});

test("basic revoke is terminal, public-excluded, replayable, and supports a new-request no-op", () => {
  const value = ids();
  const requestId = randomUUID();
  assertSuccess(sql(fixtureSql(value, { publication: "published" })));
  const revoked = sql(revokeSql(value, requestId));
  assertSuccess(revoked);
  assert.match(revoked.stdout, /\|2\|revoked\|suppressed\|0\|t\|f/);
  const replay = sql(revokeSql(value, requestId));
  assertSuccess(replay);
  assert.match(replay.stdout, /\|t\s*$/m);

  const noopRequest = randomUUID();
  const noop = sql(
    revokeSql(value, noopRequest, { expectedVersion: 2 }),
  );
  assertSuccess(noop);
  assert.match(noop.stdout, /\|2\|revoked\|suppressed\|0\|f\|f/);
  const state = sql(String.raw`
select validity_status,publication_status,version,
 revocation_reason_code,revoked_at is not null,revoked_by_user_id='${value.admin}'
from public.hall_of_fame_records where id='${value.canonical}';
select count(*) from public.hall_of_fame_record_history
where record_id='${value.canonical}';
select count(*) from public.audit_logs
where target_id='${value.canonical}';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${value.canonical}' and status='active';
select count(*) from public.list_hall_of_fame_public_records(50,0);
`);
  assertSuccess(state);
  assert.deepEqual(state.stdout.trim().split(/\r?\n/), [
    "revoked|suppressed|2|administrative_error|t|t",
    "2",
    "1",
    "0",
    "0",
  ]);
});

test("corrected and revoked records cannot be revived by projection sync", () => {
  const corrected = ids();
  assertSuccess(sql(fixtureSql(corrected)));
  assertSuccess(sql(correctionSql(corrected, randomUUID())));
  const oldSync = sql(String.raw`
${actorSql(corrected.admin)}
select * from public.sync_hall_of_fame_record_projection(
 '${corrected.canonical}',2,'${randomUUID()}'
);
`);
  assertError(oldSync, /HOF_CANONICAL_SOURCE_INTEGRITY_INVALID/);
  const successor = sql(String.raw`
select id from public.hall_of_fame_records
where corrected_from_record_id='${corrected.canonical}';
`);
  assertSuccess(successor);
  const successorSync = sql(String.raw`
${actorSql(corrected.admin)}
select * from public.sync_hall_of_fame_record_projection(
 '${successor.stdout.trim()}',1,'${randomUUID()}'
);
`);
  assertSuccess(successorSync);

  const revoked = ids();
  assertSuccess(sql(fixtureSql(revoked)));
  assertSuccess(sql(revokeSql(revoked, randomUUID())));
  const revokedSync = sql(String.raw`
${actorSql(revoked.admin)}
select * from public.sync_hall_of_fame_record_projection(
 '${revoked.canonical}',2,'${randomUUID()}'
);
`);
  assertError(revokedSync, /HOF_PROJECTION_CONTEXT_MISMATCH|HOF_CANONICAL_SOURCE_INTEGRITY_INVALID/);
});

test("moderators and direct authenticated DML remain blocked without durable ledger or audit", () => {
  const value = ids();
  const correctionRequest = randomUUID();
  const revokeRequest = randomUUID();
  assertSuccess(sql(fixtureSql(value)));
  assertError(
    sql(correctionSql(value, correctionRequest, { actor: value.moderator })),
    /HOF_REVIEW_NOT_AUTHORIZED/,
  );
  assertError(
    sql(revokeSql(value, revokeRequest, { actor: value.moderator })),
    /HOF_REVIEW_NOT_AUTHORIZED/,
  );
  const directRecord = sql(String.raw`
${actorSql(value.admin)}
update public.hall_of_fame_records
set validity_status='revoked' where id='${value.canonical}';
`);
  assertError(directRecord, /permission denied|HOF_MUTATION_RPC_REQUIRED/);
  const directBadge = sql(String.raw`
${actorSql(value.admin)}
update public.hall_of_fame_badge_sources
set status='inactive' where record_id='${value.canonical}';
`);
  assertError(directBadge, /permission denied|HOF_MUTATION_RPC_REQUIRED/);
  const durable = sql(String.raw`
select
 (select count(*) from private.hall_of_fame_mutation_requests
   where request_id in ('${correctionRequest}','${revokeRequest}')),
 (select count(*) from public.audit_logs
   where request_id in ('${correctionRequest}','${revokeRequest}'));
`);
  assertSuccess(durable);
  assert.equal(durable.stdout.trim(), "0|0");
});

test("RLS, FORCE RLS, source and successor uniqueness, and privacy projection remain effective", () => {
  const result = sql(String.raw`
select c.relname,c.relrowsecurity,c.relforcerowsecurity
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private')
  and c.relname in (
    'hall_of_fame_records',
    'hall_of_fame_record_history',
    'hall_of_fame_badge_sources',
    'hall_of_fame_mutation_requests'
  )
order by c.relname;
select indexname,indexdef
from pg_catalog.pg_indexes
where schemaname='public'
  and indexname in (
    'hall_of_fame_records_source_application_record_id_key',
    'hall_of_fame_records_correction_successor_uidx',
    'hall_of_fame_records_active_fingerprint_uidx'
  )
order by indexname;
select pg_catalog.pg_get_function_result(p.oid)
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='list_hall_of_fame_public_records';
`);
  assertSuccess(result);
  const lines = result.stdout.trim().split(/\r?\n/);
  for (const line of lines.slice(0, 4)) assert.match(line, /\|t\|t$/);
  assert.match(lines.slice(4, 7).join("\n"), /source_application_record_id_key[\s\S]*WHERE \(validity_status = 'active'/);
  assert.match(lines.slice(4, 7).join("\n"), /correction_successor_uidx/);
  assert.match(lines.slice(4, 7).join("\n"), /active_fingerprint_uidx/);
  assert.doesNotMatch(
    lines.at(-1),
    /uuid|reason|request|actor|evidence|storage|email|phone/i,
  );
});
