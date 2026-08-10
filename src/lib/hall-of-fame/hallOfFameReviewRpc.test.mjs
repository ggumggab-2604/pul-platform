import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migrations = [
  "20260808000100_pul_hall_of_fame_consent_confirmation_rpc.sql",
  "20260808000200_pul_hall_of_fame_evidence_storage_rpc.sql",
  "20260810000100_pul_hall_of_fame_application_submit_rpc.sql",
  "20260810000200_pul_hall_of_fame_review_read_start_rpc.sql",
].map((filename) =>
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

function actorSql(actor, role = "authenticated") {
  return String.raw`
set local role ${role};
select pg_catalog.set_config('request.jwt.claim.sub','${actor}',true);
`;
}

function fixtureIds() {
  return {
    applicant: randomUUID(),
    companion: randomUUID(),
    moderator: randomUUID(),
    secondModerator: randomUUID(),
    admin: randomUUID(),
    ordinary: randomUUID(),
    batch: randomUUID(),
    round: randomUUID(),
    record: randomUUID(),
    evidence: randomUUID(),
    fixtureRequest: randomUUID(),
  };
}

function reviewFixture({ batchStatus = "submitted", values = fixtureIds() } = {}) {
  const batchVersion = batchStatus === "submitted" ? 2 : 3;
  const recordStatus = batchStatus === "submitted" ? "submitted" : batchStatus;
  const recordVersion = batchStatus === "submitted" ? 2 : 3;
  const reviewHistory =
    batchStatus === "submitted"
      ? ""
      : String.raw`
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,
 version,actor_user_id,actor_platform_role,action,request_id)
values
 ('batch','${values.batch}',null,'submitted','${batchStatus}',3,
  '${values.moderator}','platform_moderator',
  'hall_of_fame.fixture.review','${values.fixtureRequest}'),
 ('record','${values.batch}','${values.record}','submitted','${recordStatus}',3,
  '${values.moderator}','platform_moderator',
  'hall_of_fame.fixture.review','${values.fixtureRequest}');
`;
  const userIds = [
    values.applicant,
    values.companion,
    values.moderator,
    values.secondModerator,
    values.admin,
    values.ordinary,
  ];
  const authRows = userIds
    .map(
      (id) =>
        `('${id}','00000000-0000-0000-0000-000000000000',` +
        `'authenticated','authenticated','hof-review-${id}@example.invalid',` +
        `'',now(),now(),now())`,
    )
    .join(",\n");
  const accountRows = [
    [values.applicant, "'member'"],
    [values.companion, "'member'"],
    [values.moderator, "'platform_moderator'"],
    [values.secondModerator, "'platform_moderator'"],
    [values.admin, "'platform_admin'"],
    [values.ordinary, "'member'"],
  ]
    .map(([id, platformRole]) => `('${id}','active',${platformRole})`)
    .join(",\n");

  return {
    values,
    batchStatus,
    batchVersion,
    recordVersion,
    sql: String.raw`
set local session_replication_role = replica;
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
 '${batchStatus}',${batchVersion},now()
);
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,
 course_region_snapshot,course_environment,course_layout_snapshot,
 round_type,event_name_snapshot,notes)
values(
 '${values.round}','${values.batch}','2026-08-01','REVIEW TEST COURSE',
 'REVIEW TEST REGION','outdoor','A COURSE','practice',
 'REVIEW TEST EVENT','REVIEW TEST ROUND'
);
insert into private.hall_of_fame_mutation_requests(
 actor_user_id,request_id,operation,application_batch_id,
 payload_fingerprint,status,result_payload,completed_at)
values(
 '${values.applicant}','${values.fixtureRequest}','hall_of_fame.fixture.create',
 '${values.batch}',decode(repeat('f1',32),'hex'),'completed','{}',now()
);
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,
 record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,
 club_verification_status,member_consent_status,review_status,
 conflict_of_interest,fingerprint_version,duplicate_fingerprint,version)
values(
 '${values.record}','${values.batch}','${values.round}','${values.applicant}',
 'hole_in_one','A',1,3,1,'not_applicable','granted','${recordStatus}',
 false,1,extensions.digest(
   pg_catalog.convert_to('${values.record}','UTF8'),'sha256'
 ),${recordVersion}
);
insert into public.hall_of_fame_application_history(
 scope,application_batch_id,application_record_id,from_status,to_status,
 version,actor_user_id,action,request_id)
values
 ('batch','${values.batch}',null,null,'draft',1,'${values.applicant}',
  'hall_of_fame.fixture.create','${values.fixtureRequest}'),
 ('batch','${values.batch}',null,'draft','submitted',2,'${values.applicant}',
  'hall_of_fame.application.submit','${values.fixtureRequest}'),
 ('record','${values.batch}','${values.record}',null,'draft',1,
  '${values.applicant}','hall_of_fame.fixture.create','${values.fixtureRequest}'),
 ('record','${values.batch}','${values.record}','draft','submitted',2,
  '${values.applicant}','hall_of_fame.application.submit','${values.fixtureRequest}');
${reviewHistory}
insert into public.hall_of_fame_application_consents(
 id,application_record_id,application_batch_id,subject_user_id,
 consent_purpose,status,policy_version,version,requested_at,expires_at,
 granted_at,declined_at,withdrawn_at,last_actor_user_id,last_request_id)
values
 ('${randomUUID()}','${values.record}','${values.batch}','${values.applicant}',
  'application_processing','granted','hof-review-v1',1,null,null,
  now(),null,null,'${values.applicant}','${values.fixtureRequest}'),
 ('${randomUUID()}','${values.record}','${values.batch}','${values.applicant}',
  'evidence_review','granted','hof-review-v1',1,null,null,
  now(),null,null,'${values.applicant}','${values.fixtureRequest}');
insert into public.hall_of_fame_publication_consents(
 application_record_id,target_user_id,status,display_name_consent,
 avatar_consent,club_name_consent,record_date_consent,course_detail_consent,
 version,consented_at,withdrawn_at,policy_version,
 masked_display_name_consent,full_display_name_consent,badge_consent,
 last_actor_user_id,last_request_id)
values(
 '${values.record}','${values.applicant}','granted',true,false,false,true,true,
 1,now(),null,'hof-review-v1',true,false,false,
 '${values.applicant}','${values.fixtureRequest}'
);
insert into public.hall_of_fame_record_confirmations(
 id,application_record_id,confirmer_user_id,confirmation_role,status,
 statement,confirmed_at,version,requester_user_id,requested_at,expires_at,
 responded_at,last_actor_user_id,last_request_id)
values(
 '${randomUUID()}','${values.record}','${values.companion}',
 'round_companion','confirmed','REVIEW TEST CONFIRMATION',now(),1,
 '${values.applicant}',now()-interval '1 day',now()+interval '13 days',now(),
 '${values.applicant}','${values.fixtureRequest}'
);
insert into public.hall_of_fame_evidence_files(
 id,application_batch_id,application_record_id,evidence_type,storage_bucket,
 storage_path,mime_type,byte_size,sha256,original_filename,
 uploaded_by_user_id,status,finalized_at,declared_mime_type,
 declared_byte_size,version)
values(
 '${values.evidence}','${values.batch}','${values.record}','scorecard',
 'hall-of-fame-evidence',
 'applications/${values.batch}/${values.evidence}/original',
 'image/png',8,decode(repeat('ab',32),'hex'),null,
 '${values.applicant}','available',now(),'image/png',8,1
);
set local session_replication_role = origin;
`,
  };
}

function startSql(fixture, actor, requestId, expectedVersion) {
  return String.raw`
${actorSql(actor)}
select * from public.start_hall_of_fame_application_review(
 '${fixture.values.batch}',${expectedVersion},'${requestId}'
);
`;
}

function noteSql(fixture, actor, requestId, expectedVersion, note) {
  return String.raw`
${actorSql(actor)}
select * from public.add_hall_of_fame_internal_review_note(
 '${fixture.values.batch}',${expectedVersion},'${note}','${requestId}'
);
`;
}

async function runGatedReviewRace(batchId, leftSql, rightSql) {
  const gateSql = String.raw`
select pg_advisory_lock(
 pg_catalog.hashtextextended('${batchId}'::text,8608)
);
select pg_sleep(0.8);
select pg_advisory_unlock(
 pg_catalog.hashtextextended('${batchId}'::text,8608)
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
  database = `pul_hof_review_${process.pid}_${Date.now()}`;
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

test("full migration apply exposes exact review ACLs, RLS, CHECK, and triggers", () => {
  const result = sql(
    container,
    database,
    String.raw`
select pg_catalog.count(*)=4
from pg_proc as p
join pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'list_hall_of_fame_review_queue',
    'get_hall_of_fame_review_detail',
    'start_hall_of_fame_application_review',
    'add_hall_of_fame_internal_review_note'
  )
  and p.prosecdef
  and p.proconfig = array['search_path=""']::text[]
  and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
  and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
  and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
  and coalesce(p.proacl::text,'') !~ '(^|,)=[^,]*X';
select pg_catalog.count(*)=7
from pg_class as c
join pg_namespace as n on n.oid=c.relnamespace
where n.nspname in ('public','private')
  and c.relname in (
    'hall_of_fame_application_batches',
    'hall_of_fame_application_records',
    'hall_of_fame_application_reviews',
    'hall_of_fame_application_history',
    'hall_of_fame_evidence_files',
    'hall_of_fame_application_consents',
    'hall_of_fame_mutation_requests'
  )
  and c.relrowsecurity and c.relforcerowsecurity;
select pg_catalog.count(*)=5
from pg_trigger as trigger
where not trigger.tgisinternal
  and trigger.tgname like 'hall_of_fame_%_review_guard_before_mutation';
select pg_get_constraintdef(oid) like '%review_note_added%'
from pg_constraint
where conname='hall_of_fame_application_reviews_action_check';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((result.stdout.match(/\bt\b/g) ?? []).length, 4);
});

