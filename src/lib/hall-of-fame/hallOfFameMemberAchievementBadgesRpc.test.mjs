import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
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
  "20260813000100_pul_hall_of_fame_badge_publication_projection_rpc.sql",
  "20260813000200_pul_hall_of_fame_canonical_correction_revoke_rpc.sql",
  "20260815000100_pul_hall_of_fame_dispute_intake_foundation.sql",
  "20260815000200_pul_hall_of_fame_dispute_review_resolution_rpc.sql",
  "20260816000100_pul_hall_of_fame_member_own_read_contract.sql",
  "20260818000100_pul_hall_of_fame_dispute_resolution_context_rpc.sql",
  "20260819000100_pul_hall_of_fame_public_ranking_read_contract.sql",
];

const precedingMigrations = precedingMigrationNames.map((filename) =>
  readFileSync(
    fileURLToPath(new URL(`../../../supabase/migrations/${filename}`, import.meta.url)),
    "utf8",
  ),
);
const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260820000100_pul_hall_of_fame_member_achievement_badge_read_contract.sql",
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

function actorSql(actorId, query, role = "authenticated") {
  return String.raw`
set role ${role};
select pg_catalog.set_config('request.jwt.claim.sub','${actorId}',false);
select pg_catalog.set_config('request.jwt.claim.role','${role}',false);
${query}
`;
}

function values() {
  const users = {
    operator: randomUUID(),
    first: randomUUID(),
    second: randomUUID(),
    outsider: randomUUID(),
  };
  const clubs = { managed: randomUUID(), other: randomUUID() };
  const memberships = {
    operator: randomUUID(),
    first: randomUUID(),
    second: randomUUID(),
    outsider: randomUUID(),
  };
  const records = [
    ["first", "hole_in_one", "published", "active", true, "active"],
    ["first", "hole_in_one", "published", "active", true, "active"],
    ["first", "albatross", "published", "active", true, "active"],
    ["first", "condor", "published", "active", false, "active"],
    ["second", "hole_in_one", "published", "active", true, "inactive"],
    ["second", "albatross", "suppressed", "active", true, "active"],
    ["second", "condor", "suppressed", "revoked", true, "active"],
  ].map((entry, index) => ({
    subject: entry[0],
    type: entry[1],
    publication: entry[2],
    validity: entry[3],
    badgeConsent: entry[4],
    sourceStatus: entry[5],
    batch: randomUUID(),
    round: randomUUID(),
    applicationRecord: randomUUID(),
    canonical: randomUUID(),
    fingerprint: (index + 1).toString(16).padStart(2, "0").repeat(32),
  }));
  return { users, clubs, memberships, records };
}

function fixtureSql(value) {
  const authUsers = Object.values(value.users)
    .map(
      (id) =>
        `('${id}','00000000-0000-0000-0000-000000000000','authenticated',` +
        `'authenticated','hof-member-achievement-${id}@example.invalid','',now(),now(),now())`,
    )
    .join(",\n");
  const accounts = Object.values(value.users)
    .map((id) => `('${id}','member','active')`)
    .join(",\n");
  const batches = value.records
    .map(
      (record) =>
        `('${record.batch}','direct_application','${value.users[record.subject]}',` +
        `'approved',4,now(),now(),now(),now())`,
    )
    .join(",\n");
  const rounds = value.records
    .map(
      (record, index) =>
        `('${record.round}','${record.batch}',date '2026-08-${String(index + 1).padStart(2, "0")}',` +
        `'TEST 파크골프장','서울','outdoor','A-B','casual',now(),now())`,
    )
    .join(",\n");
  const applicationRecords = value.records
    .map(
      (record, index) =>
        `('${record.applicationRecord}','${record.batch}','${record.round}',` +
        `'${value.users[record.subject]}','${record.type}','A',${index + 1},4,1,` +
        `'not_applicable','granted','approved',false,1,decode('${record.fingerprint}','hex'),` +
        `4,now(),now())`,
    )
    .join(",\n");
  const canonicals = value.records
    .map((record, index) => {
      const publishedAt = record.publication === "published" ? ",now()" : ",null";
      const suppression = record.publication === "suppressed" ? ",'TEST suppression'" : ",null";
      const revocation =
        record.validity === "revoked"
          ? `,now(),'${value.users.operator}','TEST revocation'`
          : ",null,null,null";
      return (
        `('${record.canonical}','${record.applicationRecord}','${value.users[record.subject]}',` +
        `'${record.type}',date '2026-08-${String(index + 1).padStart(2, "0")}','TEST 파크골프장','서울',` +
        `'outdoor','A-B','A',${index + 1},4,1,'${value.clubs.managed}',1,` +
        `decode('${record.fingerprint}','hex'),'${record.validity}','${record.publication}'` +
        `${suppression},'${value.users.operator}',now()${publishedAt},null${revocation},1,now(),now())`
      );
    })
    .join(",\n");
  const consents = value.records
    .map(
      (record) =>
        `('${record.applicationRecord}','${value.users[record.subject]}','granted',true,true,` +
        `false,false,false,true,true,${record.badgeConsent},1,now(),null,now(),now(),` +
        `'hof-member-achievement-v1',null,null)`,
    )
    .join(",\n");
  const badgeSources = value.records.flatMap((record) =>
    [record.type, "hall_of_fame_inductee"].map((badgeCode) => {
      const inactiveTail =
        record.sourceStatus === "inactive" ? ",now(),'TEST inactive'" : ",null,null";
      return (
        `('${value.users[record.subject]}','${badgeCode}','${record.canonical}',` +
        `'${record.sourceStatus}',now()${inactiveTail},now())`
      );
    }),
  );

  return String.raw`
set session_replication_role = replica;
insert into auth.users(
 id,instance_id,aud,role,email,encrypted_password,
 email_confirmed_at,created_at,updated_at
) values ${authUsers};
insert into public.user_accounts(id,platform_role,account_status) values ${accounts};
insert into public.user_profiles(user_id,display_name,profile_visibility) values
 ('${value.users.operator}','TEST 운영자','private'),
 ('${value.users.first}','동일 표시명','private'),
 ('${value.users.second}','동일 표시명','private'),
 ('${value.users.outsider}','TEST 외부회원','private');
insert into public.clubs(id,legacy_key,name,club_status) values
 ('${value.clubs.managed}',920001,'성취 TEST 동호회','active'),
 ('${value.clubs.other}',920002,'외부 TEST 동호회','active');
insert into public.club_memberships(id,club_id,user_id,membership_status) values
 ('${value.memberships.operator}','${value.clubs.managed}','${value.users.operator}','active'),
 ('${value.memberships.first}','${value.clubs.managed}','${value.users.first}','active'),
 ('${value.memberships.second}','${value.clubs.managed}','${value.users.second}','active'),
 ('${value.memberships.outsider}','${value.clubs.other}','${value.users.outsider}','active');
insert into public.club_role_assignments(membership_id,role_code,assigned_by) values
 ('${value.memberships.operator}','club_admin','${value.users.operator}');
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
insert into public.hall_of_fame_records(
 id,source_application_record_id,target_user_id,record_type_code,played_on,
 course_name_snapshot,course_region_snapshot,course_environment,
 course_layout_snapshot,course_segment_snapshot,hole_number,hole_par,strokes,
 nominating_club_id,fingerprint_version,record_fingerprint,validity_status,
 publication_status,suppression_reason,approved_by_user_id,approved_at,
 published_at,corrected_from_record_id,revoked_at,revoked_by_user_id,
 revocation_reason,version,created_at,updated_at
) values ${canonicals};
insert into public.hall_of_fame_publication_consents(
 application_record_id,target_user_id,status,display_name_consent,
 masked_display_name_consent,full_display_name_consent,avatar_consent,
 club_name_consent,record_date_consent,course_detail_consent,badge_consent,
 version,consented_at,withdrawn_at,created_at,updated_at,policy_version,
 last_actor_user_id,last_request_id
) values ${consents};
insert into public.hall_of_fame_badge_sources(
 target_user_id,badge_code,record_id,status,activated_at,
 deactivated_at,deactivation_reason,created_at
) values ${badgeSources.join(",\n")};
set session_replication_role = origin;
`;
}

