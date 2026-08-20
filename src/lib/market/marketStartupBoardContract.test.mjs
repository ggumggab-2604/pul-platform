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
const filters = read("../../components/market/MarketSearchFilter.tsx");
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
  assert.match(content, /listMarketStartupPostsAction\(target, 24, 0\)/);
  assert.match(content, /listMarketStartupPostsAction\(startupFilters, 24, startupPosts\.items\.length\)/);
  assert.match(content, /operation: item \? "update" : "create"/);
  assert.match(content, /operation: confirmation\.operation/);
  assert.match(section, /해당 카테고리의 게시글이 없습니다/);
  assert.match(section, /다시 불러오기/);
});

test("write CTAs preselect one shared form and startup mode hides product-only filters", () => {
  assert.match(content, /openStartupEntry\("screenStartup", "startupInquiry"/);
  assert.match(content, /openStartupEntry\("screenResale", "transfer"/);
  assert.match(content, /openStartupEntry\("fieldCourseDevelopment", "courseDevelopment"/);
  assert.match(entry, /StartupBoardEntryDialog/);
  assert.match(entry, /전화번호·상세 주소 등 개인정보/);
  assert.match(filters, /!startupMode && <CategoryFilterSection/);
  assert.match(filters, /!startupMode && <SaleStatusFilterSection/);
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

test("dialogs retain accessible modal focus behavior without changing ordinary market dialogs", () => {
  assert.match(entry, /role="dialog" aria-modal="true" aria-labelledby/);
  assert.match(entry, /event\.key === "Escape"/);
  assert.match(entry, /event\.key !== "Tab"/);
  assert.match(detail, /role="dialog" aria-modal="true" aria-labelledby/);
  assert.match(detail, /closeRef\.current\?\.focus/);
  assert.match(content, /triggerRef\.current\?\.isConnected/);
});
