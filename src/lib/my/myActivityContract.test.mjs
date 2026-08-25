import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationPath = new URL(
  "../../../supabase/migrations/20260913000100_pul_my_activity_overview.sql",
  import.meta.url,
);
const helperPath = new URL("./myActivity.ts", import.meta.url);
const hubPath = new URL("../../components/account/MyActivityHub.tsx", import.meta.url);
const pagePath = new URL("../../app/my/page.tsx", import.meta.url);

const [migration, helper, hub, page] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(hubPath, "utf8"),
  readFile(pagePath, "utf8"),
]);

test("my activity RPC derives ownership from auth.uid and accepts no user id", () => {
  assert.match(
    migration,
    /create function public\.get_my_activity_overview\(\s*p_item_limit integer default 6\s*\)/s,
  );
  assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/);
  assert.doesNotMatch(migration, /p_(?:user|actor|member)_id/i);
  assert.match(migration, /if v_actor_id is null then/);
});

test("my activity RPC keeps the privileged read contract locked down", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.get_my_activity_overview\(integer\)\s+from public, anon, authenticated, service_role;/s,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_my_activity_overview\(integer\)\s+to authenticated;/s,
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]*\bto anon\b/i);
});

test("every returned activity group is caller-owned", () => {
  for (const ownershipClause of [
    "membership.user_id = v_actor_id",
    "post.author_user_id = v_actor_id",
    "listing.seller_user_id = v_actor_id",
    "request.author_user_id = v_actor_id",
  ]) {
    assert.ok(migration.includes(ownershipClause), `missing ownership clause: ${ownershipClause}`);
  }

  assert.ok(
    migration.split("post.author_user_id = v_actor_id").length - 1 >= 4,
    "community, club, course and certification post sources must each enforce caller ownership",
  );
});

test("club-only visibility is preserved for posts and joined events", () => {
  assert.match(
    migration,
    /private\.club_user_has_permission\(v_actor_id, event\.club_id, 'club\.events\.read'\)/,
  );
  assert.match(
    migration,
    /private\.club_user_has_permission\(v_actor_id, post\.club_id, 'club\.posts\.read'\)/,
  );
  assert.match(migration, /event\.moderation_status = 'visible'/);
  assert.match(migration, /post\.moderation_status = 'visible'/);
});

test("activity projection excludes removed or non-viewable content", () => {
  assert.match(migration, /post\.post_status = 'published'/);
  assert.match(migration, /post\.post_status in \('published', 'edited'\)/);
  assert.match(migration, /listing\.listing_status <> 'removed'/);
  assert.match(migration, /request\.request_status <> 'removed'/);
  assert.match(migration, /event\.event_status not in \('draft', 'cancelled', 'completed'\)/);
  assert.match(migration, /event\.starts_at >= pg_catalog\.now\(\)/);
});

test("upcoming event projection does not expose an unused internal event UUID", () => {
  assert.doesNotMatch(migration, /'event_id',\s*page\./);
  assert.match(migration, /event\.id as event_sort_id/);
  assert.doesNotMatch(helper, /eventId|event_id/);
  assert.doesNotMatch(hub, /event\.eventId/);
});

test("server helper calls only the dedicated bounded RPC and validates exact response keys", () => {
  assert.match(helper, /client\.rpc\("get_my_activity_overview", \{\s*p_item_limit: itemLimit,\s*\}\)/s);
  assert.doesNotMatch(helper, /userId|user_id|actorId|actor_id/);
  assert.match(helper, /itemLimit < 1 \|\| itemLimit > 12/);
  assert.match(helper, /exactKeys\(value, \["clubs", "upcoming_events", "posts", "market_items"\]\)/);
  assert.match(helper, /isInternalPath\(value\.href\)/);
});

test("My page composes activity and existing lesson bookmarks without all-or-nothing failure", () => {
  assert.match(page, /fetchMyActivityOverview\(supabase, 6\)/);
  assert.match(page, /listMyLessonVideoBookmarks\(supabase, null, undefined, 6, 0\)/);
  assert.match(page, /Promise\.allSettled\(/);
  assert.match(page, /<MyActivityHub/);
  assert.match(page, /partialLoadFailed=\{activityLoadFailed\}/);
});

test("My activity UI exposes the five approved member-centered sections", () => {
  for (const title of [
    "내 동호회",
    "참가 예정 일정",
    "내가 쓴 글",
    "내 장터",
    "관심 레슨 영상",
  ]) {
    assert.ok(hub.includes(`title=\"${title}\"`), `missing section: ${title}`);
  }
  assert.match(hub, /href=\{`\/clubs\/\$\{club\.publicKey\}`\}/);
  assert.match(hub, /href=\{`\/clubs\/\$\{event\.clubPublicKey\}`\}/);
  assert.match(hub, /<Link href=\{post\.href\}/);
  assert.match(hub, /<Link href=\{item\.href\}/);
  assert.match(hub, /href=\{video\.youtubeUrl\}/);
  assert.match(hub, /target="_blank"/);
});

test("9-1 does not duplicate mutation controls in the activity hub", () => {
  assert.doesNotMatch(hub, /삭제|수정|참가 취소|판매완료 처리|저장 해제/);
  assert.doesNotMatch(page, /mutate|delete|update/i);
});
