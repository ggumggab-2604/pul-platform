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
      "../../../supabase/migrations/20260819000100_pul_hall_of_fame_public_ranking_read_contract.sql",
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

function values() {
  const users = {
    admin: randomUUID(),
    a: randomUUID(),
    b: randomUUID(),
    c: randomUUID(),
  };
  const clubs = { one: randomUUID(), two: randomUUID() };
  const records = [
    ["a", "hole_in_one", "2026-08-03", "한강 파크골프장", "서울", "one", true, "published", "active"],
    ["a", "albatross", "2026-08-09", "한강 파크골프장", "서울", "one", true, "published", "active"],
    ["a", "hole_in_one", "2026-01-10", "부산 시민 파크골프장", "부산", "two", true, "published", "active"],
    ["b", "hole_in_one", "2026-08-11", "한강 파크골프장", "서울", "one", true, "published", "active"],
    ["b", "condor", "2026-08-12", "부산 시민 파크골프장", "부산", "two", false, "published", "active"],
    ["b", "hole_in_one", "2026-07-01", "서울숲 파크골프장", "서울", "one", true, "published", "active"],
    ["c", "hole_in_one", "2026-08-13", "제주 파크골프장", "제주", "two", true, "published", "active"],
    ["c", "hole_in_one", "2026-08-14", "숨김 파크골프장", "서울", "one", true, "hidden", "active"],
    ["c", "condor", "2026-08-15", "취소 파크골프장", "서울", "one", true, "suppressed", "revoked"],
    ["a", "albatross", "2025-12-30", "대구 파크골프장", "대구", "one", true, "published", "active"],
  ].map((entry, index) => ({
    subject: entry[0],
    type: entry[1],
    playedOn: entry[2],
    course: entry[3],
    region: entry[4],
    club: entry[5],
    clubConsent: entry[6],
    publication: entry[7],
    validity: entry[8],
    batch: randomUUID(),
    round: randomUUID(),
    applicationRecord: randomUUID(),
    canonical: randomUUID(),
    fingerprint: (index + 1).toString(16).padStart(2, "0").repeat(32),
  }));
  return { users, clubs, records };
}

function fixtureSql(value) {
  const authUsers = Object.values(value.users)
    .map(
      (id) =>
        `('${id}','00000000-0000-0000-0000-000000000000','authenticated',` +
        `'authenticated','hof-public-ranking-${id}@example.invalid','',now(),now(),now())`,
    )
    .join(",\n");
  const accounts = Object.entries(value.users)
    .map(([alias, id]) => `('${id}','${alias === "admin" ? "platform_admin" : "member"}','active')`)
    .join(",\n");
  const profiles = [
    [value.users.a, "김정상"],
    [value.users.b, "비공개 회원"],
    [value.users.c, "박회원"],
  ]
    .map(([id, name]) => `('${id}','${name}','private')`)
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
      (record) =>
        `('${record.round}','${record.batch}',date '${record.playedOn}',` +
        `'${record.course}','${record.region}','outdoor','A-B','casual',now(),now())`,
    )
    .join(",\n");
  const applicationRecords = value.records
    .map(
      (record, index) =>
        `('${record.applicationRecord}','${record.batch}','${record.round}',` +
        `'${value.users[record.subject]}','${record.type}','A',${(index % 9) + 1},4,1,` +
        `'not_applicable','granted','approved',false,1,decode('${record.fingerprint}','hex'),` +
        `4,now(),now())`,
    )
    .join(",\n");
  const canonicals = value.records
    .map((record, index) => {
      const publishedAt = record.publication === "published" ? ",now()" : ",null";
      const suppression = record.publication === "suppressed" ? ",'TEST revoked'" : ",null";
      const revocation =
        record.validity === "revoked"
          ? `,now(),'${value.users.admin}','TEST revoked'`
          : ",null,null,null";
      return (
        `('${record.canonical}','${record.applicationRecord}','${value.users[record.subject]}',` +
        `'${record.type}',date '${record.playedOn}','${record.course}','${record.region}',` +
        `'outdoor','A-B','A',${(index % 9) + 1},4,1,'${value.clubs[record.club]}',1,` +
        `decode('${record.fingerprint}','hex'),'${record.validity}','${record.publication}'` +
        `${suppression},'${value.users.admin}',now()${publishedAt},null${revocation},1,now(),now())`
      );
    })
    .join(",\n");
  const consents = value.records
    .map((record) => {
      const fullName = record.subject !== "b";
      return (
        `('${record.applicationRecord}','${value.users[record.subject]}','granted',true,true,` +
        `${fullName},false,${record.clubConsent},true,true,false,1,now(),null,now(),now(),` +
        `'hof-public-ranking-v1',null,null)`
      );
    })
    .join(",\n");

  return String.raw`
set session_replication_role = replica;
insert into auth.users(
 id,instance_id,aud,role,email,encrypted_password,
 email_confirmed_at,created_at,updated_at
) values ${authUsers};
insert into public.user_accounts(id,platform_role,account_status) values ${accounts};
insert into public.user_profiles(user_id,display_name,profile_visibility) values ${profiles};
insert into public.clubs(id,legacy_key,name,club_status) values
 ('${value.clubs.one}',910001,'한강 TEST 동호회','active'),
 ('${value.clubs.two}',910002,'시민 TEST 동호회','active');
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
set session_replication_role = origin;
`;
}

