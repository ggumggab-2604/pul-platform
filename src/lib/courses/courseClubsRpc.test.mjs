import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260912000100_pul_course_club_links.sql",
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
      "-v",
      "ON_ERROR_STOP=1",
    ],
    text,
  );
}

function sqlAsync(text, user = "supabase_admin") {
  return new Promise((resolve) => {
    const child = spawn("docker", [
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
      "-v",
      "ON_ERROR_STOP=1",
    ]);
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

function authenticated(actor, text) {
  return sql(
    `set request.jwt.claim.sub = '${actor}'; set request.jwt.claim.role = 'authenticated'; set role authenticated; ${text}`,
  );
}

function authenticatedAsync(actor, text) {
  return sqlAsync(
    `set request.jwt.claim.sub = '${actor}'; set request.jwt.claim.role = 'authenticated'; set role authenticated; ${text}`,
  );
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

const actors = {
  admin: randomUUID(),
  vice: randomUUID(),
  manager: randomUUID(),
  member: randomUUID(),
  suspendedAccount: randomUUID(),
  inactiveMembership: randomUUID(),
  otherAdmin: randomUUID(),
};
const clubIds = { active: randomUUID(), inactive: randomUUID(), other: randomUUID() };
const membershipIds = Object.fromEntries(
  Object.keys(actors).map((key) => [key, randomUUID()]),
);
const courseIds = {
  active: randomUUID(),
  inactive: randomUUID(),
  removed: randomUUID(),
};
const suffix = `${process.pid}-${Date.now()}`;
const keys = {
  course: `course-link-${suffix}`,
  inactiveCourse: `course-inactive-${suffix}`,
  removedCourse: `course-removed-${suffix}`,
  club: `club-link-${suffix}`,
  inactiveClub: `club-inactive-${suffix}`,
  otherClub: `club-other-${suffix}`,
};

let container;
let database;

before(() => {
  const found = docker([
    "ps",
    "--filter",
    "name=supabase_db_",
    "--format",
    "{{.Names}}",
  ]).stdout
    .split(/\r?\n/)
    .filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_course_clubs_${process.pid}_${Date.now()}`;

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

  const relationExists = sql(
    "select pg_catalog.to_regclass('public.course_club_links') is not null;",
    "postgres",
  ).stdout.trim();
  if (relationExists !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = Object.values(actors)
    .map(
      (id) =>
        `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','course-link-${id}@example.invalid','',now(),now(),now())`,
    )
    .join(",");
  const accountRows = Object.entries(actors)
    .map(
      ([key, id]) =>
        `('${id}','member','${key === "suspendedAccount" ? "suspended" : "active"}')`,
    )
    .join(",");
  const membershipRows = Object.entries(actors)
    .map(([key, id]) => {
      const clubId = key === "otherAdmin" ? clubIds.other : clubIds.active;
      const status = key === "inactiveMembership" ? "suspended" : "active";
      const suspendedAt = status === "suspended" ? "now()" : "null";
      return `('${membershipIds[key]}','${clubId}','${id}','${status}',${suspendedAt})`;
    })
    .join(",");
  const roleRows = [
    [membershipIds.admin, "club_member", actors.admin],
    [membershipIds.admin, "club_admin", actors.admin],
    [membershipIds.vice, "club_member", actors.admin],
    [membershipIds.vice, "club_vice_admin", actors.admin],
    [membershipIds.manager, "club_member", actors.admin],
    [membershipIds.manager, "club_manager", actors.admin],
    [membershipIds.member, "club_member", actors.admin],
    [membershipIds.suspendedAccount, "club_member", actors.admin],
    [membershipIds.suspendedAccount, "club_admin", actors.admin],
    [membershipIds.inactiveMembership, "club_member", actors.admin],
    [membershipIds.inactiveMembership, "club_admin", actors.admin],
    [membershipIds.otherAdmin, "club_member", actors.otherAdmin],
    [membershipIds.otherAdmin, "club_admin", actors.otherAdmin],
  ]
    .map(
      ([membershipId, role, assignedBy]) =>
        `('${membershipId}','${role}','${assignedBy}')`,
    )
    .join(",");

  const fixture = sql(
    `set session_replication_role=replica;
     insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
     insert into public.user_accounts(id,platform_role,account_status) values ${accountRows};
     insert into public.clubs(id,legacy_key,name,club_status,region,district,summary,membership_recruitment_status) values
       ('${clubIds.active}','${keys.club}','TEST 활동 동호회','active','서울','마포구','TEST 공개 동호회 소개입니다.','recruiting'),
       ('${clubIds.inactive}','${keys.inactiveClub}','TEST 비활성 동호회','suspended','경기','수원시','TEST 비활성 동호회 소개입니다.','closed'),
       ('${clubIds.other}','${keys.otherClub}','TEST 다른 동호회','active','인천','연수구','TEST 다른 동호회 소개입니다.','waiting');
     insert into public.club_memberships(id,club_id,user_id,membership_status,suspended_at) values ${membershipRows};
     insert into public.club_role_assignments(membership_id,role_code,assigned_by) values ${roleRows};
     insert into public.courses(id,course_key,name,course_type,region,city,address,holes,operation_code,feature_codes,description,course_status) values
       ('${courseIds.active}','${keys.course}','TEST 활동 골프장','field','서울','마포구','서울 TEST 주소',18,'reservation','{}','TEST 활동 골프장 설명입니다.','active'),
       ('${courseIds.inactive}','${keys.inactiveCourse}','TEST 비활성 골프장','field','경기','수원시','경기 TEST 주소',9,'walkIn','{}','TEST 비활성 골프장 설명입니다.','inactive'),
       ('${courseIds.removed}','${keys.removedCourse}','TEST 제거 골프장','screen','인천','연수구','인천 TEST 주소',9,'phone','{}','TEST 제거 골프장 설명입니다.','removed');
     set session_replication_role=origin;`,
    "postgres",
  );
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) {
    assert.equal(
      docker([
        "exec",
        container,
        "dropdb",
        "--if-exists",
        "--force",
        "-U",
        "supabase_admin",
        database,
      ]).status,
      0,
    );
  }
});

test("catalog enforces forced RLS, closed table ACLs, and exact function ACLs", () => {
  const catalog = sql(
    `select c.relrowsecurity::text || ':' || c.relforcerowsecurity::text
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname='course_club_links';`,
  ).stdout.trim();
  assert.equal(catalog, "true:true");

  for (const role of ["anon", "authenticated", "service_role"]) {
    const privileges = sql(
      `select has_table_privilege('${role}','public.course_club_links','SELECT,INSERT,UPDATE,DELETE');`,
    ).stdout.trim();
    assert.equal(privileges, "f");
  }
  assert.equal(
    sql(
      "select has_function_privilege('anon','public.list_public_course_clubs(text)','EXECUTE');",
    ).stdout.trim(),
    "t",
  );
  assert.equal(
    sql(
      "select has_function_privilege('anon','public.link_club_to_course(text,text)','EXECUTE');",
    ).stdout.trim(),
    "f",
  );
  assert.equal(
    sql(
      "select has_function_privilege('authenticated','public.link_club_to_course(text,text)','EXECUTE');",
    ).stdout.trim(),
    "t",
  );
});

test("admin link is idempotent and public output excludes internal identifiers", () => {
  const first = json(
    authenticated(
      actors.admin,
      `select public.link_club_to_course('${keys.club}','${keys.course}');`,
    ),
  );
  assert.deepEqual(first, {
    changed: true,
    linked: true,
    course_key: keys.course,
    public_key: keys.club,
  });
  const replay = json(
    authenticated(
      actors.admin,
      `select public.link_club_to_course('${keys.club}','${keys.course}');`,
    ),
  );
  assert.equal(replay.changed, false);
  assert.equal(
    sql("select count(*) from public.course_club_links;", "postgres").stdout.trim(),
    "1",
  );

  const items = json(
    sql(`set role anon; select public.list_public_course_clubs('${keys.course}');`),
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].public_key, keys.club);
  for (const hidden of ["id", "course_id", "club_id", "created_by"]) {
    assert.equal(hidden in items[0], false);
  }
});

test("vice can unlink while manager, member, other club admin, and inactive actors fail closed", () => {
  const removed = json(
    authenticated(
      actors.vice,
      `select public.unlink_club_from_course('${keys.club}','${keys.course}');`,
    ),
  );
  assert.equal(removed.changed, true);
  const replay = json(
    authenticated(
      actors.vice,
      `select public.unlink_club_from_course('${keys.club}','${keys.course}');`,
    ),
  );
  assert.equal(replay.changed, false);

  for (const actor of [
    actors.manager,
    actors.member,
    actors.otherAdmin,
    actors.suspendedAccount,
    actors.inactiveMembership,
  ]) {
    const denied = authenticated(
      actor,
      `select public.link_club_to_course('${keys.club}','${keys.course}');`,
    );
    assert.notEqual(denied.status, 0);
    assert.match(
      denied.stderr,
      /권한|정상 활동|활동 중인 동호회 회원/,
    );
  }
  assert.equal(
    sql("select count(*) from public.course_club_links;", "postgres").stdout.trim(),
    "0",
  );
});

test("inactive parents, UUID injection, anon calls, and direct authenticated DML fail closed", () => {
  const inactiveCourse = authenticated(
    actors.admin,
    `select public.link_club_to_course('${keys.club}','${keys.inactiveCourse}');`,
  );
  assert.notEqual(inactiveCourse.status, 0);
  assert.match(inactiveCourse.stderr, /골프장을 찾을 수 없습니다/);

  const inactiveClub = authenticated(
    actors.admin,
    `select public.link_club_to_course('${keys.inactiveClub}','${keys.course}');`,
  );
  assert.notEqual(inactiveClub.status, 0);
  assert.match(inactiveClub.stderr, /동호회를 찾을 수 없습니다/);

  const uuidInjection = authenticated(
    actors.admin,
    `select public.link_club_to_course('${clubIds.active}','${keys.course}');`,
  );
  assert.notEqual(uuidInjection.status, 0);
  assert.match(uuidInjection.stderr, /동호회를 찾을 수 없습니다/);

  const anon = sql(
    `set role anon; select public.link_club_to_course('${keys.club}','${keys.course}');`,
  );
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);

  const directInsert = authenticated(
    actors.admin,
    `insert into public.course_club_links(course_id,club_id,created_by) values ('${courseIds.active}','${clubIds.active}','${actors.admin}');`,
  );
  assert.notEqual(directInsert.status, 0);
  assert.match(directInsert.stderr, /permission denied|row-level security/i);
});

test("manageable list is permission-minimized and exposes no unrelated club", () => {
  const adminList = json(
    authenticated(
      actors.admin,
      `select public.list_manageable_course_link_clubs('${keys.course}');`,
    ),
  );
  assert.deepEqual(adminList.map((club) => club.public_key), [keys.club]);
  assert.equal(adminList[0].linked, false);
  assert.equal("club_id" in adminList[0], false);

  const managerList = json(
    authenticated(
      actors.manager,
      `select public.list_manageable_course_link_clubs('${keys.course}');`,
    ),
  );
  assert.deepEqual(managerList, []);
});

test("concurrent duplicate links serialize to one row and one changed result", async () => {
  const statement = `select public.link_club_to_course('${keys.club}','${keys.course}');`;
  const [adminResult, viceResult] = await Promise.all([
    authenticatedAsync(actors.admin, statement),
    authenticatedAsync(actors.vice, statement),
  ]);
  const results = [json(adminResult), json(viceResult)];
  assert.equal(results.filter((result) => result.changed).length, 1);
  assert.equal(results.every((result) => result.linked), true);
  assert.equal(
    sql("select count(*) from public.course_club_links;", "postgres").stdout.trim(),
    "1",
  );
});