let container;
let database;
let value;
let baselineCounts;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"])
    .stdout.split(/\r?\n/)
    .filter(Boolean);
  assert.equal(found.length, 1);
  container = found[0];
  database = `pul_hof_member_achievement_${process.pid}_${Date.now()}`;
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
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
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
  baselineCounts = sql(
    container,
    database,
    "select count(*) from public.hall_of_fame_badge_sources; select count(*) from public.hall_of_fame_records;",
  ).stdout.trim();
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

test("catalog exposes one stable authenticated read and no anon/service-role execution", () => {
  const result = sql(
    container,
    database,
    String.raw`
select p.provolatile,p.prosecdef,p.proconfig,
 pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='list_hall_of_fame_public_achievements_for_club_members';
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const columns = result.stdout.trim().split("|");
  assert.deepEqual(columns.slice(0, 2), ["s", "t"]);
  assert.match(columns[2], /search_path/);
  assert.deepEqual(columns.slice(3), ["f", "t", "f"]);
});

test("authorized bulk read keeps same-name members separate and filters non-public sources", () => {
  const result = sql(
    container,
    database,
    actorSql(
      value.users.operator,
      String.raw`
select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(result))
from public.list_hall_of_fame_public_achievements_for_club_members(
  '${value.clubs.managed}',
  array[
    '${value.memberships.first}'::uuid,
    '${value.memberships.second}'::uuid,
    '${value.memberships.first}'::uuid
  ]
) as result;
`,
    ),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const rows = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].membership_id, value.memberships.first);
  assert.equal(rows[1].membership_id, value.memberships.second);
  assert.deepEqual(rows[0].achievements, [
    { code: "hole_in_one", name: "홀인원", source_count: 2 },
    { code: "albatross", name: "알바트로스", source_count: 1 },
    { code: "hall_of_fame_inductee", name: "명예의 전당 등재", source_count: 3 },
  ]);
  assert.deepEqual(rows[1].achievements, []);
});

test("permission, cross-club identity, invalid input, and direct raw table reads fail closed", () => {
  const cases = [
    actorSql(
      value.users.outsider,
      `select * from public.list_hall_of_fame_public_achievements_for_club_members('${value.clubs.managed}',array['${value.memberships.first}'::uuid]);`,
    ),
    actorSql(
      value.users.operator,
      `select * from public.list_hall_of_fame_public_achievements_for_club_members('${value.clubs.managed}',array['${value.memberships.outsider}'::uuid]);`,
    ),
    actorSql(
      value.users.operator,
      `select * from public.list_hall_of_fame_public_achievements_for_club_members('${value.clubs.managed}',array[]::uuid[]);`,
    ),
    actorSql(value.users.operator, "select count(*) from public.hall_of_fame_badge_sources;"),
  ];

  for (const statement of cases) {
    const result = sql(container, database, statement);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
  }
});

test("all reads leave HOF records and badge sources unchanged", () => {
  const finalCounts = sql(
    container,
    database,
    "select count(*) from public.hall_of_fame_badge_sources; select count(*) from public.hall_of_fame_records;",
  );
  assert.equal(finalCounts.status, 0, finalCounts.stdout + finalCounts.stderr);
  assert.equal(finalCounts.stdout.trim(), baselineCounts);
});