test("moderator/admin read queue and detail while ordinary users are denied", () => {
  const fixture = reviewFixture();
  const allowed = sql(
    container,
    database,
    String.raw`
begin;
${fixture.sql}
${actorSql(fixture.values.moderator)}
select application_batch_id='${fixture.values.batch}'::uuid
  and review_status='submitted'
  and batch_version=2
  and active_record_count=1
from public.list_hall_of_fame_review_queue(50,0)
where application_batch_id='${fixture.values.batch}';
select
  application_batch->>'application_batch_id'='${fixture.values.batch}'
  and application_batch->>'review_status'='submitted'
  and jsonb_array_length(application_records)=1
  and jsonb_array_length(application_records->0->'application_consents')=2
  and (application_records->0->>'valid_companion_count')::integer=1
  and jsonb_array_length(application_records->0->'evidence')=1
  and not (application_records::text ~* 'storage_path|sha256|signed_url|email|phone')
from public.get_hall_of_fame_review_detail('${fixture.values.batch}');
${actorSql(fixture.values.admin)}
select count(*)=1 from public.get_hall_of_fame_review_detail('${fixture.values.batch}');
rollback;
`,
  );
  assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
  assert.equal((allowed.stdout.match(/\bt\b/g) ?? []).length, 3);

  const denied = sql(
    container,
    database,
    String.raw`begin;
${fixture.sql}
${actorSql(fixture.values.ordinary)}
select * from public.list_hall_of_fame_review_queue(50,0);
rollback;`,
  );
  assert.notEqual(denied.status, 0);
  assert.match(denied.stdout + denied.stderr, /HOF_REVIEW_NOT_AUTHORIZED/);
});

