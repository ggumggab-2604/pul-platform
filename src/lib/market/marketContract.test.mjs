import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260823000100_pul_market_core_foundation.sql");
const client = read("./market.ts");
const storage = read("./marketStorage.ts");
const actions = read("../../app/market/actions.ts");
const page = read("../../app/market/page.tsx");
const content = read("../../components/market/MarketPageContent.tsx");
const dialog = read("../../components/market/MarketEntryDialog.tsx");
const data = read("../../data/marketData.ts");
const normalized = migration.replace(/\s+/g, " ").trim();

test("creates isolated market tables and public-read/private-write media bucket", () => {
  for (const table of ["market_listings", "market_buy_requests", "market_listing_media", "market_status_history"]) {
    assert.match(normalized, new RegExp(`create table public\\.${table} \\(`));
    assert.match(normalized, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(normalized, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`));
  }
  assert.match(normalized, /insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\) values \( 'market-media', 'market-media', true, 8388608/);
  assert.doesNotMatch(migration, /club-media/);
  assert.doesNotMatch(migration, /insert into public\.(?:club_memberships|club_role_assignments)/);
});

test("keeps public reads privacy minimized and mutations owner checked", () => {
  for (const signature of [
    "list_market_listings\\(text, text, text, text, integer, integer\\)",
    "get_market_listing\\(uuid\\)",
    "list_market_buy_requests\\(integer, integer\\)",
    "get_market_buy_request\\(uuid\\)",
  ]) assert.match(normalized, new RegExp(`grant execute on function public\\.${signature} to anon, authenticated`));
  for (const signature of [
    "mutate_market_listing\\(text, uuid, integer, jsonb, uuid\\)",
    "mutate_market_buy_request\\(text, uuid, integer, jsonb, uuid\\)",
    "create_market_media_upload_intent\\(uuid, text, bigint\\)",
  ]) assert.match(normalized, new RegExp(`grant execute on function public\\.${signature} to authenticated`));
  assert.match(migration, /listing\.seller_user_id <> v_actor_id/);
  assert.match(migration, /request\.author_user_id <> v_actor_id/);
  const publicReads = migration.slice(migration.indexOf("create function public.list_market_listings"), migration.indexOf("create function public.mutate_market_listing"));
  assert.doesNotMatch(publicReads, /email|phone|seller_user_id'|author_user_id'/);
  assert.match(migration, /profile\.profile_visibility = 'public'/);
});

test("enforces optimistic versions, sequential sale state, history, audit, and replay", () => {
  assert.match(migration, /p_expected_version <> v_listing\.version/);
  assert.match(migration, /listing_status <> 'selling'[\s\S]*v_next_status := 'reserved'/);
  assert.match(migration, /listing_status <> 'reserved'[\s\S]*v_next_status := 'sold'/);
  assert.match(normalized, /primary key \(actor_user_id, request_id\)/);
  assert.match(migration, /market_claim_request/);
  assert.match(migration, /market_complete_request/);
  assert.match(migration, /get diagnostics v_rows = row_count/);
  assert.match(migration, /insert into public\.market_status_history/);
  assert.match(migration, /insert into private\.market_audit_log/);
});

test("limits signed media to five verified images and hides service credential from clients", () => {
  assert.match(migration, /generate_series\(0, 4\)/);
  assert.match(migration, /상품 사진은 최대 5장/);
  assert.match(normalized, /grant execute on function public\.get_market_media_upload_context_server\(uuid, uuid\) to service_role/);
  assert.match(normalized, /grant execute on function public\.finalize_market_media_upload_server\(uuid, uuid, text, bigint\) to service_role/);
  assert.match(storage, /^import "server-only";/);
  assert.match(storage, /validateClubMediaBytes/);
  assert.match(storage, /createSignedUploadUrl\(path, \{ upsert: false \}\)/);
  assert.doesNotMatch(content, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(content, /uploadToSignedUrl/);
});

test("server-side pagination and strict response parsers replace mock listing sources", () => {
  assert.match(actions, /^"use server";/);
  assert.doesNotMatch(actions, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(page, /listMarketListings/);
  assert.match(client, /exactKeys\(value, listingKeys\)/);
  assert.match(client, /p_limit: limit/);
  assert.match(client, /p_offset: offset/);
  assert.match(content, /listMarketListingsAction/);
  assert.match(content, /window\.setTimeout\(\(\) => \{ void refreshListings\(\); \}, 300\)/);
  assert.doesNotMatch(content, /marketListings|marketBuyRequests|featuredListings/);
  assert.match(data, /export const marketListings/);
});

test("dialogs keep accessible keyboard and focus behavior", () => {
  assert.match(dialog, /role="dialog" aria-modal="true" aria-labelledby/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /firstRef\.current\?\.focus/);
  assert.match(content, /triggerRef\.current\?\.isConnected/);
  assert.match(content, /aria-live="polite"/);
});

test("existing startup board remains mock-scoped and outside market mutations", () => {
  assert.match(content, /startupBoardPosts/);
  assert.doesNotMatch(migration, /startup|facility/);
  assert.match(data, /export const startupBoardPosts/);
});
