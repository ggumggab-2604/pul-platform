"use client";

import { MarketActionButtons } from "@/components/market/MarketActionButtons";
import { MarketDetailModal } from "@/components/market/MarketDetailModal";
import { FeaturedMarketCards } from "@/components/market/FeaturedMarketCards";
import { MarketProductCard } from "@/components/market/MarketProductCard";
import {
  MarketHubNav,
  type MarketHubSection,
} from "@/components/market/MarketHubNav";
import {
  MarketBuyGuidePanel,
  MarketCareAndRepairPanel,
  MarketOpenEventPanel,
  MarketPriceGuidePanel,
} from "@/components/market/MarketInfoPanels";
import {
  MarketSearchFilter,
  MobileSearchToolbar,
  MobileQuickFilterRow,
  createDefaultMarketFilters,
  filterMarketListings,
  isStartupResaleMode,
} from "@/components/market/MarketSearchFilter";
import { MarketAdPlaceholder } from "@/components/market/MarketAdPlaceholder";
import { MarketOperationGuide } from "@/components/market/MarketOperationGuide";
import { MarketSafetyGuide } from "@/components/market/MarketSafetyGuide";
import { StartupBoardSection } from "@/components/market/StartupBoardSection";
import { StartupQuickAccessMenu } from "@/components/market/StartupQuickAccessMenu";
import { StartupBoardGuideBox } from "@/components/market/StartupBoardGuideBox";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { InfoModal } from "@/components/ui/InfoModal";
import { StartupBoardWritePrompt } from "@/components/market/StartupBoardWritePrompt";
import { StartupVendorRecommendBanner } from "@/components/market/StartupVendorRecommendBanner";
import { StartupBoardDetailModal } from "@/components/market/StartupBoardDetailModal";
import {
  featuredListings,
  filterStartupBoardPosts,
  MARKET_FEATURED_MOBILE_PREVIEW,
  MARKET_LATEST_MOBILE_PREVIEW,
  MARKET_PAGE_DISCLAIMER,
  MARKET_REGISTER_FORM_URL,
  marketBuyRequests,
  marketListings,
  marketRegisterNotes,
  categoryLabels,
  startupBoardPosts,
  STARTUP_BOARD_FULL_MOBILE_PREVIEW,
  STARTUP_BOARD_FULL_PC_PREVIEW,
} from "@/data/marketData";
import type { MarketBuyRequest, MarketListing, StartupBoardCategoryFilter, StartupBoardPost } from "@/types";
import { useEffect, useMemo, useState } from "react";

function handleBoardWrite(action: string) {
  console.log("[창업·매매 게시판]", action);
  alert(`${action} 기능은 준비 중입니다. 추후 게시글 작성이 가능해집니다.`);
}

function BuyRequestCard({ item }: { item: MarketBuyRequest }) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)]">
      <div className="flex flex-wrap gap-1">
        {item.isSample !== false ? (
          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">
            샘플
          </span>
        ) : null}
        <span className="rounded-md bg-pul-light px-2 py-0.5 text-[10px] font-bold text-pul-deep">
          {categoryLabels[item.category]}
        </span>
      </div>
      <h3 className="mt-2 text-sm font-bold text-foreground lg:text-base">{item.title}</h3>
      <p className="mt-1 text-xs text-pul-muted">
        {item.region} · 희망 {item.budget}
      </p>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
        {item.summary}
      </p>
      <p className="mt-2 text-[11px] text-pul-muted">
        {item.authorNickname} · {item.createdAt}
      </p>
    </article>
  );
}

