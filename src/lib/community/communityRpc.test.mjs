import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260824000100_pul_community_core_foundation.sql", import.meta.url)), "utf8");
function docker(args, input) { return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }); }
function sql(text, user = "supabase_admin") { return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text); }
function authenticated(actor, text) { return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`); }
function json(result) { assert.equal(result.status, 0, result.stdout + result.stderr); return JSON.parse(result.stdout.trim()); }

const ids = { owner: randomUUID(), other: randomUUID(), hiddenPost: randomUUID() };
let container; let database; let freeId; let questionId; let reviewId; let lostId; let commentId;

before(() => {
  const found = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(found.length, 1);
  container = found[0]; database = `pul_community_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [`createdb -U supabase_admin -O postgres ${database}`, `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`, `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const applied = sql(`begin; ${migration} commit;`, "postgres"); assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  const authRows = [ids.owner, ids.other].map((id) => `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','community-${id}@example.invalid','',now(),now(),now())`).join(",");
  const fixture = sql(`set session_replication_role=replica; insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows}; insert into public.user_accounts(id,account_status) values ('${ids.owner}','active'),('${ids.other}','active'); insert into public.user_profiles(user_id,nickname,profile_visibility) values ('${ids.owner}','TEST 작성자','public'),('${ids.other}','TEST 비공개 회원','private'); set session_replication_role=origin;`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => { if (container && database) assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0); });

test("active author creates category-specific posts and invalid payloads fail closed", () => {
  freeId = json(authenticated(ids.owner, `select public.mutate_community_post('create',null,null,'{"category":"free","title":"TEST 자유 글","body":"TEST 자유 게시글 본문 열 글자 이상입니다."}');`)).post_id;
  questionId = json(authenticated(ids.owner, `select public.mutate_community_post('create',null,null,'{"category":"question","title":"TEST 질문 글","body":"TEST 질문 게시글 본문 열 글자 이상입니다.","question_type":"beginner"}');`)).post_id;
  reviewId = json(authenticated(ids.owner, `select public.mutate_community_post('create',null,null,'{"category":"review","title":"TEST 후기 글","body":"TEST 후기 게시글 본문 열 글자 이상입니다.","review_type":"course","rating":5}');`)).post_id;
  lostId = json(authenticated(ids.owner, `select public.mutate_community_post('create',null,null,'{"category":"lostFound","title":"TEST 분실 글","body":"TEST 분실 게시글 본문 열 글자 이상입니다.","lost_found_kind":"lost","lost_found_item_name":"TEST 공가방","lost_found_place":"TEST 1번 홀","lost_found_date":"2026-08-19","lost_found_status":"searching"}');`)).post_id;
  const updated = json(authenticated(ids.owner, `select public.mutate_community_post('update','${freeId}',1,'{"category":"free","title":"TEST 수정 자유 글","body":"TEST 수정 자유 게시글 본문 열 글자 이상입니다."}');`)); assert.equal(updated.version, 2);
  const hidden = sql(`insert into public.community_posts(id,author_user_id,category_code,title,body,post_status) values ('${ids.hiddenPost}','${ids.owner}','free','TEST 숨김 글','TEST 숨김 게시글 본문 열 글자 이상입니다.','hidden');`, "postgres"); assert.equal(hidden.status, 0, hidden.stdout + hidden.stderr);
  const invalidRating = authenticated(ids.owner, `select public.mutate_community_post('create',null,null,'{"category":"review","title":"TEST 잘못된 후기","body":"TEST 후기 게시글 본문 열 글자 이상입니다.","review_type":"course","rating":6}');`);
  assert.notEqual(invalidRating.status, 0); assert.match(invalidRating.stderr, /별점|확인/);
  const notice = authenticated(ids.owner, `select public.mutate_community_post('create',null,null,'{"category":"notice","title":"TEST 공지","body":"TEST 공지 본문 열 글자 이상입니다."}');`);
  assert.notEqual(notice.status, 0); assert.match(notice.stderr, /카테고리/);
  const anonCreate = sql(`set role anon; select public.mutate_community_post('create',null,null,'{"category":"free","title":"TEST 익명 글","body":"TEST 익명 게시글 본문 열 글자 이상입니다."}');`); assert.notEqual(anonCreate.status, 0); assert.match(anonCreate.stderr, /permission denied/i);
});

test("public list, search, filters, detail and pagination expose no private identifiers", () => {
  const page = json(sql("set role anon; select public.list_community_posts(null,null,'latest',2,0);"));
  assert.equal(page.items.length, 2); assert.equal(page.total, 4); assert.equal(page.has_more, true); assert.equal("author_user_id" in page.items[0], false);
  const question = json(sql("set role anon; select public.list_community_posts('question','질문','comments',24,0);"));
  assert.equal(question.items.length, 1); assert.equal(question.items[0].id, questionId); assert.equal(question.items[0].question_status, "waiting");
  const detail = json(sql(`set role anon; select public.get_community_post('${freeId}');`)); assert.equal(detail.id, freeId); assert.equal(detail.can_edit, false);
  const hiddenDetail = sql(`set role anon; select public.get_community_post('${ids.hiddenPost}');`); assert.notEqual(hiddenDetail.status, 0); assert.match(hiddenDetail.stderr, /찾을 수 없습니다/);
  const privateName = json(sql(`set request.jwt.claim.sub='${ids.other}'; set role authenticated; select public.get_community_post('${freeId}');`)); assert.equal(privateName.author_display_name, "TEST 작성자");
});

test("comments are one-level, public-readable and author/version protected", () => {
  const created = json(authenticated(ids.other, `select public.mutate_community_comment('create','${questionId}',null,null,'TEST 정상 댓글입니다.');`)); commentId = created.comment_id;
  const page = json(sql(`set role anon; select public.list_community_comments('${questionId}',50,0);`)); assert.equal(page.items.length, 1); assert.equal(page.items[0].author_display_name, "PUL 회원"); assert.equal("author_user_id" in page.items[0], false);
  const edited = json(authenticated(ids.other, `select public.mutate_community_comment('update','${questionId}','${commentId}',1,'TEST 수정 댓글입니다.');`)); assert.equal(edited.version, 2);
  const denied = authenticated(ids.owner, `select public.mutate_community_comment('remove','${questionId}','${commentId}',2,null);`); assert.notEqual(denied.status, 0); assert.match(denied.stderr, /본인의/);
  const stale = authenticated(ids.other, `select public.mutate_community_comment('update','${questionId}','${commentId}',1,'TEST 오래된 수정입니다.');`); assert.notEqual(stale.status, 0); assert.match(stale.stderr, /새로고침/);
});

test("question and lost-found owner transitions are exact and non-owner writes are denied", () => {
  const resolved = json(authenticated(ids.owner, `select public.mutate_community_post('resolve_question','${questionId}',1,'{}');`)); assert.equal(resolved.version, 2);
  const otherResolve = authenticated(ids.other, `select public.mutate_community_post('resolve_question','${questionId}',2,'{}');`); assert.notEqual(otherResolve.status, 0); assert.match(otherResolve.stderr, /본인의/);
  const resolveAgain = authenticated(ids.owner, `select public.mutate_community_post('resolve_question','${questionId}',2,'{}');`); assert.notEqual(resolveAgain.status, 0); assert.match(resolveAgain.stderr, /이미 해결/);
  const lostResolved = json(authenticated(ids.owner, `select public.mutate_community_post('update_lost_found','${lostId}',1,'{"lost_found_status":"resolved"}');`)); assert.equal(lostResolved.version, 2);
  const otherLost = authenticated(ids.other, `select public.mutate_community_post('update_lost_found','${lostId}',2,'{"lost_found_status":"searching"}');`); assert.notEqual(otherLost.status, 0); assert.match(otherLost.stderr, /본인의/);
  const reopened = json(authenticated(ids.owner, `select public.mutate_community_post('update_lost_found','${lostId}',2,'{"lost_found_status":"searching"}');`)); assert.equal(reopened.version, 3);
  const denied = authenticated(ids.other, `select public.mutate_community_post('update','${reviewId}',1,'{"category":"review","title":"TEST 탈취 수정","body":"TEST 탈취 수정 본문 열 글자 이상입니다.","review_type":"course","rating":4}');`); assert.notEqual(denied.status, 0); assert.match(denied.stderr, /본인의/);
});

test("soft deletion hides post and comments while direct authenticated DML stays denied", () => {
  const directPost = authenticated(ids.owner, `update public.community_posts set title='직접 변경' where id='${freeId}';`); assert.notEqual(directPost.status, 0); assert.match(directPost.stderr, /permission denied|row-level security/i);
  const directComment = authenticated(ids.other, `delete from public.community_comments where id='${commentId}';`); assert.notEqual(directComment.status, 0); assert.match(directComment.stderr, /permission denied|row-level security/i);
  const removedComment = json(authenticated(ids.other, `select public.mutate_community_comment('remove','${questionId}','${commentId}',2,null);`)); assert.equal(removedComment.removed, true);
  const removedPost = json(authenticated(ids.owner, `select public.mutate_community_post('remove','${freeId}',2,'{}');`)); assert.equal(removedPost.status, "removed");
  const visible = json(sql("set role anon; select public.list_community_posts(null,null,'latest',24,0);")); assert.equal(visible.items.some((item) => item.id === freeId), false);
  const hiddenDetail = sql(`set role anon; select public.get_community_post('${freeId}');`); assert.notEqual(hiddenDetail.status, 0); assert.match(hiddenDetail.stderr, /찾을 수 없습니다/);
});
