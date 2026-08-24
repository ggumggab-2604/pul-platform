import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const migration = read("supabase/migrations/20260909000100_pul_market_repair_shop_inquiries.sql");
const action = read("src/app/market/actions.ts");
const content = read("src/components/market/MarketPageContent.tsx");
const panel = read("src/components/market/MarketInfoPanels.tsx");
const linkBox = read("src/components/market/EquipmentCareLinkBox.tsx");
const dialog = read("src/components/market/MarketRepairShopInquiryDialog.tsx");
const managementRoute = read("src/app/market/manage/repair-shop-inquiries/page.tsx");
const managementAction = read("src/app/market/manage/repair-shop-inquiries/actions.ts");

test("small inquiry table has a public key and three terminal-aware states", () => {
  assert.match(migration, /create table public\.market_repair_shop_inquiries/);
  assert.match(migration, /inquiry_status in \('pending', 'resolved', 'dismissed'\)/);
  assert.match(migration, /inquiry_key ~ '\^\[0-9a-f\]\{32\}\$'/);
  assert.match(migration, /source_url is null\s+or private\.valid_news_external_url\(source_url\)/);
  assert.doesNotMatch(migration, /request_id|mutation_requests|ledger|evidence|assignment/i);
});

test("inquiry table is RPC-only under forced RLS", () => {
  assert.match(migration, /alter table public\.market_repair_shop_inquiries enable row level security/);
  assert.match(migration, /alter table public\.market_repair_shop_inquiries force row level security/);
  assert.match(migration, /revoke all on table public\.market_repair_shop_inquiries\s+from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /create policy .*market_repair_shop_inquiries/i);
});

test("management reuses an explicit minimal platform permission", () => {
  assert.match(migration, /'market\.repair_shop_inquiries\.manage'/);
  assert.match(migration, /values \('platform_admin', 'market\.repair_shop_inquiries\.manage'\)/);
  assert.doesNotMatch(migration, /values \('platform_moderator', 'market\.repair_shop_inquiries\.manage'\)/);
  assert.match(migration, /private\.require_market_repair_shop_inquiry_manager\(\)/);
});

test("all SECURITY DEFINER functions use empty search paths and explicit ACLs", () => {
  for (const signature of [
    "submit_market_repair_shop_inquiry(text, text, text, text)",
    "list_market_repair_shop_inquiries_for_management(text, integer, integer)",
    "resolve_market_repair_shop_inquiry(text, text)",
  ]) {
    const escaped = signature.replace(/[()[\]]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped}[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}[\\s\\S]*?to authenticated`));
  }
  assert.equal((migration.match(/security definer\s+set search_path = ''/g) ?? []).length, 4);
  assert.match(migration, /revoke all on function private\.require_market_repair_shop_inquiry_manager\(\)/);
});

test("submission validates the active actor and returns no internal UUID", () => {
  const submit = migration.split("create function public.submit_market_repair_shop_inquiry")[1]
    .split("create function public.list_market_repair_shop_inquiries_for_management")[0];
  assert.match(submit, /private\.market_assert_active_actor\(\)/);
  assert.match(submit, /'inquiry_key', v_inquiry\.inquiry_key[\s\S]*?'inquiry_status', v_inquiry\.inquiry_status/);
  assert.doesNotMatch(submit, /jsonb_build_object\([\s\S]*?'(?:id|requester_user_id|resolved_by)'/);
});

test("management DTO is privacy-minimized and resolution never publishes a listing", () => {
  const list = migration.split("create function public.list_market_repair_shop_inquiries_for_management")[1]
    .split("create function public.resolve_market_repair_shop_inquiry")[0];
  for (const forbidden of ["'id'", "'requester_user_id'", "'resolved_by'"]) {
    assert.doesNotMatch(list, new RegExp(forbidden));
  }
  const resolution = migration.split("create function public.resolve_market_repair_shop_inquiry")[1];
  assert.match(resolution, /inquiry\.inquiry_status <> 'pending'/);
  assert.match(resolution, /update public\.market_repair_shop_inquiries/);
  assert.doesNotMatch(resolution, /mutate_market|update public\.market_listings|insert into public\.market_listings/);
});

test("all visible repair inquiry actions open the real accessible dialog", () => {
  assert.match(linkBox, /onRegisterInquiry\?\.\(event\.currentTarget\)/);
  assert.match(panel, /onEquipmentCareInquiry: \(trigger: HTMLButtonElement\) => void/);
  assert.match(content, /MarketRepairShopInquiryDialog/);
  assert.match(content, /onEquipmentCareInquiry=\{openRepairInquiry\}/);
  assert.doesNotMatch(content, /수리 문의 기능은 준비 중입니다/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /minLength=\{2\}/);
  assert.match(dialog, /maxLength=\{3000\}/);
  assert.match(dialog, /전화번호·이메일·주민번호 등 개인정보나 민감정보/);
  assert.match(dialog, /trigger\?\.isConnected/);
  assert.match(action, /submitMarketRepairShopInquiry/);
});

test("operator route authenticates, permission-gates, and offers only terminal actions", () => {
  assert.match(managementRoute, /getAuthenticatedSupabaseContext/);
  assert.match(managementRoute, /listMarketRepairShopInquiriesForManagement/);
  assert.match(managementAction, /resolveMarketRepairShopInquiry/);
  assert.match(managementAction, /row\.resolution === "resolved" \|\| row\.resolution === "dismissed"/);
});
