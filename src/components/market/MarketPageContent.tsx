"use client";

import { MarketActionButtons } from "@/components/market/MarketActionButtons";
import { MarketDetailModal } from "@/components/market/MarketDetailModal";
import { FeaturedMarketCards } from "@/components/market/FeaturedMarketCards";
import { MarketProductCard } from "@/components/market/MarketProductCard";
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
import { StartupBoardWritePrompt } from "@/components/market/StartupBoardWritePrompt";
import { StartupVendorRecommendBanner } from "@/components/market/StartupVendorRecommendBanner";
import { StartupBoardDetailModal } from "@/components/market/StartupBoardDetailModal";
import {
  featuredListings,
  filterStartupBoardPosts,
  MARKET_PAGE_DISCLAIMER,
  MARKET_REGISTER_FORM_URL,
  marketListings,
  marketRegisterNotes,
  startupBoardPosts,
  STARTUP_BOARD_FULL_MOBILE_PREVIEW,
  STARTUP_BOARD_FULL_PC_PREVIEW,
} from "@/data/marketData";
import type { MarketListing, StartupBoardCategoryFilter, StartupBoardPost } from "@/types";
import { useEffect, useMemo, useState } from "react";

function InfoModal({
  title,
  message,
  onClose,
  actionLabel,
  actionHref,
}: {
  title: string;
  message: string;
  onClose: () => void;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-pul-border bg-white p-5 shadow-[0_12px_40px_rgba(6,78,59,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-pul-muted">{message}</p>
        <div className="mt-5 flex gap-2">
          {actionLabel && actionHref && (
            <a
              href={actionHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
            >
              {actionLabel}
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-pul-border text-sm font-bold text-pul-muted hover:text-pul-deep"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function handleBoardWrite(action: string) {
  console.log("[창업·매매 게시판]", action);
  alert(`${action} 기능은 준비 중입니다. 추후 게시글 작성이 가능해집니다.`);
}

export function MarketPageContent() {
  const [filters, setFilters] = useState(createDefaultMarketFilters);
  const [boardCategory, setBoardCategory] = useState<StartupBoardCategoryFilter>("all");
  const [selectedItem, setSelectedItem] = useState<MarketListing | null>(null);
  const [selectedBoardPost, setSelectedBoardPost] = useState<StartupBoardPost | null>(null);
  const [infoModal, setInfoModal] = useState<"register" | "guide" | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const startupMode = isStartupResaleMode(filters);
  const showQuickAccessMenu = !startupMode && filters.sellerType === "all";

  const filteredListings = useMemo(
    () => filterMarketListings(marketListings, filters),
    [filters],
  );

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
    document.getElementById("market-safety")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleVendorInquiry = () => {
    console.log("[market] 창업·시설 업체 광고 문의");
    alert("창업·시설 업체 추천 영역 광고 문의 기능은 준비 중입니다.");
  };

  return (
    <>
      <div className="space-y-5 pb-4 lg:space-y-8 lg:pb-2">
        {!startupMode && (
          <MarketActionButtons
            onRegister={() => setInfoModal("register")}
            onGuide={() => setInfoModal("guide")}
            onSafety={scrollToSafety}
          />
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
        ) : (
          <>
            <FeaturedMarketCards
              items={featuredListings}
              onSelect={setSelectedItem}
            />

            <MarketAdPlaceholder />

            <section>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-foreground">전체 상품</h2>
                <p className="mt-1 text-sm text-pul-muted lg:text-base">
                  {filteredListings.length === marketListings.length
                    ? "등록된 중고 파크골프 용품 전체입니다."
                    : "필터 조건에 맞는 중고 파크골프 용품입니다."}
                </p>
              </div>

              {filteredListings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-pul-border bg-white px-6 py-14 text-center">
                  <p className="text-base font-semibold text-foreground">
                    조건에 맞는 상품이 없습니다.
                  </p>
                  <p className="mt-1 text-sm text-pul-muted">
                    필터를 변경하거나 검색어를 수정해 보세요.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
                  {filteredListings.map((item) => (
                    <MarketProductCard
                      key={item.id}
                      item={item}
                      onSelect={setSelectedItem}
                    />
                  ))}
                </div>
              )}
            </section>

            {showQuickAccessMenu ? (
              <StartupQuickAccessMenu onNavigate={switchToStartupBoard} />
            ) : null}
          </>
        )}

        <MarketOperationGuide />
        <MarketSafetyGuide />

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
          title="상품 등록 준비중"
          message={`PUL 중고장터 상품 등록 기능은 준비 중입니다. Google Form을 통해 임시 등록이 가능합니다.\n\n${marketRegisterNotes.join(" ")}`}
          actionLabel="등록 양식 열기"
          actionHref={MARKET_REGISTER_FORM_URL}
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
