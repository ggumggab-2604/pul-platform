"use client";

import { NewsPageHero } from "@/components/news/NewsPageHero";
import { Card } from "@/components/ui/Card";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { InfoModal } from "@/components/ui/InfoModal";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  LATEST_NEWS_MOBILE_PREVIEW,
  LATEST_NEWS_PREVIEW,
  SCREEN_PARK_GOLF_MOBILE_PREVIEW,
  EQUIPMENT_BRAND_MOBILE_PREVIEW,
  NEWS_PAGE_COPY,
  categoryLabels,
  equipmentBadgeLabels,
  equipmentBrandItems,
  equipmentNewsTypeLabels,
  screenParkGolfBadgeLabels,
  screenParkGolfItems,
  screenParkGolfTypeLabels,
  filterNewsItems,
  getFeaturedNews,
  newsCategoryTabs,
  newsItems,
  relatedMenuLinks,
  reportInquiryTypes,
  shouldShowSection,
  sourceTypeLabels,
  type NewsCategoryFilter,
  type NewsItem,
} from "@/data/newsData";

const CARD_ACTIONS =
  "mt-auto grid grid-cols-1 gap-2 pt-3 sm:grid-cols-2 lg:gap-2.5 lg:pt-4";
const CARD_BASE =
  "flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:p-4";
const SECTION_GAP = "space-y-3 lg:space-y-6";
const SECTION_TITLE = "text-base font-bold text-foreground lg:text-xl";
const SECTION_DESC = "mt-2 text-xs text-pul-muted lg:text-sm";
const MORE_BUTTON_CLASS =
  "mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:mt-4";

function handleNewsDetail(id: string, title: string) {
  // TODO: /news/[id] 상세 페이지 연결
  console.log("[news] 자세히 보기:", id, title);
}

function handleSectionMore(section: string) {
  // TODO: /news/list 또는 카테고리별 목록 페이지 연결
  console.log("[news] 더보기:", section);
}

function SectionMoreButton({
  label,
  section,
}: {
  label: string;
  section: string;
}) {
  return (
    <button type="button" onClick={() => handleSectionMore(section)} className={MORE_BUTTON_CLASS}>
      {label}
    </button>
  );
}

function IntroGuideLinkBox() {
  const { introGuideBox } = NEWS_PAGE_COPY;

  return (
    <aside className="rounded-lg border border-dashed border-pul-point/25 bg-pul-light/15 px-3 py-3 lg:px-4 lg:py-3.5">
      <p className="text-sm font-bold text-foreground">{introGuideBox.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
        {introGuideBox.description}
      </p>
      <Link
        href={introGuideBox.href}
        className="mt-2.5 inline-flex min-h-9 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-xs font-bold text-pul-deep hover:bg-pul-light lg:min-h-10 lg:text-sm"
      >
        {introGuideBox.buttonLabel}
      </Link>
    </aside>
  );
}

function CategoryBadge({ category }: { category: keyof typeof categoryLabels }) {
  return (
    <span className="inline-flex rounded-full border border-pul-point/30 bg-pul-light px-2 py-0.5 text-[10px] font-bold text-pul-deep lg:text-[11px]">
      {categoryLabels[category]}
    </span>
  );
}

function DetailButton({
  id,
  title,
  label = "자세히 보기",
  onClick,
  className,
}: {
  id: string;
  title: string;
  label?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick ?? (() => handleNewsDetail(id, title))}
      className={cn(
        "inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-pul-point text-[11px] font-bold text-white hover:bg-pul-deep lg:min-h-10 lg:text-xs",
        className,
      )}
    >
      {label}
    </button>
  );
}

