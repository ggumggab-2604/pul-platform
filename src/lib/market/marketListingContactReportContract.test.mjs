import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260928000100_pul_market_listing_contact_report_foundation.sql");
const market = read("src/lib/market/market.ts");
const reports = read("src/lib/market/marketListingReports.ts");
const detail = read("src/components/market/MarketDetailModal.tsx");
const entry = read("src/components/market/MarketEntryDialog.tsx");
const reportDialog = read("src/components/market/MarketListingReportDialog.tsx");
const pageContent = read("src/components/market/MarketPageContent.tsx");
const productCard = read("src/components/market/MarketProductCard.tsx");
const management = read("src/components/market/manage/MarketListingReportManagementPage.tsx");
const managementRoute = read("src/app/market/manage/listing-reports/page.tsx");
const manageHome = read("src/app/manage/page.tsx");

test("pending forward replacements make all four public ownership DTOs non-null without weakening parsers", () => {
  for (const name of ["list_market_listings", "get_market_listing", "list_market_buy_requests", "get_market_buy_request"]) {
    const definition = migration.match(new RegExp("create or replace function public\\." + name + "\\([\\s\\S]*?(?:\\$function\\$;|\\$\\$;)", "i"))?.[0];
    assert.ok(definition, name);
    assert.match(definition, /'can_edit', coalesce\((?:listing\.seller_user_id|request\.author_user_id) = (?:v_actor_id|auth\.uid\(\)), false\)/);
  }
  assert.equal((market.match(/typeof value\.can_edit !== "boolean"/g) ?? []).length, 3);
  assert.doesNotMatch(market, /Boolean\(value\.can_edit\)|can_edit\s*\?\?/);
});

test("contact columns are nullable, all-or-none, bounded, and legacy-safe", () => {
  assert.match(migration, /add column public_contact_method text,/);
  assert.match(migration, /add column public_contact_value text,/);
  assert.match(migration, /add column public_contact_consent_at timestamptz,/);
  assert.match(migration, /public_contact_method in \('phone', 'sms', 'external_url'\)/);
  assert.match(migration, /public_contact_value ~ '\^\[0-9\]\{8,15\}\$'/);
  assert.match(migration, /public_contact_method is not null/);
  assert.match(migration, /private\.market_valid_contact_https_url\(public_contact_value\)/);
  const columns = migration.split("alter table public.market_listings")[1]
    .split("add constraint market_listings_public_contact_check")[0];
  assert.doesNotMatch(columns, /public_contact_(?:method|value|consent_at)[^,;]*not null/i);
});

