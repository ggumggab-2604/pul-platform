import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const migration = read("supabase/migrations/20260908000100_pul_certification_study_posts.sql");
const client = read("src/lib/certification/certificationStudyPosts.ts");
const page = read("src/app/certification/page.tsx");
const content = read("src/components/certification/CertificationPageContent.tsx");
const prep = read("src/components/certification/CertificationExamPrepTab.tsx");
const section = read("src/components/certification/CertificationStudyBoardSection.tsx");
const fullPage = read("src/app/certification/study/page.tsx");
const actions = read("src/app/certification/actions.ts");
const normalized = migration.replace(/\s+/g, " ").trim();

test("dedicated certification study table stays small and RPC-only", () => {
  assert.match(normalized, /create table public\.certification_study_posts \(/);
  assert.match(normalized, /body = pg_catalog\.btrim\(body\) and pg_catalog\.char_length\(body\) between 10 and 1000/);
  assert.match(normalized, /post_status in \('published', 'removed'\)/);
  assert.match(normalized, /alter table public\.certification_study_posts enable row level security/);
  assert.match(normalized, /alter table public\.certification_study_posts force row level security/);
  assert.match(normalized, /revoke all on table public\.certification_study_posts from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /comment_count|reply_count|like_count|rating|report_count|moderation_status|ledger|reviewer_id/i);
});

test("public list and authenticated submit use narrow SECURITY DEFINER ACLs", () => {
  assert.equal((migration.match(/security definer\s+set search_path = ''/g) ?? []).length, 2);
  assert.match(normalized, /grant execute on function public\.list_public_certification_study_posts\(integer, integer\) to anon, authenticated/);
  assert.match(normalized, /grant execute on function public\.submit_certification_study_post\(text\) to authenticated/);
  assert.doesNotMatch(normalized, /grant execute on function public\.submit_certification_study_post\(text\) to (?:public|anon|service_role)/);
  assert.match(normalized, /private\.community_assert_active_actor\(\)/);
  assert.match(normalized, /private\.community_actor_display_name\(page\.author_user_id, v_viewer_id\)/);
});

test("public DTO uses stable keys and excludes internal identifiers", () => {
  const list = migration.slice(
    migration.indexOf("create function public.list_public_certification_study_posts"),
    migration.indexOf("create function public.submit_certification_study_post"),
  );
  for (const forbidden of ["'id'", "'author_user_id'", "'email'", "'phone'"]) {
    assert.doesNotMatch(list, new RegExp(forbidden));
  }
  assert.match(list, /'post_key', page\.post_key/);
  assert.match(client, /exactKeys\(value, postKeys\)/);
  assert.match(client, /exactKeys\(value, \["items", "total", "limit", "offset", "has_more"\]\)/);
});

test("certification preview and full route use real SSR data with bounded pagination", () => {
  assert.match(page, /listPublicCertificationStudyPosts\(client, STUDY_PREVIEW_LIMIT, 0\)/);
  assert.match(page, /const STUDY_PREVIEW_LIMIT = 3/);
  assert.match(content, /studyPage=\{studyPage\}/);
  assert.match(prep, /<CertificationStudyBoardSection/);
  assert.doesNotMatch(prep, /filterExamPrepPosts\(examPrepBoardPosts, "generalTalk"/);
  assert.match(fullPage, /const PAGE_SIZE = 20/);
  assert.match(fullPage, /listPublicCertificationStudyPosts\(await createClient\(\), PAGE_SIZE, offset\)/);
  assert.match(fullPage, /page\.hasMore/);
  assert.match(section, /href="\/certification\/study"/);
});

test("exam prep runtime uses only the real study board and drops legacy mock actions", () => {
  assert.match(prep, /<CertificationStudyBoardSection/);
  assert.match(prep, /시험 준비 이야기방은 실제 회원 글입니다/);
  for (const legacyRuntime of [
    "examPrepBoardPosts",
    "filterExamPrepPosts",
    "학습용 예시",
    "필기 자료 전체 보기",
    "TODO",
  ]) {
    assert.doesNotMatch(prep, new RegExp(legacyRuntime));
  }
  assert.doesNotMatch(prep, /function BoardSection|<BoardSection/);
  assert.doesNotMatch(prep, /function BoardPostRow|<BoardPostRow/);
  assert.doesNotMatch(prep, /function ViewModalDialog|<ViewModalDialog/);
});

test("write UI replaces the story placeholder and preserves login, validation, privacy, and refresh", () => {
  assert.match(section, /submitCertificationStudyPostAction\(\{ body \}\)/);
  assert.match(section, /\/login\?next=\$\{encodeURIComponent\(returnPath\)\}/);
  assert.match(section, /minLength=\{10\}/);
  assert.match(section, /maxLength=\{1000\}/);
  assert.match(section, /개인정보는 작성하지 마세요/);
  assert.match(section, /role="dialog"/);
  assert.match(section, /event\.key === "Escape"/);
  assert.match(section, /trigger\?\.isConnected/);
  assert.doesNotMatch(section, /작성자 이름|author_user_id|email|phone/);
  assert.match(actions, /revalidatePath\("\/certification"\)/);
  assert.match(actions, /revalidatePath\("\/certification\/study"\)/);
  assert.doesNotMatch(prep, /generalTalk: "TODO: 시험 준비 이야기방 전체글 페이지"/);
  assert.doesNotMatch(prep, /openAction\("글쓰기", "TODO: 회원 로그인 후 글쓰기"\)/);
});

test("scope remains a lightweight member board without course, inquiry, or social workflows", () => {
  assert.doesNotMatch(migration, /certification_course_id|certification_submission_requests|certification_jobs|certification_courses/);
  assert.doesNotMatch([migration, client, section, fullPage].join("\n"), /답변 채택|문제은행|모의시험|자동 채점|AI moderation|좋아요|추천순|댓글 작성/);
});
