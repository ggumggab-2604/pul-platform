import { AdBanner } from "@/components/home/AdBanner";
import { EducationCards } from "@/components/home/EducationCards";
import { EventSection } from "@/components/home/EventSection";
import { HallOfFameSection } from "@/components/home/HallOfFameSection";
import { HeroSection, HeroWithQuickMenu } from "@/components/home/HeroSection";
import { LiveNewsCard } from "@/components/home/LiveNewsCard";
import { LowerContentGrid } from "@/components/home/LowerContentGrid";
import { MainFeatureBanners } from "@/components/home/MainFeatureBanners";
import { MembershipBanner } from "@/components/home/MembershipBanner";
import { NewClubSection } from "@/components/home/NewClubSection";
import { QuickMenu } from "@/components/home/QuickMenu";
import { WeatherCard } from "@/components/home/WeatherCard";
import { Container } from "@/components/ui/Container";
import { leftAdBanners, mobileAdBanners, rightAdBanners } from "@/data/homeData";

/** PC 3열: 좌광고 | 본문 | 우광고 */
const PORTAL_COLS = "lg:grid-cols-[172px_minmax(0,1fr)_172px]";

export default function Home() {
  return (
    <div className="bg-pul-page">
      <Container className="py-4">
        <section
          className={`main-portal-grid hidden lg:grid ${PORTAL_COLS} lg:items-start lg:gap-3`}
        >
          {/* 1열: 좌측 광고 */}
          <aside className="left-ad-column col-start-1 row-start-1 self-start flex flex-col gap-4">
            {leftAdBanners.map((ad) => (
              <AdBanner key={ad.id} data={ad} />
            ))}
          </aside>

          {/* 2열: 히어로·퀵메뉴·동호회/대회 + 오른쪽 정보 컬럼 */}
          <section className="col-start-2 row-start-1 min-w-0">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px] items-start gap-4">
              <div className="col-span-2 min-w-0">
                <HeroSection />
                <QuickMenu />
                <section className="mt-4 grid grid-cols-2 gap-4">
                  <NewClubSection />
                  <EventSection />
                </section>
              </div>
              <aside className="right-info-area min-w-0 space-y-4">
                <LiveNewsCard compact />
                <WeatherCard compact />
                <HallOfFameSection />
              </aside>
            </div>
          </section>

          {/* 3열: 우측 광고 */}
          <aside className="right-ad-column col-start-3 row-start-1 self-start flex flex-col gap-4">
            {rightAdBanners.map((ad) => (
              <AdBanner key={ad.id} data={ad} />
            ))}
          </aside>

          {/* 2행: 중앙 본문 */}
          <div className="col-start-2 row-start-2 flex flex-col gap-4">
            <EducationCards />
            <MainFeatureBanners />
            <LowerContentGrid />
            <MembershipBanner />
          </div>
        </section>

        {/* 모바일 */}
        <main className="flex flex-col gap-4 pb-2 lg:hidden">
          <HeroWithQuickMenu />
          <LiveNewsCard compact />
          <WeatherCard compact />
          <HallOfFameSection />
          <NewClubSection />
          <EventSection />
          <EducationCards />
          <AdBanner data={mobileAdBanners.mid} compact />
          <MainFeatureBanners />
          <LowerContentGrid />
          <AdBanner data={mobileAdBanners.bottom} compact />
          <MembershipBanner />
        </main>
      </Container>
    </div>
  );
}