test("list DTO remains contact-free while detail filters sold and removed", () => {
  const getDetail = migration.split("create or replace function public.get_market_listing")[1]
    .split("create or replace function public.mutate_market_listing")[0];
  assert.match(getDetail, /listing\.listing_status in \('selling', 'reserved'\)/);
  assert.match(getDetail, /listing\.listing_status <> 'removed'/);
  assert.match(getDetail, /'public_contact_value'/);
  assert.doesNotMatch(market.match(/const listingKeys = \[[\s\S]*?\] as const;/)?.[0] ?? "", /public_contact/);
  assert.match(market, /const listingDetailKeys = \[[\s\S]*public_contact_method[\s\S]*public_contact_value/);
});

test("listing mutation requires explicit consent and redacts contact in audit and result", () => {
  const mutation = migration.split("create or replace function public.mutate_market_listing")[1]
    .split("create function public.submit_market_listing_report")[0];
  assert.match(mutation, /public_contact_consent/);
  assert.match(mutation, /private\.market_normalize_public_contact/);
  assert.match(mutation, /- 'public_contact_value'/);
  assert.match(mutation, /- 'public_contact_consent_at'/);
  assert.match(mutation, /'contact_present'/);
  const result = mutation.split("v_result :=")[1].split("insert into private.market_audit_log")[0];
  assert.doesNotMatch(result, /public_contact_value/);
  assert.match(entry, /공개 연락처 사용에 동의합니다/);
  assert.doesNotMatch(migration, /user_private_contacts|auth\.users|email/);
});

test("report foundation has five reasons, three statuses, lifecycle FKs, forced RLS and no table grants", () => {
  assert.match(migration, /create table public\.market_listing_reports/);
  for (const reason of ["fraud_or_false", "prohibited_or_inappropriate", "spam_or_duplicate", "privacy_exposure", "other"]) assert.match(migration, new RegExp(`'${reason}'`));
  assert.match(migration, /report_status in \('received', 'handled', 'dismissed'\)/);
  assert.match(migration, /reporter_user_id uuid references public\.user_accounts \(id\) on delete set null/);
  assert.match(migration, /resolved_by uuid references public\.user_accounts \(id\) on delete set null/);
  assert.match(migration, /market_listing_reports_one_received_reporter_listing_idx/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.market_listing_reports[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete)[\s\S]*market_listing_reports/i);
});

test("permissions map only to platform_admin and RPC ACLs are minimal", () => {
  for (const permission of ["market.listing_reports.manage", "market.listings.moderate"]) {
    assert.match(migration, new RegExp(`\\('platform_admin', '${permission.replaceAll(".", "\\.")}\\'`));
    assert.doesNotMatch(migration, new RegExp(`\\('platform_moderator', '${permission.replaceAll(".", "\\.")}\\'`));
  }
  for (const signature of [
    "submit_market_listing_report\\(uuid, text, text, uuid\\)",
    "list_market_listing_reports_for_management\\(text, integer, integer\\)",
    "get_market_listing_report_for_management\\(text\\)",
    "resolve_market_listing_report\\(text, integer, text, text, uuid\\)",
    "remove_market_listing_for_moderation\\(uuid, integer, text, uuid\\)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*to authenticated`));
  }
});

test("report replay uses canonical JSONB SHA-256 and omits raw notes from audit/results", () => {
  assert.match(migration, /extensions\.digest\([\s\S]*p_request_payload::text[\s\S]*'sha256'/);
  const submit = migration.split("create function public.submit_market_listing_report")[1]
    .split("create function public.list_market_listing_reports_for_management")[0];
  assert.match(submit, /private\.market_claim_sha256_request/);
  assert.match(submit, /when unique_violation/);
  const submitAudit = submit.split("insert into private.market_audit_log")[1];
  assert.doesNotMatch(submitAudit, /v_note|p_note/);
  const resolve = migration.split("create function public.resolve_market_listing_report")[1]
    .split("create function public.remove_market_listing_for_moderation")[0];
  const resolveAudit = resolve.split("insert into private.market_audit_log")[1];
  assert.doesNotMatch(resolveAudit, /v_note|p_resolution_note/);
});

test("report resolution and moderation are transactionally separate", () => {
  const resolve = migration.split("create function public.resolve_market_listing_report")[1]
    .split("create function public.remove_market_listing_for_moderation")[0];
  assert.match(resolve, /update public\.market_listing_reports/);
  assert.doesNotMatch(resolve, /update public\.market_listings|remove_market_listing_for_moderation/);
  const moderate = migration.split("create function public.remove_market_listing_for_moderation")[1];
  assert.match(moderate, /for update/);
  assert.match(moderate, /update public\.market_listings/);
  assert.match(moderate, /insert into public\.market_status_history/);
  assert.match(moderate, /insert into private\.market_audit_log/);
  assert.doesNotMatch(moderate, /update public\.market_listing_reports|resolve_market_listing_report/);
});

test("UI exposes real contact and sibling report dialog without card leakage", () => {
  assert.match(productCard, /상세보기/);
  assert.doesNotMatch(productCard, /문의하기|publicContactValue/);
  assert.match(detail, /tel:/);
  assert.match(detail, /sms:/);
  assert.match(detail, /noopener noreferrer nofollow/);
  assert.match(detail, /판매자가 공개 연락처를 등록하지 않았습니다/);
  assert.match(detail, /신고하기/);
  assert.match(pageContent, /setSelectedItem\(null\); setReportItem\(item\)/);
  assert.match(pageContent, /MarketListingReportDialog item=\{reportItem\}/);
  assert.match(reportDialog, /role="dialog"/);
  assert.match(reportDialog, /aria-modal="true"/);
  assert.match(reportDialog, /event\.key === "Escape"/);
  assert.match(reportDialog, /event\.key !== "Tab"/);
  assert.match(reportDialog, /requestIdRef/);
  assert.match(reportDialog, /disabled=\{busy\}/);
});

test("management route and home card preserve separate operator actions", () => {
  assert.match(managementRoute, /getAuthenticatedSupabaseContext/);
  assert.match(managementRoute, /listMarketListingReportsForManagement/);
  assert.match(management, /신고 처리/);
  assert.match(management, /판매글 비공개 처리/);
  assert.match(management, /resolveMarketListingReportAction/);
  assert.match(management, /removeMarketListingForModerationAction/);
  assert.match(manageHome, /href: "\/market\/manage\/listing-reports"/);
  assert.match(reports, /exact\(data/);
});
