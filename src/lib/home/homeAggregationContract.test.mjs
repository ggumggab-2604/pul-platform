import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("home loads the six public domains once and shares the results across layouts", async () => {
  const [page, aggregation] = await Promise.all([
    source("app/page.tsx"),
    source("lib/home/homeAggregation.ts"),
  ]);

  assert.match(page, /loadHomeContent\(client\)/);
  assert.match(page, /loadHomeWeather\(\)/);
  assert.match(page, /Promise\.all/);
  assert.equal((aggregation.match(/listPublicNewsArticles\(/g) ?? []).length, 1);
  assert.equal((aggregation.match(/listPublicEvents\(/g) ?? []).length, 1);
  assert.equal((aggregation.match(/listPublicHomeClubs\(/g) ?? []).length, 2);
  assert.equal((aggregation.match(/listMarketListings\(/g) ?? []).length, 1);
  assert.equal((aggregation.match(/listCommunityPosts\(/g) ?? []).length, 1);
  assert.equal((page.match(/loadNationalScores\(client,/g) ?? []).length, 1);
  assert.equal((page.match(/loadLatestHallRecords\(client\)/g) ?? []).length, 1);
  assert.equal((page.match(/loadNationalSpecial\(client,/g) ?? []).length, 1);
  assert.match(aggregation, /Promise\.allSettled/);
});

test("home community card uses latest public posts and a truthful empty state", async () => {
  const [page, aggregation, lower, data] = await Promise.all([
    source("app/page.tsx"),
    source("lib/home/homeAggregation.ts"),
    source("components/home/LowerContentGrid.tsx"),
    source("data/homeData.ts"),
  ]);

  assert.match(aggregation, /listCommunityPosts\(client, "all", "", "latest", 5, 0\)/);
  assert.match(page, /community=\{homeContent\.community\.items\}/);
  assert.match(page, /communityLoadFailed=\{homeContent\.community\.loadFailed\}/);
  assert.match(lower, /title="커뮤니티 새 글"/);
  assert.match(lower, /아직 등록된 커뮤니티 글이 없습니다/);
  assert.match(lower, /href=\{`\/community\/\$\{post\.id\}`\}/);
  assert.doesNotMatch(lower, /조회 \{post\.views\}|post\.rank|popularPosts/);
  assert.doesNotMatch(data, /export const popularPosts/);
});

test("home shares today's national scores and public records across both layouts", async () => {
  const [page, card, aggregation] = await Promise.all([
    source("app/page.tsx"),
    source("components/home/HomeHallRecords.tsx"),
    source("lib/home/homeAggregation.ts"),
  ]);
  assert.match(page, /loadNationalScores\(client, "today", 3\)/);
  assert.equal((page.match(/<HomeHallRecords today=\{today\} latest=\{latest\} special=\{special\}/g) ?? []).length, 2);
  assert.match(aggregation, /timeZone: "Asia\/Seoul"/);
  for (const label of ["오늘의 전국 최저타", "특별 기록", "최신 기록", "오늘 입력된 공개 성적이 없습니다", "최근 공개된 기록이 없습니다", "오늘 순위를 불러오지 못했습니다", "최신 기록을 불러오지 못했습니다"]) {
    assert.match(card, new RegExp(label));
  }
  assert.match(card, /href="\/hall-of-fame\/mine"/);
  assert.doesNotMatch(card, /application_id|record_id|request_id|@\/data\/homeData/);
});

test("home news uses the published public RPC result and stable news keys", async () => {
  const [card, lower, aggregation] = await Promise.all([
    source("components/home/LiveNewsCard.tsx"),
    source("components/home/LowerContentGrid.tsx"),
    source("lib/home/homeAggregation.ts"),
  ]);

  assert.match(aggregation, /listPublicNewsArticles\(client, \{\}, 10, 0\)/);
  assert.match(card, /href=\{`\/news\/\$\{item\.newsKey\}`\}/);
  assert.match(lower, /href=\{`\/news\/\$\{news\.newsKey\}`\}/);
  assert.doesNotMatch(card, /liveNewsItems|@\/data\/homeData/);
});

test("home events keep only upcoming public rows and use stable detail keys", async () => {
  const [card, aggregation] = await Promise.all([
    source("components/home/EventSection.tsx"),
    source("lib/home/homeAggregation.ts"),
  ]);

  assert.match(aggregation, /event\.startDate === null \|\| event\.startDate >= today/);
  assert.match(aggregation, /event\.registrationStatus !== "ended"/);
  assert.match(card, /href=\{`\/events\/\$\{featuredEvent\.eventKey\}`\}/);
  assert.match(card, /href=\{`\/events\/\$\{event\.eventKey\}`\}/);
  assert.doesNotMatch(card, /eventSchedule|@\/data\/homeData|<button/);
});

test("home clubs and market use active public data without fake counts or popularity", async () => {
  const [clubs, market, aggregation] = await Promise.all([
    source("components/home/NewClubSection.tsx"),
    source("components/home/HomeMarketTeaser.tsx"),
    source("lib/home/homeAggregation.ts"),
  ]);

  assert.match(aggregation, /listPublicClubs\(client, \{\}, limit, 0\)/);
  assert.match(aggregation, /saleStatus: "selling"/);
  assert.match(clubs, /href=\{`\/clubs\/\$\{club\.legacyKey\}`\}/);
  assert.doesNotMatch(clubs, /club\.members|newClubs|@\/data\/homeData/);
  assert.match(market, /title="최근 장터 매물"/);
  assert.match(market, /title="참고 장비 시세"/);
  assert.doesNotMatch(market, /장터 인기 상품|운영 준비 샘플 매물|marketItems/);
});

test("home keeps empty and failure states while removing operational mock exports", async () => {
  const [news, events, clubs, market, lower, data] = await Promise.all([
    source("components/home/LiveNewsCard.tsx"),
    source("components/home/EventSection.tsx"),
    source("components/home/NewClubSection.tsx"),
    source("components/home/HomeMarketTeaser.tsx"),
    source("components/home/LowerContentGrid.tsx"),
    source("data/homeData.ts"),
  ]);

  for (const component of [news, events, clubs, market]) {
    assert.match(component, /loadFailed/);
  }
  assert.match(lower, /marketLoadFailed/);
  assert.match(lower, /clubsLoadFailed/);
  assert.match(lower, /newsLoadFailed/);
  assert.match(lower, /communityLoadFailed/);
  assert.match(news, /등록된 최신 소식이 없습니다/);
  assert.match(events, /예정된 대회·이벤트가 없습니다/);
  assert.match(clubs, /등록된 동호회가 없습니다/);
  assert.match(market, /현재 등록된 장터 매물이 없습니다/);
  assert.doesNotMatch(
    data,
    /export const (liveNewsItems|eventSchedule|featuredEvent|newClubs|marketItems|pulNews|recommendedClubs|homeTopMarketItemIds)/,
  );
  assert.doesNotMatch(data, /export const (hallOfFamePeople|hallOfFamePortalData)/);
});