function NewsCategoryTabs({
  active,
  onChange,
}: {
  active: NewsCategoryFilter;
  onChange: (category: NewsCategoryFilter) => void;
}) {
  return (
    <div className="scrollbar-none -mx-1 overflow-x-auto px-1 lg:mx-0 lg:overflow-visible">
      <div className="flex min-w-max gap-1.5 lg:flex-wrap lg:gap-2">
        {newsCategoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition-colors lg:px-4 lg:py-2.5 lg:text-sm",
              active === tab.id
                ? "border-pul-point bg-pul-point text-white"
                : "border-pul-border bg-white text-pul-muted hover:border-pul-point/40 hover:text-pul-deep",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FeaturedNewsCard({ item }: { item: NewsItem }) {
  return (
    <article className={CARD_BASE}>
      <div className="flex flex-1 flex-col">
        <CategoryBadge category={item.category} />
        <h4 className="mt-2 text-sm font-bold text-foreground lg:text-base">{item.title}</h4>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          {item.summary}
        </p>
        <p className="mt-2 text-[11px] text-pul-muted lg:text-xs">
          <span className="font-semibold text-foreground">{item.region}</span>
          {" · "}
          {item.publishedAt}
          {" · 조회 "}
          {item.viewCount}
        </p>
      </div>
      <div className={CARD_ACTIONS}>
        <DetailButton id={item.id} title={item.title} />
      </div>
    </article>
  );
}

function LatestNewsRow({ item }: { item: NewsItem }) {
  return (
    <article className="flex flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:flex-row lg:items-center lg:gap-4 lg:p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={item.category} />
          <span className="text-[10px] text-pul-muted lg:text-xs">
            {sourceTypeLabels[item.sourceType]}
          </span>
        </div>
        <h4 className="mt-1.5 text-sm font-bold text-foreground lg:text-base">{item.title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">{item.summary}</p>
        <p className="mt-2 text-[11px] text-pul-muted lg:text-xs">
          {item.region} · {item.publishedAt} · 조회 {item.viewCount} · 댓글{" "}
          {item.commentCount}
          {item.relatedLinkType ? ` · ${item.relatedLinkType}` : ""}
        </p>
      </div>
      <div className="mt-3 shrink-0 lg:mt-0 lg:w-36">
        <DetailButton id={item.id} title={item.title} />
      </div>
    </article>
  );
}

export function NewsPageContent() {
  const [activeCategory, setActiveCategory] = useState<NewsCategoryFilter>("all");
  const [sortOrder, setSortOrder] = useState<"latest" | "views">("latest");
  const [infoModal, setInfoModal] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const featuredNews = useMemo(
    () => getFeaturedNews(activeCategory),
    [activeCategory],
  );

  const latestNews = useMemo(() => {
    const items = filterNewsItems(newsItems, activeCategory);
    return [...items].sort((a, b) => {
      if (sortOrder === "views") return b.viewCount - a.viewCount;
      return b.publishedAt.localeCompare(a.publishedAt);
    });
  }, [activeCategory, sortOrder]);

  const visibleCourseChanges = useMemo(
    () =>
      shouldShowSection("screenParkGolf", activeCategory)
        ? screenParkGolfItems
        : [],
    [activeCategory],
  );

  const visibleEquipment = useMemo(
    () =>
      shouldShowSection("equipmentBrand", activeCategory) ? equipmentBrandItems : [],
    [activeCategory],
  );

  const latestPreviewCount = isMobile ? LATEST_NEWS_MOBILE_PREVIEW : LATEST_NEWS_PREVIEW;
  const previewLatestNews = latestNews.slice(0, latestPreviewCount);
  const hasMoreLatestNews = latestNews.length > latestPreviewCount;

  const openReport = () => {
    console.log("[news] 소식 제보하기");
    setInfoModal({
      title: "소식 제보하기",
      message: `소식 제보 기능은 준비 중입니다.\n\n${NEWS_PAGE_COPY.inquiryNote}`,
    });
  };

  const openPromotion = () => {
    console.log("[news] 홍보 문의하기");
    setInfoModal({
      title: "홍보 문의하기",
      message: `홍보 문의 기능은 준비 중입니다.\n\n대회, 자격증 교육, 대학·학과, 장비·브랜드 홍보 문의를 받을 예정입니다.\n\n${NEWS_PAGE_COPY.inquiryNote}`,
    });
  };

  return (
    <>
      <NewsPageHero onReport={openReport} onPromotionInquiry={openPromotion} />

      <div className={cn("mt-3 lg:mt-5", SECTION_GAP)}>
        <section className="rounded-xl border border-pul-border bg-white p-2.5 lg:p-5">
          <NewsCategoryTabs active={activeCategory} onChange={setActiveCategory} />
        </section>

        <IntroGuideLinkBox />

        {(activeCategory === "all" || featuredNews.length > 0) && (
          <section>
            <h2 className={SECTION_TITLE}>주요 소식</h2>
            <p className={SECTION_DESC}>지금 확인하면 좋은 파크골프 주요 소식입니다.</p>
            {featuredNews.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-pul-border px-4 py-8 text-center text-sm text-pul-muted">
                해당 카테고리의 주요 소식이 없습니다.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2 lg:mt-4 lg:grid-cols-3 lg:gap-4">
                {featuredNews.map((item) => (
                  <div key={item.id} className="h-full">
                    <FeaturedNewsCard item={item} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section>
          <h2 className={SECTION_TITLE}>최신 뉴스·정보</h2>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <p className={cn(SECTION_DESC, "mt-0")}>
              PUL 운영자가 확인한 소식과 제보·참고 자료를 모았습니다.
            </p>
            <select
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(event.target.value as "latest" | "views")
              }
              className="h-10 w-full rounded-lg border border-pul-border px-3 text-sm lg:w-44"
              aria-label="정렬"
            >
              <option value="latest">최신순</option>
              <option value="views">조회순</option>
            </select>
          </div>
          <div className="mt-3 space-y-2 lg:mt-4 lg:space-y-3">
            {latestNews.length === 0 ? (
              <p className="rounded-xl border border-dashed border-pul-border px-4 py-8 text-center text-sm text-pul-muted">
                해당 카테고리의 뉴스가 없습니다.
              </p>
            ) : (
              previewLatestNews.map((item) => <LatestNewsRow key={item.id} item={item} />)
            )}
          </div>
          {hasMoreLatestNews && (
            <SectionMoreButton label="최신 뉴스 더보기" section="latest-news" />
          )}
        </section>

        {visibleCourseChanges.length > 0 && (
          <section>
            <h2 className={SECTION_TITLE}>스크린 파크골프 소식</h2>
            <p className={SECTION_DESC}>
              신규 오픈 스크린 파크골프장, 오픈 이벤트, 무료 체험, 창업 설명회, 가맹 모집, 스크린 대회 소식을 소개합니다.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 lg:mt-4 lg:grid-cols-2 lg:gap-4">
              {visibleCourseChanges.map((item, index) => (
                <article
                  key={item.id}
                  className={cn(
                    CARD_BASE,
                    index >= SCREEN_PARK_GOLF_MOBILE_PREVIEW && "hidden lg:flex",
                  )}
                >
                  <div className="flex flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                        {screenParkGolfTypeLabels[item.newsType]}
                      </span>
                      <span className="rounded-full border border-pul-border bg-[#fafbfa] px-2 py-0.5 text-[10px] font-bold text-pul-muted">
                        {screenParkGolfBadgeLabels[item.promotionBadge]}
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-bold text-foreground lg:text-base">
                      {item.title}
                    </h4>
                    <p className="mt-0.5 text-xs text-pul-deep">
                      {item.businessName} · {item.region}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-pul-muted lg:text-sm">
                      {item.summary}
                    </p>
                    <p className="mt-2 text-[11px] text-pul-muted">
                      {item.eventPeriod}
                    </p>
                    <p className="mt-1 text-[11px] text-pul-muted">
                      시설 특징: {item.features.join(" · ")}
                    </p>
                  </div>
                  <div className={cn(CARD_ACTIONS, "sm:grid-cols-1")}>
                    <DetailButton id={item.id} title={item.title} />
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 lg:mt-4 lg:flex-row lg:gap-3">
              {visibleCourseChanges.length > SCREEN_PARK_GOLF_MOBILE_PREVIEW ? (
                <button
                  type="button"
                  onClick={() => handleSectionMore("screen-park-golf")}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-pul-border bg-white text-base font-bold text-pul-deep hover:bg-pul-light/70 lg:hidden"
                >
                  스크린 소식 더보기 (외{" "}
                  {visibleCourseChanges.length - SCREEN_PARK_GOLF_MOBILE_PREVIEW}
                  건) →
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => handleSectionMore("screen-park-golf")}
                className="hidden min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:inline-flex"
              >
                스크린 파크골프 소식 더보기
              </button>
              <button
                type="button"
                onClick={openPromotion}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-pul-light text-sm font-bold text-pul-deep hover:bg-pul-light/80"
              >
                스크린 홍보 문의
              </button>
            </div>
          </section>
        )}

        <section>
          <h2 className={SECTION_TITLE}>관련 메뉴 소식 바로가기</h2>
          <p className={SECTION_DESC}>
            대회 일정, 자격증·심판 정보, 대학·학과 소식은 각 전용 메뉴에서 더 자세히 확인할 수 있습니다.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 lg:mt-4 lg:grid-cols-3 lg:gap-4">
            {relatedMenuLinks.map((shortcut) => (
              <article key={shortcut.id} className={CARD_BASE}>
                <div className="flex flex-1 flex-col">
                  <h3 className="text-sm font-bold text-foreground lg:text-base">{shortcut.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-pul-muted lg:text-sm">
                    {shortcut.description}
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {shortcut.examples.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-[11px] leading-snug text-foreground lg:text-sm"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href={shortcut.href}
                  className="mt-auto inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-pul-border bg-pul-light text-sm font-bold text-pul-deep hover:bg-pul-light/80 lg:min-h-11"
                >
                  {shortcut.buttonLabel}
                </Link>
              </article>
            ))}
          </div>
        </section>

        {visibleEquipment.length > 0 && (
          <section>
            <h2 className={SECTION_TITLE}>장비·브랜드 소식</h2>
            <p className={SECTION_DESC}>
              파크골프 장비 신제품, 브랜드 소식, 체험단, 할인 행사, 업체 홍보를 소개합니다.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 lg:mt-4 lg:grid-cols-3 lg:gap-4">
              {visibleEquipment.map((item, index) => (
                <article
                  key={item.id}
                  className={cn(
                    CARD_BASE,
                    index >= EQUIPMENT_BRAND_MOBILE_PREVIEW && "hidden lg:flex",
                  )}
                >
                  <div className="flex flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex rounded-full border border-pul-point/30 bg-pul-light px-2 py-0.5 text-[10px] font-bold text-pul-deep">
                        {equipmentNewsTypeLabels[item.newsType]}
                      </span>
                      <span className="inline-flex rounded-full border border-pul-border bg-[#fafbfa] px-2 py-0.5 text-[10px] font-bold text-pul-muted">
                        {equipmentBadgeLabels[item.promotionBadge]}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-pul-deep">{item.brandName}</p>
                    <h4 className="mt-0.5 text-sm font-bold text-foreground lg:text-base">
                      {item.title}
                    </h4>
                    <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
                      {item.summary}
                    </p>
                  </div>
                  <div className={CARD_ACTIONS}>
                    <Link
                      href="/market"
                      className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-pul-border text-[11px] font-bold text-pul-deep hover:bg-pul-light lg:min-h-10 lg:text-xs"
                    >
                      {item.primaryButtonLabel}
                    </Link>
                    <DetailButton id={item.id} title={item.title} label={item.secondaryButtonLabel} />
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 lg:mt-4 lg:flex-row lg:gap-3">
              {visibleEquipment.length > EQUIPMENT_BRAND_MOBILE_PREVIEW ? (
                <button
                  type="button"
                  onClick={() => handleSectionMore("equipment-brand")}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-pul-border bg-white text-base font-bold text-pul-deep hover:bg-pul-light/70 lg:hidden"
                >
                  장비·브랜드 더보기 (외{" "}
                  {visibleEquipment.length - EQUIPMENT_BRAND_MOBILE_PREVIEW}건) →
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => handleSectionMore("equipment-brand")}
                className="hidden min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:inline-flex"
              >
                장비·브랜드 소식 더보기
              </button>
              <button
                type="button"
                onClick={openPromotion}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-pul-light text-sm font-bold text-pul-deep hover:bg-pul-light/80"
              >
                장비업체 홍보 문의
              </button>
            </div>
          </section>
        )}

        <div className="lg:hidden">
          <CollapsibleSection
            title="소식 제보·홍보 문의"
            summary="제보·홍보 문의 유형과 신청 방법을 확인하세요."
          >
            <p className="text-sm leading-relaxed text-pul-muted">
              파크골프 소식, 스크린 이벤트, 장비·브랜드 소식을 PUL에 알려주세요.
            </p>
            <p className="mt-2 text-xs text-pul-muted">{NEWS_PAGE_COPY.inquiryNote}</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {reportInquiryTypes.map((type) => (
                <div
                  key={type.id}
                  className="rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-3"
                >
                  <p className="text-sm font-bold text-foreground">{type.title}</p>
                  <p className="mt-1 text-xs text-pul-muted">{type.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={openReport}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
              >
                소식 제보하기
              </button>
              <button
                type="button"
                onClick={openPromotion}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-pul-light text-sm font-bold text-pul-deep"
              >
                홍보 문의하기
              </button>
            </div>
          </CollapsibleSection>
        </div>
        <div className="hidden lg:block">
          <Card title="소식 제보·홍보 문의" dense>
            <p className="text-xs leading-relaxed text-pul-muted lg:text-sm">
              파크골프 소식, 스크린 파크골프장 이벤트, 장비·브랜드 신제품, 대회·행사, 자격증 교육, 대학·학과 소식을
              PUL에 알려주세요. 운영자가 내용을 확인한 뒤 뉴스·정보 또는 관련 메뉴에 반영할 수 있습니다.
            </p>
            <p className="mt-2 text-[11px] text-pul-muted lg:text-xs">{NEWS_PAGE_COPY.inquiryNote}</p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
              {reportInquiryTypes.map((type) => (
                <div
                  key={type.id}
                  className="rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-3"
                >
                  <p className="text-sm font-bold text-foreground">{type.title}</p>
                  <p className="mt-1 text-xs text-pul-muted">{type.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row lg:gap-3">
              <button
                type="button"
                onClick={openReport}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep lg:min-h-12"
              >
                소식 제보하기
              </button>
              <button
                type="button"
                onClick={openPromotion}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-pul-light text-sm font-bold text-pul-deep hover:bg-pul-light/80 lg:min-h-12"
              >
                홍보 문의하기
              </button>
            </div>
          </Card>
        </div>

        <p className="whitespace-pre-line rounded-xl border border-pul-border bg-[#fafbfa] px-3 py-3 text-[11px] leading-relaxed text-pul-muted lg:px-4 lg:py-4 lg:text-xs">
          {NEWS_PAGE_COPY.disclaimer}
        </p>
      </div>

      {infoModal && (
        <InfoModal
          title={infoModal.title}
          message={infoModal.message}
          onClose={() => setInfoModal(null)}
        />
      )}
    </>
  );
}
