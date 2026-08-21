import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const lessonFoundation = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260827000100_pul_lesson_directory_foundation.sql", import.meta.url)),
  "utf8",
);
const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260902000100_pul_lesson_video_bookmarks.sql", import.meta.url)),
  "utf8",
);

function docker(args, input) {
  return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
}

function sql(text, user = "supabase_admin") {
  return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text);
}

function authenticated(actor, text) {
  return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

const ids = {
  admin: randomUUID(),
  member: randomUUID(),
  other: randomUUID(),
  inactive: randomUUID(),
};
let container;
let database;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout
    .split(/\r?\n/)
    .filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_lesson_bookmarks_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const foundationExists = sql("select pg_catalog.to_regprocedure('private.public_lesson_video_json(public.lesson_videos)') is not null;", "postgres");
  assert.equal(foundationExists.status, 0, foundationExists.stdout + foundationExists.stderr);
  if (foundationExists.stdout.trim() !== "t") {
    const appliedFoundation = sql(`begin; ${lessonFoundation} commit;`, "postgres");
    assert.equal(appliedFoundation.status, 0, appliedFoundation.stdout + appliedFoundation.stderr);
  }
  const applied = sql(`begin; ${migration} commit;`, "postgres");
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);

  const authRows = Object.entries(ids).map(([alias, id]) =>
    `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lesson-bookmark-${alias}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),('${ids.member}','active','member'),
      ('${ids.other}','active','member'),('${ids.inactive}','suspended','member');
    set session_replication_role=origin;
    insert into public.lesson_videos(
      video_key,title,category,channel_name,instructor_name,level,duration_text,description,youtube_url,
      youtube_channel_url,thumbnail_type,tags,is_featured,publication_status,created_by,updated_by
    ) values
      ('bookmark-video-a','TEST 북마크 영상 A','basic_stance','TEST 채널','TEST 강사','intro','08:30','TEST 북마크 영상 A 공개 설명입니다.','https://youtu.be/BookmarkVideoA',null,'green',array['입문'],false,'published','${ids.admin}','${ids.admin}'),
      ('bookmark-video-b','TEST 북마크 영상 B','swing','TEST 채널','TEST 강사','beginner','10:00','TEST 북마크 영상 B 공개 설명입니다.','https://youtu.be/BookmarkVideoB',null,'teal',array['스윙'],false,'published','${ids.admin}','${ids.admin}'),
      ('bookmark-hidden','TEST 숨김 북마크 영상','swing','TEST 채널','TEST 강사','intro','05:00','TEST 숨김 북마크 영상 설명입니다.','https://youtu.be/BookmarkHidden',null,'forest','{}',false,'hidden','${ids.admin}','${ids.admin}'),
      ('bookmark-removed','TEST 제거 북마크 영상','swing','TEST 채널','TEST 강사','intro','05:00','TEST 제거 북마크 영상 설명입니다.','https://youtu.be/BookmarkRemoved',null,'forest','{}',false,'removed','${ids.admin}','${ids.admin}');`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) {
    assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
  }
});

test("anon is denied while active save and duplicate save are idempotent", () => {
  const anon = sql("set role anon; select public.set_lesson_video_bookmark('bookmark-video-a',true);");
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);

  const saved = json(authenticated(ids.member, "select public.set_lesson_video_bookmark('bookmark-video-a',true);"));
  assert.deepEqual(saved, { video_key: "bookmark-video-a", saved: true });
  const replay = json(authenticated(ids.member, "select public.set_lesson_video_bookmark('bookmark-video-a',true);"));
  assert.deepEqual(replay, saved);
  assert.equal(sql(`select count(*) from public.lesson_video_bookmarks where user_id='${ids.member}';`).stdout.trim(), "1");
});

test("own list is isolated, batched, bounded, and contains no bookmark internals", () => {
  json(authenticated(ids.other, "select public.set_lesson_video_bookmark('bookmark-video-b',true);"));
  const own = json(authenticated(ids.member, "select public.list_my_lesson_video_bookmarks(array['bookmark-video-a','bookmark-video-b'],null,24,0);"));
  assert.equal(own.total, 1);
  assert.equal(own.items[0].video_key, "bookmark-video-a");
  for (const key of ["id", "user_id", "lesson_video_id", "created_at", "publication_status", "version"]) {
    assert.equal(key in own.items[0], false);
  }
  const other = json(authenticated(ids.other, "select public.list_my_lesson_video_bookmarks(null,null,24,0);"));
  assert.deepEqual(other.items.map((item) => item.video_key), ["bookmark-video-b"]);
});

test("inactive actors and nonexistent, hidden, or removed save targets fail closed", () => {
  for (const statement of [
    authenticated(ids.inactive, "select public.set_lesson_video_bookmark('bookmark-video-a',true);"),
    authenticated(ids.inactive, "select public.set_lesson_video_bookmark('bookmark-video-a',false);"),
  ]) {
    assert.notEqual(statement.status, 0);
    assert.match(statement.stderr, /정상 계정/);
  }
  for (const key of ["missing-video", "bookmark-hidden", "bookmark-removed"]) {
    const result = authenticated(ids.member, `select public.set_lesson_video_bookmark('${key}',true);`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /찾을 수 없|공개 중/);
  }
});

test("a bookmarked video hidden later is excluded without deleting the private row", () => {
  json(authenticated(ids.member, "select public.set_lesson_video_bookmark('bookmark-video-b',true);"));
  const hidden = sql("update public.lesson_videos set publication_status='hidden' where video_key='bookmark-video-b';", "postgres");
  assert.equal(hidden.status, 0, hidden.stdout + hidden.stderr);
  const page = json(authenticated(ids.member, "select public.list_my_lesson_video_bookmarks(null,null,24,0);"));
  assert.deepEqual(page.items.map((item) => item.video_key), ["bookmark-video-a"]);
  assert.equal(sql(`select count(*) from public.lesson_video_bookmarks where user_id='${ids.member}';`).stdout.trim(), "2");
});

test("unsave reaches a stable absent state and direct authenticated DML stays closed", () => {
  const removed = json(authenticated(ids.member, "select public.set_lesson_video_bookmark('bookmark-video-a',false);"));
  assert.deepEqual(removed, { video_key: "bookmark-video-a", saved: false });
  assert.deepEqual(json(authenticated(ids.member, "select public.set_lesson_video_bookmark('bookmark-video-a',false);")), removed);
  assert.equal(sql(`select count(*) from public.lesson_video_bookmarks where user_id='${ids.member}' and lesson_video_id=(select id from public.lesson_videos where video_key='bookmark-video-a');`).stdout.trim(), "0");

  const directInsert = authenticated(ids.member, `insert into public.lesson_video_bookmarks(user_id,lesson_video_id) select '${ids.member}',id from public.lesson_videos where video_key='bookmark-video-a';`);
  assert.notEqual(directInsert.status, 0);
  assert.match(directInsert.stderr, /permission denied|row-level security/i);
  const directRead = authenticated(ids.member, "select count(*) from public.lesson_video_bookmarks;");
  assert.notEqual(directRead.status, 0);
  assert.match(directRead.stderr, /permission denied|row-level security/i);
});
