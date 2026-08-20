import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260827000100_pul_lesson_directory_foundation.sql");
const page = read("../../app/lessons/page.tsx");
const shell = read("../../components/lessons/LessonsPageShell.tsx");
const content = read("../../components/lessons/LessonsPageContent.tsx");
const detail = read("../../components/lessons/LessonDetailModal.tsx");
const videos = read("../../components/lessons/FreeVideoLessonsSection.tsx");
const videoCard = read("../../components/lessons/VideoLessonCard.tsx");
const client = read("./lessonDirectory.ts");

test("lesson and video tables keep stable public keys, publication state, and no product seed", () => {
  assert.match(migration, /create table public\.lessons/);
  assert.match(migration, /constraint lessons_lesson_key_uidx unique \(lesson_key\)/);
  assert.match(migration, /create table public\.lesson_videos/);
  assert.match(migration, /constraint lesson_videos_video_key_uidx unique \(video_key\)/);
  assert.match(migration, /publication_status in \('published', 'hidden', 'removed'\)/);
  const beforeMutations = migration.split("create function public.mutate_lesson")[0];
  assert.doesNotMatch(beforeMutations, /insert into public\.(lessons|lesson_videos)/i);
});

test("public read RPCs are security-definer, paginated, and published-only", () => {
  for (const signature of [
    "list_public_lessons(text, text, text, text, text, text, integer, integer)",
    "list_featured_public_lessons(integer)",
    "get_public_lesson(text)",
    "list_public_lesson_videos(text, integer, integer)",
  ]) {
    const escaped = signature.replace(/[()]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}[\\s\\S]*?to anon, authenticated`));
  }
  assert.match(migration, /lesson\.publication_status = 'published'/);
  assert.match(migration, /video\.publication_status = 'published'/);
  assert.match(migration, /p_limit not between 1 and 50 or p_offset < 0/);
});

test("operator mutations reuse platform permission and raw DML stays closed", () => {
  assert.match(migration, /values \('lessons\.manage'/);
  assert.match(migration, /values \('platform_admin', 'lessons\.manage'\)/);
  assert.match(migration, /mapping\.permission_code = 'lessons\.manage'/);
  assert.match(migration, /for share of account/);
  assert.match(migration, /for update/);
  assert.match(migration, /revoke all on table public\.lessons[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on table public\.lesson_videos[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.mutate_lesson\(text, text, integer, jsonb\)[\s\S]*?to authenticated/);
  assert.match(migration, /grant execute on function public\.mutate_lesson_video\(text, text, integer, jsonb\)[\s\S]*?to authenticated/);
});

test("external lesson and YouTube links reject unsafe protocols and unapproved hosts", () => {
  assert.match(migration, /p_url ~ '\^https:\/\/'/);
  assert.match(migration, /p_url ~ '\^https:\/\/\(\(www\\\.\)\?youtube\\\.com\/\|youtu\\\.be\/\)'/);
  assert.match(client, /url\.hostname === "youtube\.com"/);
  assert.match(client, /url\.hostname === "www\.youtube\.com"/);
  assert.match(client, /url\.hostname === "youtu\.be"/);
});

test("actual lessons route uses server contracts and never imports paid or video mock arrays", () => {
  assert.match(page, /listPublicLessons/);
  assert.match(page, /listFeaturedPublicLessons/);
  assert.match(page, /listPublicLessonVideos/);
  for (const source of [page, shell, content, videos]) {
    assert.doesNotMatch(source, /generalPaidLessons|generalFeaturedLessons|\bvideoLessons\b|featuredYoutubeInstructors/);
  }
  assert.match(content, /현재 등록된 레슨·교육 프로그램이 없습니다/);
  assert.match(videos, /현재 등록된 무료 강의 영상이 없습니다/);
});

test("UI keeps modal detail, safe external semantics, accessibility, and no PUL payment claim", () => {
  assert.match(detail, /role="dialog"/);
  assert.match(detail, /aria-modal="true"/);
  assert.match(detail, /event\.key === "Escape"/);
  assert.match(detail, /previousFocus\?\.focus/);
  assert.match(detail, /target="_blank"/);
  assert.match(detail, /rel="noopener noreferrer"/);
  assert.match(detail, /PUL은 레슨 신청·예약·결제를 직접 처리하지 않습니다/);
  assert.match(videoCard, /YouTube에서 보기/);
  assert.match(videoCard, /새 창/);
  assert.doesNotMatch([page, shell, content, detail, videos, videoCard].join("\n"), /결제하기|PUL 신청 완료/);
});
