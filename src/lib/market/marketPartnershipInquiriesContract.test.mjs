import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const migration = read("supabase/migrations/20260911000100_pul_market_partnership_inquiries.sql");
const action = read("src/app/market/actions.ts");
const content = read("src/components/market/MarketPageContent.tsx");
const placeholder = read("src/components/market/MarketAdPlaceholder.tsx");
const dialog = read("src/components/market/MarketPartnershipInquiryDialog.tsx");
const managementRoute = read("src/app/market/manage/partnership-inquiries/page.tsx");
const managementAction = read("src/app/market/manage/partnership-inquiries/actions.ts");

test("inquiry table has a stable public key, bounded types, and terminal-aware states", () => {
  assert.match(migration, /create table public\.market_partnership_inquiries/);
  assert.match(migration, /inquiry_type in \('advertising', 'shop_entry', 'partnership'\)/);
  assert.match(migration, /inquiry_status in \('pending', 'resolved', 'dismissed'\)/);
  assert.match(migration, /inquiry_key ~ '\^\[0-9a-f\]\{32\}\$'/);
  assert.match(migration, /source_url is null\s+or private\.valid_news_external_url\(source_url\)/);
  assert.doesNotMatch(migration, /request_id|mutation_requests|ledger|evidence|assignment/i);
});

test("inquiry table is RPC-only under forced RLS", () => {
  assert.match(migration, /alter table public\.market_partnership_inquiries enable row level security/);
  assert.match(migration, /alter table public\.market_partnership_inquiries force row level security/);
  assert.match(migration, /revoke all on table public\.market_partnership_inquiries\s+from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /create policy .*market_partnership_inquiries/i);
});

test("management uses an explicit platform-admin-only permission", () => {
  assert.match(migration, /'market\.partnership_inquiries\.manage'/);
  assert.match(migration, /values \('platform_admin', 'market\.partnership_inquiries\.manage'\)/);
  assert.doesNotMatch(migration, /values \('platform_moderator', 'market\.partnership_inquiries\.manage'\)/);
  assert.match(migration, /private\.require_market_partnership_inquiry_manager\(\)/);
});

test("all SECURITY DEFINER functions use empty search paths and explicit ACLs", () => {
  for (const signature of [
    "submit_market_partnership_inquiry(text, text, text, text)",
    "list_market_partnership_inquiries_for_management(text, integer, integer)",
    "resolve_market_partnership_inquiry(text, text)",
  ]) {
    const escaped = signature.replace(/[()[\]]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped}[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}[\\s\\S]*?to authenticated`));
  }
  assert.equal((migration.match(/security definer\s+set search_path = ''/g) ?? []).length, 4);
  assert.match(migration, /revoke all on function private\.require_market_partnership_inquiry_manager\(\)/);
});

test("submission validates the active actor and returns no internal UUID", () => {
  const submit = migration.split("create function public.submit_market_partnership_inquiry")[1]
    .split("create function public.list_market_partnership_inquiries_for_management")[0];
  assert.match(submit, /private\.market_assert_active_actor\(\)/);
  assert.match(submit, /'inquiry_key', v_inquiry\.inquiry_key[\s\S]*?'inquiry_status', v_inquiry\.inquiry_status/);
  assert.doesNotMatch(submit, /jsonb_build_object\([\s\S]*?'(?:id|requester_user_id|resolved_by)'/);
});

test("management DTO is privacy-minimized and resolution has no commercial side effect", () => {
  const list = migration.split("create function public.list_market_partnership_inquiries_for_management")[1]
    .split("create function public.resolve_market_partnership_inquiry")[0];
  for (const forbidden of ["'id'", "'requester_user_id'", "'resolved_by'"]) {
    assert.doesNotMatch(list, new RegExp(forbidden));
  }
  const resolution = migration.split("create function public.resolve_market_partnership_inquiry")[1];
  assert.match(resolution, /inquiry\.inquiry_status <> 'pending'/);
  assert.match(resolution, /update public\.market_partnership_inquiries/);
  assert.doesNotMatch(
    resolution,
    /(?:insert into|update|delete from) public\.(?:market_listings|market_payments|market_contracts)/i,
  );
});

test("visible placeholder opens the accessible real inquiry dialog", () => {
  assert.match(placeholder, /onInquiry\(event\.currentTarget\)/);
  assert.match(content, /MarketPartnershipInquiryDialog/);
  assert.match(content, /onInquiry=\{openPartnershipInquiry\}/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /minLength=\{2\}/);
  assert.match(dialog, /maxLength=\{3000\}/);
  assert.match(dialog, /개인정보나 민감정보는 입력하지 마세요/);
  assert.match(dialog, /가격·결제·계약은 이 화면에서 진행하지 않습니다/);
  assert.match(dialog, /trigger\?\.isConnected/);
  assert.match(action, /submitMarketPartnershipInquiry/);
});

test("operator route authenticates, permission-gates, and offers only terminal actions", () => {
  assert.match(managementRoute, /getAuthenticatedSupabaseContext/);
  assert.match(managementRoute, /listMarketPartnershipInquiriesForManagement/);
  assert.match(managementAction, /resolveMarketPartnershipInquiry/);
  assert.match(managementAction, /row\.resolution === "resolved" \|\| row\.resolution === "dismissed"/);
});
