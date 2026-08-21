import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260906000100_pul_course_discussion_posts.sql", import.meta.url)),
  "utf8",
);
const communityFoundation = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260824000100_pul_community_core_foundation.sql", import.meta.url)),
  "utf8",
);
const courseFoundation = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260825000100_pul_course_directory_foundation.sql", import.meta.url)),
  "utf8",
);

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

const ids = {
  publicAuthor: randomUUID(),
  privateAuthor: randomUUID(),
  suspended: randomUUID(),
};
let container;
let database;
let newestPostKey;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"])
    .stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_course_discussions_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const communityExists = sql("select pg_catalog.to_regprocedure('private.community_assert_active_actor()') is not null;", "postgres");
  assert.equal(communityExists.status, 0, communityExists.stdout + communityExists.stderr);
  if (communityExists.stdout.trim() !== "t") {
    const appliedCommunity = sql(`begin; ${communityFoundation} commit;`, "postgres");
    assert.equal(appliedCommunity.status, 0, appliedCommunity.stdout + appliedCommunity.stderr);
  }

  const courseExists = sql("select pg_catalog.to_regclass('public.courses') is not null;", "postgres");
  assert.equal(courseExists.status, 0, courseExists.stdout + courseExists.stderr);
  if (courseExists.stdout.trim() !== "t") {
    const appliedCourse = sql(`begin; ${courseFoundation} commit;`, "postgres");
    assert.equal(appliedCourse.status, 0, appliedCourse.stdout + appliedCourse.stderr);
  }

  const exists = sql("select pg_catalog.to_regclass('public.course_discussion_posts') is not null;", "postgres");
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = Object.entries(ids).map(([alias, id]) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','course-discussion-${alias}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status) values
      ('${ids.publicAuthor}','active'),
      ('${ids.privateAuthor}','active'),
      ('${ids.suspended}','suspended');
    insert into public.user_profiles(user_id,nickname,profile_visibility) values
      ('${ids.publicAuthor}','TEST 이야기 작성자','public'),
      ('${ids.privateAuthor}','TEST 비공개 작성자','private');
    set session_replication_role=origin;
    insert into public.courses(course_key,name,course_type,region,city,address,holes,operation_code,description,course_status) values
      ('discussion-course-a','TEST 이야기 골프장 A','field','서울','마포구','서울 TEST 이야기 골프장 주소 A',18,'walkIn','TEST 이야기 골프장 A 공개 설명입니다.','active'),
      ('discussion-course-b','TEST 이야기 골프장 B','screen','경기','수원시','경기 TEST 이야기 골프장 주소 B',9,'phone','TEST 이야기 골프장 B 공개 설명입니다.','active'),
      ('discussion-inactive','TEST 비공개 이야기 골프장','field','서울','강서구','서울 TEST 비공개 골프장 주소',18,'walkIn','TEST 비공개 이야기 골프장 설명입니다.','inactive'),
      ('discussion-removed','TEST 삭제 이야기 골프장','field','제주','제주시','제주 TEST 삭제 골프장 주소',18,'walkIn','TEST 삭제 이야기 골프장 설명입니다.','removed');`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) {
    assert.equal(
      docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status,
      0,
    );
  }
});

test("anon can list an active course but cannot submit", () => {
  const page = json(sql("set role anon; select public.list_public_course_discussion_posts('discussion-course-a',20,0);"));
  assert.deepEqual(page, { items: [], total: 0, limit: 20, offset: 0, has_more: false });
  const denied = sql("set role anon; select public.submit_course_discussion_post('discussion-course-a','TEST 익명 게시글 본문입니다.');");
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /permission denied/i);
});

test("active members submit trimmed posts and public DTOs preserve profile privacy", () => {
  const first = json(authenticated(ids.publicAuthor, "select public.submit_course_discussion_post('discussion-course-a','  오늘 골프장 잔디 상태가 매우 좋았습니다.  ');"));
  assert.match(first.post_key, /^[0-9a-f]{32}$/);
  assert.equal(first.post_status, "published");
  assert.deepEqual(Object.keys(first).sort(), ["post_key", "post_status"]);

  const second = json(authenticated(ids.privateAuthor, "select public.submit_course_discussion_post('discussion-course-a','오전에는 대기가 조금 있었지만 이용하기 좋았습니다.');"));
  newestPostKey = second.post_key;
  const otherCourse = json(authenticated(ids.publicAuthor, "select public.submit_course_discussion_post('discussion-course-b','스크린 골프장 장비 상태가 깨끗하고 좋았습니다.');"));
  assert.match(otherCourse.post_key, /^[0-9a-f]{32}$/);

  const page = json(sql("set role anon; select public.list_public_course_discussion_posts('discussion-course-a',20,0);"));
  assert.equal(page.total, 2);
  assert.equal(page.items[0].post_key, newestPostKey);
  assert.equal(page.items[0].author_display_name, "PUL 회원");
  assert.equal(page.items[1].author_display_name, "TEST 이야기 작성자");
  for (const item of page.items) {
    assert.deepEqual(Object.keys(item).sort(), ["author_display_name", "body", "created_at", "post_key"]);
  }
});

test("pagination is latest-first and never mixes courses", () => {
  const first = json(sql("set role anon; select public.list_public_course_discussion_posts('discussion-course-a',1,0);"));
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].post_key, newestPostKey);
  assert.equal(first.total, 2);
  assert.equal(first.has_more, true);
  const second = json(sql("set role anon; select public.list_public_course_discussion_posts('discussion-course-a',1,1);"));
  assert.equal(second.items.length, 1);
  assert.equal(second.has_more, false);
  const courseB = json(sql("set role anon; select public.list_public_course_discussion_posts('discussion-course-b',20,0);"));
  assert.equal(courseB.total, 1);
  assert.ok(courseB.items.every((item) => !first.items.some((other) => other.post_key === item.post_key)));
});

test("suspended actors, missing or non-public courses, and invalid lengths fail closed", () => {
  const cases = [
    authenticated(ids.suspended, "select public.submit_course_discussion_post('discussion-course-a','TEST 정지 회원 게시글 본문입니다.');"),
    authenticated(ids.publicAuthor, "select public.submit_course_discussion_post('missing-course','TEST 없는 골프장 게시글 본문입니다.');"),
    authenticated(ids.publicAuthor, "select public.submit_course_discussion_post('discussion-inactive','TEST 비공개 골프장 게시글 본문입니다.');"),
    authenticated(ids.publicAuthor, "select public.submit_course_discussion_post('discussion-removed','TEST 삭제 골프장 게시글 본문입니다.');"),
    authenticated(ids.publicAuthor, "select public.submit_course_discussion_post('discussion-course-a','짧음');"),
    authenticated(ids.publicAuthor, "select public.submit_course_discussion_post('discussion-course-a',repeat('가',1001));"),
  ];
  for (const result of cases) assert.notEqual(result.status, 0);
  assert.match(cases[0].stderr, /정상 활동/);
  for (const result of cases.slice(1, 4)) assert.match(result.stderr, /찾을 수 없습니다/);
  for (const result of cases.slice(4)) assert.match(result.stderr, /10~1000자/);
});

test("authenticated raw reads and writes remain blocked", () => {
  const directRead = authenticated(ids.publicAuthor, "select count(*) from public.course_discussion_posts;");
  assert.notEqual(directRead.status, 0);
  assert.match(directRead.stderr, /permission denied|row-level security/i);
  const directInsert = authenticated(ids.publicAuthor, `insert into public.course_discussion_posts(course_id,author_user_id,body) select course.id,'${ids.publicAuthor}','TEST 직접 삽입은 차단되어야 합니다.' from public.courses as course where course.course_key='discussion-course-a';`);
  assert.notEqual(directInsert.status, 0);
  assert.match(directInsert.stderr, /permission denied|row-level security/i);
  const directUpdate = authenticated(ids.publicAuthor, "update public.course_discussion_posts set body='TEST 직접 수정은 차단되어야 합니다.';");
  assert.notEqual(directUpdate.status, 0);
  assert.match(directUpdate.stderr, /permission denied|row-level security/i);
});
