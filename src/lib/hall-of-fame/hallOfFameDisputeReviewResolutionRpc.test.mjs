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
  "20260815000200_pul_hall_of_fame_dispute_review_resolution_rpc.sql",
];

const migrations = migrationNames.map((filename) =>
  readFileSync(
    fileURLToPath(
      new URL(`../../../supabase/migrations/${filename}`, import.meta.url),
    ),
    "utf8",
  ),
);

let container;
let database;
let actors;
let canonicals;
let rejected;

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

function outputRow(result) {
  return result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1)
    .split("|");
}

function assertSuccess(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

function assertError(result, pattern) {
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, pattern);
}

function makeFixtureIds() {
  actors = {
    admin: randomUUID(),
    moderator: randomUUID(),
    moderator2: randomUUID(),
    member: randomUUID(),
    reporter: randomUUID(),
    subject: randomUUID(),
    creator: randomUUID(),
    coiSubject: randomUUID(),
  };
  canonicals = Array.from({ length: 48 }, (_, index) => ({
    id: randomUUID(),
    batch: randomUUID(),
    round: randomUUID(),
    application: randomUUID(),
    request: randomUUID(),
    target:
      index === 1 || index === 42
        ? actors.coiSubject
        : [39, 40, 41].includes(index)
          ? actors.admin
          : actors.subject,
    index,
  }));
  rejected = {
    batch: randomUUID(),
    round: randomUUID(),
    application: randomUUID(),
  };
}