test("review start transitions batch and active records atomically and replays once", () => {
  const fixture = reviewFixture();
  const requestId = randomUUID();
  const result = sql(
    container,
    database,
    String.raw`
begin;
${fixture.sql}
${startSql(fixture, fixture.values.moderator, requestId, 2)} \gset first_
select * from public.start_hall_of_fame_application_review(
 '${fixture.values.batch}',2,'${requestId}'
) \gset replay_
reset role;
select
  :'first_status'='under_review'
  and :'first_batch_version'='3'
  and :'first_transitioned_record_count'='1'
  and :'first_replayed'='f'
  and :'replay_replayed'='t'
  and :'first_review_started_at'=:'replay_review_started_at'
  and (select status='under_review' and version=3 and submitted_at is not null
       from public.hall_of_fame_application_batches
       where id='${fixture.values.batch}')
  and (select review_status='under_review' and version=3
       from public.hall_of_fame_application_records
       where id='${fixture.values.record}')
  and (select count(*)=3 from public.hall_of_fame_application_history
       where application_batch_id='${fixture.values.batch}' and scope='batch')
  and (select count(*)=3 from public.hall_of_fame_application_history
       where application_record_id='${fixture.values.record}' and scope='record')
  and (select count(*)=1 from public.hall_of_fame_application_reviews
       where application_batch_id='${fixture.values.batch}'
         and review_action='review_started')
  and (select count(*)=1 from public.audit_logs where request_id='${requestId}')
  and (select count(*)=1 from private.hall_of_fame_mutation_requests
       where actor_user_id='${fixture.values.moderator}'
         and request_id='${requestId}' and status='completed');
rollback;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /t/);
});

test("stale, request mismatch, and ordinary review start fail without effects", () => {
  for (const [actorKey, expectedVersion, expectedError] of [
    ["moderator", 99, /HOF_STALE_VERSION/],
    ["ordinary", 2, /HOF_REVIEW_NOT_AUTHORIZED/],
  ]) {
    const fixture = reviewFixture();
    const requestId = randomUUID();
    const setup = sql(container, database, `begin;\n${fixture.sql}\ncommit;`);
    assert.equal(setup.status, 0, setup.stdout + setup.stderr);
    const failed = sql(
      container,
      database,
      `begin;\n${startSql(
        fixture,
        fixture.values[actorKey],
        requestId,
        expectedVersion,
      )}\ncommit;`,
    );
    assert.notEqual(failed.status, 0);
    assert.match(failed.stdout + failed.stderr, expectedError);
    const unchanged = sql(
      container,
      database,
      String.raw`select
        (select status='submitted' and version=2
         from public.hall_of_fame_application_batches
         where id='${fixture.values.batch}')
        and not exists (
          select 1 from public.hall_of_fame_application_reviews
          where application_batch_id='${fixture.values.batch}'
        )
        and not exists (
          select 1 from public.audit_logs where request_id='${requestId}'
        )
        and not exists (
          select 1 from private.hall_of_fame_mutation_requests
          where actor_user_id='${fixture.values[actorKey]}'
            and request_id='${requestId}'
        );`,
    );
    assert.equal(unchanged.status, 0, unchanged.stdout + unchanged.stderr);
    assert.match(unchanged.stdout, /t/);
  }

  const mismatchFixture = reviewFixture();
  const mismatchRequest = randomUUID();
  const mismatch = sql(
    container,
    database,
    String.raw`begin;
${mismatchFixture.sql}
${startSql(mismatchFixture, mismatchFixture.values.moderator, mismatchRequest, 2)}
select * from public.start_hall_of_fame_application_review(
 '${mismatchFixture.values.batch}',3,'${mismatchRequest}'
);
commit;`,
  );
  assert.notEqual(mismatch.status, 0);
  assert.match(
    mismatch.stdout + mismatch.stderr,
    /HOF_REQUEST_ID_PAYLOAD_MISMATCH/,
  );
});

test("two authorized reviewers race to one review-start winner", async () => {
  const fixture = reviewFixture();
  const setup = sql(container, database, `begin;\n${fixture.sql}\ncommit;`);
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);
  const leftRequest = randomUUID();
  const rightRequest = randomUUID();
  const [left, right] = await runGatedReviewRace(
    fixture.values.batch,
    `begin;\n${startSql(
      fixture,
      fixture.values.moderator,
      leftRequest,
      2,
    )}\ncommit;`,
    `begin;\n${startSql(
      fixture,
      fixture.values.admin,
      rightRequest,
      2,
    )}\ncommit;`,
  );
  assert.equal([left, right].filter((result) => result.status === 0).length, 1);
  assert.equal([left, right].filter((result) => result.status !== 0).length, 1);
  assert.match(left.stdout + left.stderr + right.stdout + right.stderr, /HOF_STALE_VERSION/);
  assert.doesNotMatch(
    left.stdout + left.stderr + right.stdout + right.stderr,
    /deadlock detected/i,
  );
  const state = sql(
    container,
    database,
    String.raw`select
      (select status='under_review' and version=3
       from public.hall_of_fame_application_batches
       where id='${fixture.values.batch}')
      and (select review_status='under_review' and version=3
       from public.hall_of_fame_application_records
       where id='${fixture.values.record}')
      and (select count(*)=1 from public.hall_of_fame_application_reviews
       where application_batch_id='${fixture.values.batch}'
         and review_action='review_started')
      and (select count(*)=1 from public.audit_logs
       where request_id in ('${leftRequest}','${rightRequest}'))
      and (select count(*)=1 from private.hall_of_fame_mutation_requests
       where request_id in ('${leftRequest}','${rightRequest}')
         and status='completed');`,
  );
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.match(state.stdout, /t/);
});

test("multiple reviewers append internal notes without version or history changes", () => {
  const fixture = reviewFixture();
  const startRequest = randomUUID();
  const firstNoteRequest = randomUUID();
  const secondNoteRequest = randomUUID();
  const firstNote = "First internal review note";
  const secondNote = "Second internal review note";
  const result = sql(
    container,
    database,
    String.raw`
begin;
${fixture.sql}
${startSql(fixture, fixture.values.moderator, startRequest, 2)}
${noteSql(fixture, fixture.values.moderator, firstNoteRequest, 3, firstNote)} \gset note_
select * from public.add_hall_of_fame_internal_review_note(
 '${fixture.values.batch}',3,'${firstNote}','${firstNoteRequest}'
) \gset replay_
${noteSql(fixture, fixture.values.admin, secondNoteRequest, 3, secondNote)}
reset role;
select
  :'note_replayed'='f'
  and :'replay_replayed'='t'
  and :'note_review_event_id'=:'replay_review_event_id'
  and (select status='under_review' and version=3
       from public.hall_of_fame_application_batches
       where id='${fixture.values.batch}')
  and (select count(*)=3 from public.hall_of_fame_application_history
       where application_batch_id='${fixture.values.batch}' and scope='batch')
  and (select count(*)=2 from public.hall_of_fame_application_reviews
       where application_batch_id='${fixture.values.batch}'
         and review_action='review_note_added')
  and (select count(*)=2 from public.audit_logs
       where request_id in ('${firstNoteRequest}','${secondNoteRequest}'))
  and (select count(*)=2 from private.hall_of_fame_mutation_requests
       where request_id in ('${firstNoteRequest}','${secondNoteRequest}')
         and status='completed')
  and (select jsonb_array_length(review_events)=3
       from public.get_hall_of_fame_review_detail('${fixture.values.batch}'));
rollback;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /t/);
});

