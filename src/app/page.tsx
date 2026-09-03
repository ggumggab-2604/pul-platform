import { HomeMarketTeaser } from "@/components/home/HomeMarketTeaser";
import { EducationCards } from "@/components/home/EducationCards";
import { EventSection } from "@/components/home/EventSection";
import { HallOfFameSection } from "@/components/home/HallOfFameSection";
import { HomeRailPromotionGroup } from "@/components/home/HomeRailPromotionGroup";
import { HeroSection, HeroWithQuickMenu } from "@/components/home/HeroSection";
import { LiveNewsCard } from "@/components/home/LiveNewsCard";
import { LowerContentGrid } from "@/components/home/LowerContentGrid";
import { MainFeatureBanners } from "@/components/home/MainFeatureBanners";
import { MembershipBanner } from "@/components/home/MembershipBanner";
import { MobileHallOfFameCard } from "@/components/home/MobileHallOfFameCard";
import { NewClubSection } from "@/components/home/NewClubSection";
import { QuickMenu } from "@/components/home/QuickMenu";
import { WeatherCard } from "@/components/home/WeatherCard";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { Container } from "@/components/ui/Container";
import { loadHomeContent } from "@/lib/home/homeAggregation";
import { findPromotionForSlot } from "@/lib/promotions/promotionRuntime";
import { loadActivePromotionsForSlots } from "@/lib/promotions/promotionRuntime.server";
import { createClient } from "@/lib/supabase/server";
import { loadHomeWeather } from "@/lib/weather/weather";

/**
 * PC 포털 그리드 (lg+)
 * 외곽: 좌광고 | 본문 | 우광고
 * 본문 내부 5영역 중 중앙 3열:
 *   [중앙L] [중앙R] [실시간정보]
 * 행1: 히어로+퀵(2열 span) | 소식+날씨
 * 행2: 장터·시세(2열 span) | 명예의 전당(행2~3 span)
 * 행3: 동호회 | 대회·이벤트 | (HOF 계속)
 */
const PORTAL_GAP = "gap-3"; // 12px

function portalLayout(hasLeftRail: boolean, hasRightRail: boolean) {
  if (hasLeftRail && hasRightRail) {
    return {
      grid: "lg:grid-cols-[172px_minmax(0,1fr)_172px]",
      core: "col-start-2",
      right: "col-start-3",
      lower: "col-start-2",
    };
  }
  if (hasLeftRail) {
    return {
      grid: "lg:grid-cols-[172px_minmax(0,1fr)]",
      core: "col-start-2",
      right: "",
      lower: "col-start-2",
    };
  }
  if (hasRightRail) {
    return {
      grid: "lg:grid-cols-[minmax(0,1fr)_172px]",
      core: "col-start-1",
      right: "col-start-2",
      lower: "col-start-1",
    };
  }
  return {
    grid: "lg:grid-cols-[minmax(0,1fr)]",
    core: "col-start-1",
    right: "",
    lower: "col-start-1",
  };
}

