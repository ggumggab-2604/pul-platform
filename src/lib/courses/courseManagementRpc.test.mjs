import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260921000100_pul_course_operations_management.sql", import.meta.url)), "utf8");

function currentFunction(name) {
  const match = migration.match(new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"));
  assert.ok(match, `${name} definition must exist in the migration`);
  return match[0].replace(/^create function/i, "create or replace function");
}

function docker(args, input) { return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }); }
function sql(text, user = "supabase_admin") { return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text); }
function authenticated(actor, text) { return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`); }
function json(result) { assert.equal(result.status, 0, result.stdout + result.stderr); return JSON.parse(result.stdout.trim()); }
function payload(overrides = {}) {
  return JSON.stringify({
    name: "TEST 신규 운영 골프장",
    course_type: "field",
    region: "서울",
    city: "마포구",
    address: "서울 TEST 운영 주소 20",
    holes: 18,
    operating_hours: null,
    operation_code: "walkIn",
    phone: null,
    parking_available: null,
    feature_codes: [],
    description: "TEST 신규 운영 골프장 설명입니다.",
    reservation_url: null,
    reservation_guide: null,
    fee_guide: null,
    latitude: null,
    longitude: null,
    ...overrides,
  });
}

const ids = {
  admin: randomUUID(), moderator: randomUUID(), member: randomUUID(), inactive: randomUUID(),
  report: randomUUID(), reportDismissed: randomUUID(),
};
let container;
let database;
let activeUpdatedAt;
let inactiveUpdatedAt;

before(() => {
  const found = docker(["ps", "--filter", "name=^supabase_db_pul-platform$", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(found, ["supabase_db_pul-platform"], "pul-platform local Supabase database container is required");
  container = found[0];
  database = `pul_course_management_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const refreshedFunctions = sql(`${currentFunction("mutate_managed_course")}\n${currentFunction("resolve_course_information_report_for_management")}`, "postgres");
  assert.equal(refreshedFunctions.status, 0, refreshedFunctions.stdout + refreshedFunctions.stderr);

  const authRows = [ids.admin, ids.moderator, ids.member, ids.inactive].map((id) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','course-management-${id}@example.invalid','',now(),now(),now())`).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),
      ('${ids.moderator}','active','platform_moderator'),
      ('${ids.member}','active','member'),
      ('${ids.inactive}','suspended','platform_admin');
    set session_replication_role=origin;
    insert into public.courses(course_key,name,course_type,region,city,address,holes,operating_hours,operation_code,phone,parking_available,feature_codes,description,reservation_url,reservation_guide,fee_guide,latitude,longitude,course_status) values
      ('ops-active','TEST 운영 공개 골프장','field','서울','마포구','서울 TEST 운영 주소 1',18,'06:00~18:00','reservation','02-000-0000',true,array['club_available'],'TEST 운영 공개 골프장 설명입니다.','https://example.invalid/reserve','공식 사이트 예약','TEST 이용료',37.5,126.9,'active'),
      ('ops-inactive','TEST 운영 숨김 골프장','screen','경기','수원시','경기 TEST 운영 주소 2',9,null,'phone',null,null,array['lesson_available'],'TEST 운영 숨김 골프장 설명입니다.',null,null,null,null,null,'inactive');
    insert into public.course_information_reports(id,reporter_user_id,report_type,target_course_id,course_name,region,location_description,operation_details,report_body,report_status)
    select '${ids.report}', '${ids.member}', 'correction', course.id, course.name, course.region, course.address, '운영시간 변경 확인', 'TEST 운영시간 정보 정정 제보 본문입니다.', 'received'
    from public.courses as course where course.course_key='ops-active';
    insert into public.course_information_reports(id,reporter_user_id,report_type,target_course_id,course_name,region,location_description,operation_details,report_body,report_status,created_at)
    values ('${ids.reportDismissed}','${ids.member}','new_course',null,'TEST 존재하지 않는 골프장','충청','충청 TEST 위치 설명',null,'TEST 적용할 내용이 없는 신규 제보입니다.','received',now() + interval '1 second');`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
  activeUpdatedAt = sql("select updated_at from public.courses where course_key='ops-active';", "postgres").stdout.trim();
  inactiveUpdatedAt = sql("select updated_at from public.courses where course_key='ops-inactive';", "postgres").stdout.trim();
});

after(() => {
  if (container && database) assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
});

test("platform admin lists all publication states while anon, member, moderator and inactive admin are denied", () => {
  const page = json(authenticated(ids.admin, "select public.list_courses_for_management(null,null,null,30,0);"));
  assert.equal(page.total, 2);
  assert.deepEqual(page.items.map((item) => item.course_status).sort(), ["active", "inactive"]);
  for (const actor of [ids.member, ids.moderator, ids.inactive]) {
    const denied = authenticated(actor, "select public.list_courses_for_management(null,null,null,30,0);");
    assert.notEqual(denied.status, 0); assert.match(denied.stderr, /권한이 없습니다/);
  }
  const anon = sql("set role anon; select public.list_courses_for_management(null,null,null,30,0);");
  assert.notEqual(anon.status, 0); assert.match(anon.stderr, /permission denied/i);
});

test("admin creates an inactive course, exact replay is a noop and payload-conflict replay is rejected", () => {
  const requestId = randomUUID();
  const statement = `select public.mutate_managed_course('create',null,null,'${requestId}',$json$${payload()}$json$::jsonb);`;
  const created = json(authenticated(ids.admin, statement));
  assert.equal(created.course_status, "inactive");
  assert.equal(created.request_id, requestId);
  const replay = json(authenticated(ids.admin, statement));
  assert.deepEqual(replay, created);
  const conflict = authenticated(ids.admin, `select public.mutate_managed_course('create',null,null,'${requestId}',$json$${payload({ name: "TEST 다른 골프장" })}$json$::jsonb);`);
  assert.notEqual(conflict.status, 0); assert.match(conflict.stderr, /재사용할 수 없습니다/);
  const counts = sql(`select concat_ws(',',
    (select count(*) from public.courses where course_key='${created.course_key}'),
    (select count(*) from public.audit_logs where actor_id='${ids.admin}' and request_id='${requestId}'),
    (select count(*) from private.course_operation_requests where actor_id='${ids.admin}' and request_id='${requestId}')
  );`, "postgres").stdout.trim();
  assert.equal(counts, "1,1,1");
});

test("deterministic duplicate warning is nonblocking and contains no internal UUID", () => {
  const candidates = json(authenticated(ids.admin, "select public.find_course_duplicate_candidates('TEST 운영 공개 골프장','서울','마포구',null);"));
  assert.equal(candidates.length, 1);
  assert.deepEqual(Object.keys(candidates[0]).sort(), ["address", "city", "course_key", "course_status", "name", "region"]);
  assert.equal(JSON.stringify(candidates).includes(ids.member), false);
});

test("admin updates by stable key and stale updates fail without partial audit or ledger", () => {
  const requestId = randomUUID();
  const updated = json(authenticated(ids.admin, `select public.mutate_managed_course('update','ops-inactive','${inactiveUpdatedAt}','${requestId}',$json$${payload({ name: "TEST 운영 숨김 골프장 수정", course_type: "screen", region: "경기", city: "수원시", address: "경기 TEST 운영 주소 2", holes: 9, operation_code: "phone", feature_codes: ["lesson_available"], description: "TEST 운영 숨김 골프장 수정 설명입니다." })}$json$::jsonb);`));
  assert.equal(updated.course_key, "ops-inactive");
  const staleId = randomUUID();
  const stale = authenticated(ids.admin, `select public.mutate_managed_course('update','ops-inactive','${inactiveUpdatedAt}','${staleId}',$json$${payload()}$json$::jsonb);`);
  assert.notEqual(stale.status, 0); assert.match(stale.stderr, /최신 내용을/);
  assert.equal(sql(`select count(*) from private.course_operation_requests where request_id='${staleId}';`, "postgres").stdout.trim(), "0");
});

test("publication mutation changes public visibility, replays before stale checks and never hard-deletes", () => {
  const requestId = randomUUID();
  assert.equal(json(sql("set role anon; select public.get_public_course('ops-active');")).course_key, "ops-active");
  const statement = `select public.mutate_managed_course('deactivate','ops-active','${activeUpdatedAt}','${requestId}','{}'::jsonb);`;
  const hidden = json(authenticated(ids.admin, statement));
  assert.equal(hidden.course_status, "inactive");
  assert.deepEqual(json(authenticated(ids.admin, statement)), hidden);
  const publicList = json(sql("set role anon; select public.list_public_courses('TEST 운영 공개 골프장',null,null,null,null,null,24,0);"));
  assert.equal(publicList.total, 0);
  assert.equal(sql("select count(*) from public.courses where course_key='ops-active';", "postgres").stdout.trim(), "1");
});

test("report list/detail is privacy-minimized and exact received ordering is available only to admin", () => {
  const page = json(authenticated(ids.admin, "select public.list_course_information_reports_for_management('received',30,0);"));
  assert.equal(page.total, 2);
  assert.equal(page.items[0].report_id, ids.report);
  assert.equal("reporter_user_id" in page.items[0], false);
  const detail = json(authenticated(ids.admin, `select public.get_course_information_report_for_management('${ids.report}');`));
  assert.equal(detail.report_status, "received");
  assert.equal("reporter_user_id" in detail, false);
  assert.equal("resolved_by" in detail, false);
  for (const actor of [ids.member, ids.moderator, ids.inactive]) {
    const denied = authenticated(actor, "select public.list_course_information_reports_for_management(null,30,0);");
    assert.notEqual(denied.status, 0); assert.match(denied.stderr, /권한이 없습니다/);
  }
});

test("report resolution, replay, audit and ledger are singular; a second resolution rolls back cleanly", () => {
  const expected = sql(`select updated_at from public.course_information_reports where id='${ids.report}';`, "postgres").stdout.trim();
  const requestId = randomUUID();
  const statement = `select public.resolve_course_information_report_for_management('${ids.report}','handled','${expected}','운영시간 확인 완료','${requestId}');`;
  const handled = json(authenticated(ids.admin, statement));
  assert.equal(handled.report_status, "handled");
  assert.deepEqual(json(authenticated(ids.admin, statement)), handled);
  const secondId = randomUUID();
  const second = authenticated(ids.admin, `select public.resolve_course_information_report_for_management('${ids.report}','dismissed','${handled.updated_at}',null,'${secondId}');`);
  assert.notEqual(second.status, 0); assert.match(second.stderr, /이미 처리된/);
  const counts = sql(`select concat_ws(',',
    (select count(*) from public.course_information_reports where id='${ids.report}' and report_status='handled'),
    (select count(*) from public.audit_logs where request_id='${requestId}'),
    (select count(*) from private.course_operation_requests where request_id='${requestId}'),
    (select count(*) from private.course_operation_requests where request_id='${secondId}')
  );`, "postgres").stdout.trim();
  assert.equal(counts, "1,1,1,0");
});

test("a separate received report can be dismissed once with an optional note", () => {
  const expected = sql(`select updated_at from public.course_information_reports where id='${ids.reportDismissed}';`, "postgres").stdout.trim();
  const requestId = randomUUID();
  const dismissed = json(authenticated(ids.admin, `select public.resolve_course_information_report_for_management('${ids.reportDismissed}','dismissed','${expected}','공식 정보에서 확인되지 않음','${requestId}');`));
  assert.equal(dismissed.report_status, "dismissed");
  assert.equal(sql(`select count(*) from public.audit_logs where request_id='${requestId}' and action='course.information_report.dismissed';`, "postgres").stdout.trim(), "1");
  assert.equal(json(authenticated(ids.admin, "select public.list_course_information_reports_for_management('received',30,0);")).total, 0);
});

test("public course list/detail and active-member report submission remain compatible", () => {
  const publicPage = json(sql("set role anon; select public.list_public_courses(null,null,null,null,null,null,24,0);"));
  assert.equal(publicPage.items.every((item) => item.course_key !== "ops-active" && item.course_status === undefined), true);
  const before = sql("select count(*) from public.courses;", "postgres").stdout.trim();
  const submitted = json(authenticated(ids.member, "select public.submit_course_information_report('new_course',null,'TEST 회원 신규 제보','전라','전라 TEST 제보 위치',null,'TEST 회원 공개 제보 회귀 본문입니다.');"));
  assert.equal(submitted.status, "received");
  assert.equal(sql("select count(*) from public.courses;", "postgres").stdout.trim(), before);
});

test("authenticated direct course/report/ledger/audit writes remain denied", () => {
  for (const statement of [
    "update public.courses set name='직접 변경' where course_key='ops-active';",
    `update public.course_information_reports set report_status='dismissed' where id='${ids.report}';`,
    `insert into private.course_operation_requests(actor_id,request_id,action_code,request_fingerprint) values ('${ids.member}','${randomUUID()}','course.update',repeat('a',64));`,
    `insert into public.audit_logs(actor_id,actor_type,action,target_type,request_id,outcome) values ('${ids.member}','user','course.update','course','${randomUUID()}','success');`,
  ]) {
    const denied = authenticated(ids.member, statement);
    assert.notEqual(denied.status, 0); assert.match(denied.stderr, /permission denied|row-level security/i);
  }
});