test("internal note rejects invalid state, secret markers, mismatch, and ordinary actors", () => {
  const cases = [
    ["moderator", "Safe note", /HOF_INTERNAL_REVIEW_NOTE_STATE_INVALID/],
    ["moderator", "contains access token", /HOF_INTERNAL_REVIEW_NOTE_SECRET_FORBIDDEN/],
    ["ordinary", "Safe note", /HOF_REVIEW_NOT_AUTHORIZED/],
  ];
  for (const [actorKey, note, expected] of cases) {
    const fixture = reviewFixture();
    const result = sql(
      container,
      database,
      String.raw`begin;
${fixture.sql}
${noteSql(fixture, fixture.values[actorKey], randomUUID(), 2, note)}
commit;`,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, expected);
  }

  const fixture = reviewFixture();
  const startRequest = randomUUID();
  const noteRequest = randomUUID();
  const mismatch = sql(
    container,
    database,
    String.raw`begin;
${fixture.sql}
${startSql(fixture, fixture.values.moderator, startRequest, 2)}
${noteSql(fixture, fixture.values.moderator, noteRequest, 3, "Original note")}
select * from public.add_hall_of_fame_internal_review_note(
 '${fixture.values.batch}',3,'Changed note','${noteRequest}'
);
commit;`,
  );
  assert.notEqual(mismatch.status, 0);
  assert.match(
    mismatch.stdout + mismatch.stderr,
    /HOF_REQUEST_ID_PAYLOAD_MISMATCH/,
  );
});

