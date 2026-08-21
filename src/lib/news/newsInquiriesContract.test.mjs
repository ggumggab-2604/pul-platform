import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const migration = read("supabase/migrations/20260904000100_pul_news_inquiries.sql");
const action = read("src/app/news/actions.ts");
const content = read("src/components/news/NewsPageContent.tsx");
const hero = read("src/components/news/NewsPageHero.tsx");
const dialog = read("src/components/news/NewsInquiryDialog.tsx");
const managementRoute = read("src/app/news/manage/inquiries/page.tsx");
const managementAction = read("src/app/news/manage/inquiries/actions.ts");

test("small inquiry table has two types and three simple states", () => {
  assert.match(migration, /create table public\.news_inquiries/);
  assert.match(migration, /inquiry_type in \('news_report', 'promotion_inquiry'\)/);
  assert.match(migration, /inquiry_status in \('pending', 'resolved', 'dismissed'\)/);
  assert.match(migration, /inquiry_key ~ '\^\[0-9a-f\]\{32\}\$'/);
  assert.doesNotMatch(migration, /reviewer|evidence|ledger|appeal|assignment/i);
});

test("inquiry table is RPC-only under forced RLS", () => {
  assert.match(migration, /alter table public\.news_inquiries enable row level security/);
  assert.match(migration, /alter table public\.news_inquiries force row level security/);
  assert.match(migration, /revoke all on table public\.news_inquiries\s+from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /create policy .*news_inquiries/i);
});

test("all narrow SECURITY DEFINER RPCs use explicit ACLs and the existing manager helper", () => {
  for (const signature of [
    "submit_news_inquiry(text, text)",
    "list_news_inquiries_for_management(text, integer, integer)",
    "resolve_news_inquiry(text, text)",
  ]) {
    const escaped = signature.replace(/[()[\]]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped}[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}[\\s\\S]*?to authenticated`));
  }
  assert.equal((migration.match(/security definer\s+set search_path = ''/g) ?? []).length, 3);
  assert.match(migration, /list_news_inquiries_for_management[\s\S]*?private\.require_news_directory_manager\(\)/);
  assert.match(migration, /resolve_news_inquiry[\s\S]*?private\.require_news_directory_manager\(\)/);
});

test("member submit validates active account and returns no internal UUID", () => {
  const submit = migration.split("create function public.submit_news_inquiry")[1]
    .split("create function public.list_news_inquiries_for_management")[0];
  assert.match(submit, /account\.account_status[\s\S]*?for share/);
  assert.match(submit, /v_account_status is distinct from 'active'/);
  assert.match(submit, /'inquiry_key', v_inquiry\.inquiry_key[\s\S]*?'inquiry_status', v_inquiry\.inquiry_status/);
  assert.doesNotMatch(submit, /jsonb_build_object\([\s\S]*?'(?:id|requester_user_id|resolved_by)'/);
});

test("management DTO is privacy-minimized and resolution never publishes news", () => {
  const list = migration.split("create function public.list_news_inquiries_for_management")[1]
    .split("create function public.resolve_news_inquiry")[0];
  for (const forbidden of ["'id'", "'requester_user_id'", "'resolved_by'"]) {
    assert.doesNotMatch(list, new RegExp(forbidden));
  }
  const resolution = migration.split("create function public.resolve_news_inquiry")[1];
  assert.match(resolution, /inquiry\.inquiry_status <> 'pending'/);
  assert.match(resolution, /update public\.news_inquiries/);
  assert.doesNotMatch(resolution, /mutate_news_article|update public\.news_articles|insert into public\.news_articles/);
});

test("all visible news inquiry actions open the real accessible dialog", () => {
  assert.match(hero, /onReport\?\.\(event\.currentTarget\)/);
  assert.match(hero, /onPromotionInquiry\?\.\(event\.currentTarget\)/);
  assert.match(content, /NewsInquiryDialog/);
  assert.match(content, /openInquiry\("news_report", trigger\)/);
  assert.match(content, /openInquiry\("promotion_inquiry", trigger\)/);
  assert.doesNotMatch(content, /기능은 준비 중입니다/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /minLength=\{10\}/);
  assert.match(dialog, /maxLength=\{3000\}/);
  assert.match(dialog, /개인 전화번호·주민번호 등 불필요한 개인정보/);
  assert.match(dialog, /trigger\?\.isConnected/);
  assert.match(action, /submitNewsInquiry/);
});

test("operator route authenticates, permission-gates, and offers only simple terminal actions", () => {
  assert.match(managementRoute, /getAuthenticatedSupabaseContext/);
  assert.match(managementRoute, /redirect\(`\/login\?next=\$\{encodeURIComponent\("\/news\/manage\/inquiries"\)\}`\)/);
  assert.match(managementRoute, /listNewsInquiriesForManagement/);
  assert.match(managementAction, /resolveNewsInquiry/);
  assert.match(managementAction, /row\.resolution !== "resolved" && row\.resolution !== "dismissed"/);
});
