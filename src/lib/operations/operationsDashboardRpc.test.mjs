import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260920000100_pul_operations_dashboard_read_model.sql", import.meta.url)),
  "utf8",
);

const container = "supabase_db_pul-platform";
const database = `pul_operations_dashboard_${process.pid}_${Date.now()}`;
const referenceAt = "2026-09-20T00:00:00Z";
const ids = {
  admin: randomUUID(),
  moderator: randomUUID(),
  member: randomUUID(),
  inactive: randomUUID(),
};

function docker(args, input) {
  return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
}

function sql(text, user = "supabase_admin") {
  return docker([
    "exec", "-i", container, "psql", "-U", user, "-d", database,
    "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
  ], text);
}

function authenticated(actor, text) {
  return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

function queueKeys(result) {
  return result.attention.map((item) => item.queue_key).sort();
}

before(() => {
  const running = docker(["ps", "--filter", `name=^/${container}$`, "--format", "{{.Names}}"]);
  assert.equal(running.status, 0, running.stdout + running.stderr);
  assert.equal(running.stdout.trim(), container, "the pul-platform local Supabase database is required");

  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const exists = sql(
    "select pg_catalog.to_regprocedure('public.get_operations_dashboard(timestamptz,integer)') is not null;",
    "postgres",
  );
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = Object.entries(ids).map(([alias, id]) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','operations-${alias}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),
      ('${ids.moderator}','active','platform_moderator'),
      ('${ids.member}','active','member'),
      ('${ids.inactive}','suspended','platform_admin');
    insert into public.course_information_reports(
      reporter_user_id,report_type,course_name,region,location_description,report_body,created_at
    ) values (
      '${ids.member}','new_course','테스트 파크골프장','서울','테스트 위치 설명','운영 대시보드 격리 검증용 골프장 정보입니다.','2026-09-18T00:00:00Z'
    );
    insert into public.news_inquiries(requester_user_id,inquiry_type,inquiry_body,created_at)
    values ('${ids.member}','news_report','운영 대시보드 격리 검증용 뉴스 제보 내용입니다.','2026-09-13T00:00:00Z');
    insert into public.hall_of_fame_application_batches(
      application_type,created_by_user_id,status,submitted_at,created_at,updated_at
    ) values (
      'direct_application','${ids.member}','submitted','2026-09-18T00:00:00Z','2026-09-18T00:00:00Z','2026-09-18T00:00:00Z'
    );
    insert into public.audit_logs(
      actor_id,actor_type,actor_role,action,target_type,target_id,request_id,outcome
    ) values (
      '${ids.admin}','admin','platform_admin','promotion.update','promotion','masked-target','${randomUUID()}','success'
    );
    set session_replication_role=origin;`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  assert.equal(
    docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status,
    0,
  );
});

test("catalog exposes only authenticated execution and exact function properties", () => {
  const catalog = json(sql(`select pg_catalog.json_build_object(
    'stable', p.provolatile = 's',
    'security_definer', p.prosecdef,
    'auth_execute', pg_catalog.has_function_privilege('authenticated','public.get_operations_dashboard(timestamptz,integer)','EXECUTE'),
    'anon_execute', pg_catalog.has_function_privilege('anon','public.get_operations_dashboard(timestamptz,integer)','EXECUTE'),
    'public_execute', pg_catalog.has_function_privilege('public','public.get_operations_dashboard(timestamptz,integer)','EXECUTE')
  ) from pg_catalog.pg_proc p where p.oid='public.get_operations_dashboard(timestamptz,integer)'::regprocedure;`, "postgres"));
  assert.deepEqual(catalog, {
    stable: true,
    security_definer: true,
    auth_execute: true,
    anon_execute: false,
    public_execute: false,
  });
});

test("anonymous, unauthenticated, normal member and inactive operator calls fail closed", () => {
  const anon = sql(`set role anon; select public.get_operations_dashboard('${referenceAt}',8);`);
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);

  const unauthenticated = sql(`set role authenticated; select public.get_operations_dashboard('${referenceAt}',8);`);
  assert.notEqual(unauthenticated.status, 0);
  assert.match(unauthenticated.stderr, /AUTHENTICATION_REQUIRED/);

  for (const actor of [ids.member, ids.inactive]) {
    const denied = authenticated(actor, `select public.get_operations_dashboard('${referenceAt}',8);`);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /NOT_AUTHORIZED/);
  }
});

test("admin receives authorized queues, fixed age, compact activity and no sensitive identifiers", () => {
  const dashboard = json(authenticated(ids.admin, `select public.get_operations_dashboard('${referenceAt}',8);`));
  assert.deepEqual(Object.keys(dashboard).sort(), [
    "attention", "automation_signals", "generated_at", "recent_activity", "schema_version", "upcoming",
  ]);
  assert.equal(dashboard.schema_version, 1);
  assert.deepEqual(queueKeys(dashboard), [
    "course_information_reports", "hall_of_fame_application_reviews", "news_inquiries",
  ]);
  const news = dashboard.attention.find((item) => item.queue_key === "news_inquiries");
  assert.equal(news.age_days, 7);
  assert.equal(news.urgency, "overdue");
  assert.equal(dashboard.recent_activity.length, 1);
  assert.deepEqual(Object.keys(dashboard.recent_activity[0]).sort(), ["action", "domain", "occurred_at", "outcome"]);
  const serialized = JSON.stringify(dashboard);
  assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  for (const forbidden of ["report_body", "inquiry_body", "email", "storage_path", "metadata", "target_id"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("moderator sees HOF only and unauthorized admin domains are completely absent", () => {
  const dashboard = json(authenticated(ids.moderator, `select public.get_operations_dashboard('${referenceAt}',8);`));
  assert.deepEqual(queueKeys(dashboard), ["hall_of_fame_application_reviews"]);
  assert.equal(JSON.stringify(dashboard).includes("news_inquiries"), false);
  assert.equal(JSON.stringify(dashboard).includes("course_information_reports"), false);
  assert.equal(JSON.stringify(dashboard).includes("promotions"), false);
});

test("empty authorized arrays remain exact and recent_limit validation is strict", () => {
  const empty = json(authenticated(ids.admin, `select public.get_operations_dashboard('2026-09-01T00:00:00Z',1);`));
  assert.ok(Array.isArray(empty.upcoming));
  assert.ok(Array.isArray(empty.automation_signals));
  assert.equal(empty.recent_activity.length, 1);
  for (const limit of [0, 9]) {
    const invalid = authenticated(ids.admin, `select public.get_operations_dashboard('${referenceAt}',${limit});`);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /INVALID_ARGUMENT/);
  }
  const nullLimit = authenticated(ids.admin, `select public.get_operations_dashboard('${referenceAt}',null);`);
  assert.notEqual(nullLimit.status, 0);
});

test("PostgREST-style read-only transaction succeeds and leaves all domain rows unchanged", () => {
  const beforeCounts = sql(`select concat_ws(',',
    (select count(*) from public.course_information_reports),
    (select count(*) from public.news_inquiries),
    (select count(*) from public.hall_of_fame_application_batches),
    (select count(*) from public.audit_logs)
  );`, "postgres").stdout.trim();
  const readOnly = authenticated(ids.admin, `begin read only; select public.get_operations_dashboard('${referenceAt}',8); commit;`);
  assert.equal(readOnly.status, 0, readOnly.stdout + readOnly.stderr);
  const afterCounts = sql(`select concat_ws(',',
    (select count(*) from public.course_information_reports),
    (select count(*) from public.news_inquiries),
    (select count(*) from public.hall_of_fame_application_batches),
    (select count(*) from public.audit_logs)
  );`, "postgres").stdout.trim();
  assert.equal(afterCounts, beforeCounts);
});
