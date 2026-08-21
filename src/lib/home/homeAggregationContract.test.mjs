import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("home loads the five public domains once and shares the results across layouts", async () => {
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
  assert.equal(
    (aggregation.match(/listHallOfFamePublicRecordsByType\(/g) ?? []).length,
    1,
  );
  assert.equal(
    (aggregation.match(/listHallOfFamePublicRankings\(/g) ?? []).length,
    1,
  );
  assert.match(aggregation, /Promise\.allSettled/);
});

test("home hall of fame reuses public records and monthly rankings with KST", async () => {
  const [page, aggregation, desktop, mobile] = await Promise.all([
    source("app/page.tsx"),
    source("lib/home/homeAggregation.ts"),
    source("components/home/HallOfFameSection.tsx"),
    source("components/home/MobileHallOfFameCard.tsx"),
  ]);

  assert.match(
    aggregation,
    /listHallOfFamePublicRecordsByType\(client, "all", 12, 0\)/,
  );
  assert.match(
    aggregation,
    /listHallOfFamePublicRankings\(client, "monthly", referenceDate, 10\)/,
  );
  assert.match(aggregation, /timeZone: "Asia\/Seoul"/);
  assert.match(page, /records=\{homeContent\.hallOfFame\.records\.items\}/);
  assert.match(page, /rankings=\{homeContent\.hallOfFame\.rankings\.items\}/);
  assert.doesNotMatch(desktop + mobile, /@\/data\/homeData|hallOfFamePortalData|hallOfFamePeople/);
});

test("home hall of fame has honest sections, empty and isolated failure states", async () => {
  const [desktop, mobile] = await Promise.all([
    source("components/home/HallOfFameSection.tsx"),
    source("components/home/MobileHallOfFameCard.tsx"),
  ]);
  const all = desktop + mobile;

  assert.match(all, /특별 기록/);
  assert.match(all, /이번 달 개인 순위/);
  assert.match(all, /최근 공개 기록/);
  assert.match(all, /아직 등록된 특별 기록이 없습니다/);
  assert.match(all, /이번 달 공개된 순위 기록이 없습니다/);
  assert.match(all, /최근 공개된 명예 기록이 없습니다/);
  assert.match(all, /recordsLoadFailed/);
  assert.match(all, /rankingsLoadFailed/);
  assert.doesNotMatch(all, /최근 대회 우승자|동호회 최저타수|준비 중/);
});

test("home hall of fame CTA targets the real member area without private identifiers", async () => {
  const [aggregation, desktop, mobile] = await Promise.all([
    source("lib/home/homeAggregation.ts"),
    source("components/home/HallOfFameSection.tsx"),
    source("components/home/MobileHallOfFameCard.tsx"),
  ]);
  const all = desktop + mobile;

  assert.match(all, /\/hall-of-fame#my-hall-of-fame/);
  assert.match(all, /내 기록·신청 확인/);
  assert.doesNotMatch(
    aggregation,
    /authUuid|actorUuid|email|phone|evidence|internal|reviewer|version/,
  );
  assert.doesNotMatch(all, /application_id|record_id|request_id/);
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