export default async function Home() {
  const client = await createClient();
  const [homeContent, homeWeather, promotions] = await Promise.all([
    loadHomeContent(client),
    loadHomeWeather(),
    loadActivePromotionsForSlots(client, [
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
    ]),
  ]);
  const heroPromotion = findPromotionForSlot(promotions, "home.hero.01");
  const leftLongPromotion = findPromotionForSlot(promotions, "home.rail_left.01");
  const leftShortPromotions = [
    "home.rail_left.short.01",
    "home.rail_left.short.02",
    "home.rail_left.short.03",
  ].flatMap((slotCode) => findPromotionForSlot(promotions, slotCode) ?? []);
  const rightLongPromotion = findPromotionForSlot(promotions, "home.rail_right.01");
  const rightShortPromotions = [
    "home.rail_right.short.01",
    "home.rail_right.short.02",
    "home.rail_right.short.03",
  ].flatMap((slotCode) => findPromotionForSlot(promotions, slotCode) ?? []);
  const mobileFeedPromotion = findPromotionForSlot(promotions, "home.feed.01");
  const hasLeftRail = Boolean(leftLongPromotion || leftShortPromotions.length);
  const hasRightRail = Boolean(rightLongPromotion || rightShortPromotions.length);
  const layout = portalLayout(hasLeftRail, hasRightRail);
  const primaryNews = homeContent.news.items.slice(0, 5);
  const secondaryNews = homeContent.news.items.slice(5, 10);
  const primaryClubs = homeContent.clubs.items.slice(0, 4);
  const secondaryClubs = homeContent.clubs.items.slice(4, 7);
  const primaryMarket = homeContent.market.items.slice(0, 3);
  const secondaryMarket = homeContent.market.items.slice(3, 6);

  return (
    <div className="bg-pul-page">
      <Container className="py-4">
        <section
          className={`main-portal-grid hidden lg:grid ${layout.grid} ${PORTAL_GAP} lg:items-start`}
        >
          {hasLeftRail ? (
            <aside
              className="left-ad-column col-start-1 row-start-1 self-start"
              aria-label="왼쪽 홍보"
            >
              <HomeRailPromotionGroup
                longPromotion={leftLongPromotion}
                shortPromotions={leftShortPromotions}
              />
            </aside>
          ) : null}

          <div
            className={`portal-core ${layout.core} row-start-1 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,300px)] grid-rows-[auto_auto_auto] items-stretch ${PORTAL_GAP}`}
          >
            {/* 행1 · 중앙: 대표 이미지 + 주요 바로가기 */}
            <div className="col-span-2 row-start-1 flex min-h-0 flex-col">
              <HeroSection promotion={heroPromotion} />
              <QuickMenu />
            </div>

            {/* 행1 · 실시간: 소식 + 날씨 (히어로 행과 동일 하단 기준선) */}
            <div className="col-start-3 row-start-1 flex h-full min-h-0 flex-col gap-3">
              <LiveNewsCard
                articles={primaryNews}
                loadFailed={homeContent.news.loadFailed}
                compact
                fullHeight
                className="min-h-0 flex-1"
              />
              <WeatherCard
                weather={homeWeather.weather}
                loadFailed={homeWeather.loadFailed}
                portal
              />
            </div>

            {/* 행2 · 장터 인기 상품 | 인기 장비 시세 */}
            <div className="col-span-2 row-start-2 min-w-0">
              <HomeMarketTeaser
                listings={primaryMarket}
                loadFailed={homeContent.market.loadFailed}
              />
            </div>

            {/* 행2~3 · 명예의 전당 (동호회·대회 하단까지 stretch) */}
            <div className="col-start-3 row-start-2 row-end-4 min-h-0 self-stretch overflow-hidden">
              <HallOfFameSection
                records={homeContent.hallOfFame.records.items}
                rankings={homeContent.hallOfFame.rankings.items}
                recordsLoadFailed={homeContent.hallOfFame.records.loadFailed}
                rankingsLoadFailed={homeContent.hallOfFame.rankings.loadFailed}
              />
            </div>

            {/* 행3 · 신규 등록 동호회 | 예정 대회·이벤트 */}
            <div className="col-start-1 row-start-3 min-h-0 self-stretch">
              <NewClubSection
                clubs={primaryClubs}
                loadFailed={homeContent.clubs.loadFailed}
              />
            </div>
            <div className="col-start-2 row-start-3 min-h-0 self-stretch">
              <EventSection
                events={homeContent.events.items}
                loadFailed={homeContent.events.loadFailed}
              />
            </div>
          </div>

          {hasRightRail ? (
            <aside
              className={`right-ad-column ${layout.right} row-start-1 self-start`}
              aria-label="오른쪽 홍보"
            >
              <HomeRailPromotionGroup
                longPromotion={rightLongPromotion}
                shortPromotions={rightShortPromotions}
              />
            </aside>
          ) : null}

          {/* 포털 그리드 종료 후 · 다음 바로가기부터 동일 가로선 */}
          <div className={`${layout.lower} row-start-2 flex flex-col ${PORTAL_GAP}`}>
            <EducationCards />
            <MainFeatureBanners />
            <LowerContentGrid
              listings={secondaryMarket}
              clubs={secondaryClubs}
              news={secondaryNews}
              community={homeContent.community.items}
              marketLoadFailed={homeContent.market.loadFailed}
              clubsLoadFailed={homeContent.clubs.loadFailed}
              newsLoadFailed={homeContent.news.loadFailed}
              communityLoadFailed={homeContent.community.loadFailed}
            />
            <MembershipBanner />
          </div>
        </section>

        {/* 모바일 — 핵심 먼저, 중복·긴 안내는 축소 (PC 그리드와 분리) */}
        <main className="flex flex-col gap-4 pb-2 lg:hidden">
          <HeroWithQuickMenu promotion={heroPromotion} />
          <WeatherCard
            weather={homeWeather.weather}
            loadFailed={homeWeather.loadFailed}
            bar
          />
          <LiveNewsCard
            articles={primaryNews}
            loadFailed={homeContent.news.loadFailed}
            compact
            maxItems={3}
          />
          <MobileHallOfFameCard
            records={homeContent.hallOfFame.records.items}
            rankings={homeContent.hallOfFame.rankings.items}
            recordsLoadFailed={homeContent.hallOfFame.records.loadFailed}
            rankingsLoadFailed={homeContent.hallOfFame.rankings.loadFailed}
          />
          <EventSection
            events={homeContent.events.items}
            loadFailed={homeContent.events.loadFailed}
            mobileLimit={2}
          />
          <NewClubSection
            clubs={primaryClubs}
            loadFailed={homeContent.clubs.loadFailed}
            mobileLimit={3}
          />
          <HomeMarketTeaser
            listings={primaryMarket}
            loadFailed={homeContent.market.loadFailed}
          />
          <EducationCards />
          <MainFeatureBanners />
          <LowerContentGrid
            listings={secondaryMarket}
            clubs={secondaryClubs}
            news={secondaryNews}
            community={homeContent.community.items}
            marketLoadFailed={homeContent.market.loadFailed}
            clubsLoadFailed={homeContent.clubs.loadFailed}
            newsLoadFailed={homeContent.news.loadFailed}
            communityLoadFailed={homeContent.community.loadFailed}
            mobileCompact
          />
          {mobileFeedPromotion ? (
            <PromotionBanner promotion={mobileFeedPromotion} variant="mobileFeed" />
          ) : null}
          <MembershipBanner compact />
        </main>
      </Container>
    </div>
  );
}