function jsonQuery(container, database, query) {
  const result = sql(
    container,
    database,
    `select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item)), '[]'::jsonb) from (${query}) as item;`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

let container;
let database;
let value;
let baselineCounts;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout
    .split(/\r?\n/)
    .filter(Boolean);
  assert.equal(found.length, 1);
  container = found[0];
  database = `pul_hof_public_ranking_${process.pid}_${Date.now()}`;
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
    "select count(*) from public.hall_of_fame_records; select count(*) from public.hall_of_fame_publication_consents;",
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

test("catalog exposes two stable security-definer reads to anon and authenticated only", () => {
  const result = sql(
    container,
    database,
    String.raw`
select p.proname,p.provolatile,p.prosecdef,p.proconfig,
 pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
 pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
 'list_hall_of_fame_public_records_by_type',
 'list_hall_of_fame_public_rankings'
)
order by p.proname;
`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const rows = result.stdout.trim().split(/\r?\n/).map((line) => line.split("|"));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row[1], "s");
    assert.equal(row[2], "t");
    assert.match(row[3], /search_path/);
    assert.deepEqual(row.slice(4), ["t", "t", "f"]);
  }
});

test("record type filtering returns only active published consented records", () => {
  const all = jsonQuery(
    container,
    database,
    "select record_type_code,played_on,display_name from public.list_hall_of_fame_public_records_by_type(null,24,0)",
  );
  assert.equal(all.length, 8);
  assert.equal(all.some((row) => row.played_on === "2026-08-14"), false);
  assert.equal(all.some((row) => row.played_on === "2026-08-15"), false);
  const condors = jsonQuery(
    container,
    database,
    "select record_type_code from public.list_hall_of_fame_public_records_by_type('condor',24,0)",
  );
  assert.deepEqual(condors, [{ record_type_code: "condor" }]);
});

test("monthly and yearly rankings use played_on and preserve tied dense ranks", () => {
  const monthly = jsonQuery(
    container,
    database,
    "select * from public.list_hall_of_fame_public_rankings('monthly',date '2026-08-19',20)",
  );
  assert.deepEqual(
    monthly.map((row) => [row.rank_position, row.ranking_label, row.record_count]),
    [
      [1, "PUL member", 2],
      [1, "김정상", 2],
      [2, "박회원", 1],
    ],
  );
  const yearly = jsonQuery(
    container,
    database,
    "select * from public.list_hall_of_fame_public_rankings('yearly',date '2026-08-19',20)",
  );
  assert.deepEqual(
    yearly.map((row) => [row.rank_position, row.ranking_label, row.record_count]),
    [
      [1, "PUL member", 3],
      [1, "김정상", 3],
      [2, "박회원", 1],
    ],
  );
  assert.equal(yearly.flatMap((row) => Object.keys(row)).some((key) => key.includes("user_id")), false);
});

test("region, club, and course rankings aggregate only their public dimensions", () => {
  const region = jsonQuery(
    container,
    database,
    "select rank_position,ranking_label,record_count from public.list_hall_of_fame_public_rankings('region',date '2026-08-19',20)",
  );
  assert.deepEqual(
    region.map((row) => [row.rank_position, row.ranking_label, row.record_count]),
    [
      [1, "서울", 4],
      [2, "부산", 2],
      [3, "대구", 1],
      [3, "제주", 1],
    ],
  );
  const club = jsonQuery(
    container,
    database,
    "select ranking_label,record_count from public.list_hall_of_fame_public_rankings('club',date '2026-08-19',20)",
  );
  assert.deepEqual(club, [
    { ranking_label: "한강 TEST 동호회", record_count: 5 },
    { ranking_label: "시민 TEST 동호회", record_count: 2 },
  ]);
  const course = jsonQuery(
    container,
    database,
    "select ranking_label,ranking_sublabel,record_count from public.list_hall_of_fame_public_rankings('course',date '2026-08-19',20)",
  );
  assert.deepEqual(course[0], {
    ranking_label: "한강 파크골프장",
    ranking_sublabel: "서울",
    record_count: 3,
  });
});

test("anon can read both projections while invalid requests fail safely", () => {
  const anon = sql(
    container,
    database,
    String.raw`
set role anon;
select count(*) from public.list_hall_of_fame_public_records_by_type(null,24,0);
select count(*) from public.list_hall_of_fame_public_rankings('monthly',date '2026-08-19',20);
`,
  );
  assert.equal(anon.status, 0, anon.stdout + anon.stderr);
  assert.equal(anon.stdout.trim(), "8\n3");
  for (const query of [
    "select * from public.list_hall_of_fame_public_records_by_type('eagle',24,0);",
    "select * from public.list_hall_of_fame_public_rankings('score',date '2026-08-19',20);",
  ]) {
    const invalid = sql(container, database, query);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /HOF_INVALID_PUBLIC_/);
  }
});

test("all read calls leave canonical and consent fixtures unchanged", () => {
  const finalCounts = sql(
    container,
    database,
    "select count(*) from public.hall_of_fame_records; select count(*) from public.hall_of_fame_publication_consents;",
  );
  assert.equal(finalCounts.status, 0, finalCounts.stdout + finalCounts.stderr);
  assert.equal(finalCounts.stdout.trim(), baselineCounts);
});
