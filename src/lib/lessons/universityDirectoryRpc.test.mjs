import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260924000100_pul_lesson_university_directory_foundation.sql", import.meta.url)), "utf8");
const correction = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260924000200_pul_lesson_university_management_read_volatility_fix.sql", import.meta.url)), "utf8");
const ids = { admin: randomUUID(), member: randomUUID(), inactive: randomUUID() };
let container;
let database;

function docker(args, input) { return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }); }
function sql(text, user = "supabase_admin") { return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text); }
function authenticated(actor, text) { return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`); }
function json(result) { assert.equal(result.status, 0, result.stdout + result.stderr); return JSON.parse(result.stdout.trim()); }
function payload(overrides = {}) {
  return JSON.stringify({
    university_name: "TEST 대학교", department_name: "파크골프 과정",
    summary: "공식 출처로 확인한 TEST 파크골프 관련 대학 과정입니다.", region: "서울",
    official_url: "https://example.invalid/department", admissions_url: null, ...overrides,
  });
}
function requestPayload(overrides = {}) {
  return JSON.stringify({
    university_name: "TEST 요청 대학교", department_name: "파크골프 전공",
    region: "경기", reference_url: "https://example.invalid/source",
    request_message: "공식 대학·학과 정보의 등록을 요청합니다.", ...overrides,
  });
}

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_pul-platform", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(found, ["supabase_db_pul-platform"], "the pul-platform local Supabase database container is required");
  container = found[0];
  database = `pul_university_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const catalog = sql("select to_regclass('public.lesson_university_departments') is not null;", "postgres");
  assert.equal(catalog.status, 0, catalog.stdout + catalog.stderr);
  if (catalog.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }
  const corrected = sql(`begin; ${correction} commit;`, "postgres");
  assert.equal(corrected.status, 0, corrected.stdout + corrected.stderr);
  const authRows = Object.entries(ids).map(([alias, id]) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','university-${alias}@example.invalid','',now(),now(),now())`).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),('${ids.member}','active','member'),('${ids.inactive}','suspended','member');
    set session_replication_role=origin;`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
});

test("catalog is RLS-protected and function ACLs are explicit", () => {
  const result = sql(`select relrowsecurity::text || '|' || relforcerowsecurity::text from pg_class where oid='public.lesson_university_departments'::regclass;
    select has_function_privilege('anon','public.list_public_lesson_university_departments(text,text,integer,integer)','execute')::text || '|' || has_function_privilege('anon','public.mutate_lesson_university_department(text,text,integer,jsonb)','execute')::text;`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /true\|true/);
  assert.match(result.stdout, /true\|false/);
});

test("locking management reads are volatile in catalog and execute for authorized admin", () => {
  const volatility = sql(`select string_agg(p.provolatile::text, '|' order by signature.position)
    from (values
      (1, 'public.list_lesson_university_departments_for_management(text,text,integer,integer)'::regprocedure),
      (2, 'public.get_lesson_university_department_for_management(text)'::regprocedure),
      (3, 'public.list_lesson_university_department_requests_for_management(text,integer,integer)'::regprocedure),
      (4, 'public.list_public_lesson_university_departments(text,text,integer,integer)'::regprocedure)
    ) as signature(position, oid)
    join pg_proc as p on p.oid = signature.oid;`);
  assert.equal(volatility.status, 0, volatility.stdout + volatility.stderr);
  assert.equal(volatility.stdout.trim(), "v|v|v|s");

  const created = authenticated(ids.admin, `select public.mutate_lesson_university_department('create','management-read-test',null,$payload$${payload()}$payload$::jsonb);`);
  assert.equal(created.status, 0, created.stdout + created.stderr);
  const list = json(authenticated(ids.admin, "select public.list_lesson_university_departments_for_management('TEST',null,30,0);"));
  assert.ok(list.total >= 1);
  const detail = json(authenticated(ids.admin, "select public.get_lesson_university_department_for_management('management-read-test');"));
  assert.equal(detail.department_key, "management-read-test");
  const requests = json(authenticated(ids.admin, "select public.list_lesson_university_department_requests_for_management('pending',30,0);"));
  assert.equal(typeof requests.total, "number");
});

test("admin creates hidden, publishes, searches, and hides while public sees published only", () => {
  const created = json(authenticated(ids.admin, `select public.mutate_lesson_university_department('create','test-department',null,$payload$${payload()}$payload$::jsonb);`));
  assert.equal(created.publication_status, "hidden");
  assert.equal(json(sql("set role anon; select public.list_public_lesson_university_departments(null,null,24,0);" )).total, 0);
  const published = json(authenticated(ids.admin, "select public.mutate_lesson_university_department('publish','test-department',1,'{}'::jsonb);"));
  assert.equal(published.version, 2);
  const page = json(sql("set role anon; select public.list_public_lesson_university_departments('파크골프','서울',24,0);"));
  assert.equal(page.total, 1);
  assert.equal(page.items[0].department_key, "test-department");
  for (const key of ["id", "version", "publication_status", "created_by", "updated_by"]) assert.equal(key in page.items[0], false);
  const stale = authenticated(ids.admin, `select public.mutate_lesson_university_department('update','test-department',1,$payload$${payload()}$payload$::jsonb);`);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /변경되었습니다/);
});

test("member and inactive actors fail closed for management or submission", () => {
  const memberList = authenticated(ids.member, "select public.list_lesson_university_departments_for_management(null,null,30,0);");
  assert.notEqual(memberList.status, 0);
  assert.match(memberList.stderr, /권한/);
  assert.doesNotMatch(memberList.stderr, /25006/);
  const memberRequests = authenticated(ids.member, "select public.list_lesson_university_department_requests_for_management('pending',30,0);");
  assert.notEqual(memberRequests.status, 0);
  assert.match(memberRequests.stderr, /권한/);
  assert.doesNotMatch(memberRequests.stderr, /25006/);
  const memberMutation = authenticated(ids.member, `select public.mutate_lesson_university_department('create','member-denied',null,$payload$${payload()}$payload$::jsonb);`);
  assert.notEqual(memberMutation.status, 0);
  assert.match(memberMutation.stderr, /권한/);
  const inactiveRequest = authenticated(ids.inactive, `select public.submit_lesson_university_department_request('${randomUUID()}',$payload$${requestPayload()}$payload$::jsonb);`);
  assert.notEqual(inactiveRequest.status, 0);
  assert.match(inactiveRequest.stderr, /현재 계정/);
});

test("request id replay, conflict, pending duplicate, and manager resolution are consistent", () => {
  const requestId = randomUUID();
  const first = json(authenticated(ids.member, `select public.submit_lesson_university_department_request('${requestId}',$payload$${requestPayload()}$payload$::jsonb);`));
  assert.equal(first.replayed, false);
  const replay = json(authenticated(ids.member, `select public.submit_lesson_university_department_request('${requestId}',$payload$${requestPayload()}$payload$::jsonb);`));
  assert.equal(replay.replayed, true);
  assert.equal(replay.request_key, first.request_key);
  const conflict = authenticated(ids.member, `select public.submit_lesson_university_department_request('${requestId}',$payload$${requestPayload({ request_message: "서로 다른 내용을 같은 ID로 제출합니다." })}$payload$::jsonb);`);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /재사용/);
  const duplicate = authenticated(ids.member, `select public.submit_lesson_university_department_request('${randomUUID()}',$payload$${requestPayload()}$payload$::jsonb);`);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /이미 있습니다/);
  const before = Number(sql("select count(*) from public.lesson_university_departments;", "postgres").stdout.trim());
  const resolved = json(authenticated(ids.admin, `select public.resolve_lesson_university_department_request('${first.request_key}',1,'completed','공식 출처 확인 완료');`));
  assert.equal(resolved.request_status, "completed");
  assert.equal(resolved.version, 2);
  const afterCount = Number(sql("select count(*) from public.lesson_university_departments;", "postgres").stdout.trim());
  assert.equal(afterCount, before, "resolution must not auto-create a directory row");
});

test("authenticated actors cannot directly mutate either table", () => {
  const directory = authenticated(ids.admin, "update public.lesson_university_departments set summary='직접 변경' where department_key='test-department';");
  assert.notEqual(directory.status, 0);
  assert.match(directory.stderr, /permission denied|row-level security/i);
  const requests = authenticated(ids.member, "delete from public.lesson_university_department_submission_requests;");
  assert.notEqual(requests.status, 0);
  assert.match(requests.stderr, /permission denied|row-level security/i);
});
