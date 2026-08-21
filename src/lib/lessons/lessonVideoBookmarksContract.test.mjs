import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const migration = read("supabase/migrations/20260902000100_pul_lesson_video_bookmarks.sql");
const page = read("src/app/lessons/page.tsx");
const action = read("src/app/lessons/actions.ts");
const content = read("src/components/lessons/LessonsPageContent.tsx");
const shell = read("src/components/lessons/LessonsPageShell.tsx");
const section = read("src/components/lessons/FreeVideoLessonsSection.tsx");
const card = read("src/components/lessons/VideoLessonCard.tsx");

test("small private join table uses stable ownership, duplicate protection, and natural cleanup", () => {
  assert.match(migration, /create table public\.lesson_video_bookmarks/);
  assert.match(migration, /primary key \(user_id, lesson_video_id\)/);
  assert.match(migration, /references public\.user_accounts \(id\) on delete cascade/);
  assert.match(migration, /references public\.lesson_videos \(id\) on delete cascade/);
  assert.doesNotMatch(migration, /audit|ledger|history|recommend|like_count|view_count/i);
});

test("bookmark RPCs are authenticated-only, RPC-only, and lock the active account", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.lesson_video_bookmarks[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(migration, /account\.account_status = 'active'[\s\S]*?for share/);
  for (const signature of [
    "set_lesson_video_bookmark(text, boolean)",
    "list_my_lesson_video_bookmarks(text[], text, integer, integer)",
  ]) {
    const escaped = signature.replace(/[()[\]]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped}[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}[\\s\\S]*?to authenticated`));
  }
  assert.match(migration, /security definer\s+set search_path = ''/);
});

test("target-state mutation is idempotent and published-only for new saves", () => {
  const mutation = migration.split("create function public.set_lesson_video_bookmark")[1].split("create function public.list_my_lesson_video_bookmarks")[0];
  assert.match(mutation, /p_saved boolean/);
  assert.match(mutation, /publication_status <> 'published'/);
  assert.match(mutation, /on conflict \(user_id, lesson_video_id\) do nothing/);
  assert.match(mutation, /delete from public\.lesson_video_bookmarks/);
  assert.match(mutation, /from public\.lesson_videos[\s\S]*?for share/);
});

test("own list is bounded, batched, privacy-minimized, and excludes unpublished videos", () => {
  const list = migration.split("create function public.list_my_lesson_video_bookmarks")[1];
  assert.match(list, /bookmark\.user_id = v_actor_id/);
  assert.match(list, /video\.publication_status = 'published'/);
  assert.match(list, /pg_catalog\.cardinality\(p_video_keys\) > 50/);
  assert.match(list, /p_limit not between 1 and 50 or p_offset < 0/);
  assert.match(list, /private\.public_lesson_video_json\(video\)/);
  assert.doesNotMatch(list, /'user_id'|'lesson_video_id'|'bookmark_id'/);
  assert.match(page, /listMyLessonVideoBookmarks\([\s\S]*?items\.map\(\(video\) => video\.videoKey\)/);
  assert.doesNotMatch(page, /Promise\.all\([\s\S]{0,120}video.*map[\s\S]{0,120}listMyLessonVideoBookmarks/);
});

test("free video UI uses real saved state, safe login return, and accessible duplicate-click protection", () => {
  assert.match(action, /setLessonVideoBookmark/);
  assert.match(action, /revalidatePath\("\/lessons"\)/);
  assert.match(content, /setLessonVideoBookmarkAction/);
  assert.match(content, /\/login\?next=\$\{encodeURIComponent\(nextPath\)\}/);
  assert.match(content, /pendingVideoKeys\.has\(videoKey\)/);
  assert.match(shell, /initialSavedVideoKeys\.join\(","\)/);
  assert.match(shell, /<LessonsPageContent key=\{contentKey\}/);
  assert.match(section, /전체 영상/);
  assert.match(section, /내 관심영상/);
  assert.match(section, /아직 저장한 관심 영상이 없습니다/);
  assert.match(card, /aria-pressed=\{isSaved\}/);
  assert.match(card, /disabled=\{isPending\}/);
  assert.match(card, /관심 \$\{isSaved \? "해제" : "저장"\}/);
});

test("old interest placeholder modal is removed without touching unrelated placeholders", () => {
  const runtime = [content, section, card].join("\n");
  assert.doesNotMatch(runtime, /infoModal === "video-save"/);
  assert.doesNotMatch(runtime, /관심 목록 기능은 준비 중입니다/);
  assert.doesNotMatch(runtime, /title="관심 목록 준비중"/);
  assert.doesNotMatch(content, /신고 기능은 후속 단계/);
  assert.match(content, /대학·학과 모집 홍보 기능은 준비 중/);
});
