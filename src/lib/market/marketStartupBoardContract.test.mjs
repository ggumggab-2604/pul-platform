import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260830000100_pul_market_startup_board_foundation.sql");
const client = read("./market.ts");
const actions = read("../../app/market/actions.ts");
const content = read("../../components/market/MarketPageContent.tsx");
const section = read("../../components/market/StartupBoardSection.tsx");
const card = read("../../components/market/StartupBoardPostCard.tsx");
const detail = read("../../components/market/StartupBoardDetailModal.tsx");
const entry = read("../../components/market/StartupBoardEntryDialog.tsx");
const prompt = read("../../components/market/StartupBoardWritePrompt.tsx");
const vendor = read("../../components/market/StartupVendorRecommendBanner.tsx");
const filters = read("../../components/market/MarketListSearch.tsx");
const sharedDialog = read("../../components/market/MarketDialog.tsx");
const phaseActions = read("../../app/market/phaseOneActions.ts");
const data = read("../../data/marketData.ts");
const normalized = migration.replace(/\s+/g, " ").trim();

test("creates one simple guarded startup-board table without brokerage subsystems", () => {
  assert.match(normalized, /create table public\.market_startup_posts \(/);
  assert.match(normalized, /alter table public\.market_startup_posts force row level security/);
  assert.match(normalized, /revoke all on table public\.market_startup_posts from public, anon, authenticated, service_role/);
  assert.match(migration, /publication_status in \('published', 'hidden', 'removed'\)/);
  assert.match(migration, /board_status in \('open', 'closed'\)/);
  assert.match(migration, /v_limit integer := least\(greatest\(coalesce\(p_limit, 24\), 1\), 30\)/);
  assert.doesNotMatch(migration, /phone|email|escrow|contract|answer_count|view_count/);
});

test("public list and detail expose stable keys but no UUID, version, or private contact data", () => {
  const publicReads = migration.slice(
    migration.indexOf("create function public.list_market_startup_posts"),
    migration.indexOf("create function public.get_my_market_startup_post_mutation_context"),
  );
  assert.match(publicReads, /'post_key', post\.post_key/);
  assert.doesNotMatch(publicReads, /'id'|'author_user_id'|'version'|'email'|'phone'/);
  assert.match(normalized, /grant execute on function public\.list_market_startup_posts\(text, text, text, integer, integer\) to anon, authenticated/);
  assert.match(normalized, /grant execute on function public\.get_market_startup_post\(text\) to anon, authenticated/);
  assert.match(client, /exactKeys\(value, startupPostKeys\)/);
  assert.match(client, /startupPostKeyPattern/);
});

test("owner mutation context keeps optimistic version private and mutations active-owner only", () => {
  assert.match(normalized, /grant execute on function public\.get_my_market_startup_post_mutation_context\(text\) to authenticated/);
  assert.match(normalized, /grant execute on function public\.mutate_market_startup_post\(text, text, integer, jsonb\) to authenticated/);
  assert.match(migration, /private\.market_assert_active_actor\(\)/);
  assert.match(migration, /v_post\.author_user_id <> v_actor_id/);
  assert.match(migration, /v_post\.version <> p_expected_version/);
  assert.match(migration, /publication_status = 'removed'/);
  assert.doesNotMatch(migration, /grant execute on function public\.mutate_market_startup_post[\s\S]*to anon/);
});

test("client connects real paginated list, strict detail, create, edit, close, and remove", () => {
  for (const name of [
    "listMarketStartupPostsAction",
    "getMarketStartupPostAction",
    "getMyMarketStartupPostMutationContextAction",
    "mutateMarketStartupPostAction",
  ]) assert.match(actions, new RegExp(name));
  assert.match(content, /listMarketStartupPostsAction\(\s*startupFilters,\s*24,\s*more\s*\?\s*posts\.items\.length\s*:\s*0,?\s*\)/);
  for (const name of ["getStartupContextV2Action", "getStartupV2Action", "mutateStartupV2Action"]) assert.match(phaseActions, new RegExp(name));
  assert.match(content, /operation:\s*entry\.item\s*\?\s*"update"\s*:\s*"create"/);
  assert.match(content, /operation:\s*confirmation\.operation/);
  assert.match(section, /해당 카테고리의 게시글이 없습니다/);
  assert.match(section, /다시 불러오기/);
});

test("write CTAs preselect one shared form and startup mode hides product-only filters", () => {
  for (const value of ["screenStartup", "startupInquiry", "screenResale", "transfer", "fieldCourseDevelopment", "courseDevelopment"]) assert.ok(content.includes(value));
  assert.match(entry, /StartupBoardEntryDialog/);
  assert.match(entry, /본문에 연락처·상세 주소 등 개인정보/);
  assert.match(filters, /query\.view !== "startup"/);
  assert.match(filters, /startupBoardCategoryLabels/);
  assert.doesNotMatch(prompt, /준비 중|alert\(/);
  assert.doesNotMatch(vendor, /onInquiry|광고 문의|인증업체/);
});

test("mock-only answers, views, vendor answers, authors, and placeholder form are gone", () => {
  for (const source of [content, card, detail, data]) {
    assert.doesNotMatch(source, /startupBoardPosts|answerCount|viewCount|authorType|vendorAnswer/);
  }
  assert.doesNotMatch(data, /MARKET_REGISTER_FORM_URL|placeholder\/viewform/);
  assert.match(card, /post\.authorNickname/);
  assert.match(detail, /post\.authorNickname/);
});

test("startup and ordinary dialogs share the accessible keyboard and focus shell", () => {
  assert.match(entry, /MarketDialog/);
  assert.match(detail, /MarketDialog/);
  assert.match(sharedDialog, /role="dialog"\s+aria-modal="true"\s+aria-labelledby/);
  assert.match(sharedDialog, /event\.key === "Escape"/);
  assert.match(sharedDialog, /event\.key !== "Tab"/);
  assert.match(sharedDialog, /close\.current\?\.focus/);
  assert.match(content, /trigger\.current\?\.isConnected/);
});
