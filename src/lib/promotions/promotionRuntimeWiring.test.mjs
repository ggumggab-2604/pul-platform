import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const home = source("../../app/page.tsx");
const hero = source("../../components/home/HeroSection.tsx");
const railGroup = source("../../components/home/HomeRailPromotionGroup.tsx");
const market = source("../../components/market/MarketPageContent.tsx");
const detail = source("../../app/promotions/[slug]/page.tsx");

const slotContracts = [
  ["courses.top.01", "courses.after_map.01", source("../../app/courses/page.tsx"), source("../../components/courses/CoursesPageClient.tsx")],
  ["clubs.top.01", "clubs.after_list.01", source("../../app/clubs/page.tsx"), source("../../components/clubs/ClubsPageShell.tsx")],
  ["market.list_top.01", "market.after_list.01", source("../../app/market/page.tsx"), market],
  ["community.top.01", "community.after_posts.01", source("../../app/community/page.tsx"), source("../../components/community/CommunityPageContent.tsx")],
  ["events.top.01", "events.after_schedule.01", source("../../app/events/page.tsx"), source("../../components/events/EventsPageContent.tsx")],
  ["lessons.top.01", "lessons.after_content.01", source("../../app/lessons/page.tsx"), source("../../components/lessons/LessonsPageShell.tsx")],
  ["certification.top.01", "certification.after_content.01", source("../../app/certification/page.tsx"), source("../../app/certification/page.tsx")],
  ["news.top.01", "news.after_list.01", source("../../app/news/page.tsx"), source("../../components/news/NewsPageContent.tsx")],
];

test("HOME requests all ten slots in one batched runtime call", () => {
  for (const slot of [
    "home.hero.01",
    "home.rail_left.01",
    "home.rail_left.short.01",
    "home.rail_left.short.02",
    "home.rail_left.short.03",
    "home.rail_right.01",
    "home.rail_right.short.01",
    "home.rail_right.short.02",
    "home.rail_right.short.03",
    "home.feed.01",
  ]) assert.match(home, new RegExp(slot.replaceAll(".", "\\.")));
  assert.equal((home.match(/loadActivePromotionsForSlots\(/g) ?? []).length, 1);
});

test("HOME keeps the PUL hero fallback and removes static runtime advertisements", () => {
  assert.match(hero, /PUL_hero_main_v4\.png/);
  assert.match(hero, /if \(promotion\)[\s\S]*variant="hero"/);
  assert.doesNotMatch(home, /leftAdBanners|rightAdBanners|mobileAdBanners|<AdBanner/);
});

test("HOME rail columns collapse for all zero, left, right, and both combinations", () => {
  assert.match(home, /hasLeftRail && hasRightRail/);
  assert.match(home, /if \(hasLeftRail\)/);
  assert.match(home, /if \(hasRightRail\)/);
  assert.match(home, /lg:grid-cols-\[minmax\(0,1fr\)\]/);
  assert.match(home, /hasLeftRail \?/);
  assert.match(home, /hasRightRail \?/);
});

test("HOME rail groups prefer long, otherwise pack active shorts without placeholders", () => {
  assert.match(railGroup, /if \(longPromotion\)/);
  assert.match(railGroup, /data-rail-mode="long"/);
  assert.match(railGroup, /if \(shortPromotions\.length === 0\) return null/);
  assert.match(railGroup, /shortPromotions\.map/);
  assert.match(railGroup, /data-rail-mode="short"/);
  assert.match(railGroup, /flex w-\[172px\] flex-col gap-2/);
  assert.doesNotMatch(railGroup, /placeholder|console\./i);
  const mobileHome = home.split("{/* 모바일")[1];
  assert.doesNotMatch(mobileHome, /HomeRailPromotionGroup/);
});

test("each directory fetches its top and secondary slots in one bounded server batch", () => {
  for (const [topSlot, secondSlot, page, component] of slotContracts) {
    assert.match(page, new RegExp(topSlot.replaceAll(".", "\\.")), `${topSlot} is missing from its page`);
    assert.match(page, new RegExp(secondSlot.replaceAll(".", "\\.")), `${secondSlot} is missing from its page`);
    assert.equal((page.match(/loadActivePromotionsForSlots\(/g) ?? []).length, 1);
    assert.match(component, /PromotionBanner/);
    assert.match(component, /variant="horizontal"/);
    assert.match(component, /secondPromotion \?/);
  }
});

test("secondary slots keep the approved natural content boundaries", () => {
  const contracts = [
    [market, /market-all-listings[\s\S]*secondPromotion[\s\S]*MarketPriceGuidePanel/],
    [source("../../components/community/CommunityPageContent.tsx"), /community-posts-title[\s\S]*secondPromotion[\s\S]*관련 커뮤니티 메뉴/],
    [source("../../components/events/EventsPageContent.tsx"), /대회·이벤트 일정[\s\S]*secondPromotion[\s\S]*지역별 필드 대회/],
    [source("../../components/news/NewsPageContent.tsx"), /latest-news-heading[\s\S]*secondPromotion[\s\S]*DerivedSection/],
  ];
  for (const [component, pattern] of contracts) assert.match(component, pattern);
});

test("market removes the visual placeholder but preserves the partnership inquiry", () => {
  assert.doesNotMatch(market, /MarketAdPlaceholder/);
  assert.match(market, /제휴·광고 문의/);
  assert.match(market, /openPartnershipInquiry/);
  assert.match(market, /promotion \? <PromotionBanner/);
});

test("disabled HOF and private MY remain free of runtime promotion wiring", () => {
  const hof = source("../../app/hall-of-fame/page.tsx");
  const my = source("../../app/my/page.tsx");
  assert.doesNotMatch(hof + my, /PromotionBanner|getActivePromotionsForSlots|hall_of_fame\.top\.01/);
});

test("existing domain detail pages do not gain promotion slots", () => {
  const details = [
    source("../../app/clubs/[id]/page.tsx"),
    source("../../app/courses/[id]/page.tsx"),
    source("../../app/community/[id]/page.tsx"),
    source("../../app/events/[id]/page.tsx"),
    source("../../app/news/[id]/page.tsx"),
  ].join("\n");
  assert.doesNotMatch(details, /PromotionBanner|getActivePromotionsForSlots/);
});

test("the only new public detail route uses metadata and the existing detail contract", () => {
  assert.match(detail, /generateMetadata/);
  assert.match(detail, /loadPublicPromotionDetail/);
  assert.match(detail, /notFound\(\)/);
});
