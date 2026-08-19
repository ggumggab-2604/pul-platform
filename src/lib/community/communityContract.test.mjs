import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260824000100_pul_community_core_foundation.sql");
const contract = read("./community.ts");
const list = read("../../components/community/CommunityPageContent.tsx");
const detail = read("../../components/community/CommunityPostDetailContent.tsx");
const dialog = read("../../components/community/CommunityPostDialog.tsx");
const page = read("../../app/community/page.tsx");

test("community public reads expose privacy-minimized DTOs and authenticated-only writes", () => {
  assert.match(migration, /security definer\s+set search_path = ''/gi);
  assert.match(migration, /grant execute on function public\.list_community_posts[\s\S]*to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_community_post[\s\S]*to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.mutate_community_post[\s\S]*to authenticated/);
  assert.match(migration, /revoke all on table public\.community_posts from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /author_user_id'\s*,|seller_user_id'\s*,/);
});

test("strict client contract has exact-key and enum validation", () => {
  assert.match(contract, /function exactKeys/);
  assert.match(contract, /categories = new Set<CommunityWritableCategory>/);
  assert.match(contract, /questionStatuses = new Set/);
  assert.match(contract, /lostFoundStatuses = new Set/);
  assert.match(contract, /validateCommunityPostInput/);
  assert.match(contract, /limit > maxLimit/);
});

test("community runtime no longer imports mock post arrays", () => {
  for (const source of [list, detail, page]) {
    assert.doesNotMatch(source, /communityPosts|communityQuestions|communityReviews|communityLostFoundItems/);
  }
  assert.match(page, /listCommunityPosts/);
  assert.match(list, /listCommunityPostsAction/);
  assert.match(list, /href={`\/community\/\$\{post\.id\}`}/);
});

test("dialogs and forms preserve keyboard and accessible naming contracts", () => {
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(list, /role="search"/);
  assert.match(detail, /community-comments-title/);
  assert.match(detail, /requestAnimationFrame/);
});

test("category-specific inputs and actions are wired", () => {
  assert.match(dialog, /questionType/);
  assert.match(dialog, /reviewType/);
  assert.match(dialog, /lostFoundItemName/);
  assert.match(detail, /resolve_question/);
  assert.match(detail, /update_lost_found/);
  assert.match(detail, /mutateCommunityCommentAction/);
});
