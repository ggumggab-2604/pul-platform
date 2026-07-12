"use client";

import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { EventsPageHero } from "@/components/events/EventsPageHero";
import { Card } from "@/components/ui/Card";
import { InfoModal } from "@/components/ui/InfoModal";
import { SoftBadge } from "@/components/ui/SoftBadge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EVENTS_PAGE_COPY,
  REGION_MOBILE_PREVIEW,
  REGION_PC_PREVIEW,
  REVIEW_MOBILE_PREVIEW,
  REVIEW_PC_PREVIEW,
  SCHEDULE_MOBILE_PREVIEW,
  SCHEDULE_PC_PREVIEW,
  SCREEN_MOBILE_PREVIEW,
  SCREEN_PC_PREVIEW,
  matchTypeFilterOptions,
  eventCategoryTabs,
  eventInquiryTypes,
  eventItems,
  eventReviewCards,
  filterEventItems,
  formatBenefitsSummary,
  getScheduleItems,
  hasRecruitment,
  matchTypeLabels,
  recruitmentStatusLabels,
  regionEventSummaries,
  regionFilterOptions,
  registrationFilterOptions,
  registrationStatusLabels,
  registrationStatusTone,
  screenTournamentCards,
  type EventCategoryFilter,
  type EventItem,
  type QuickFilterState,
  type ScreenTournamentCard,
} from "@/data/eventsData";

const CARD_BASE =
  "flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:p-4";
const REGION_CARD_BASE =
  "flex flex-col rounded-lg border border-pul-border bg-white p-2.5 shadow-[0_2px_8px_rgba(6,78,59,0.04)] lg:p-3";
const SECTION_GAP = "space-y-2 lg:space-y-5";
const SECTION_DESC = "mt-1 text-xs text-pul-muted lg:mt-2 lg:text-sm";
const MORE_BUTTON_CLASS =
  "mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:mt-4";
const DETAIL_BUTTON_CLASS =
  "inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-pul-point text-[11px] font-bold text-white hover:bg-pul-deep lg:min-h-10 lg:text-xs";

const defaultFilters: QuickFilterState = {
  matchType: "전체",
  region: "전체",
  registrationStatus: "전체",
};

function handleDetail(section: string, id: string, title: string) {
  console.log(`[events] ${section} 자세히 보기:`, id, title);
}

function handleRecruitmentView(id: string, title: string) {
  console.log("[events] 심판 모집 보기:", id, title);
  alert(
    `「${title}」 심판·운영 모집 정보는 자격증·심판 메뉴의 구인구직에서 확인할 예정입니다.`,
  );
}

function handleSectionMore(section: string) {
  console.log("[events] 더보기:", section);
}

function SectionMoreButton({ label, section }: { label: string; section: string }) {
  return (
    <button type="button" onClick={() => handleSectionMore(section)} className={MORE_BUTTON_CLASS}>
      {label}
    </button>
  );
}

function DetailButton({
  id,
  title,
  section,
  label = "자세히 보기",
}: {
  id: string;
  title: string;
  section: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => handleDetail(section, id, title)}
      className={DETAIL_BUTTON_CLASS}
    >
      {label}
    </button>
  );
}

function RecruitmentAuxLink({ id, title }: { id: string; title: string }) {
  return (
    <button
      type="button"
      onClick={() => handleRecruitmentView(id, title)}
      className="inline-flex w-auto text-[10px] font-semibold text-pul-point underline-offset-2 hover:underline lg:text-[11px]"
    >
      자격증·심판 구인구직에서 보기
    </button>
  );
}

