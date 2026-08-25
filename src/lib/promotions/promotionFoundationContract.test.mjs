import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260915000100_pul_promotion_banner_management_foundation.sql", import.meta.url)),
  "utf8",
);
const directory = readFileSync(new URL("./promotionDirectory.ts", import.meta.url), "utf8");
const management = readFileSync(new URL("./promotionManagement.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("./promotionMediaStorage.ts", import.meta.url), "utf8");

test("slot catalog is exact, HOF is disabled, and MY/detail slots are absent", () => {
  const expected = [
    "home.hero.01", "home.rail_left.01", "home.rail_right.01", "home.feed.01",
    "courses.top.01", "clubs.top.01", "market.list_top.01", "community.top.01",
    "events.top.01", "lessons.top.01", "certification.top.01", "news.top.01",
    "hall_of_fame.top.01",
  ];
  for (const code of expected) assert.match(migration, new RegExp(`'${code.replaceAll(".", "\\.")}'`));
  assert.match(migration, /where slot_code = 'hall_of_fame\.top\.01'[\s\S]*and not is_enabled/);
  assert.doesNotMatch(migration, /'my\.[^']+'/);
  assert.doesNotMatch(migration, /'[^']*\.detail\.[^']*'/);
});

test("slot metadata fixes dimensions and content-kind allow-lists", () => {
  assert.match(migration, /1600, 840, 1080, 720/);
  assert.match(migration, /600, 1050, null, null/);
  assert.match(migration, /1600, 320, 1080, 480/);
  assert.match(migration, /promotion_content_kind_array_is_valid/);
  assert.match(migration, /'home\.hero\.01'[\s\S]*array\['pul_notice', 'pul_event', 'partnership', 'content_recommendation'\]/);
});

test("promotion link modes and HTTPS-only external URLs are constrained", () => {
  assert.match(migration, /link_type in \('external', 'internal_detail', 'none'\)/);
  assert.match(migration, /external_url ~ '\^https:\/\//);
  assert.match(migration, /link_type = 'internal_detail'[\s\S]*slug is not null[\s\S]*body is not null/);
  assert.match(migration, /link_type = 'none'[\s\S]*external_url is null[\s\S]*slug is null/);
});

test("published schedules use finite half-open ranges and a database exclusion constraint", () => {
  assert.match(migration, /starts_at timestamptz not null/);
  assert.match(migration, /ends_at timestamptz not null/);
  assert.match(migration, /tstzrange\(starts_at, ends_at, '\[\)'\) with &&/);
  assert.match(migration, /where \(publication_status = 'published'\)/);
  assert.match(migration, /exception when exclusion_violation/);
});

test("public reads are batched, bounded, live-only, and privacy minimized", () => {
  assert.match(migration, /get_active_promotions_for_slots\(\s*p_slot_codes text\[\]/);
  assert.match(migration, /cardinality\(p_slot_codes\) not between 1 and 20/);
  assert.match(migration, /placement\.starts_at <= v_now/);
  assert.match(migration, /placement\.ends_at > v_now/);
  assert.match(migration, /desktop_media\.media_status = 'available'/);
  assert.doesNotMatch(directory, /created_by|updated_by|actor_id|promotion_id|placement_id/);
});

test("public detail requires a live placement", () => {
  assert.match(migration, /get_public_promotion_detail/);
  assert.match(migration, /promotion\.link_type = 'internal_detail'/);
  assert.match(migration, /and exists \([\s\S]*promotion_placements/);
  assert.match(directory, /parsePublicPromotionDetail/);
});

test("direct table access is revoked and all public tables force RLS", () => {
  for (const table of ["promotion_slots", "promotions", "promotion_media", "promotion_placements"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}`));
  }
  assert.match(migration, /alter table private\.promotion_mutation_requests force row level security/);
});

test("manage permission is admin-only and guarded functions have explicit ACLs", () => {
  assert.match(migration, /'promotions\.manage'/);
  assert.match(migration, /'platform_admin',[\s\n]+\s*'promotions\.manage'/);
  assert.doesNotMatch(migration, /'platform_moderator',[\s\n]+\s*'promotions\.manage'/);
  assert.match(migration, /grant execute on function public\.mutate_promotion[\s\S]*to authenticated/);
  assert.match(migration, /grant execute on function public\.finalize_promotion_media_for_service[\s\S]*to service_role/);
});

test("security definer functions use an empty search path", () => {
  const definitions = migration.match(/create function[\s\S]*?\$\$;/g) ?? [];
  const definers = definitions.filter((definition) => /security definer/.test(definition));
  assert.ok(definers.length >= 10);
  for (const definition of definers) assert.match(definition, /set search_path = ''/);
});

test("media bucket, MIME, size, opaque path, and no-upsert upload are fixed", () => {
  assert.match(migration, /'promotion-media'[\s\S]*5242880[\s\S]*image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/);
  assert.match(migration, /storage_path ~ '\^\[0-9a-f\]\{32\}\//);
  assert.match(storage, /createSignedUploadUrl\(path, \{ upsert: false \}\)/);
  assert.match(storage, /validateClubMediaBytes/);
  assert.doesNotMatch(storage, /SUPABASE_SERVICE_ROLE_KEY[^\n]*(console|return)/);
});

test("media replacement is atomic and pending/available rows are uniquely bounded", () => {
  assert.match(migration, /promotion_media_pending_variant_order_uidx/);
  assert.match(migration, /promotion_media_available_variant_order_uidx/);
  assert.match(migration, /set media_status = 'removed'[\s\S]*set media_status = 'available'/);
});

test("idempotency uses actor/request locking and SHA-256 payload fingerprints", () => {
  assert.match(migration, /primary key \(actor_id, request_id\)/);
  assert.match(migration, /extensions\.digest[\s\S]*'sha256'/);
  assert.match(migration, /on conflict \(actor_id, request_id\) do nothing/);
  assert.match(migration, /for update/);
  assert.match(migration, /동일한 요청 식별자를 다른 작업에 재사용할 수 없습니다/);
});

test("management helpers preserve request IDs and optimistic versions", () => {
  assert.match(management, /parsed\.request_id !== input\.requestId/);
  assert.match(management, /p_expected_version/);
  assert.match(management, /p_request_id/);
  assert.match(migration, /최신 정보를 다시 확인해 주세요/);
});

test("audit covers promotion, placement, and media lifecycle mutations", () => {
  assert.match(migration, /v_action_code := 'promotion\.' \|\| p_operation/);
  for (const action of [
    "promotion.placement.", "promotion.media.upload_intent",
    "promotion.media.finalize", "promotion.media.remove",
  ]) assert.match(migration, new RegExp(action.replaceAll(".", "\\.")));
  assert.match(migration, /insert into public\.audit_logs/g);
});

test("foundation adds no UI route or page component", () => {
  assert.doesNotMatch(migration, /\/manage\/banners/);
  assert.doesNotMatch(directory + management + storage, /export default function|<main|<section|\.tsx/);
});