export function MarketPageContent() {
  const [filters, setFilters] = useState(createDefaultMarketFilters);
  const [hubSection, setHubSection] = useState<MarketHubSection>("browse");
  const [boardCategory, setBoardCategory] = useState<StartupBoardCategoryFilter>("all");
  const [selectedItem, setSelectedItem] = useState<MarketListing | null>(null);
  const [selectedBoardPost, setSelectedBoardPost] = useState<StartupBoardPost | null>(null);
  const [infoModal, setInfoModal] = useState<"register" | "buy" | "guide" | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showAllListings, setShowAllListings] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setShowAllListings(false);
  }, [filters]);

  const startupMode = isStartupResaleMode(filters);
  const showQuickAccessMenu = !startupMode && filters.sellerType === "all";

  const filteredListings = useMemo(
    () =>
      filterMarketListings(marketListings, filters).map((item) => ({
        ...item,
        isSample: item.isSample ?? true,
      })),
    [filters],
  );

  const featuredIds = useMemo(() => {
    const ids = new Set(featuredListings.map((item) => item.id));
    return ids;
  }, []);

  const mobileFeatured = useMemo(() => {
    const fromFiltered = filteredListings.filter((item) => featuredIds.has(item.id));
    const base =
      fromFiltered.length > 0
        ? fromFiltered
        : featuredListings.filter((item) =>
            filteredListings.some((listing) => listing.id === item.id),
          );
    return base.slice(0, MARKET_FEATURED_MOBILE_PREVIEW);
  }, [filteredListings, featuredIds]);

  const mobileFeaturedIds = useMemo(
    () => new Set(mobileFeatured.map((item) => item.id)),
    [mobileFeatured],
  );

  /** 최신: 추천에 나온 상품 제외, 최대 4 */
  const mobileLatest = useMemo(
    () =>
      filteredListings
        .filter((item) => !mobileFeaturedIds.has(item.id))
        .slice(0, MARKET_LATEST_MOBILE_PREVIEW),
    [filteredListings, mobileFeaturedIds],
  );

  const mobilePreviewIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of mobileFeatured) ids.add(item.id);
    for (const item of mobileLatest) ids.add(item.id);
    return ids;
  }, [mobileFeatured, mobileLatest]);

  const mobileHiddenCount = Math.max(0, filteredListings.length - mobilePreviewIds.size);

  const filteredBoardPosts = useMemo(
    () =>
      filterStartupBoardPosts(startupBoardPosts, boardCategory, {
        keyword: filters.keyword,
        region: filters.region,
      }),
    [boardCategory, filters.keyword, filters.region],
  );

  const boardPreviewLimit = isMobile
    ? STARTUP_BOARD_FULL_MOBILE_PREVIEW
    : STARTUP_BOARD_FULL_PC_PREVIEW;

  const visibleBoardPosts = startupMode
    ? filteredBoardPosts.slice(0, boardPreviewLimit)
    : [];

  const resultCount = startupMode ? filteredBoardPosts.length : filteredListings.length;

  const resetFilters = () => {
    setFilters(createDefaultMarketFilters());
    setBoardCategory("all");
  };

  const switchToStartupBoard = (category: StartupBoardCategoryFilter = "all") => {
    setFilters({ ...createDefaultMarketFilters(), sellerType: "startupResale" });
    setBoardCategory(category);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSafety = () => {
    setHubSection("safety");
    document.getElementById("market-safety")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleHubChange = (section: MarketHubSection) => {
    setHubSection(section);
    if (section === "price") {
      document.getElementById("market-price-guide")?.scrollIntoView({ behavior: "smooth" });
    } else if (section === "guide") {
      document.getElementById("market-buy-guide")?.scrollIntoView({ behavior: "smooth" });
    } else if (section === "safety") {
      scrollToSafety();
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleEquipmentCareInquiry = () => {
    alert("수리업체 등록 문의 기능은 준비 중입니다.");
  };

  const handleVendorInquiry = () => {
    console.log("[market] 창업·시설 업체 광고 문의");
    alert("창업·시설 업체 추천 영역 광고 문의 기능은 준비 중입니다.");
  };

  const expandAllListings = () => {
    setShowAllListings(true);
    window.setTimeout(() => {
      document
        .getElementById("market-all-listings")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  return (
    <>
      <div className="space-y-5 pb-4 lg:space-y-8 lg:pb-2">
        {!startupMode && (
          <>
            <MarketActionButtons
              onRegister={() => setInfoModal("register")}
              onBuyRegister={() => setInfoModal("buy")}
              onSafety={scrollToSafety}
            />
            <MarketHubNav active={hubSection} onChange={handleHubChange} />
            <MarketOpenEventPanel />
          </>
        )}

        <div className="space-y-2.5 lg:hidden">
          <MobileSearchToolbar
            keyword={filters.keyword}
            onKeywordChange={(keyword) => setFilters({ ...filters, keyword })}
            resultCount={resultCount}
          />
          <MobileQuickFilterRow
            title="판매자 유형"
            filters={filters}
            onChange={setFilters}
            type="sellerType"
          />
          <MobileQuickFilterRow
            title="카테고리"
            filters={filters}
            onChange={setFilters}
            type="category"
          />
          <MobileQuickFilterRow
            title="지역"
            filters={filters}
            onChange={setFilters}
            type="region"
          />
        </div>

        <div className="hidden lg:block">
          <MarketSearchFilter
            filters={filters}
            onChange={setFilters}
            onReset={resetFilters}
            resultCount={resultCount}
          />
        </div>

        {startupMode ? (
          <>
            <StartupBoardGuideBox compact={isMobile} />
            <StartupBoardSection
              posts={visibleBoardPosts}
              mode="full"
              boardCategory={boardCategory}
              onBoardCategoryChange={setBoardCategory}
              onDetail={setSelectedBoardPost}
              showCategories
            />
            <StartupVendorRecommendBanner
              onInquiry={handleVendorInquiry}
              compact={isMobile}
            />
            <StartupBoardWritePrompt
              onStartupInquiry={() => handleBoardWrite("창업 문의하기")}
              onResalePost={() => handleBoardWrite("매장 매매 올리기")}
              onFieldInquiry={() => handleBoardWrite("필드 신설 문의하기")}
            />
          </>
        ) : hubSection === "wanted" ? (
          <section>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-foreground">삽니다</h2>
              <p className="mt-1 text-sm text-pul-muted">
                구매 희망 글입니다. 샘플 데이터가 포함되어 있습니다.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {marketBuyRequests.map((item) => (
                <BuyRequestCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : (
          <>
            <FeaturedMarketCards
              items={isMobile ? mobileFeatured : featuredListings}
              onSelect={setSelectedItem}
              mobileVisibleCount={MARKET_FEATURED_MOBILE_PREVIEW}
            />

            <MarketAdPlaceholder />

            {/* 모바일: 최신 (추천과 중복 제외) */}
            <section className="lg:hidden">
              <div className="mb-3">
                <h2 className="text-xl font-bold text-foreground">최신 상품</h2>
                <p className="mt-1 text-sm text-pul-muted">
                  추천에 없는 최근 등록 매물입니다.
                </p>
              </div>
              {mobileLatest.length === 0 ? (
                <div className="rounded-xl border border-dashed border-pul-border bg-white px-6 py-10 text-center">
                  <p className="text-base font-semibold text-foreground">
                    추가로 보여줄 최신 상품이 없습니다.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
                  {mobileLatest.map((item) => (
                    <MarketProductCard
                      key={item.id}
                      item={item}
                      onSelect={setSelectedItem}
                    />
                  ))}
                </div>
              )}
              {!showAllListings && mobileHiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={expandAllListings}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-pul-border bg-white text-base font-bold text-pul-deep hover:bg-pul-light/70"
                >
                  전체 상품 보기 (외 {mobileHiddenCount}건) →
                </button>
              ) : null}
            </section>

            {/* 모바일: 전체 펼침 / PC: 전체 목록 */}
            <section
              id="market-all-listings"
              className={showAllListings ? "scroll-mt-4" : "hidden scroll-mt-4 lg:block"}
            >
              <div className="mb-4">
                <h2 className="text-xl font-bold text-foreground">전체 상품</h2>
                <p className="mt-1 text-sm text-pul-muted lg:text-base">
                  {filteredListings.length === marketListings.length
                    ? "등록된 중고 파크골프 용품 전체입니다. 샘플 매물이 포함될 수 있습니다."
                    : "필터 조건에 맞는 중고 파크골프 용품입니다."}
                </p>
              </div>

              {filteredListings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-pul-border bg-white px-6 py-14 text-center">
                  <p className="text-base font-semibold text-foreground">
                    조건에 맞는 상품이 없습니다.
                  </p>
                  <p className="mt-1 text-sm text-pul-muted">
                    아래 시세·구매 가이드·안전거래 안내를 참고해 주세요.
                  </p>
                </div>
              ) : (
                <>
                  {/* 모바일 펼침: 첫 화면 미리보기에 없는 나머지 */}
                  <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:hidden">
                    {filteredListings
                      .filter((item) => !mobilePreviewIds.has(item.id))
                      .map((item) => (
                        <MarketProductCard
                          key={item.id}
                          item={item}
                          onSelect={setSelectedItem}
                        />
                      ))}
                  </div>
                  {/* PC: 전체 (기존과 동일) */}
                  <div className="hidden grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
                    {filteredListings.map((item) => (
                      <MarketProductCard
                        key={item.id}
                        item={item}
                        onSelect={setSelectedItem}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* PC: 창업 빠른 메뉴 유지 */}
            {showQuickAccessMenu ? (
              <div className="hidden lg:block">
                <StartupQuickAccessMenu onNavigate={switchToStartupBoard} />
              </div>
            ) : null}

            {/* 모바일: 인기 장비 시세 (접지 않음) */}
            <div className="lg:hidden">
              <MarketPriceGuidePanel />
            </div>

            {/* 모바일: 안내 영역 개별 접기 */}
            <div className="space-y-3 lg:hidden">
              {showQuickAccessMenu ? (
                <CollapsibleSection
                  title="창업·매매·시공 안내"
                  summary="스크린 창업, 매장 매매, 필드 신설·시공 문의로 이동하세요."
                >
                  <StartupQuickAccessMenu onNavigate={switchToStartupBoard} />
                </CollapsibleSection>
              ) : null}
              <CollapsibleSection
                title="시세·구매 가이드"
                summary="참고용 시세이며, 실제 거래가와 차이가 있을 수 있습니다."
              >
                <ul className="space-y-2 text-sm leading-relaxed text-pul-muted">
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
                    <span>
                      참고용 시세 정보입니다. 실제 거래가와 차이가 있을 수 있습니다.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
                    <span>
                      상품 상태 사진을 꼼꼼히 확인해주세요.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
                    <span>
                      중고 구매 시 그립·헤드 사진과 거래 방식을 카드에서 먼저 확인하세요.
                    </span>
                  </li>
                </ul>
              </CollapsibleSection>
              <CollapsibleSection
                title="초보자 장비 선택 가이드"
                summary="첫 채·공·중고 구매 시 확인할 기본 팁입니다."
              >
                <MarketBuyGuidePanel />
              </CollapsibleSection>
              <CollapsibleSection
                title="거래 안내"
                summary="장터 운영 기준과 장비 관리·수리 안내입니다."
              >
                <div className="space-y-4">
                  <MarketOperationGuide />
                  <MarketCareAndRepairPanel
                    onEquipmentCareInquiry={handleEquipmentCareInquiry}
                  />
                </div>
              </CollapsibleSection>
              <CollapsibleSection
                title="안전거래 안내"
                summary="직거래·선입금·개인정보 관련 기본 수칙입니다."
              >
                <MarketSafetyGuide />
              </CollapsibleSection>
            </div>

            {/* PC: 기존 패널 순서 유지 */}
            <div className="hidden space-y-5 lg:block">
              <MarketPriceGuidePanel />
              <MarketBuyGuidePanel />
              <MarketCareAndRepairPanel
                onEquipmentCareInquiry={handleEquipmentCareInquiry}
              />
              <MarketOperationGuide />
              <MarketSafetyGuide />
            </div>
          </>
        )}

        {!startupMode ? null : (
          <>
            <div className="lg:hidden">
              <CollapsibleSection
                title="운영·안전 안내"
                summary="장터 운영 기준과 안전거래 수칙"
              >
                <div className="space-y-4">
                  <MarketOperationGuide />
                  <MarketSafetyGuide />
                </div>
              </CollapsibleSection>
            </div>
            <div className="hidden space-y-5 lg:block">
              <MarketOperationGuide />
              <MarketSafetyGuide />
            </div>
          </>
        )}

        <p className="rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-3 text-center text-xs leading-relaxed text-pul-muted lg:text-sm">
          {MARKET_PAGE_DISCLAIMER}
        </p>
      </div>

      <MarketDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      <StartupBoardDetailModal
        post={selectedBoardPost}
        onClose={() => setSelectedBoardPost(null)}
      />

      {infoModal === "register" && (
        <InfoModal
          title="판매글 등록 준비중"
          message={`PUL 장터 판매글 등록 기능은 준비 중입니다. Google Form을 통해 임시 등록이 가능합니다.\n\n${marketRegisterNotes.join(" ")}`}
          actionLabel="등록 양식 열기"
          actionHref={MARKET_REGISTER_FORM_URL}
          onClose={() => setInfoModal(null)}
        />
      )}

      {infoModal === "buy" && (
        <InfoModal
          title="삽니다 글 등록 준비중"
          message="구매 희망 글 등록 기능은 준비 중입니다. 원하는 장비, 예산, 지역을 남겨주시면 추후 매칭에 활용됩니다."
          onClose={() => setInfoModal(null)}
        />
      )}

      {infoModal === "guide" && (
        <InfoModal
          title="판매 가이드"
          message="상품 사진을 여러 장 올리고, 상태와 거래 방식을 정확히 기재해주세요. 직거래 시 안전한 장소에서 만나시고, 선입금 요구에는 주의해주세요."
          onClose={() => setInfoModal(null)}
        />
      )}
    </>
  );
}
