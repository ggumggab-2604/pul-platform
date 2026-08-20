import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260825000100_pul_course_directory_foundation.sql", import.meta.url)), "utf8");
function docker(args, input) { return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }); }
function sql(text, user = "supabase_admin") { return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text); }
function authenticated(actor, text) { return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`); }
function json(result) { assert.equal(result.status, 0, result.stdout + result.stderr); return JSON.parse(result.stdout.trim()); }

const ids = { active: randomUUID(), inactive: randomUUID() };
let container; let database;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_courses_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const applied = sql(`begin; ${migration} commit;`, "postgres");
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);

  const authRows = [ids.active, ids.inactive].map((id) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','course-${id}@example.invalid','',now(),now(),now())`).join(",");
  const fixture = sql(`set session_replication_role=replica; insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows}; insert into public.user_accounts(id,account_status) values ('${ids.active}','active'),('${ids.inactive}','suspended'); set session_replication_role=origin;
    insert into public.courses(course_key,name,course_type,region,city,address,holes,operating_hours,operation_code,phone,parking_available,feature_codes,description,reservation_url,reservation_guide,fee_guide,latitude,longitude,course_status) values
    ('1','TEST 한강 코스','field','서울','마포구','서울 TEST 주소 1',18,'06:00-18:00','reservation','02-000-0000',true,array['club_available','event_history'],'TEST 공개 필드 골프장 설명입니다.','https://example.invalid/reserve','공식 사이트 예약','TEST 이용료',37.5,126.9,'active'),
    ('screen-1','TEST 스크린 코스','screen','경기','수원시','경기 TEST 주소 2',9,null,'phone',null,null,array['lesson_available','equipment_rental'],'TEST 공개 스크린 골프장 설명입니다.',null,null,null,null,null,'active'),
    ('inactive-1','TEST 비공개 코스','field','서울','강서구','서울 TEST 주소 3',27,null,'walkIn',null,false,'{}','TEST 비공개 골프장 설명입니다.',null,null,null,null,null,'inactive'),
    ('removed-1','TEST 삭제 코스','field','제주','제주시','제주 TEST 주소 4',36,null,'walkIn',null,true,'{}','TEST 삭제 골프장 설명입니다.',null,null,null,null,null,'removed');`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
});

test("anon sees active courses only and public payload excludes internal identifiers", () => {
  const page = json(sql("set role anon; select public.list_public_courses(null,null,null,null,null,null,24,0);"));
  assert.equal(page.total, 2);
  assert.deepEqual(page.items.map((item) => item.course_key).sort(), ["1", "screen-1"]);
  for (const item of page.items) {
    assert.equal("id" in item, false);
    assert.equal("course_status" in item, false);
    assert.equal("created_at" in item, false);
  }
});

test("type, region, operation, holes, features, keyword, and pagination filter on the server", () => {
  assert.equal(json(sql("set role anon; select public.list_public_courses(null,'field',null,null,null,null,24,0);" )).total, 1);
  assert.equal(json(sql("set role anon; select public.list_public_courses(null,null,'경기',null,null,null,24,0);" )).items[0].course_key, "screen-1");
  assert.equal(json(sql("set role anon; select public.list_public_courses(null,null,null,'reservation',null,null,24,0);" )).items[0].course_key, "1");
  assert.equal(json(sql("set role anon; select public.list_public_courses(null,null,null,null,'9',null,24,0);" )).items[0].course_key, "screen-1");
  assert.equal(json(sql("set role anon; select public.list_public_courses(null,null,null,null,null,array['parking'],24,0);" )).items[0].course_key, "1");
  assert.equal(json(sql("set role anon; select public.list_public_courses('한강',null,null,null,null,null,24,0);" )).items[0].course_key, "1");
  const first = json(sql("set role anon; select public.list_public_courses(null,null,null,null,null,null,1,0);"));
  assert.equal(first.items.length, 1); assert.equal(first.has_more, true); assert.equal(first.total, 2);
  const second = json(sql("set role anon; select public.list_public_courses(null,null,null,null,null,null,1,1);"));
  assert.equal(second.items.length, 1); assert.equal(second.has_more, false);
});

test("detail resolves the stable key and rejects absent or non-public courses", () => {
  const field = json(sql("set role anon; select public.get_public_course('1');"));
  assert.equal(field.course_type, "field"); assert.equal(field.course_key, "1");
  const screen = json(sql("set role anon; select public.get_public_course('screen-1');"));
  assert.equal(screen.course_type, "screen");
  for (const key of ["missing", "inactive-1", "removed-1"]) {
    const denied = sql(`set role anon; select public.get_public_course('${key}');`);
    assert.notEqual(denied.status, 0); assert.match(denied.stderr, /찾을 수 없습니다/);
  }
});

test("active member submits new and correction reports without mutating course data", () => {
  const before = sql("select updated_at::text from public.courses where course_key='1';", "postgres").stdout.trim();
  const created = json(authenticated(ids.active, "select public.submit_course_information_report('new_course',null,'TEST 신규 골프장','충청','충청 TEST 위치','전화 운영 확인','TEST 신규 골프장 제보 본문입니다.');"));
  assert.equal(created.status, "received");
  const corrected = json(authenticated(ids.active, "select public.submit_course_information_report('correction','1',null,null,null,'운영시간 변경 확인','TEST 기존 골프장 정보수정 내용입니다.');"));
  assert.equal(corrected.status, "received");
  const rows = sql("select count(*)||':'||count(*) filter (where report_type='correction' and target_course_id is not null)||':'||(select updated_at::text from public.courses where course_key='1') from public.course_information_reports;", "postgres").stdout.trim();
  assert.equal(rows, `2:1:${before}`);
});

test("anon, inactive member, invalid target, direct writes, and report reads fail closed", () => {
  const anon = sql("set role anon; select public.submit_course_information_report('new_course',null,'TEST 신규 골프장','서울','서울 TEST 위치',null,'TEST 제보 내용 열 자 이상입니다.');");
  assert.notEqual(anon.status, 0); assert.match(anon.stderr, /permission denied/i);
  const inactive = authenticated(ids.inactive, "select public.submit_course_information_report('new_course',null,'TEST 신규 골프장','서울','서울 TEST 위치',null,'TEST 제보 내용 열 자 이상입니다.');");
  assert.notEqual(inactive.status, 0); assert.match(inactive.stderr, /정상 활동/);
  const missing = authenticated(ids.active, "select public.submit_course_information_report('correction','missing',null,null,null,null,'TEST 수정 제보 내용입니다.');");
  assert.notEqual(missing.status, 0); assert.match(missing.stderr, /찾을 수 없습니다/);
  const courseWrite = authenticated(ids.active, "update public.courses set name='직접 변경' where course_key='1';");
  assert.notEqual(courseWrite.status, 0); assert.match(courseWrite.stderr, /permission denied|row-level security/i);
  const reportRead = authenticated(ids.active, "select count(*) from public.course_information_reports;");
  assert.notEqual(reportRead.status, 0); assert.match(reportRead.stderr, /permission denied|row-level security/i);
});