test("moderator Evidence read is available-only and review-state bounded", () => {
  for (const batchStatus of [
    "submitted",
    "under_review",
    "additional_info_required",
  ]) {
    const fixture = reviewFixture({ batchStatus });
    const result = sql(
      container,
      database,
      String.raw`begin;
${fixture.sql}
set local role service_role;
select evidence_id='${fixture.values.evidence}'::uuid
from public.get_hall_of_fame_evidence_read_context_server(
 '${fixture.values.moderator}','${fixture.values.evidence}'
);
rollback;`,
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /t/);
  }

  const draft = reviewFixture();
  draft.sql += String.raw`
set local session_replication_role=replica;
update public.hall_of_fame_application_batches
set status='draft',version=1,submitted_at=null
where id='${draft.values.batch}';
update public.hall_of_fame_application_records
set review_status='draft',version=1
where id='${draft.values.record}';
set local session_replication_role=origin;
`;
  const moderatorDenied = sql(
    container,
    database,
    String.raw`begin;
${draft.sql}
set local role service_role;
select * from public.get_hall_of_fame_evidence_read_context_server(
 '${draft.values.moderator}','${draft.values.evidence}'
);
rollback;`,
  );
  assert.notEqual(moderatorDenied.status, 0);
  assert.match(
    moderatorDenied.stdout + moderatorDenied.stderr,
    /HOF_EVIDENCE_READ_NOT_AUTHORIZED/,
  );

  const ownerAllowed = sql(
    container,
    database,
    String.raw`begin;
${draft.sql}
set local role service_role;
select evidence_id='${draft.values.evidence}'::uuid
from public.get_hall_of_fame_evidence_read_context_server(
 '${draft.values.applicant}','${draft.values.evidence}'
);
rollback;`,
  );
  assert.equal(ownerAllowed.status, 0, ownerAllowed.stdout + ownerAllowed.stderr);
  assert.match(ownerAllowed.stdout, /t/);
});

