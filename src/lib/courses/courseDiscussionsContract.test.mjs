import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260906000100_pul_course_discussion_posts.sql");
const client = read("./courseDiscussions.ts");
const detailPage = read("../../app/courses/[id]/page.tsx");
const storiesPage = read("../../app/courses/[id]/stories/page.tsx");
const section = read("../../components/courses/CourseDiscussionSection.tsx");
const legacySection = read("../../components/courses/CourseStoryBoardSection.tsx");
const actions = read("../../app/courses/actions.ts");
const normalized = migration.replace(/\s+/g, " ").trim();

test("dedicated course discussion table stays small and RPC-only", () => {
  assert.match(normalized, /create table public\.course_discussion_posts \(/);
  assert.match(normalized, /body = pg_catalog\.btrim\(body\) and pg_catalog\.char_length\(body\) between 10 and 1000/);
  assert.match(normalized, /post_status in \('published', 'removed'\)/);
  assert.match(normalized, /alter table public\.course_discussion_posts enable row level security/);
  assert.match(normalized, /alter table public\.course_discussion_posts force row level security/);
  assert.match(normalized, /revoke all on table public\.course_discussion_posts from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /comment_count|reply_count|like_count|rating|report_count|moderation_status|ledger|reviewer_id/i);
});

test("public list and authenticated submit use narrow SECURITY DEFINER ACLs", () => {
  assert.equal((migration.match(/security definer\s+set search_path = ''/g) ?? []).length, 2);
  assert.match(normalized, /grant execute on function public\.list_public_course_discussion_posts\(text, integer, integer\) to anon, authenticated/);
  assert.match(normalized, /grant execute on function public\.submit_course_discussion_post\(text, text\) to authenticated/);
  assert.doesNotMatch(normalized, /grant execute on function public\.submit_course_discussion_post\(text, text\) to (?:public|anon|service_role)/);
  assert.match(normalized, /private\.community_assert_active_actor\(\)/);
  assert.match(normalized, /private\.community_actor_display_name\(page\.author_user_id, v_viewer_id\)/);
});

test("public DTO uses stable keys and excludes internal UUIDs", () => {
  const list = migration.slice(migration.indexOf("create function public.list_public_course_discussion_posts"), migration.indexOf("create function public.submit_course_discussion_post"));
  for (const forbidden of ["'id'", "'course_id'", "'author_user_id'", "'email'"]) {
    assert.doesNotMatch(list, new RegExp(forbidden));
  }
  assert.match(list, /'post_key', page\.post_key/);
  assert.match(client, /exactKeys\(value, postKeys\)/);
  assert.match(client, /exactKeys\(value, \["items", "total", "limit", "offset", "has_more"\]\)/);
});

test("detail preview and full route use real data with bounded pagination", () => {
  assert.match(detailPage, /listPublicCourseDiscussionPosts\(client, id, 3, 0\)/);
  assert.match(detailPage, /Promise\.all\(\[/);
  assert.match(detailPage, /CourseStoryBoardSection/);
  assert.match(storiesPage, /const PAGE_SIZE = 20/);
  assert.match(storiesPage, /listPublicCourseDiscussionPosts\(client, id, PAGE_SIZE, offset\)/);
  assert.match(storiesPage, /discussionPage\.hasMore/);
  assert.match(section, /href={`\/courses\/\$\{courseKey\}\/stories`}/);
});

test("write UI replaces placeholders and preserves login, privacy, and course-target contracts", () => {
  assert.match(section, /submitCourseDiscussionPostAction\(\{ courseKey, body \}\)/);
  assert.match(section, /\/login\?next=\$\{encodeURIComponent\(returnPath\)\}/);
  assert.match(section, /minLength=\{10\}/);
  assert.match(section, /maxLength=\{1000\}/);
  assert.match(section, /개인정보는 작성하지 마세요/);
  assert.match(section, /role="dialog"/);
  assert.match(section, /event\.key === "Escape"/);
  assert.match(section, /setWriteTrigger\(trigger\)/);
  assert.doesNotMatch(section, /작성자 이름|author_user_id|course_id/);
  assert.match(actions, /revalidatePath\(`\/courses\/\$\{input\.courseKey\}`\)/);
  assert.doesNotMatch(legacySection, /준비 중|BOARD_PREP_MESSAGE|courseBoardPosts/);
});