function EventsCategoryTabs({
  active,
  onChange,
  onSelectAll,
}: {
  active: EventCategoryFilter;
  onChange: (category: EventCategoryFilter) => void;
  onSelectAll: () => void;
}) {
  return (
    <div className="scrollbar-none -mx-1 overflow-x-auto px-1 lg:mx-0 lg:overflow-visible">
      <div className="flex min-w-max gap-1.5 lg:flex-wrap lg:gap-2" role="tablist" aria-label="대회·이벤트 카테고리">
        {eventCategoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => {
              if (tab.id === "all") {
                onSelectAll();
              } else {
                onChange(tab.id);
              }
            }}
            className={cn(
              "shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition-colors lg:px-4 lg:py-2.5 lg:text-sm",
              active === tab.id
                ? "border-pul-deep bg-pul-point text-white shadow-sm"
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

function QuickFilters({
  filters,
  onChange,
}: {
  filters: QuickFilterState;
  onChange: (next: QuickFilterState) => void;
}) {
  const selectClass =
    "min-h-10 w-full rounded-lg border border-pul-border bg-white px-2 text-xs font-semibold text-pul-deep lg:min-h-11 lg:px-3 lg:text-sm";

  return (
    <section className="rounded-lg border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.04)] lg:p-4">
      <p className="text-sm font-bold text-foreground">빠른 필터</p>
      <div className="mt-2 grid grid-cols-1 gap-2 lg:mt-3 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-pul-muted lg:text-xs">시합 유형</span>
          <select
            value={filters.matchType}
            onChange={(e) => onChange({ ...filters, matchType: e.target.value })}
            className={selectClass}
          >
            {matchTypeFilterOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-pul-muted lg:text-xs">지역</span>
          <select
            value={filters.region}
            onChange={(e) => onChange({ ...filters, region: e.target.value })}
            className={selectClass}
          >
            {regionFilterOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-pul-muted lg:text-xs">접수 상태</span>
          <select
            value={filters.registrationStatus}
            onChange={(e) => onChange({ ...filters, registrationStatus: e.target.value })}
            className={selectClass}
          >
            {registrationFilterOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function HorizontalRecommendBanner({
  title,
  description,
  tags,
  onInquiry,
  compact = false,
}: {
  title: string;
  description: string;
  tags?: string[];
  onInquiry: () => void;
  compact?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-dashed border-pul-border/80 bg-pul-page/50",
        compact ? "px-3 py-2" : "px-3 py-2.5 lg:px-4 lg:py-3",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-bold text-pul-deep lg:text-sm">{title}</h3>
          <p
            className={cn(
              "mt-1 text-[11px] leading-relaxed text-pul-muted lg:text-xs",
              compact && "line-clamp-2",
            )}
          >
            {description}
          </p>
          {tags && tags.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-pul-border bg-white px-2 py-0.5 text-[10px] font-semibold text-pul-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onInquiry}
          className="inline-flex min-h-10 w-full shrink-0 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-xs font-bold text-pul-deep hover:bg-pul-light sm:min-h-9 sm:w-auto"
        >
          광고 문의
        </button>
      </div>
    </section>
  );
}

function ScheduleCalendarStrip({ items }: { items: EventItem[] }) {
  const dateChips = [...new Set(items.map((item) => item.startDate))].slice(0, 6);
  if (dateChips.length === 0) return null;

  return (
    <div className="rounded-lg border border-pul-border/70 bg-pul-page/40 p-2.5 lg:p-3">
      <p className="text-xs font-bold text-pul-deep lg:text-sm">이번 달 대회 일정</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {dateChips.map((date) => {
          const dayItems = items.filter((item) => item.startDate === date);
          return (
            <div
              key={date}
              className="rounded-lg border border-pul-border bg-white px-2.5 py-1.5"
            >
              <p className="text-[10px] font-bold text-pul-deep lg:text-[11px]">{date}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {dayItems.slice(0, 2).map((item) => (
                  <span
                    key={item.id}
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold lg:text-[10px]",
                      item.matchType === "field"
                        ? "bg-pul-light text-pul-deep"
                        : "bg-sky-50 text-sky-800",
                    )}
                  >
                    {item.matchType === "field" ? "필드" : "스크린"}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleCard({ item }: { item: EventItem }) {
  const recruitmentVisible = hasRecruitment(item.recruitmentStatus);
  const benefitTags = item.benefits.filter((benefit) => benefit !== "없음").slice(0, 4);

  return (
    <article className={cn(CARD_BASE, "p-2.5 lg:p-3")}>
      <div className="flex flex-wrap items-center gap-1">
        <SoftBadge tone="muted">{item.startDate}</SoftBadge>
        <SoftBadge tone={item.matchType === "field" ? "point" : "default"}>
          {matchTypeLabels[item.matchType]}
        </SoftBadge>
        <SoftBadge tone="default">{item.eventScaleLabel}</SoftBadge>
        <SoftBadge tone={registrationStatusTone(item.registrationStatus)}>
          {registrationStatusLabels[item.registrationStatus]}
        </SoftBadge>
      </div>

      <h4 className="mt-2 line-clamp-2 min-h-[2.6rem] text-sm font-bold text-foreground lg:min-h-[3rem] lg:text-base">
        {item.title}
      </h4>

      <dl className="mt-2 space-y-1 text-[11px] text-pul-muted lg:text-xs">
        <div className="flex gap-1">
          <dt className="shrink-0 font-semibold text-pul-deep">개최 장소</dt>
          <dd className="line-clamp-1">{item.venueName}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="shrink-0 font-semibold text-pul-deep">주최</dt>
          <dd className="line-clamp-1">{item.organizer}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="shrink-0 font-semibold text-pul-deep">부대행사·혜택</dt>
          <dd className="line-clamp-1 lg:line-clamp-2">{formatBenefitsSummary(item.benefits)}</dd>
        </div>
      </dl>
      {benefitTags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {benefitTags.map((tag) => (
            <span
              key={`${item.id}-${tag}`}
              className="rounded-full border border-pul-border bg-pul-page px-2 py-0.5 text-[10px] font-semibold text-pul-deep"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto space-y-2 pt-3">
        {recruitmentVisible ? (
          <div className="space-y-0.5 text-[10px] text-pul-muted lg:text-[11px]">
            <p>{recruitmentStatusLabels[item.recruitmentStatus]}</p>
            <RecruitmentAuxLink id={item.id} title={item.title} />
          </div>
        ) : null}
        <DetailButton id={item.id} title={item.title} section="schedule" />
      </div>
    </article>
  );
}

function ScreenTournamentCardView({ item }: { item: ScreenTournamentCard }) {
  return (
    <article className={CARD_BASE}>
      <div className="flex flex-wrap gap-1.5">
        <SoftBadge tone="point">{item.screenEventType}</SoftBadge>
        <SoftBadge tone="muted">{item.promoBadge}</SoftBadge>
        <SoftBadge tone={registrationStatusTone(item.registrationStatus)}>
          {registrationStatusLabels[item.registrationStatus]}
        </SoftBadge>
      </div>
      <h4 className="mt-2 text-sm font-bold text-foreground lg:text-base">{item.tournamentName}</h4>
      <p className="mt-1 text-xs font-semibold text-pul-deep">{item.storeName}</p>
      <p className="mt-1 text-xs text-pul-muted">
        {item.region} · {item.schedule} · {item.targetAudience}
      </p>
      <p className="mt-1 text-xs text-pul-muted">
        부대행사·혜택 {formatBenefitsSummary(item.benefits)}
      </p>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted">{item.summary}</p>
      <div className="mt-auto pt-3">
        <DetailButton id={item.id} title={item.tournamentName} section="screen" />
      </div>
    </article>
  );
}

function ClubEventsLinkBox() {
  return (
    <aside className="rounded-lg border border-pul-border bg-pul-page/50 px-3 py-3 lg:px-4 lg:py-3.5">
      <h3 className="text-sm font-bold text-foreground">동호회 행사는 동호회 메뉴에서 확인하세요</h3>
      <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
        동호회 월례회, 친선전, 정기 라운드, 회원 전용 행사는 각 동호회 게시판과 동호회 메뉴에서 확인할 수
        있습니다.
      </p>
      <Link
        href="/clubs"
        className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-xs font-bold text-pul-deep hover:bg-pul-light sm:w-auto lg:text-sm"
      >
        동호회 행사 보기
      </Link>
    </aside>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <p className="mt-1 text-xs font-semibold text-amber-600" aria-label={`별점 ${rating}점`}>
      {"★".repeat(rating)}
      {"☆".repeat(Math.max(0, 5 - rating))}
    </p>
  );
}

function EventReviewsSection({ reviewLimit }: { reviewLimit: number }) {
  return (
    <div id="event-reviews">
      <Card title="대회 후기" dense>
        <p className={SECTION_DESC}>
          참가자들이 남긴 대회 후기와 현장 분위기를 커뮤니티에서 확인하세요.
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:mt-4 lg:gap-4">
          {eventReviewCards.slice(0, reviewLimit).map((item) => (
            <article key={item.id} className={CARD_BASE}>
              <SoftBadge tone="point">{item.reviewType}</SoftBadge>
              <h4 className="mt-2 text-sm font-bold text-foreground">{item.title}</h4>
              <StarRating rating={item.rating} />
              <p className="mt-1 text-xs text-pul-muted">
                {item.tournamentName} · {item.region}
              </p>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted">{item.summary}</p>
              <p className="mt-1 text-[11px] text-pul-muted">
                {item.authorNickname} · {item.createdAt}
              </p>
              <div className="mt-auto pt-3">
                <Link href="/community" className={cn(DETAIL_BUTTON_CLASS, "hover:bg-pul-deep")}>
                  커뮤니티 후기 보기
                </Link>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/community"
            className={cn(MORE_BUTTON_CLASS, "mt-0 text-center hover:bg-pul-light sm:flex-1")}
          >
            커뮤니티 후기 보기
          </Link>
          <button
            type="button"
            onClick={() => handleSectionMore("review")}
            className={cn(MORE_BUTTON_CLASS, "mt-0 sm:flex-1")}
          >
            대회 후기 더보기
          </button>
        </div>
      </Card>
    </div>
  );
}

export function EventsPageContent() {
  const [category, setCategory] = useState<EventCategoryFilter>("all");
  const [filters, setFilters] = useState<QuickFilterState>(defaultFilters);
  const [regionExpanded, setRegionExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const filteredItems = useMemo(
    () => filterEventItems(eventItems, category, filters),
    [category, filters],
  );

  const scheduleLimit = isMobile ? SCHEDULE_MOBILE_PREVIEW : SCHEDULE_PC_PREVIEW;
  const scheduleItems = useMemo(
    () => getScheduleItems(filteredItems).slice(0, scheduleLimit),
    [filteredItems, scheduleLimit],
  );

  const screenLimit = isMobile ? SCREEN_MOBILE_PREVIEW : SCREEN_PC_PREVIEW;
  const reviewLimit = isMobile ? REVIEW_MOBILE_PREVIEW : REVIEW_PC_PREVIEW;

  const regionLimit =
    isMobile && !regionExpanded ? REGION_MOBILE_PREVIEW : REGION_PC_PREVIEW;
  const visibleRegions = regionEventSummaries.slice(0, regionLimit);

  const openModal = (title: string, message: string, log?: string) => {
    if (log) console.log(log);
    setModal({ title, message });
  };

  const handleSelectAll = () => {
    setCategory("all");
    setFilters(defaultFilters);
  };

  const handleCategoryChange = (next: EventCategoryFilter) => {
    setCategory(next);
    if (next === "fieldMatch") {
      setFilters((prev) => ({ ...prev, matchType: "필드 시합" }));
    } else if (next === "screenMatch") {
      setFilters((prev) => ({ ...prev, matchType: "스크린 시합" }));
    } else if (next === "eventReview") {
      window.setTimeout(() => {
        document.getElementById("event-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  };

  const handleFilterChange = (next: QuickFilterState) => {
    setFilters(next);
    if (category === "eventReview") return;
    if (next.matchType === "필드 시합") {
      setCategory("fieldMatch");
    } else if (next.matchType === "스크린 시합") {
      setCategory("screenMatch");
    } else if (next.matchType === "전체" && (category === "fieldMatch" || category === "screenMatch")) {
      setCategory("all");
    }
  };

  const isReviewMode = category === "eventReview";
  const showSchedule = !isReviewMode;
  const showFieldRegions = category === "all" || category === "fieldMatch";
  const showScreenSection = category === "all" || category === "screenMatch";

  const hasActiveFilter =
    category !== "all" ||
    filters.matchType !== "전체" ||
    filters.region !== "전체" ||
    filters.registrationStatus !== "전체";

  return (
    <div className={SECTION_GAP}>
      <EventsPageHero
        onRegisterInquiry={() =>
          openModal(
            "대회 등록 문의",
            `대회 등록 문의 기능은 추후 제공될 예정입니다.\n\n${EVENTS_PAGE_COPY.inquiryNote}`,
            "[events] register inquiry",
          )
        }
        onParticipationGuide={() =>
          openModal(
            "참가 안내",
            "접수 상태, 참가 자격, 개최 장소, 부대행사·혜택 정보는 주최 측 공식 안내를 반드시 함께 확인해주세요.\n\nMVP 단계에서는 안내 UI만 제공합니다.",
            "[events] participation guide",
          )
        }
      />

      <EventsCategoryTabs
        active={category}
        onChange={handleCategoryChange}
        onSelectAll={handleSelectAll}
      />

      {!isReviewMode ? <QuickFilters filters={filters} onChange={handleFilterChange} /> : null}

      {isReviewMode ? <EventReviewsSection reviewLimit={reviewLimit} /> : null}

      {showSchedule ? (
        <Card title="이번 달 주요 대회 일정" dense>
          <p className={SECTION_DESC}>날짜별 필드 시합과 스크린 시합을 한눈에 확인하세요.</p>
          {hasActiveFilter ? (
            <p className="mt-1 text-xs font-semibold text-pul-point">선택한 카테고리·필터 기준으로 표시 중</p>
          ) : null}
          <div className="mt-2 space-y-2 lg:mt-3">
            <ScheduleCalendarStrip items={scheduleItems} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
              {scheduleItems.map((item) => (
                <ScheduleCard key={item.id} item={item} />
              ))}
            </div>
          </div>
          {scheduleItems.length === 0 ? (
            <p className="mt-2 text-sm text-pul-muted">해당 조건의 일정이 없습니다.</p>
          ) : null}
          <SectionMoreButton label="대회 일정 더보기" section="schedule" />
        </Card>
      ) : null}

      {!isReviewMode ? (
        <HorizontalRecommendBanner
          title="대회 용품·단체복 추천 영역"
          description="대회 참가 용품, 단체복, 모자·조끼 제작, 기념품, 버스 대절 정보를 소개할 수 있는 공간입니다."
          tags={["단체복", "모자·조끼 제작", "대회 기념품", "버스 대절", "단체 식당"]}
          onInquiry={() =>
            openModal("광고 문의", EVENTS_PAGE_COPY.inquiryNote, "[events] equipment banner inquiry")
          }
          compact={isMobile}
        />
      ) : null}

      {showFieldRegions ? (
        <Card title="지역별 필드 대회 바로가기" dense>
          <p className={SECTION_DESC}>지역별로 진행되는 필드 시합을 확인하세요.</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:gap-3">
            {visibleRegions.map((region) => (
              <article key={region.id} className={REGION_CARD_BASE}>
                <h4 className="text-sm font-bold text-foreground">{region.regionLabel}</h4>
                <p className="mt-1.5 text-[11px] text-pul-muted lg:text-xs">
                  진행 예정 {region.upcomingCount}건 · 접수중 {region.openCount}건 · 확인 필요{" "}
                  {region.needCheckCount}건
                </p>
                <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-foreground lg:text-xs">
                  {region.representativeTitle}
                </p>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => console.log("[events] 지역 시합 보기:", region.regionLabel)}
                    className="inline-flex min-h-8 w-full items-center justify-center rounded-lg bg-pul-point text-[11px] font-bold text-white hover:bg-pul-deep"
                  >
                    지역 시합 보기
                  </button>
                </div>
              </article>
            ))}
          </div>
          {isMobile && !regionExpanded && regionEventSummaries.length > REGION_MOBILE_PREVIEW ? (
            <button
              type="button"
              onClick={() => setRegionExpanded(true)}
              className={MORE_BUTTON_CLASS}
            >
              지역별 시합 더보기
            </button>
          ) : (
            <SectionMoreButton label="지역별 시합 더보기" section="region" />
          )}
        </Card>
      ) : null}

      {showScreenSection ? (
        <Card title="스크린 시합" dense>
          <p className={SECTION_DESC}>
            스크린 파크골프 매장이나 실내 시설에서 진행되는 시합을 확인하세요.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:mt-4 lg:gap-4">
            {screenTournamentCards.slice(0, screenLimit).map((item) => (
              <ScreenTournamentCardView key={item.id} item={item} />
            ))}
          </div>
          <SectionMoreButton label="스크린 시합 더보기" section="screen" />
        </Card>
      ) : null}

      <ClubEventsLinkBox />

      {!isReviewMode ? <EventReviewsSection reviewLimit={reviewLimit} /> : null}

      <HorizontalRecommendBanner
        title="행사 주변 추천 영역"
        description="대회장 주변 맛집, 숙박, 카페, 지역 관광, 지역 상권 정보를 소개할 수 있는 공간입니다."
        tags={["주변 맛집", "숙박", "카페", "지역 관광", "지역 상권"]}
        onInquiry={() =>
          openModal("광고 문의", EVENTS_PAGE_COPY.inquiryNote, "[events] venue banner inquiry")
        }
        compact={isMobile}
      />

      <div className="lg:hidden">
        <CollapsibleSection
          title="대회·행사 등록/홍보 문의"
          summary="대회 등록·홍보 문의 유형과 신청 방법을 확인하세요."
        >
          <p className={SECTION_DESC}>{EVENTS_PAGE_COPY.inquiryDescription}</p>
          <p className="mt-1 text-[11px] text-pul-muted lg:text-xs">{EVENTS_PAGE_COPY.inquiryNote}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {eventInquiryTypes.map((item) => (
              <article key={item.id} className={CARD_BASE}>
                <h4 className="text-sm font-bold text-foreground">{item.title}</h4>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted">{item.description}</p>
              </article>
            ))}
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() =>
                openModal("대회 등록 문의", EVENTS_PAGE_COPY.inquiryNote, "[events] register")
              }
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
            >
              대회 등록 문의
            </button>
            <button
              type="button"
              onClick={() =>
                openModal("홍보 문의하기", EVENTS_PAGE_COPY.inquiryNote, "[events] promo")
              }
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
            >
              홍보 문의하기
            </button>
          </div>
        </CollapsibleSection>
      </div>
      <div className="hidden lg:block">
        <Card title="대회·행사 등록/홍보 문의" dense>
          <p className={SECTION_DESC}>{EVENTS_PAGE_COPY.inquiryDescription}</p>
          <p className="mt-1 text-[11px] text-pul-muted lg:text-xs">{EVENTS_PAGE_COPY.inquiryNote}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:mt-4 lg:grid-cols-3 lg:gap-4">
            {eventInquiryTypes.map((item) => (
              <article key={item.id} className={CARD_BASE}>
                <h4 className="text-sm font-bold text-foreground">{item.title}</h4>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted">{item.description}</p>
              </article>
            ))}
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row lg:mt-4">
            <button
              type="button"
              onClick={() =>
                openModal("대회 등록 문의", EVENTS_PAGE_COPY.inquiryNote, "[events] register")
              }
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
            >
              대회 등록 문의
            </button>
            <button
              type="button"
              onClick={() =>
                openModal("홍보 문의하기", EVENTS_PAGE_COPY.inquiryNote, "[events] promo")
              }
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
            >
              홍보 문의하기
            </button>
          </div>
        </Card>
      </div>

      <aside className="rounded-lg border border-pul-border/80 bg-white px-3 py-3 text-xs leading-relaxed text-pul-muted lg:px-4 lg:py-3.5 lg:text-sm">
        <p className="whitespace-pre-line">{EVENTS_PAGE_COPY.disclaimer}</p>
      </aside>

      {modal ? (
        <InfoModal title={modal.title} message={modal.message} onClose={() => setModal(null)} />
      ) : null}
    </div>
  );
}