test("ordinary Evidence access and non-available Evidence remain denied", () => {
  const fixture = reviewFixture();
  const ordinary = sql(
    container,
    database,
    String.raw`begin;
${fixture.sql}
set local role service_role;
select * from public.get_hall_of_fame_evidence_read_context_server(
 '${fixture.values.ordinary}','${fixture.values.evidence}'
);
rollback;`,
  );
  assert.notEqual(ordinary.status, 0);
  assert.match(ordinary.stdout + ordinary.stderr, /HOF_EVIDENCE_READ_NOT_AUTHORIZED/);

  const unavailable = sql(
    container,
    database,
    String.raw`begin;
${fixture.sql}
set local session_replication_role=replica;
update public.hall_of_fame_evidence_files
set status='failed',byte_size=null,sha256=null,finalized_at=null
where id='${fixture.values.evidence}';
set local session_replication_role=origin;
set local role service_role;
select * from public.get_hall_of_fame_evidence_read_context_server(
 '${fixture.values.moderator}','${fixture.values.evidence}'
);
rollback;`,
  );
  assert.notEqual(unavailable.status, 0);
  assert.match(
    unavailable.stdout + unavailable.stderr,
    /HOF_EVIDENCE_READ_NOT_AUTHORIZED/,
  );
});

test("direct review table and state DML remain blocked", () => {
  const fixture = reviewFixture();
  const statements = [
    `update public.hall_of_fame_application_batches set status='under_review' where id='${fixture.values.batch}';`,
    `update public.hall_of_fame_application_records set review_status='under_review' where id='${fixture.values.record}';`,
    `insert into public.hall_of_fame_application_reviews(application_batch_id,review_action,reviewer_user_id,reviewer_platform_role,request_id) values('${fixture.values.batch}','review_started','${fixture.values.moderator}','platform_moderator','${randomUUID()}');`,
  ];
  for (const statement of statements) {
    const result = sql(
      container,
      database,
      String.raw`begin;
${fixture.sql}
${actorSql(fixture.values.moderator)}
${statement}
rollback;`,
    );
    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout + result.stderr,
      /permission denied|HOF_MUTATION_RPC_REQUIRED|HOF_APPEND_ONLY_MUTATION_FORBIDDEN/,
    );
  }
});
