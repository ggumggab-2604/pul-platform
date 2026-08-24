import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260908000100_pul_certification_study_posts.sql", import.meta.url)),
  "utf8",
);
const communityFoundation = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260824000100_pul_community_core_foundation.sql", import.meta.url)),
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

function certificationDirectoryCounts() {
  return json(sql(`select pg_catalog.jsonb_build_object(
    'requests', (select pg_catalog.count(*) from public.certification_submission_requests),
    'courses', (select pg_catalog.count(*) from public.certification_courses),
    'jobs', (select pg_catalog.count(*) from public.certification_jobs)
  );`));
}

const ids = {
  publicAuthor: randomUUID(),
  privateAuthor: randomUUID(),
  inactive: randomUUID(),
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
  database = `pul_certification_study_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const communityExists = sql(
    "select pg_catalog.to_regprocedure('private.community_assert_active_actor()') is not null;",
    "postgres",
  );
  assert.equal(communityExists.status, 0, communityExists.stdout + communityExists.stderr);
  if (communityExists.stdout.trim() !== "t") {
    const appliedCommunity = sql(`begin; ${communityFoundation} commit;`, "postgres");
    assert.equal(appliedCommunity.status, 0, appliedCommunity.stdout + appliedCommunity.stderr);
  }

  const exists = sql(
    "select pg_catalog.to_regclass('public.certification_study_posts') is not null;",
    "postgres",
  );
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }

  const authRows = Object.entries(ids).map(([alias, id]) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','certification-study-${alias}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status) values
      ('${ids.publicAuthor}','active'),
      ('${ids.privateAuthor}','active'),
      ('${ids.inactive}','withdrawn'),
      ('${ids.suspended}','suspended');
    insert into public.user_profiles(user_id,nickname,profile_visibility) values
      ('${ids.publicAuthor}','TEST 시험 준비 작성자','public'),
      ('${ids.privateAuthor}','TEST 비공개 시험 준비 작성자','private');
    set session_replication_role=origin;`, "postgres");
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

test("anon and authenticated users can list, while anon submit is blocked", () => {
  const anonPage = json(sql("set role anon; select public.list_public_certification_study_posts(20,0);"));
  assert.deepEqual(anonPage, { items: [], total: 0, limit: 20, offset: 0, has_more: false });
  const authenticatedPage = json(authenticated(
    ids.publicAuthor,
    "select public.list_public_certification_study_posts(20,0);",
  ));
  assert.deepEqual(authenticatedPage, anonPage);

  const denied = sql("set role anon; select public.submit_certification_study_post('TEST 익명 시험 준비 게시글 본문입니다.');");
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /permission denied/i);
});

test("active members submit trimmed posts and public DTOs preserve profile privacy", () => {
  const countsBefore = certificationDirectoryCounts();
  const first = json(authenticated(
    ids.publicAuthor,
    "select public.submit_certification_study_post('  필기시험 준비 순서와 학습 경험을 공유합니다.  ');",
  ));
  assert.match(first.post_key, /^[0-9a-f]{32}$/);
  assert.equal(first.post_status, "published");
  assert.deepEqual(Object.keys(first).sort(), ["post_key", "post_status"]);

  const second = json(authenticated(
    ids.privateAuthor,
    "select public.submit_certification_study_post('실기시험 연습 방법과 준비 경험을 공유합니다.');",
  ));
  newestPostKey = second.post_key;

  const page = json(sql("set role anon; select public.list_public_certification_study_posts(20,0);"));
  assert.equal(page.total, 2);
  assert.equal(page.items[0].post_key, newestPostKey);
  assert.equal(page.items[0].author_display_name, "PUL 회원");
  assert.equal(page.items[1].author_display_name, "TEST 시험 준비 작성자");
  assert.equal(page.items[1].body, "필기시험 준비 순서와 학습 경험을 공유합니다.");
  for (const item of page.items) {
    assert.deepEqual(Object.keys(item).sort(), ["author_display_name", "body", "created_at", "post_key"]);
  }
  assert.deepEqual(certificationDirectoryCounts(), countsBefore);
});

test("published posts paginate latest-first and removed posts stay out of public results", () => {
  const first = json(sql("set role anon; select public.list_public_certification_study_posts(1,0);"));
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].post_key, newestPostKey);
  assert.equal(first.total, 2);
  assert.equal(first.has_more, true);

  const second = json(sql("set role anon; select public.list_public_certification_study_posts(1,1);"));
  assert.equal(second.items.length, 1);
  assert.equal(second.has_more, false);

  const removed = sql(`insert into public.certification_study_posts(author_user_id,body,post_status,removed_at)
    values ('${ids.publicAuthor}','TEST 삭제된 시험 준비 게시글은 공개되지 않습니다.','removed',now());`, "postgres");
  assert.equal(removed.status, 0, removed.stdout + removed.stderr);
  const afterRemoved = json(sql("set role anon; select public.list_public_certification_study_posts(20,0);"));
  assert.equal(afterRemoved.total, 2);
});

test("inactive, suspended, and invalid-length submissions fail closed", () => {
  const cases = [
    authenticated(ids.inactive, "select public.submit_certification_study_post('TEST 비활성 회원 시험 준비 게시글입니다.');"),
    authenticated(ids.suspended, "select public.submit_certification_study_post('TEST 정지 회원 시험 준비 게시글입니다.');"),
    authenticated(ids.publicAuthor, "select public.submit_certification_study_post('짧음');"),
    authenticated(ids.publicAuthor, "select public.submit_certification_study_post(repeat('가',1001));"),
  ];
  for (const result of cases) assert.notEqual(result.status, 0);
  for (const result of cases.slice(0, 2)) assert.match(result.stderr, /정상 활동/);
  for (const result of cases.slice(2)) assert.match(result.stderr, /10~1000자/);
});

test("raw table SELECT, INSERT, UPDATE, and DELETE remain blocked", () => {
  const cases = [
    authenticated(ids.publicAuthor, "select count(*) from public.certification_study_posts;"),
    authenticated(ids.publicAuthor, `insert into public.certification_study_posts(author_user_id,body) values ('${ids.publicAuthor}','TEST 직접 삽입은 차단되어야 합니다.');`),
    authenticated(ids.publicAuthor, "update public.certification_study_posts set body='TEST 직접 수정은 차단되어야 합니다.';"),
    authenticated(ids.publicAuthor, "delete from public.certification_study_posts;"),
  ];
  for (const result of cases) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /permission denied|row-level security/i);
  }
});