function fixtureSql() {
  const authRows = Object.entries(actors)
    .map(
      ([name, id]) =>
        `('${id}','00000000-0000-0000-0000-000000000000',` +
        `'authenticated','authenticated','${name}-${id}@example.invalid',` +
        `'',now(),now(),now())`,
    )
    .join(",\n");
  const roleByName = {
    admin: "platform_admin",
    creator: "platform_admin",
    moderator: "platform_moderator",
    moderator2: "platform_moderator",
    coiSubject: "platform_moderator",
  };
  const accountRows = Object.entries(actors)
    .map(([name, id]) => `('${id}','active','${roleByName[name] ?? "member"}')`)
    .join(",\n");
  const ledgerRows = canonicals
    .map(
      (item) =>
        `('${actors.admin}','${item.request}','hall_of_fame.fixture.create',` +
        `'${item.batch}',decode(repeat('f8',32),'hex'),'completed','{}',now())`,
    )
    .join(",\n");
  const batchRows = canonicals
    .map(
      (item) =>
        `('${item.batch}','direct_application','${actors.creator}',` +
        `'approved',4,now(),now())`,
    )
    .concat(
      `('${rejected.batch}','direct_application','${actors.creator}',` +
        `'partially_approved',4,now(),now())`,
    )
    .join(",\n");
  const roundRows = canonicals
    .map(
      (item) =>
        `('${item.round}','${item.batch}','2026-08-${String((item.index % 24) + 1).padStart(2, "0")}',` +
        `'DISPUTE REVIEW COURSE ${item.index}','DISPUTE REVIEW REGION',` +
        `'outdoor','A','practice')`,
    )
    .concat(
      `('${rejected.round}','${rejected.batch}','2026-07-31',` +
        `'DISPUTE APPEAL COURSE','DISPUTE REVIEW REGION','outdoor','A','practice')`,
    )
    .join(",\n");
  const recordRows = canonicals
    .map(
      (item) =>
        `('${item.application}','${item.batch}','${item.round}','${item.target}',` +
        `'hole_in_one','A',${(item.index % 18) + 1},3,1,'not_applicable',` +
        `'granted','approved',false,1,` +
        `extensions.digest(pg_catalog.convert_to('${item.application}','UTF8'),'sha256'),4)`,
    )
    .concat(
      `('${rejected.application}','${rejected.batch}','${rejected.round}',` +
        `'${actors.subject}','hole_in_one','A',18,3,1,'not_applicable',` +
        `'granted','rejected',false,1,` +
        `extensions.digest(pg_catalog.convert_to('${rejected.application}','UTF8'),'sha256'),4)`,
    )
    .join(",\n");
  const canonicalRows = canonicals
    .map(
      (item) =>
        `('${item.id}','${item.application}','${item.target}','hole_in_one',` +
        `'2026-08-${String((item.index % 24) + 1).padStart(2, "0")}',` +
        `'DISPUTE REVIEW COURSE ${item.index}','DISPUTE REVIEW REGION',` +
        `'outdoor','A',${(item.index % 18) + 1},3,1,1,` +
        `extensions.digest(pg_catalog.convert_to('${item.id}','UTF8'),'sha256'),` +
        `'active','hidden','${actors.admin}',now(),1)`,
    )
    .join(",\n");
  const historyRows = canonicals
    .map(
      (item) =>
        `('${item.id}',1,null,'active',null,'hidden',` +
        `'hall_of_fame.record.fixture_created',null,'${actors.admin}','${item.request}')`,
    )
    .join(",\n");
  const badgeRows = canonicals
    .flatMap((item) =>
      ["hole_in_one", "hall_of_fame_inductee"].map(
        (badge) =>
          `('${item.target}','${badge}','${item.id}','active',now(),now())`,
      ),
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
insert into private.hall_of_fame_mutation_requests(
 actor_user_id,request_id,operation,application_batch_id,
 payload_fingerprint,status,result_payload,completed_at)
values
${ledgerRows};
insert into public.hall_of_fame_application_batches(
 id,application_type,created_by_user_id,status,version,submitted_at,finalized_at)
values
${batchRows};
insert into public.hall_of_fame_round_snapshots(
 id,application_batch_id,played_on,course_name_snapshot,
 course_region_snapshot,course_environment,course_layout_snapshot,round_type)
values
${roundRows};
insert into public.hall_of_fame_application_records(
 id,application_batch_id,round_snapshot_id,target_user_id,
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
 approved_by_user_id,approved_at,version)
values
${canonicalRows};
insert into public.hall_of_fame_record_history(
 record_id,version,from_validity_status,to_validity_status,
 from_publication_status,to_publication_status,action,reason,
 actor_user_id,request_id)
values
${historyRows};
insert into public.hall_of_fame_badge_sources(
 target_user_id,badge_code,record_id,status,activated_at,created_at)
values
${badgeRows};
set session_replication_role = origin;
`;
}

function submitSql(
  actor,
  type,
  target,
  requestId = randomUUID(),
  statement = "TEST dispute statement for private review",
) {
  const categories = {
    correction_request: "factual_error",
    decision_appeal: "decision_error",
    subject_objection: "wrong_subject",
    fraud_report: "false_record",
  };
  const application = type === "decision_appeal" ? target : null;
  const canonical = type === "decision_appeal" ? null : target;
  return String.raw`
${actorSql(actor)}
select * from public.submit_hall_of_fame_dispute(
 '${type}','${categories[type]}',
 ${application ? `'${application}'` : "null"},
 ${canonical ? `'${canonical}'` : "null"},
 ${quote(statement)},'${requestId}'
);
`;
}

function startSql(actor, disputeId, version, requestId = randomUUID()) {
  return String.raw`
${actorSql(actor)}
select * from public.start_hall_of_fame_dispute_review(
 '${disputeId}',${version},'${requestId}'
);
`;
}

function noteSql(
  actor,
  disputeId,
  version,
  requestId = randomUUID(),
  note = "TEST reviewer-only internal note",
) {
  return String.raw`
${actorSql(actor)}
select * from public.add_hall_of_fame_dispute_internal_note(
 '${disputeId}',${version},${quote(note)},'${requestId}'
);
`;
}

function resolveSql(
  actor,
  disputeId,
  version,
  outcome,
  requestId = randomUUID(),
  message = "TEST sanitized resolution message",
) {
  return String.raw`
${actorSql(actor)}
select * from public.resolve_hall_of_fame_dispute(
 '${disputeId}',${version},'${outcome}',${quote(message)},
 'TEST private resolution note','${requestId}'
);
`;
}

function correctionSql(
  actor,
  disputeId,
  disputeVersion,
  item,
  requestId = randomUUID(),
  options = {},
) {
  const original = options.original ?? false;
  const course = original
    ? `DISPUTE REVIEW COURSE ${item.index}`
    : `CORRECTED DISPUTE COURSE ${item.index}`;
  const date = `2026-08-${String((item.index % 24) + 1).padStart(2, "0")}`;
  const segment = original ? "A" : "B";
  const hole = original ? (item.index % 18) + 1 : ((item.index + 8) % 18) + 1;
  return String.raw`
${actorSql(actor)}
select * from public.resolve_hall_of_fame_dispute_with_correction(
 '${disputeId}',${disputeVersion},'${options.recordId ?? item.id}',
 ${options.recordVersion ?? 1},'${original ? "hole_in_one" : "albatross"}',
 '${date}','${course}','DISPUTE REVIEW REGION','outdoor',null,
 '${segment}',${hole},${original ? 3 : 5},${original ? 1 : 2},null,
 'wrong_record_type',${quote(options.reason ?? "TEST canonical correction reason")},
 'TEST sanitized correction result','TEST private correction note',
 '${requestId}'
);
`;
}

function revokeSql(
  actor,
  disputeId,
  disputeVersion,
  item,
  requestId = randomUUID(),
  options = {},
) {
  return String.raw`
${actorSql(actor)}
select * from public.resolve_hall_of_fame_dispute_with_revoke(
 '${disputeId}',${disputeVersion},'${options.recordId ?? item.id}',
 ${options.recordVersion ?? 1},'administrative_error',
 ${quote(options.reason ?? "TEST canonical revocation reason")},'TEST sanitized revocation result',
 'TEST private revocation note','${requestId}'
);
`;
}

function withdrawSql(actor, disputeId, version, requestId = randomUUID()) {
  return String.raw`
${actorSql(actor)}
select * from public.withdraw_hall_of_fame_dispute(
 '${disputeId}',${version},'${requestId}'
);
`;
}

function submit(
  actor,
  type,
  target,
  statement = "TEST dispute statement for private review",
) {
  const result = sql(submitSql(actor, type, target, randomUUID(), statement));
  assertSuccess(result);
  return outputRow(result)[2];
}

function start(actor, disputeId) {
  const result = sql(startSql(actor, disputeId, 1));
  assertSuccess(result);
  assert.equal(outputRow(result)[3], "under_review");
  return result;
}

function openForReview(
  type,
  item,
  submitter,
  reviewer = actors.moderator,
  statement = "TEST dispute statement for private review",
) {
  const target = type === "decision_appeal" ? rejected.application : item.id;
  const disputeId = submit(submitter, type, target, statement);
  start(reviewer, disputeId);
  return disputeId;
}

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
  database = `pul_hof_dispute_review_${process.pid}_${Date.now()}`;
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

  makeFixtureIds();
  assertSuccess(sql(fixtureSql(), "postgres"));
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

test("effective catalog is 38 with exact role permissions, RLS, and closed ACL", () => {
  const result = sql(String.raw`
select count(*) || ':' || max(version)
from supabase_migrations.schema_migrations;
select platform_role,permission_code
from public.platform_role_permissions
where permission_code like 'hall_of_fame.disputes.%'
order by platform_role,permission_code;
select c.relname,c.relrowsecurity,c.relforcerowsecurity,
 pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid=c.relnamespace
where n.nspname='public'
 and c.relname in (
  'hall_of_fame_disputes','hall_of_fame_dispute_history',
  'hall_of_fame_dispute_reviews'
 )
order by c.relname;
select count(*)
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public'
 and p.proname like '%hall_of_fame_dispute%'
 and p.prosecdef
 and p.proconfig::text like '%search_path%'
 and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
 and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
 and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
`);
  assertSuccess(result);
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.equal(lines[0], "38:20260815000200");
  assert.deepEqual(lines.slice(1, 6), [
    "platform_admin|hall_of_fame.disputes.read",
    "platform_admin|hall_of_fame.disputes.resolve",
    "platform_admin|hall_of_fame.disputes.review",
    "platform_moderator|hall_of_fame.disputes.read",
    "platform_moderator|hall_of_fame.disputes.review",
  ]);
  assert.deepEqual(lines.slice(6, 9), [
    "hall_of_fame_dispute_history|t|t|f",
    "hall_of_fame_dispute_reviews|t|t|f",
    "hall_of_fame_disputes|t|t|f",
  ]);
  assert.equal(lines[9], "12");
});

test("review queue, start, replay, COI, assignment, notes, and privacy are enforced", async () => {
  const ordinaryQueue = sql(String.raw`
${actorSql(actors.member)}
select * from public.list_hall_of_fame_dispute_review_queue(null,null,50,0);
`);
  assertError(ordinaryQueue, /HOF_REVIEW_NOT_AUTHORIZED/);

  const dispute = submit(actors.reporter, "fraud_report", canonicals[0].id);
  const queue = sql(String.raw`
${actorSql(actors.moderator)}
select dispute_id,status,version from public.list_hall_of_fame_dispute_review_queue(
 'open','fraud_report',50,0
) where dispute_id='${dispute}';
  `);
  assertSuccess(queue);
  assert.equal(outputRow(queue).join("|"), `${dispute}|open|1`);

  const startRequest = randomUUID();
  const started = sql(startSql(actors.moderator, dispute, 1, startRequest));
  assertSuccess(started);
  assert.match(started.stdout, /\|under_review\|2\|.*\|t\|f/);
  const replay = sql(startSql(actors.moderator, dispute, 1, startRequest));
  assertSuccess(replay);
  assert.match(replay.stdout, /\|under_review\|2\|.*\|t\|t/);
  assertError(
    sql(startSql(actors.moderator2, dispute, 2)),
    /HOF_DISPUTE_REVIEW_ALREADY_STARTED/,
  );

  const noteRequest = randomUUID();
  const noted = sql(noteSql(actors.moderator, dispute, 2, noteRequest));
  assertSuccess(noted);
  const noteReplay = sql(noteSql(actors.moderator, dispute, 2, noteRequest));
  assertSuccess(noteReplay);
  assert.match(noteReplay.stdout, /\|t\s*$/m);
  const noteRead = sql(String.raw`
${actorSql(actors.moderator2)}
select review_kind,note from public.list_hall_of_fame_dispute_internal_notes(
 '${dispute}',50,0
);
  `);
  assertSuccess(noteRead);
  assert.equal(
    outputRow(noteRead).join("|"),
    "internal_note|TEST reviewer-only internal note",
  );
  const ownRead = sql(String.raw`
${actorSql(actors.reporter)}
select resolution_outcome,resolution_message
from public.get_my_hall_of_fame_dispute('${dispute}');
  `);
  assertSuccess(ownRead);
  assert.equal(outputRow(ownRead).join("|"), "|");

  const submitterCoi = submit(
    actors.moderator2,
    "fraud_report",
    canonicals[2].id,
  );
  const submitterCoiRequest = randomUUID();
  assertError(
    sql(startSql(actors.moderator2, submitterCoi, 1, submitterCoiRequest)),
    /HOF_DISPUTE_REVIEW_CONFLICT_OF_INTEREST/,
  );
  const subjectCoi = submit(
    actors.reporter,
    "fraud_report",
    canonicals[1].id,
  );
  const subjectCoiRequest = randomUUID();
  assertError(
    sql(startSql(actors.coiSubject, subjectCoi, 1, subjectCoiRequest)),
    /HOF_DISPUTE_REVIEW_CONFLICT_OF_INTEREST/,
  );
  const coiState = sql(String.raw`
select id,status,version,review_started_at is null
from public.hall_of_fame_disputes
where id in ('${submitterCoi}','${subjectCoi}') order by id;
select count(*) from public.hall_of_fame_dispute_history
where dispute_id in ('${submitterCoi}','${subjectCoi}')
 and action='hall_of_fame.dispute.review_started';
select count(*) from public.audit_logs
where request_id in ('${submitterCoiRequest}','${subjectCoiRequest}');
select count(*) from private.hall_of_fame_mutation_requests
where request_id in ('${submitterCoiRequest}','${subjectCoiRequest}');
`);
  assertSuccess(coiState);
  const coiLines = coiState.stdout.trim().split(/\r?\n/);
  assert.equal(coiLines.length, 5);
  assert.match(coiLines[0], /^[0-9a-f-]+\|open\|1\|t$/);
  assert.match(coiLines[1], /^[0-9a-f-]+\|open\|1\|t$/);
  assert.deepEqual(coiLines.slice(2), ["0", "0", "0"]);

  const adminStart = submit(
    actors.reporter,
    "fraud_report",
    canonicals[3].id,
  );
  assertSuccess(sql(startSql(actors.admin, adminStart, 1)));

  const concurrent = submit(
    actors.reporter,
    "fraud_report",
    canonicals[4].id,
  );
  const [left, right] = await Promise.all([
    sqlAsync(startSql(actors.moderator, concurrent, 1)),
    sqlAsync(startSql(actors.moderator2, concurrent, 1)),
  ]);
  assert.equal([left, right].filter((item) => item.status === 0).length, 1);
  const state = sql(String.raw`
select status,version from public.hall_of_fame_disputes where id='${concurrent}';
select count(*) from public.hall_of_fame_dispute_history
where dispute_id='${concurrent}' and action='hall_of_fame.dispute.review_started';
select count(*) from public.audit_logs
where target_id='${concurrent}' and action='hall_of_fame.dispute.review.start';
select count(*) from private.hall_of_fame_mutation_requests
where result_payload->>'dispute_id'='${concurrent}'
 and operation='hall_of_fame.dispute.review.start';
`);
  assertSuccess(state);
  assert.deepEqual(state.stdout.trim().split(/\r?\n/), [
    "under_review|2",
    "1",
    "1",
    "1",
  ]);
});

test("ordinary and moderator actors satisfy the complete review RPC matrix", () => {
  const openDispute = submit(
    actors.reporter,
    "fraud_report",
    canonicals[24].id,
  );
  const reviewDispute = openForReview(
    "subject_objection",
    canonicals[25],
    actors.subject,
  );
  const ordinaryRequestIds = Array.from({ length: 5 }, () => randomUUID());
  const ordinaryCalls = [
    String.raw`${actorSql(actors.member)}
select * from public.list_hall_of_fame_dispute_review_queue(null,null,50,0);`,
    String.raw`${actorSql(actors.member)}
select * from public.get_hall_of_fame_dispute_for_review('${reviewDispute}');`,
    String.raw`${actorSql(actors.member)}
select * from public.list_hall_of_fame_dispute_internal_notes('${reviewDispute}',50,0);`,
    startSql(actors.member, openDispute, 1, ordinaryRequestIds[0]),
    noteSql(actors.member, reviewDispute, 2, ordinaryRequestIds[1]),
    resolveSql(
      actors.member,
      reviewDispute,
      2,
      "objection_not_upheld",
      ordinaryRequestIds[2],
    ),
    correctionSql(
      actors.member,
      reviewDispute,
      2,
      canonicals[25],
      ordinaryRequestIds[3],
    ),
    revokeSql(
      actors.member,
      reviewDispute,
      2,
      canonicals[25],
      ordinaryRequestIds[4],
    ),
  ];
  for (const call of ordinaryCalls) {
    assertError(sql(call), /HOF_REVIEW_NOT_AUTHORIZED/);
  }
  const ordinaryDurable = sql(String.raw`
select count(*) from private.hall_of_fame_mutation_requests
where request_id in (${ordinaryRequestIds.map(quote).join(",")});
`);
  assertSuccess(ordinaryDurable);
  assert.equal(ordinaryDurable.stdout.trim(), "0");

  for (const call of [
    String.raw`${actorSql(actors.moderator)}
select * from public.list_hall_of_fame_dispute_review_queue(null,null,50,0);`,
    String.raw`${actorSql(actors.moderator)}
select * from public.get_hall_of_fame_dispute_for_review('${reviewDispute}');`,
    String.raw`${actorSql(actors.moderator)}
select * from public.list_hall_of_fame_dispute_internal_notes('${reviewDispute}',50,0);`,
    startSql(actors.moderator, openDispute, 1),
    noteSql(actors.moderator, reviewDispute, 2),
  ]) {
    assertSuccess(sql(call));
  }
  for (const call of [
    resolveSql(actors.moderator, reviewDispute, 2, "objection_not_upheld"),
    correctionSql(actors.moderator, reviewDispute, 2, canonicals[25]),
    revokeSql(actors.moderator, reviewDispute, 2, canonicals[25]),
  ]) {
    assertError(sql(call), /HOF_REVIEW_NOT_AUTHORIZED/);
  }
});

test("exact canonical permission precedes dispute existence and row-lock access", async () => {
  const item = canonicals[26];
  const dispute = openForReview("subject_objection", item, actors.subject);
  const missingDispute = randomUUID();
  const requestIds = Array.from({ length: 6 }, () => randomUUID());
  const limitedSql = (call) => String.raw`
begin;
set session_replication_role = replica;
insert into public.platform_role_permissions(platform_role,permission_code)
values('platform_moderator','hall_of_fame.disputes.resolve')
on conflict do nothing;
set session_replication_role = origin;
set local statement_timeout = '750ms';
${call}
commit;
`;

  for (const call of [
    correctionSql(actors.moderator, dispute, 2, item, requestIds[0]),
    correctionSql(actors.moderator, missingDispute, 2, item, requestIds[1]),
    revokeSql(actors.moderator, dispute, 2, item, requestIds[2]),
    revokeSql(actors.moderator, missingDispute, 2, item, requestIds[3]),
  ]) {
    assertError(sql(limitedSql(call), "postgres"), /HOF_REVIEW_NOT_AUTHORIZED/);
  }

  const blocker = sqlAsync(
    String.raw`
begin;
select id from public.hall_of_fame_disputes
where id='${dispute}' for update;
select pg_catalog.pg_sleep(2);
rollback;
`,
    "postgres",
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  for (const call of [
    correctionSql(actors.moderator, dispute, 2, item, requestIds[4]),
    revokeSql(actors.moderator, dispute, 2, item, requestIds[5]),
  ]) {
    assertError(sql(limitedSql(call), "postgres"), /HOF_REVIEW_NOT_AUTHORIZED/);
  }
  assertSuccess(await blocker);

  const state = sql(String.raw`
select status,version,resolution_outcome is null,resolved_at is null
from public.hall_of_fame_disputes where id='${dispute}';
select count(*) from public.hall_of_fame_dispute_history
where dispute_id='${dispute}' and action='hall_of_fame.dispute.resolved';
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${dispute}' and review_kind='resolution_note';
select count(*) from public.audit_logs
where request_id in (${requestIds.map(quote).join(",")});
select count(*) from private.hall_of_fame_mutation_requests
where request_id in (${requestIds.map(quote).join(",")});
select validity_status,publication_status,version
from public.hall_of_fame_records where id='${item.id}';
select count(*) from public.hall_of_fame_records
where corrected_from_record_id='${item.id}';
`);
  assertSuccess(state);
  assert.deepEqual(state.stdout.trim().split(/\r?\n/), [
    "under_review|2|t|t",
    "0",
    "0",
    "0",
    "0",
    "active|hidden|1",
    "0",
  ]);
});

test("review and resolution conflict-of-interest is enforced with sufficient permissions", () => {
  const noteSubmitter = openForReview(
    "fraud_report",
    canonicals[35],
    actors.moderator2,
  );
  const noteSubject = openForReview(
    "fraud_report",
    canonicals[42],
    actors.reporter,
  );
  const genericSubmitter = openForReview(
    "fraud_report",
    canonicals[36],
    actors.admin,
  );
  const genericSubject = openForReview(
    "fraud_report",
    canonicals[39],
    actors.reporter,
  );
  const correctionSubmitter = openForReview(
    "correction_request",
    canonicals[37],
    actors.creator,
  );
  const correctionSubject = openForReview(
    "fraud_report",
    canonicals[40],
    actors.reporter,
  );
  const revokeSubmitter = openForReview(
    "fraud_report",
    canonicals[38],
    actors.creator,
  );
  const revokeSubject = openForReview(
    "fraud_report",
    canonicals[41],
    actors.reporter,
  );
  const requestIds = Array.from({ length: 8 }, () => randomUUID());
  const cases = [
    noteSql(actors.moderator2, noteSubmitter, 2, requestIds[0]),
    noteSql(actors.coiSubject, noteSubject, 2, requestIds[1]),
    resolveSql(
      actors.admin,
      genericSubmitter,
      2,
      "fraud_not_substantiated",
      requestIds[2],
    ),
    resolveSql(
      actors.admin,
      genericSubject,
      2,
      "fraud_not_substantiated",
      requestIds[3],
    ),
    correctionSql(
      actors.creator,
      correctionSubmitter,
      2,
      canonicals[37],
      requestIds[4],
    ),
    correctionSql(
      actors.admin,
      correctionSubject,
      2,
      canonicals[40],
      requestIds[5],
    ),
    revokeSql(
      actors.creator,
      revokeSubmitter,
      2,
      canonicals[38],
      requestIds[6],
    ),
    revokeSql(
      actors.admin,
      revokeSubject,
      2,
      canonicals[41],
      requestIds[7],
    ),
  ];
  for (const call of cases) {
    assertError(sql(call), /HOF_DISPUTE_REVIEW_CONFLICT_OF_INTEREST/);
  }

  const disputeIds = [
    noteSubmitter,
    noteSubject,
    genericSubmitter,
    genericSubject,
    correctionSubmitter,
    correctionSubject,
    revokeSubmitter,
    revokeSubject,
  ];
  const state = sql(String.raw`
select count(*) from public.hall_of_fame_disputes
where id in (${disputeIds.map(quote).join(",")})
 and status='under_review' and version=2
 and resolution_outcome is null and resolved_at is null;
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id in (${disputeIds.map(quote).join(",")});
select count(*) from public.hall_of_fame_dispute_history
where dispute_id in (${disputeIds.map(quote).join(",")})
 and action='hall_of_fame.dispute.resolved';
select count(*) from public.audit_logs
where request_id in (${requestIds.map(quote).join(",")});
select count(*) from private.hall_of_fame_mutation_requests
where request_id in (${requestIds.map(quote).join(",")});
select count(*) from public.hall_of_fame_records
where id in ('${canonicals[37].id}','${canonicals[38].id}',
 '${canonicals[40].id}','${canonicals[41].id}')
 and (validity_status <> 'active' or version <> 1);
select count(*) from public.hall_of_fame_records
where corrected_from_record_id in ('${canonicals[37].id}','${canonicals[40].id}');
`);
  assertSuccess(state);
  assert.deepEqual(state.stdout.trim().split(/\r?\n/), [
    "8",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
  ]);
});

test("generic resolution is admin-only, outcome-safe, atomic, private, and replayable", () => {
  const dispute = openForReview(
    "fraud_report",
    canonicals[5],
    actors.reporter,
  );
  assertError(
    sql(
      resolveSql(
        actors.moderator,
        dispute,
        2,
        "fraud_not_substantiated",
      ),
    ),
    /HOF_REVIEW_NOT_AUTHORIZED/,
  );
  assertError(
    sql(resolveSql(actors.admin, dispute, 2, "appeal_denied")),
    /HOF_DISPUTE_RESOLUTION_OUTCOME_INVALID/,
  );

  const requestId = randomUUID();
  const before = sql(String.raw`
select validity_status,publication_status,version
from public.hall_of_fame_records where id='${canonicals[5].id}';
`);
  assertSuccess(before);
  const resolved = sql(
    resolveSql(
      actors.admin,
      dispute,
      2,
      "fraud_not_substantiated",
      requestId,
    ),
  );
  assertSuccess(resolved);
  assert.match(resolved.stdout, /\|resolved\|3\|fraud_not_substantiated\|.*\|t\|f/);
  const replay = sql(
    resolveSql(
      actors.admin,
      dispute,
      2,
      "fraud_not_substantiated",
      requestId,
    ),
  );
  assertSuccess(replay);
  assert.match(replay.stdout, /\|t\s*$/m);
  assertError(
    sql(
      resolveSql(
        actors.admin,
        dispute,
        2,
        "fraud_not_substantiated",
        requestId,
        "DIFFERENT TEST resolution",
      ),
    ),
    /HOF_REQUEST_ID_PAYLOAD_MISMATCH/,
  );
  assertError(
    sql(resolveSql(actors.admin, dispute, 2, "fraud_not_substantiated")),
    /HOF_STALE_DISPUTE_VERSION/,
  );
  assertError(
    sql(noteSql(actors.moderator, dispute, 3)),
    /HOF_DISPUTE_TERMINAL_STATE/,
  );

  const state = sql(String.raw`
select status,version,resolution_outcome,resolution_message
from public.hall_of_fame_disputes where id='${dispute}';
select action,resolution_outcome from public.hall_of_fame_dispute_history
where dispute_id='${dispute}' order by version;
select review_kind,count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${dispute}' group by review_kind;
select count(*) from public.audit_logs where request_id='${requestId}';
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${actors.admin}' and request_id='${requestId}';
select validity_status,publication_status,version
from public.hall_of_fame_records where id='${canonicals[5].id}';
`);
  assertSuccess(state);
  const lines = state.stdout.trim().split(/\r?\n/);
  assert.equal(
    lines[0],
    "resolved|3|fraud_not_substantiated|TEST sanitized resolution message",
  );
  assert.equal(lines[1], "hall_of_fame.dispute.submitted|");
  assert.equal(lines[2], "hall_of_fame.dispute.review_started|");
  assert.equal(
    lines[3],
    "hall_of_fame.dispute.resolved|fraud_not_substantiated",
  );
  assert.equal(lines[4], "resolution_note|1");
  assert.deepEqual(lines.slice(5, 7), ["1", "1"]);
  assert.equal(lines[7], before.stdout.trim());

  const own = sql(String.raw`
${actorSql(actors.reporter)}
select resolution_outcome,resolution_message,resolved_at is not null
from public.get_my_hall_of_fame_dispute('${dispute}');
  `);
  assertSuccess(own);
  assert.equal(
    outputRow(own).join("|"),
    "fraud_not_substantiated|TEST sanitized resolution message|t",
  );

  const withdrawn = submit(
    actors.subject,
    "subject_objection",
    canonicals[6].id,
  );
  assertSuccess(sql(withdrawSql(actors.subject, withdrawn, 1)));
  assertError(
    sql(noteSql(actors.moderator, withdrawn, 2)),
    /HOF_DISPUTE_TERMINAL_STATE/,
  );
});

test("every no-action outcome family preserves canonical state and rejects cross-type outcomes", () => {
  const scenarios = [
    ["correction_request", actors.subject, canonicals[29], "correction_denied"],
    ["decision_appeal", actors.creator, canonicals[30], "appeal_denied"],
    [
      "decision_appeal",
      actors.creator,
      canonicals[31],
      "re_review_recommended",
    ],
    ["subject_objection", actors.subject, canonicals[32], "objection_not_upheld"],
    ["fraud_report", actors.reporter, canonicals[33], "fraud_not_substantiated"],
    ["correction_request", actors.subject, canonicals[34], "already_remediated"],
  ];
  const canonicalSnapshotSql = String.raw`
select count(*),coalesce(sum(version),0),
 count(*) filter (where validity_status='corrected'),
 count(*) filter (where validity_status='revoked')
from public.hall_of_fame_records;
select count(*) from public.hall_of_fame_record_history;
select count(*),count(*) filter (where status='active')
from public.hall_of_fame_badge_sources;
`;
  for (const [type, submitter, item, outcome] of scenarios) {
    const dispute = openForReview(type, item, submitter);
    const before = sql(canonicalSnapshotSql);
    assertSuccess(before);
    const resolved = sql(resolveSql(actors.admin, dispute, 2, outcome));
    assertSuccess(resolved);
    assert.match(resolved.stdout, new RegExp(`\\|resolved\\|3\\|${outcome}\\|`));
    const after = sql(canonicalSnapshotSql);
    assertSuccess(after);
    assert.equal(after.stdout, before.stdout);
    const state = sql(String.raw`
select status,version,resolution_outcome,resolution_canonical_record_id is null
from public.hall_of_fame_disputes where id='${dispute}';
`);
    assertSuccess(state);
    assert.equal(state.stdout.trim(), `resolved|3|${outcome}|t`);
  }

  const wrongScenarios = [
    ["correction_request", actors.subject, canonicals[43], "appeal_denied"],
    ["decision_appeal", actors.creator, canonicals[44], "fraud_not_substantiated"],
    ["subject_objection", actors.subject, canonicals[45], "correction_denied"],
    ["fraud_report", actors.reporter, canonicals[46], "objection_not_upheld"],
  ];
  for (const [type, submitter, item, outcome] of wrongScenarios) {
    const dispute = openForReview(type, item, submitter);
    const requestId = randomUUID();
    assertError(
      sql(resolveSql(actors.admin, dispute, 2, outcome, requestId)),
      /HOF_DISPUTE_RESOLUTION_OUTCOME_INVALID/,
    );
    const state = sql(String.raw`
select status,version,resolution_outcome is null
from public.hall_of_fame_disputes where id='${dispute}';
select count(*) from private.hall_of_fame_mutation_requests
where request_id='${requestId}';
`);
    assertSuccess(state);
    assert.deepEqual(state.stdout.trim().split(/\r?\n/), [
      "under_review|2|t",
      "0",
    ]);
    assertSuccess(sql(withdrawSql(submitter, dispute, 2)));
  }
});

test("correction orchestration supports exact types with private child correlation and rollback", () => {
  const scenarios = [
    ["correction_request", actors.subject, "correction_applied", 7],
    [
      "subject_objection",
      actors.subject,
      "objection_upheld_correction_applied",
      8,
    ],
    [
      "fraud_report",
      actors.reporter,
      "fraud_substantiated_correction_applied",
      9,
    ],
  ];

  for (const [type, submitter, outcome, index] of scenarios) {
    const item = canonicals[index];
    const statement = `REPORTER_OR_SUBMITTER_STATEMENT_MARKER_${index}`;
    const verifiedReason = `VERIFIED_CANONICAL_CORRECTION_REASON_MARKER_${index}`;
    const dispute = openForReview(
      type,
      item,
      submitter,
      actors.moderator,
      statement,
    );
    const requestId = randomUUID();
    const corrected = sql(
      correctionSql(actors.admin, dispute, 2, item, requestId, {
        reason: verifiedReason,
      }),
    );
    assertSuccess(corrected);
    const row = outputRow(corrected);
    assert.equal(row[3], "resolved");
    assert.equal(row[4], "3");
    assert.equal(row[5], outcome);
    assert.equal(row[8], "t");
    assert.equal(row[9], "f");
    const successor = row[6];

    const state = sql(String.raw`
select validity_status,publication_status,version
from public.hall_of_fame_records where id='${item.id}';
select id='${successor}',validity_status,publication_status,version,
 corrected_from_record_id='${item.id}'
from public.hall_of_fame_records where corrected_from_record_id='${item.id}';
select status,version,resolution_outcome,resolution_canonical_record_id='${successor}'
from public.hall_of_fame_disputes where id='${dispute}';
select metadata->>'child_request_id' <> '${requestId}',
 metadata->>'canonical_operation'
from public.audit_logs where request_id='${requestId}';
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${actors.admin}' and request_id='${requestId}'
 and result_payload->>'child_request_id' is not null;
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${actors.admin}'
 and request_id=(select (metadata->>'child_request_id')::uuid
  from public.audit_logs where request_id='${requestId}');
select count(*) from public.hall_of_fame_record_history
where record_id in ('${item.id}','${successor}')
 and actor_user_id='${actors.admin}';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${item.id}' and status='active';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${successor}' and status='active';
select statement=${quote(statement)}
from public.hall_of_fame_disputes where id='${dispute}';
select count(*) from public.hall_of_fame_record_history
where record_id in ('${item.id}','${successor}') and reason=${quote(verifiedReason)};
select count(*) from public.hall_of_fame_record_history
where record_id in ('${item.id}','${successor}') and reason=${quote(statement)};
`);
    assertSuccess(state);
    assert.deepEqual(state.stdout.trim().split(/\r?\n/), [
      "corrected|suppressed|2",
      "t|active|hidden|1|t",
      `resolved|3|${outcome}|t`,
      "t|hall_of_fame.record.correct",
      "1",
      "1",
      "3",
      "0",
      "2",
      "t",
      "2",
      "0",
    ]);

    const replayStateSql = String.raw`
select validity_status,publication_status,version
from public.hall_of_fame_records where id='${item.id}';
select count(*) from public.hall_of_fame_records
where corrected_from_record_id='${item.id}';
select count(*) from public.hall_of_fame_badge_sources
where record_id in ('${item.id}','${successor}');
select count(*) from public.hall_of_fame_record_history
where record_id in ('${item.id}','${successor}');
select count(*) from public.audit_logs
where target_id in ('${item.id}','${successor}')
 and action like 'hall_of_fame.record.%';
select status,version from public.hall_of_fame_disputes where id='${dispute}';
select count(*) from public.hall_of_fame_dispute_history
where dispute_id='${dispute}' and action='hall_of_fame.dispute.resolved';
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${dispute}' and review_kind='resolution_note';
select count(*) from public.audit_logs where request_id='${requestId}';
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${actors.admin}'
 and request_id in (
  '${requestId}',
  (select (metadata->>'child_request_id')::uuid
   from public.audit_logs where request_id='${requestId}')
 );
`;
    const beforeReplay = sql(replayStateSql);
    assertSuccess(beforeReplay);
    const replay = sql(
      correctionSql(actors.admin, dispute, 2, item, requestId, {
        reason: verifiedReason,
      }),
    );
    assertSuccess(replay);
    assert.match(replay.stdout, /\|t\s*$/m);
    const afterReplay = sql(replayStateSql);
    assertSuccess(afterReplay);
    assert.equal(afterReplay.stdout, beforeReplay.stdout);
    const replayWithoutPermission = sql(
      String.raw`
begin;
set session_replication_role = replica;
delete from public.platform_role_permissions
where platform_role='platform_admin'
 and permission_code='hall_of_fame.records.correct';
set session_replication_role = origin;
${correctionSql(actors.admin, dispute, 2, item, requestId, {
  reason: verifiedReason,
})}
rollback;
`,
      "postgres",
    );
    assertSuccess(replayWithoutPermission);
    assert.match(replayWithoutPermission.stdout, /\|t\s*$/m);
  }

  const appeal = openForReview(
    "decision_appeal",
    canonicals[10],
    actors.creator,
  );
  assertError(
    sql(correctionSql(actors.admin, appeal, 2, canonicals[10])),
    /HOF_DISPUTE_CANONICAL_TARGET_INVALID/,
  );
  const binding = openForReview(
    "correction_request",
    canonicals[10],
    actors.subject,
  );
  assertError(
    sql(
      correctionSql(actors.admin, binding, 2, canonicals[10], randomUUID(), {
        recordId: canonicals[11].id,
      }),
    ),
    /HOF_DISPUTE_CANONICAL_TARGET_INVALID/,
  );
  assertError(
    sql(
      correctionSql(actors.admin, binding, 2, canonicals[10], randomUUID(), {
        recordVersion: 2,
      }),
    ),
    /HOF_STALE_RECORD_VERSION/,
  );
  assertError(
    sql(
      correctionSql(actors.admin, binding, 2, canonicals[10], randomUUID(), {
        original: true,
      }),
    ),
    /HOF_CORRECTION_NO_FACTUAL_CHANGE/,
  );
  const limitedCorrection = sql(
    String.raw`
begin;
set session_replication_role = replica;
insert into public.platform_role_permissions(platform_role,permission_code)
values('platform_moderator','hall_of_fame.disputes.resolve');
set session_replication_role = origin;
${correctionSql(actors.moderator, binding, 2, canonicals[10])}
commit;
`,
    "postgres",
  );
  assertError(limitedCorrection, /HOF_REVIEW_NOT_AUTHORIZED/);
  const adminWithoutCorrection = sql(
    String.raw`
begin;
set session_replication_role = replica;
delete from public.platform_role_permissions
where platform_role='platform_admin'
 and permission_code='hall_of_fame.records.correct';
set session_replication_role = origin;
${correctionSql(actors.admin, binding, 2, canonicals[10])}
commit;
`,
    "postgres",
  );
  assertError(adminWithoutCorrection, /HOF_REVIEW_NOT_AUTHORIZED/);
  const rollback = sql(String.raw`
select status,version from public.hall_of_fame_disputes where id='${binding}';
select count(*) from public.hall_of_fame_dispute_history
where dispute_id='${binding}' and action='hall_of_fame.dispute.resolved';
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${binding}' and review_kind='resolution_note';
`);
  assertSuccess(rollback);
  assert.deepEqual(rollback.stdout.trim().split(/\r?\n/), [
    "under_review|2",
    "0",
    "0",
  ]);
  assertSuccess(sql(withdrawSql(actors.creator, appeal, 2)));
});

test("revoke orchestration supports objection and fraud only, with replay and terminal suppression", () => {
  const scenarios = [
    [
      "subject_objection",
      actors.subject,
      "objection_upheld_revoke_applied",
      12,
    ],
    [
      "fraud_report",
      actors.reporter,
      "fraud_substantiated_revoke_applied",
      13,
    ],
  ];
  for (const [type, submitter, outcome, index] of scenarios) {
    const item = canonicals[index];
    const statement = `REPORTER_ALLEGATION_STATEMENT_MARKER_${index}`;
    const verifiedReason = `VERIFIED_CANONICAL_REVOKE_REASON_MARKER_${index}`;
    const dispute = openForReview(
      type,
      item,
      submitter,
      actors.moderator,
      statement,
    );
    const requestId = randomUUID();
    const revoked = sql(
      revokeSql(actors.admin, dispute, 2, item, requestId, {
        reason: verifiedReason,
      }),
    );
    assertSuccess(revoked);
    const row = outputRow(revoked);
    assert.deepEqual(row.slice(3, 7), ["resolved", "3", outcome, item.id]);
    const state = sql(String.raw`
select validity_status,publication_status,version
from public.hall_of_fame_records where id='${item.id}';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${item.id}' and status='active';
select status,version,resolution_outcome,resolution_canonical_record_id='${item.id}'
from public.hall_of_fame_disputes where id='${dispute}';
select metadata->>'child_request_id' <> '${requestId}',
 metadata->>'canonical_operation'
from public.audit_logs where request_id='${requestId}';
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${actors.admin}'
 and request_id=(select (metadata->>'child_request_id')::uuid
  from public.audit_logs where request_id='${requestId}');
select revocation_reason=${quote(verifiedReason)}
from public.hall_of_fame_records where id='${item.id}';
select count(*) from public.hall_of_fame_record_history
where record_id='${item.id}' and reason=${quote(verifiedReason)};
select count(*) from public.hall_of_fame_record_history
where record_id='${item.id}' and reason=${quote(statement)};
`);
    assertSuccess(state);
    assert.deepEqual(state.stdout.trim().split(/\r?\n/), [
      "revoked|suppressed|2",
      "0",
      `resolved|3|${outcome}|t`,
      "t|hall_of_fame.record.revoke",
      "1",
      "t",
      "1",
      "0",
    ]);
    const replayStateSql = String.raw`
select validity_status,publication_status,version,revocation_reason
from public.hall_of_fame_records where id='${item.id}';
select count(*) from public.hall_of_fame_badge_sources where record_id='${item.id}';
select count(*) from public.hall_of_fame_record_history where record_id='${item.id}';
select count(*) from public.audit_logs
where target_id='${item.id}' and action='hall_of_fame.record.revoke';
select status,version from public.hall_of_fame_disputes where id='${dispute}';
select count(*) from public.hall_of_fame_dispute_history
where dispute_id='${dispute}' and action='hall_of_fame.dispute.resolved';
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${dispute}' and review_kind='resolution_note';
select count(*) from public.audit_logs where request_id='${requestId}';
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${actors.admin}'
 and request_id in (
  '${requestId}',
  (select (metadata->>'child_request_id')::uuid
   from public.audit_logs where request_id='${requestId}')
 );
`;
    const beforeReplay = sql(replayStateSql);
    assertSuccess(beforeReplay);
    const replay = sql(
      revokeSql(actors.admin, dispute, 2, item, requestId, {
        reason: verifiedReason,
      }),
    );
    assertSuccess(replay);
    assert.match(replay.stdout, /\|t\s*$/m);
    const afterReplay = sql(replayStateSql);
    assertSuccess(afterReplay);
    assert.equal(afterReplay.stdout, beforeReplay.stdout);
    const replayWithoutPermission = sql(
      String.raw`
begin;
set session_replication_role = replica;
delete from public.platform_role_permissions
where platform_role='platform_admin'
 and permission_code='hall_of_fame.records.revoke';
set session_replication_role = origin;
${revokeSql(actors.admin, dispute, 2, item, requestId, {
  reason: verifiedReason,
})}
rollback;
`,
      "postgres",
    );
    assertSuccess(replayWithoutPermission);
    assert.match(replayWithoutPermission.stdout, /\|t\s*$/m);
  }

  const correctionRequest = openForReview(
    "correction_request",
    canonicals[14],
    actors.subject,
  );
  assertError(
    sql(revokeSql(actors.admin, correctionRequest, 2, canonicals[14])),
    /HOF_DISPUTE_CANONICAL_TARGET_INVALID/,
  );
  const appeal = openForReview(
    "decision_appeal",
    canonicals[15],
    actors.creator,
  );
  assertError(
    sql(revokeSql(actors.admin, appeal, 2, canonicals[15])),
    /HOF_DISPUTE_CANONICAL_TARGET_INVALID/,
  );

  const limitedTarget = canonicals[11];
  const limitedDispute = openForReview(
    "subject_objection",
    limitedTarget,
    actors.subject,
  );
  const limitedRevoke = sql(
    String.raw`
begin;
set session_replication_role = replica;
insert into public.platform_role_permissions(platform_role,permission_code)
values('platform_moderator','hall_of_fame.disputes.resolve');
set session_replication_role = origin;
${revokeSql(actors.moderator, limitedDispute, 2, limitedTarget)}
commit;
`,
    "postgres",
  );
  assertError(limitedRevoke, /HOF_REVIEW_NOT_AUTHORIZED/);
  const adminWithoutRevoke = sql(
    String.raw`
begin;
set session_replication_role = replica;
delete from public.platform_role_permissions
where platform_role='platform_admin'
 and permission_code='hall_of_fame.records.revoke';
set session_replication_role = origin;
${revokeSql(actors.admin, limitedDispute, 2, limitedTarget)}
commit;
`,
    "postgres",
  );
  assertError(adminWithoutRevoke, /HOF_REVIEW_NOT_AUTHORIZED/);
  assertError(
    sql(
      revokeSql(actors.admin, limitedDispute, 2, limitedTarget, randomUUID(), {
        recordId: canonicals[10].id,
      }),
    ),
    /HOF_DISPUTE_CANONICAL_TARGET_INVALID/,
  );
});

test("outer failure after inner correction or revoke rolls back every durable effect", () => {
  const correctionItem = canonicals[27];
  const revokeItem = canonicals[28];
  const correctionDispute = openForReview(
    "correction_request",
    correctionItem,
    actors.subject,
  );
  const revokeDispute = openForReview(
    "subject_objection",
    revokeItem,
    actors.subject,
  );
  const correctionRequest = randomUUID();
  const revokeRequest = randomUUID();
  const install = sql(
    String.raw`
create function private.test_fail_hof_dispute_resolution_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'TEST_OUTER_AFTER_INNER_FAILURE';
end;
$$;
create trigger zz_test_fail_hof_dispute_resolution_review
before insert on public.hall_of_fame_dispute_reviews
for each row
when (new.review_kind = 'resolution_note')
execute function private.test_fail_hof_dispute_resolution_review();
`,
    "postgres",
  );
  assertSuccess(install);

  const snapshotSql = (item, dispute, outerOperation, innerOperation) =>
    String.raw`
select validity_status,publication_status,version,revoked_at is null,
 revocation_reason is null
from public.hall_of_fame_records where id='${item.id}';
select count(*) from public.hall_of_fame_records
where corrected_from_record_id='${item.id}';
select count(*),count(*) filter (where status='active')
from public.hall_of_fame_badge_sources where record_id='${item.id}';
select count(*) from public.hall_of_fame_record_history where record_id='${item.id}';
select count(*) from public.audit_logs
where target_id in ('${item.id}','${dispute}');
select count(*) from private.hall_of_fame_mutation_requests
where actor_user_id='${actors.admin}'
 and operation in ('${outerOperation}','${innerOperation}');
select status,version,resolution_outcome is null,resolved_at is null,
 resolution_canonical_record_id is null
from public.hall_of_fame_disputes where id='${dispute}';
select count(*) from public.hall_of_fame_dispute_history
where dispute_id='${dispute}' and action='hall_of_fame.dispute.resolved';
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${dispute}' and review_kind='resolution_note';
`;

  try {
    const correctionSnapshot = snapshotSql(
      correctionItem,
      correctionDispute,
      "hall_of_fame.dispute.resolve.correction",
      "hall_of_fame.record.correct",
    );
    const beforeCorrection = sql(correctionSnapshot);
    assertSuccess(beforeCorrection);
    assertError(
      sql(
        correctionSql(
          actors.admin,
          correctionDispute,
          2,
          correctionItem,
          correctionRequest,
        ),
      ),
      /TEST_OUTER_AFTER_INNER_FAILURE/,
    );
    const afterCorrection = sql(correctionSnapshot);
    assertSuccess(afterCorrection);
    assert.equal(afterCorrection.stdout, beforeCorrection.stdout);
    const correctionLedger = sql(String.raw`
select count(*) from private.hall_of_fame_mutation_requests
where request_id='${correctionRequest}';
`);
    assertSuccess(correctionLedger);
    assert.equal(correctionLedger.stdout.trim(), "0");

    const revokeSnapshot = snapshotSql(
      revokeItem,
      revokeDispute,
      "hall_of_fame.dispute.resolve.revoke",
      "hall_of_fame.record.revoke",
    );
    const beforeRevoke = sql(revokeSnapshot);
    assertSuccess(beforeRevoke);
    assertError(
      sql(
        revokeSql(
          actors.admin,
          revokeDispute,
          2,
          revokeItem,
          revokeRequest,
        ),
      ),
      /TEST_OUTER_AFTER_INNER_FAILURE/,
    );
    const afterRevoke = sql(revokeSnapshot);
    assertSuccess(afterRevoke);
    assert.equal(afterRevoke.stdout, beforeRevoke.stdout);
    const revokeLedger = sql(String.raw`
select count(*) from private.hall_of_fame_mutation_requests
where request_id='${revokeRequest}';
`);
    assertSuccess(revokeLedger);
    assert.equal(revokeLedger.stdout.trim(), "0");
  } finally {
    const cleanup = sql(
      String.raw`
drop trigger if exists zz_test_fail_hof_dispute_resolution_review
on public.hall_of_fame_dispute_reviews;
drop function if exists private.test_fail_hof_dispute_resolution_review();
`,
      "postgres",
    );
    assertSuccess(cleanup);
  }

  const noTestObjects = sql(String.raw`
select count(*) from pg_catalog.pg_trigger
where tgname='zz_test_fail_hof_dispute_resolution_review' and not tgisinternal;
select count(*) from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace on namespace.oid=procedure.pronamespace
where namespace.nspname='private'
 and procedure.proname='test_fail_hof_dispute_resolution_review';
`);
  assertSuccess(noTestObjects);
  assert.deepEqual(noTestObjects.stdout.trim().split(/\r?\n/), ["0", "0"]);
});

test("seven independent races converge without partial dispute or canonical state", async () => {
  const raceResults = [];
  const requestIds = Object.fromEntries(
    [
      "withdrawStartWithdraw",
      "withdrawStartReview",
      "withdrawGenericWithdraw",
      "withdrawGenericResolve",
      "withdrawCorrectionWithdraw",
      "withdrawCorrectionResolve",
      "withdrawRevokeWithdraw",
      "withdrawRevokeResolve",
      "correctionRaceCorrect",
      "correctionRaceRevoke",
      "duplicateGenericLeft",
      "duplicateGenericRight",
      "noteRaceNote",
      "noteRaceResolve",
    ].map((name) => [name, randomUUID()]),
  );

  const withdrawStart = submit(
    actors.subject,
    "subject_objection",
    canonicals[16].id,
  );
  raceResults.push(
    await Promise.all([
      sqlAsync(
        withdrawSql(
          actors.subject,
          withdrawStart,
          1,
          requestIds.withdrawStartWithdraw,
        ),
      ),
      sqlAsync(
        startSql(
          actors.moderator,
          withdrawStart,
          1,
          requestIds.withdrawStartReview,
        ),
      ),
    ]),
  );

  const withdrawGeneric = openForReview(
    "subject_objection",
    canonicals[17],
    actors.subject,
  );
  raceResults.push(
    await Promise.all([
      sqlAsync(
        withdrawSql(
          actors.subject,
          withdrawGeneric,
          2,
          requestIds.withdrawGenericWithdraw,
        ),
      ),
      sqlAsync(
        resolveSql(
          actors.admin,
          withdrawGeneric,
          2,
          "objection_not_upheld",
          requestIds.withdrawGenericResolve,
        ),
      ),
    ]),
  );

  const withdrawCorrection = openForReview(
    "correction_request",
    canonicals[18],
    actors.subject,
  );
  raceResults.push(
    await Promise.all([
      sqlAsync(
        withdrawSql(
          actors.subject,
          withdrawCorrection,
          2,
          requestIds.withdrawCorrectionWithdraw,
        ),
      ),
      sqlAsync(
        correctionSql(
          actors.admin,
          withdrawCorrection,
          2,
          canonicals[18],
          requestIds.withdrawCorrectionResolve,
        ),
      ),
    ]),
  );

  const withdrawRevoke = openForReview(
    "subject_objection",
    canonicals[19],
    actors.subject,
  );
  raceResults.push(
    await Promise.all([
      sqlAsync(
        withdrawSql(
          actors.subject,
          withdrawRevoke,
          2,
          requestIds.withdrawRevokeWithdraw,
        ),
      ),
      sqlAsync(
        revokeSql(
          actors.admin,
          withdrawRevoke,
          2,
          canonicals[19],
          requestIds.withdrawRevokeResolve,
        ),
      ),
    ]),
  );

  const correctionRevoke = openForReview(
    "subject_objection",
    canonicals[20],
    actors.subject,
  );
  raceResults.push(
    await Promise.all([
      sqlAsync(
        correctionSql(
          actors.admin,
          correctionRevoke,
          2,
          canonicals[20],
          requestIds.correctionRaceCorrect,
        ),
      ),
      sqlAsync(
        revokeSql(
          actors.admin,
          correctionRevoke,
          2,
          canonicals[20],
          requestIds.correctionRaceRevoke,
        ),
      ),
    ]),
  );

  const duplicateGeneric = openForReview(
    "fraud_report",
    canonicals[21],
    actors.reporter,
  );
  raceResults.push(
    await Promise.all([
      sqlAsync(
        resolveSql(
          actors.admin,
          duplicateGeneric,
          2,
          "fraud_not_substantiated",
          requestIds.duplicateGenericLeft,
        ),
      ),
      sqlAsync(
        resolveSql(
          actors.admin,
          duplicateGeneric,
          2,
          "fraud_not_substantiated",
          requestIds.duplicateGenericRight,
        ),
      ),
    ]),
  );

  const noteResolution = openForReview(
    "fraud_report",
    canonicals[22],
    actors.reporter,
  );
  raceResults.push(
    await Promise.all([
      sqlAsync(
        noteSql(
          actors.moderator,
          noteResolution,
          2,
          requestIds.noteRaceNote,
        ),
      ),
      sqlAsync(
        resolveSql(
          actors.admin,
          noteResolution,
          2,
          "fraud_not_substantiated",
          requestIds.noteRaceResolve,
        ),
      ),
    ]),
  );

  for (const pair of raceResults.slice(0, 6)) {
    assert.equal(pair.filter((item) => item.status === 0).length, 1);
  }
  assert.equal(raceResults[6][1].status, 0, raceResults[6][1].stderr);
  assert.ok(
    raceResults[6][0].status === 0 ||
      /HOF_DISPUTE_TERMINAL_STATE|HOF_STALE_DISPUTE_VERSION/.test(
        raceResults[6][0].stderr,
      ),
  );

  const state = sql(String.raw`
select id,status,version from public.hall_of_fame_disputes
where id in (
 '${withdrawStart}','${withdrawGeneric}','${withdrawCorrection}',
 '${withdrawRevoke}','${correctionRevoke}','${duplicateGeneric}',
 '${noteResolution}'
) order by id;
select count(*) from public.hall_of_fame_disputes
where id in (
 '${withdrawStart}','${withdrawGeneric}','${withdrawCorrection}',
 '${withdrawRevoke}','${correctionRevoke}','${duplicateGeneric}',
 '${noteResolution}'
) and status not in ('under_review','resolved','withdrawn');
select count(*) from public.hall_of_fame_dispute_history as history
join public.hall_of_fame_disputes as dispute on dispute.id=history.dispute_id
where dispute.id in (
 '${withdrawStart}','${withdrawGeneric}','${withdrawCorrection}',
 '${withdrawRevoke}','${correctionRevoke}','${duplicateGeneric}',
 '${noteResolution}'
) and history.version > dispute.version;
select count(*) from public.hall_of_fame_records
where corrected_from_record_id in ('${canonicals[18].id}','${canonicals[20].id}')
 and validity_status='active';
select count(*) from public.hall_of_fame_records
where id in ('${canonicals[19].id}','${canonicals[20].id}')
 and validity_status='revoked';
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${duplicateGeneric}' and review_kind='resolution_note';
select count(*) from public.audit_logs
where target_id='${duplicateGeneric}' and action='hall_of_fame.dispute.resolve';
`);
  assertSuccess(state);
  const lines = state.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 13);
  for (const line of lines.slice(0, 7)) {
    assert.match(line, /^[0-9a-f-]+\|(under_review|resolved|withdrawn)\|[23]$/);
  }
  assert.deepEqual(lines.slice(7, 9), ["0", "0"]);
  assert.ok(Number(lines[9]) <= 2);
  assert.ok(Number(lines[10]) <= 2);
  assert.deepEqual(lines.slice(11), ["1", "1"]);

  const withdrawStartState = sql(String.raw`
select status,version,review_started_at is not null,withdrawn_at is not null
from public.hall_of_fame_disputes where id='${withdrawStart}';
select count(*) filter (where action='hall_of_fame.dispute.withdrawn'),
 count(*) filter (where action='hall_of_fame.dispute.review_started')
from public.hall_of_fame_dispute_history where dispute_id='${withdrawStart}';
select count(*) from public.audit_logs
where request_id in ('${requestIds.withdrawStartWithdraw}','${requestIds.withdrawStartReview}');
select count(*) from private.hall_of_fame_mutation_requests
where request_id in ('${requestIds.withdrawStartWithdraw}','${requestIds.withdrawStartReview}');
select validity_status,publication_status,version
from public.hall_of_fame_records where id='${canonicals[16].id}';
`);
  assertSuccess(withdrawStartState);
  assert.deepEqual(
    withdrawStartState.stdout.trim().split(/\r?\n/),
    raceResults[0][0].status === 0
      ? ["withdrawn|2|f|t", "1|0", "1", "1", "active|hidden|1"]
      : ["under_review|2|t|f", "0|1", "1", "1", "active|hidden|1"],
  );

  const withdrawGenericState = sql(String.raw`
select status,version,withdrawn_at is null,coalesce(resolution_outcome,''),
 resolution_message is null
from public.hall_of_fame_disputes where id='${withdrawGeneric}';
select count(*) filter (where action='hall_of_fame.dispute.withdrawn'),
 count(*) filter (where action='hall_of_fame.dispute.resolved')
from public.hall_of_fame_dispute_history where dispute_id='${withdrawGeneric}';
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${withdrawGeneric}' and review_kind='resolution_note';
select count(*) from public.audit_logs
where request_id in ('${requestIds.withdrawGenericWithdraw}','${requestIds.withdrawGenericResolve}');
select count(*) from private.hall_of_fame_mutation_requests
where request_id in ('${requestIds.withdrawGenericWithdraw}','${requestIds.withdrawGenericResolve}');
select validity_status,publication_status,version
from public.hall_of_fame_records where id='${canonicals[17].id}';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${canonicals[17].id}' and status='active';
`);
  assertSuccess(withdrawGenericState);
  assert.deepEqual(
    withdrawGenericState.stdout.trim().split(/\r?\n/),
    raceResults[1][0].status === 0
      ? ["withdrawn|3|f||t", "1|0", "0", "1", "1", "active|hidden|1", "2"]
      : [
          "resolved|3|t|objection_not_upheld|f",
          "0|1",
          "1",
          "1",
          "1",
          "active|hidden|1",
          "2",
        ],
  );

  const withdrawCorrectionState = sql(String.raw`
select status,version,coalesce(resolution_outcome,'')
from public.hall_of_fame_disputes where id='${withdrawCorrection}';
select validity_status,publication_status,version
from public.hall_of_fame_records where id='${canonicals[18].id}';
select count(*) from public.hall_of_fame_records
where corrected_from_record_id='${canonicals[18].id}';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${canonicals[18].id}' and status='active';
select count(*) from public.hall_of_fame_badge_sources
where record_id in (select id from public.hall_of_fame_records
 where corrected_from_record_id='${canonicals[18].id}') and status='active';
select count(*) filter (where action='hall_of_fame.dispute.withdrawn'),
 count(*) filter (where action='hall_of_fame.dispute.resolved')
from public.hall_of_fame_dispute_history where dispute_id='${withdrawCorrection}';
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${withdrawCorrection}' and review_kind='resolution_note';
select count(*) from public.audit_logs
where request_id in ('${requestIds.withdrawCorrectionWithdraw}','${requestIds.withdrawCorrectionResolve}');
select count(*) from private.hall_of_fame_mutation_requests
where request_id in ('${requestIds.withdrawCorrectionWithdraw}','${requestIds.withdrawCorrectionResolve}');
`);
  assertSuccess(withdrawCorrectionState);
  assert.deepEqual(
    withdrawCorrectionState.stdout.trim().split(/\r?\n/),
    raceResults[2][0].status === 0
      ? ["withdrawn|3|", "active|hidden|1", "0", "2", "0", "1|0", "0", "1", "1"]
      : [
          "resolved|3|correction_applied",
          "corrected|suppressed|2",
          "1",
          "0",
          "2",
          "0|1",
          "1",
          "1",
          "1",
        ],
  );

  const withdrawRevokeState = sql(String.raw`
select status,version,coalesce(resolution_outcome,'')
from public.hall_of_fame_disputes where id='${withdrawRevoke}';
select validity_status,publication_status,version,revocation_reason is null
from public.hall_of_fame_records where id='${canonicals[19].id}';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${canonicals[19].id}' and status='active';
select count(*) filter (where action='hall_of_fame.dispute.withdrawn'),
 count(*) filter (where action='hall_of_fame.dispute.resolved')
from public.hall_of_fame_dispute_history where dispute_id='${withdrawRevoke}';
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${withdrawRevoke}' and review_kind='resolution_note';
select count(*) from public.audit_logs
where request_id in ('${requestIds.withdrawRevokeWithdraw}','${requestIds.withdrawRevokeResolve}');
select count(*) from private.hall_of_fame_mutation_requests
where request_id in ('${requestIds.withdrawRevokeWithdraw}','${requestIds.withdrawRevokeResolve}');
`);
  assertSuccess(withdrawRevokeState);
  assert.deepEqual(
    withdrawRevokeState.stdout.trim().split(/\r?\n/),
    raceResults[3][0].status === 0
      ? ["withdrawn|3|", "active|hidden|1|t", "2", "1|0", "0", "1", "1"]
      : [
          "resolved|3|objection_upheld_revoke_applied",
          "revoked|suppressed|2|f",
          "0",
          "0|1",
          "1",
          "1",
          "1",
        ],
  );

  const correctionRevokeState = sql(String.raw`
select status,version,resolution_outcome
from public.hall_of_fame_disputes where id='${correctionRevoke}';
select validity_status,publication_status,version,revocation_reason is null
from public.hall_of_fame_records where id='${canonicals[20].id}';
select count(*) from public.hall_of_fame_records
where corrected_from_record_id='${canonicals[20].id}';
select count(*) from public.hall_of_fame_badge_sources
where record_id='${canonicals[20].id}' and status='active';
select count(*) from public.hall_of_fame_badge_sources
where record_id in (select id from public.hall_of_fame_records
 where corrected_from_record_id='${canonicals[20].id}') and status='active';
select count(*) from public.hall_of_fame_dispute_history
where dispute_id='${correctionRevoke}' and action='hall_of_fame.dispute.resolved';
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${correctionRevoke}' and review_kind='resolution_note';
select count(*) from public.audit_logs
where request_id in ('${requestIds.correctionRaceCorrect}','${requestIds.correctionRaceRevoke}');
select count(*) from private.hall_of_fame_mutation_requests
where request_id in ('${requestIds.correctionRaceCorrect}','${requestIds.correctionRaceRevoke}');
`);
  assertSuccess(correctionRevokeState);
  assert.deepEqual(
    correctionRevokeState.stdout.trim().split(/\r?\n/),
    raceResults[4][0].status === 0
      ? [
          "resolved|3|objection_upheld_correction_applied",
          "corrected|suppressed|2|t",
          "1",
          "0",
          "2",
          "1",
          "1",
          "1",
          "1",
        ]
      : [
          "resolved|3|objection_upheld_revoke_applied",
          "revoked|suppressed|2|f",
          "0",
          "0",
          "0",
          "1",
          "1",
          "1",
          "1",
        ],
  );

  const duplicateGenericState = sql(String.raw`
select status,version,resolution_outcome,resolution_message
from public.hall_of_fame_disputes where id='${duplicateGeneric}';
select count(*) from public.hall_of_fame_dispute_history
where dispute_id='${duplicateGeneric}' and action='hall_of_fame.dispute.resolved';
select count(*) from public.hall_of_fame_dispute_reviews
where dispute_id='${duplicateGeneric}' and review_kind='resolution_note';
select count(*) from public.audit_logs
where request_id in ('${requestIds.duplicateGenericLeft}','${requestIds.duplicateGenericRight}');
select count(*) from private.hall_of_fame_mutation_requests
where request_id in ('${requestIds.duplicateGenericLeft}','${requestIds.duplicateGenericRight}');
select validity_status,publication_status,version
from public.hall_of_fame_records where id='${canonicals[21].id}';
`);
  assertSuccess(duplicateGenericState);
  assert.deepEqual(duplicateGenericState.stdout.trim().split(/\r?\n/), [
    "resolved|3|fraud_not_substantiated|TEST sanitized resolution message",
    "1",
    "1",
    "1",
    "1",
    "active|hidden|1",
  ]);

  const noteSucceeded = raceResults[6][0].status === 0;
  const noteResolutionState = sql(String.raw`
select status,version,resolution_outcome
from public.hall_of_fame_disputes where id='${noteResolution}';
select count(*) filter (where review_kind='internal_note'),
 count(*) filter (where review_kind='resolution_note')
from public.hall_of_fame_dispute_reviews where dispute_id='${noteResolution}';
select count(*) from public.hall_of_fame_dispute_history
where dispute_id='${noteResolution}' and action='hall_of_fame.dispute.resolved';
select count(*) from public.audit_logs
where request_id in ('${requestIds.noteRaceNote}','${requestIds.noteRaceResolve}');
select count(*) from private.hall_of_fame_mutation_requests
where request_id in ('${requestIds.noteRaceNote}','${requestIds.noteRaceResolve}');
select validity_status,publication_status,version
from public.hall_of_fame_records where id='${canonicals[22].id}';
`);
  assertSuccess(noteResolutionState);
  assert.deepEqual(noteResolutionState.stdout.trim().split(/\r?\n/), [
    "resolved|3|fraud_not_substantiated",
    `${noteSucceeded ? 1 : 0}|1`,
    "1",
    noteSucceeded ? "2" : "1",
    noteSucceeded ? "2" : "1",
    "active|hidden|1",
  ]);
});

test("authenticated direct mutation of dispute, history, and review tables remains blocked", () => {
  const dispute = submit(
    actors.reporter,
    "fraud_report",
    canonicals[23].id,
  );
  for (const statement of [
    `update public.hall_of_fame_disputes set status='resolved' where id='${dispute}';`,
    `delete from public.hall_of_fame_dispute_history where dispute_id='${dispute}';`,
    `insert into public.hall_of_fame_dispute_reviews(dispute_id,review_kind,note,actor_user_id,request_id) values('${dispute}','internal_note','FORGED','${actors.moderator}','${randomUUID()}');`,
  ]) {
    const result = sql(`${actorSql(actors.moderator)}\n${statement}`);
    assertError(result, /permission denied|row-level security|HOF_/i);
  }
});
