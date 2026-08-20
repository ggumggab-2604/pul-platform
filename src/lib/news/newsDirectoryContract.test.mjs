import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const foundation = read("../../../supabase/migrations/20260829000100_pul_news_directory_foundation.sql");
const correction = read("../../../supabase/migrations/20260829000200_pul_news_publication_time_invariant_correction.sql");
const migration = `${foundation}\n${correction}`;
const adapter = read("./newsDirectory.ts");
const page = read("../../app/news/page.tsx");
const content = read("../../components/news/NewsPageContent.tsx");
const detail = read("../../app/news/[id]/page.tsx");
const managePage = read("../../app/news/manage/page.tsx");
const manageActions = read("../../app/news/manage/actions.ts");
const manageUi = read("../../components/news/manage/NewsManagementPage.tsx");
const staticData = read("../../data/newsData.ts");

test("unified news model keeps stable keys, four categories, publication state, and no seed", () => {
  assert.match(migration, /create table public\.news_articles/);
  assert.match(migration, /constraint news_articles_news_key_uidx unique \(news_key\)/);
  for (const category of ["parkGolfNews", "screenParkGolf", "equipmentBrand", "noticeOperation"]) {
    assert.match(migration, new RegExp(`'${category}'`));
  }
  assert.match(migration, /publication_status in \('published', 'hidden', 'removed'\)/);
  assert.match(correction, /news_articles_enforce_publication_time/);
  assert.match(correction, /new\.publication_status = 'published'/);
  assert.match(correction, /new\.published_at > pg_catalog\.now\(\)/);
  const beforeMutation = migration.split("create function public.mutate_news_article")[0];
  assert.doesNotMatch(beforeMutation, /insert into public\.news_articles/i);
});

test("public RPCs are published-only, paginated, privacy-minimized, and public executable", () => {
  assert.match(migration, /create function public\.list_public_news_articles/);
  assert.match(migration, /create function public\.get_public_news_article/);
  assert.equal((migration.match(/article\.publication_status = 'published'/g) ?? []).length >= 3, true);
  assert.match(migration, /article\.published_at <= pg_catalog\.now\(\)/);
  assert.match(migration, /p_limit not between 1 and 50 or p_offset < 0/);
  for (const signature of [
    "list_public_news_articles",
    "get_public_news_article",
  ]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to anon, authenticated`));
  }
  const dto = migration.slice(
    migration.indexOf("create function private.public_news_article_json"),
    migration.indexOf("revoke all on function private.public_news_article_json"),
  );
  for (const privateField of ["created_by", "updated_by", "version", "publication_status", "email", "phone"]) {
    assert.doesNotMatch(dto, new RegExp(privateField));
  }
});

test("HTTPS source contract and strict client parser reject unsafe or expanded DTOs", () => {
  assert.match(migration, /p_url ~ '\^https:\/\//);
  assert.match(migration, /private\.valid_news_external_url\(source_url\)/);
  assert.match(adapter, /url\.protocol === "https:"/);
  assert.match(adapter, /exactKeys\(value, publicKeys\)/);
  assert.match(adapter, /exactKeys\(data, \["news_key", "publication_status", "version"\]\)/);
});

test("active platform admin manages through RPC while raw table DML stays closed", () => {
  assert.match(migration, /values \(\s*'news\.manage'/);
  assert.match(migration, /values \('platform_admin', 'news\.manage'\)/);
  assert.match(migration, /account\.account_status = 'active'/);
  assert.match(migration, /for share of account/);
  assert.match(migration, /where article\.news_key = v_key\s+for update/);
  assert.match(migration, /grant execute on function public\.mutate_news_article\(text, text, integer, jsonb\)\s+to authenticated/);
  assert.match(migration, /revoke all on table public\.news_articles\s+from public, anon, authenticated, service_role/);
  assert.match(migration, /v_article\.version <> p_expected_version/);
});

test("runtime news routes consume RPC data and no article, screen, equipment, view, or comment mock", () => {
  assert.match(page, /listPublicNewsArticles/);
  assert.match(detail, /getServerNewsArticle/);
  assert.match(content, /현재 등록된 뉴스·정보가 없습니다/);
  assert.match(content, /screenNews/);
  assert.match(content, /equipmentNews/);
  for (const source of [page, content, detail, staticData]) {
    assert.doesNotMatch(source, /newsItems|screenParkGolfItems|equipmentBrandItems|viewCount|commentCount/);
  }
  assert.doesNotMatch(content, /조회순|댓글\s*\{/);
});

test("detail, category, search, pagination, source, and management UI are wired", () => {
  assert.match(content, /aria-current=/);
  assert.match(content, /name="keyword"/);
  assert.match(content, /pageHref\(pageNumber \+ 1/);
  assert.match(detail, /whitespace-pre-line/);
  assert.match(detail, /target="_blank"/);
  assert.match(detail, /rel="noopener noreferrer"/);
  assert.match(detail, /notFound\(\)/);
  assert.match(managePage, /listNewsArticlesForManagement/);
  assert.match(manageActions, /mutateNewsArticle/);
  for (const operation of ["create", "update", "publish", "hide", "remove"]) {
    assert.match(manageActions, new RegExp(`${operation}:`));
  }
  assert.match(manageUi, /role="dialog"/);
  assert.match(manageUi, /aria-modal="true"/);
  assert.match(manageUi, /event\.key === "Escape"/);
  assert.match(manageUi, /trigger\.focus/);
  assert.match(manageUi, /type="datetime-local"/);
});
