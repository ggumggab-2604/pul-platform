import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const courseMigration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260825000100_pul_course_directory_foundation.sql", import.meta.url)), "utf8");
const communityMigration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260824000100_pul_community_core_foundation.sql", import.meta.url)), "utf8");
const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260826000100_pul_event_directory_foundation.sql", import.meta.url)), "utf8");
function docker(args, input) { return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }); }
function sql(text, user = "supabase_admin") { return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text); }
function authenticated(actor, text) { return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`); }
function json(result) { assert.equal(result.status, 0, result.stdout + result.stderr); return JSON.parse(result.stdout.trim()); }
function payload(overrides = {}) { return JSON.stringify({
  title: "TEST 신규 대회", match_type: "field", event_scale: "city", region: "서울", venue_name: "TEST 한강 코스",
  venue_type: "publicCourse", start_date: "2026-10-10", end_date: null, schedule_note: null,
  registration_status: "scheduled", target_audience: ["동호인"], organizer: "TEST 운영 기관",
  summary: "TEST 신규 대회의 공개 안내 본문입니다.", benefits: ["기념품"], recruitment_status: "none",
  related_course_key: "course-1", official_url: "https://example.invalid/event", registration_url: null,
  registration_note: "공식 공지를 확인하세요.", is_featured: false, ...overrides,
}); }

const ids = { admin: randomUUID(), member: randomUUID(), suspendedAdmin: randomUUID() };
let container; let database;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_events_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const applied = sql(`begin; ${communityMigration} ${courseMigration} ${migration} commit;`, "postgres");
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);

  const authRows = Object.entries(ids).map(([alias, id]) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','event-${alias}@example.invalid','',now(),now(),now())`).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),('${ids.member}','active','member'),('${ids.suspendedAdmin}','suspended','platform_admin');
    set session_replication_role=origin;
    insert into public.courses(course_key,name,course_type,region,city,address,holes,operation_code,parking_available,description,course_status) values
      ('course-1','TEST 공개 코스','field','서울','마포구','서울 TEST 주소',18,'reservation',true,'TEST 공개 골프장 설명입니다.','active'),
      ('course-hidden','TEST 비공개 코스','field','경기','수원시','경기 TEST 주소',18,'phone',false,'TEST 비공개 골프장 설명입니다.','inactive');
    insert into public.events(event_key,title,match_type,event_scale,region,venue_name,venue_type,start_date,schedule_note,registration_status,target_audience,organizer,summary,benefits,recruitment_status,related_course_id,official_url,registration_url,registration_note,is_featured,publication_status,created_by,updated_by) values
      ('field-1','TEST 서울 필드 대회','field','national','서울','TEST 공개 코스','publicCourse','2026-10-15',null,'open',array['전국 동호인'],'TEST 협회','TEST 서울 필드 대회의 공개 설명입니다.',array['기념품'],'refereeOpen',(select id from public.courses where course_key='course-1'),'https://example.invalid/field','https://example.invalid/register','외부 공식 접수',true,'published','${ids.admin}','${ids.admin}'),
      ('screen-1','TEST 경기 스크린 대회','screen','store','경기','TEST 스크린 매장','screen','2026-11-01',null,'scheduled',array['누구나'],'TEST 매장','TEST 경기 스크린 대회의 공개 설명입니다.',array['시상품'],'none',null,null,null,null,false,'published','${ids.admin}','${ids.admin}'),
      ('course-hidden-link','TEST 비공개 코스 연결 대회','field','friendly','경기','TEST 비공개 코스','privateVenue',null,'2026년 겨울 예정','needCheck',array['동호인'],'TEST 동호회','TEST 비공개 코스 연결 대회 설명입니다.','{}','none',(select id from public.courses where course_key='course-hidden'),null,null,null,false,'published','${ids.admin}','${ids.admin}'),
      ('hidden-1','TEST 숨김 대회','field','city','서울','TEST 장소','field','2026-12-01',null,'scheduled',array['시민'],'TEST 기관','TEST 숨김 대회의 공개되지 않을 설명입니다.','{}','none',null,null,null,null,false,'hidden','${ids.admin}','${ids.admin}'),
      ('removed-1','TEST 제거 대회','screen','store','서울','TEST 매장','screen','2026-12-02',null,'ended',array['누구나'],'TEST 매장','TEST 제거 대회의 공개되지 않을 설명입니다.','{}','none',null,null,null,null,false,'removed','${ids.admin}','${ids.admin}');
    insert into public.community_posts(author_user_id,category_code,title,body,post_status,review_type,rating) values
      ('${ids.member}','review','TEST 공개 대회 후기','TEST 공개 대회 후기 본문 열 자 이상입니다.','published','event',5),
      ('${ids.member}','review','TEST 골프장 후기','TEST 골프장 후기 본문 열 자 이상입니다.','published','course',4),
      ('${ids.member}','review','TEST 숨김 대회 후기','TEST 숨김 대회 후기 본문 열 자 이상입니다.','hidden','event',3);`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
});

test("anon sees published events only and no internal operator fields", () => {
  const page = json(sql("set role anon; select public.list_public_events(null,null,null,24,0);"));
  assert.equal(page.total, 3);
  assert.deepEqual(page.items.map((item) => item.event_key).sort(), ["course-hidden-link", "field-1", "screen-1"]);
  for (const item of page.items) {
    for (const key of ["id", "publication_status", "created_by", "updated_by", "version"]) assert.equal(key in item, false);
  }
});

test("server filters and pagination keep field and screen in one model", () => {
  assert.equal(json(sql("set role anon; select public.list_public_events('field',null,null,24,0);" )).total, 2);
  assert.equal(json(sql("set role anon; select public.list_public_events('screen',null,null,24,0);" )).items[0].event_key, "screen-1");
  assert.equal(json(sql("set role anon; select public.list_public_events(null,'서울',null,24,0);" )).items[0].event_key, "field-1");
  assert.equal(json(sql("set role anon; select public.list_public_events(null,null,'open',24,0);" )).items[0].event_key, "field-1");
  const first = json(sql("set role anon; select public.list_public_events(null,null,null,1,0);"));
  const second = json(sql("set role anon; select public.list_public_events(null,null,null,1,1);"));
  assert.equal(first.items.length, 1); assert.equal(first.total, 3); assert.equal(first.has_more, true);
  assert.equal(second.items.length, 1);
});

test("stable detail exposes only an active course key and hides absent, hidden, and removed events", () => {
  const field = json(sql("set role anon; select public.get_public_event('field-1');"));
  assert.deepEqual(field.related_course, { course_key: "course-1", name: "TEST 공개 코스" });
  const unavailableCourse = json(sql("set role anon; select public.get_public_event('course-hidden-link');"));
  assert.equal(unavailableCourse.related_course, null);
  for (const key of ["missing", "hidden-1", "removed-1"]) {
    const result = sql(`set role anon; select public.get_public_event('${key}');`);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /찾을 수 없습니다/);
  }
});

test("region summaries derive from published field events only", () => {
  const summaries = json(sql("set role anon; select public.get_public_event_region_summaries(null);"));
  assert.deepEqual(summaries.map((item) => item.region), ["서울", "경기"]);
  const seoul = summaries.find((item) => item.region === "서울");
  assert.equal(seoul.open_count, 1); assert.equal(seoul.need_check_count, 0); assert.equal(seoul.representative_title, "TEST 서울 필드 대회");
  const open = json(sql("set role anon; select public.get_public_event_region_summaries('open');"));
  assert.deepEqual(open.map((item) => item.region), ["서울"]);
});

test("event review projection reuses published community event reviews only", () => {
  const reviews = json(sql("set role anon; select public.list_public_event_reviews(2);"));
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].title, "TEST 공개 대회 후기");
  assert.equal(reviews[0].rating, 5);
  assert.equal(reviews[0].author_display_name, "PUL 회원");
  assert.equal("author_user_id" in reviews[0], false);
});

test("platform admin can create, publish, end, and hide while ordinary or inactive actors cannot", () => {
  const denied = authenticated(ids.member, `select public.mutate_event('create','denied-event',null,$payload$${payload()}$payload$::jsonb);`);
  assert.notEqual(denied.status, 0); assert.match(denied.stderr, /권한/);
  const inactive = authenticated(ids.suspendedAdmin, `select public.mutate_event('create','inactive-event',null,$payload$${payload()}$payload$::jsonb);`);
  assert.notEqual(inactive.status, 0); assert.match(inactive.stderr, /권한/);
  const created = json(authenticated(ids.admin, `select public.mutate_event('create','new-event',null,$payload$${payload()}$payload$::jsonb);`));
  assert.equal(created.publication_status, "hidden"); assert.equal(created.version, 1);
  assert.equal(json(sql("set role anon; select public.list_public_events(null,null,null,24,0);" )).total, 3);
  const published = json(authenticated(ids.admin, "select public.mutate_event('publish','new-event',1,'{}'::jsonb);"));
  assert.equal(published.publication_status, "published"); assert.equal(published.version, 2);
  const ended = json(authenticated(ids.admin, "select public.mutate_event('end','new-event',2,'{}'::jsonb);"));
  assert.equal(ended.registration_status, "ended"); assert.equal(ended.version, 3);
  const hidden = json(authenticated(ids.admin, "select public.mutate_event('hide','new-event',3,'{}'::jsonb);"));
  assert.equal(hidden.publication_status, "hidden"); assert.equal(hidden.version, 4);
});

test("invalid URL, stale version, anon mutation, and direct authenticated DML fail closed", () => {
  const invalidUrl = authenticated(ids.admin, `select public.mutate_event('create','bad-url',null,$payload$${payload({ official_url: "javascript:alert(1)" })}$payload$::jsonb);`);
  assert.notEqual(invalidUrl.status, 0); assert.match(invalidUrl.stderr, /events_official_url_check|check constraint/i);
  const stale = authenticated(ids.admin, "select public.mutate_event('hide','field-1',999,'{}'::jsonb);");
  assert.notEqual(stale.status, 0); assert.match(stale.stderr, /변경되었습니다/);
  const anon = sql("set role anon; select public.mutate_event('hide','field-1',1,'{}'::jsonb);");
  assert.notEqual(anon.status, 0); assert.match(anon.stderr, /permission denied/i);
  const direct = authenticated(ids.admin, "update public.events set title='직접 변경' where event_key='field-1';");
  assert.notEqual(direct.status, 0); assert.match(direct.stderr, /permission denied|row-level security/i);
});
