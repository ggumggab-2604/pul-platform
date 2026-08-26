"use client";

import { EventsPageHero } from "@/components/events/EventsPageHero";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { Card } from "@/components/ui/Card";
import { InfoModal } from "@/components/ui/InfoModal";
import { SoftBadge } from "@/components/ui/SoftBadge";
import { EVENTS_PAGE_COPY, eventCategoryTabs, type EventCategoryFilter } from "@/data/eventsData";
import {
  eventRegionOptions,
  eventScaleLabels,
  formatEventSchedule,
  matchTypeLabels,
  registrationStatusLabels,
  type EventFilters,
  type EventReview,
  type EventRegionSummary,
  type PublicEvent,
  type PublicEventPage,
  type RegistrationStatus,
} from "@/lib/events/eventDirectory";
import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type EventsPageContentProps = {
  page: PublicEventPage;
  filters: EventFilters;
  regionSummaries: EventRegionSummary[];
  screenEvents: PublicEvent[];
  eventReviews: EventReview[];
  error?: string;
  promotion: ActiveSlotPromotion | null;
};

const cardClass = "flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:p-4";
const linkClass = "inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-4 text-sm font-bold text-white hover:bg-pul-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pul-point focus-visible:ring-offset-2";

function statusTone(status: RegistrationStatus): "point" | "default" | "muted" | "warn" {
  if (status === "open") return "point";
  if (status === "scheduled" || status === "needCheck") return "warn";
  if (status === "closed") return "muted";
  return "muted";
}

function buildListHref(filters: EventFilters, pageNumber: number) {
  const params = new URLSearchParams();
  if (filters.matchType) params.set("type", filters.matchType);
  if (filters.region) params.set("region", filters.region);
  if (filters.registrationStatus) params.set("registration", filters.registrationStatus);
  if (pageNumber > 1) params.set("page", String(pageNumber));
  const query = params.toString();
  return query ? `/events?${query}` : "/events";
}

function EventCard({ event }: { event: PublicEvent }) {
  return (
    <article className={cardClass}>
      <div className="flex flex-wrap gap-1.5">
        <SoftBadge tone={event.matchType === "field" ? "point" : "default"}>{matchTypeLabels[event.matchType]}</SoftBadge>
        <SoftBadge tone="muted">{eventScaleLabels[event.eventScale]}</SoftBadge>
        <SoftBadge tone={statusTone(event.registrationStatus)}>{registrationStatusLabels[event.registrationStatus]}</SoftBadge>
        {event.isFeatured ? <SoftBadge tone="warn">추천</SoftBadge> : null}
      </div>
      <h3 className="mt-3 text-lg font-bold leading-snug text-foreground">{event.title}</h3>
      <dl className="mt-3 space-y-2 text-sm text-pul-muted">
        <div><dt className="font-bold text-pul-deep">일정</dt><dd>{formatEventSchedule(event)}</dd></div>
        <div><dt className="font-bold text-pul-deep">장소</dt><dd>{event.venueName} · {event.region}</dd></div>
        <div><dt className="font-bold text-pul-deep">주최·주관</dt><dd>{event.organizer}</dd></div>
        <div><dt className="font-bold text-pul-deep">참가 대상</dt><dd>{event.targetAudience.join(" · ")}</dd></div>
      </dl>
      {event.benefits.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="부대행사와 혜택">
          {event.benefits.slice(0, 4).map((benefit) => <span key={benefit} className="rounded-full bg-pul-page px-2.5 py-1 text-xs font-semibold text-pul-deep">{benefit}</span>)}
        </div>
      ) : null}
      <Link href={`/events/${event.eventKey}`} className={cn(linkClass, "mt-auto w-full [margin-top:1rem]")}>상세 정보 보기</Link>
    </article>
  );
}

function EventFiltersPanel({ filters, onChange }: { filters: EventFilters; onChange: (next: EventFilters) => void }) {
  const selectClass = "min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-sm font-semibold text-pul-deep";
  return (
    <section className="rounded-xl border border-pul-border bg-white p-3 shadow-sm lg:p-4" aria-labelledby="event-filter-title">
      <h2 id="event-filter-title" className="text-base font-bold text-foreground">빠른 필터</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label><span className="mb-1 block text-sm font-bold text-pul-muted">시합 유형</span>
          <select className={selectClass} value={filters.matchType ?? ""} onChange={(event) => onChange({ ...filters, matchType: (event.target.value || undefined) as EventFilters["matchType"] })}>
            <option value="">전체</option><option value="field">필드 시합</option><option value="screen">스크린 시합</option>
          </select>
        </label>
        <label><span className="mb-1 block text-sm font-bold text-pul-muted">지역</span>
          <select className={selectClass} value={filters.region ?? ""} onChange={(event) => onChange({ ...filters, region: (event.target.value || undefined) as EventFilters["region"] })}>
            <option value="">전체</option>{eventRegionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </label>
        <label><span className="mb-1 block text-sm font-bold text-pul-muted">접수 상태</span>
          <select className={selectClass} value={filters.registrationStatus ?? ""} onChange={(event) => onChange({ ...filters, registrationStatus: (event.target.value || undefined) as EventFilters["registrationStatus"] })}>
            <option value="">전체</option>{Object.entries(registrationStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}

function EventReviews({ reviews }: { reviews: EventReview[] }) {
  return (
    <section id="event-reviews" tabIndex={-1} aria-labelledby="event-review-title">
      <Card title="대회 후기" dense>
        <p id="event-review-title" className="text-sm text-pul-muted">커뮤니티에 공개된 실제 대회 후기만 보여드립니다.</p>
        {reviews.length > 0 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {reviews.map((review) => (
              <article key={review.id} className={cardClass}>
                <div className="flex items-center justify-between gap-2"><SoftBadge tone="point">대회 후기</SoftBadge><span className="text-sm font-bold text-amber-600" aria-label={`별점 ${review.rating}점`}>{"★".repeat(review.rating)}</span></div>
                <h3 className="mt-3 text-base font-bold text-foreground">{review.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-pul-muted">{review.summary}</p>
                <p className="mt-3 text-xs text-pul-muted">{review.authorDisplayName} · {review.createdAt}</p>
                <Link href={`/community/${review.id}`} className={cn(linkClass, "mt-4 w-full")}>커뮤니티 후기 보기</Link>
              </article>
            ))}
          </div>
        ) : <p className="mt-3 rounded-lg bg-pul-page p-4 text-sm text-pul-muted">현재 공개된 대회 후기가 없습니다.</p>}
        <Link href="/community" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light sm:w-auto">커뮤니티에서 후기 보기</Link>
      </Card>
    </section>
  );
}

export function EventsPageContent({ page, filters, regionSummaries, screenEvents, eventReviews, error, promotion }: EventsPageContentProps) {
  const router = useRouter();
  const [reviewMode, setReviewMode] = useState(false);
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const pageNumber = Math.floor(page.offset / page.limit) + 1;
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit));
  const activeCategory: EventCategoryFilter = reviewMode ? "eventReview" : filters.matchType === "field" ? "fieldMatch" : filters.matchType === "screen" ? "screenMatch" : "all";
  const dateChips = useMemo(() => [...new Set(page.items.map((event) => formatEventSchedule(event)))].slice(0, 6), [page.items]);

  useEffect(() => {
    if (reviewMode) document.getElementById("event-reviews")?.focus({ preventScroll: true });
  }, [reviewMode]);

  const navigate = (next: EventFilters, nextPage = 1) => {
    setReviewMode(false);
    router.push(buildListHref(next, nextPage));
  };

  const selectCategory = (category: EventCategoryFilter) => {
    if (category === "eventReview") {
      setReviewMode(true);
      return;
    }
    navigate({ ...filters, matchType: category === "fieldMatch" ? "field" : category === "screenMatch" ? "screen" : undefined });
  };

  return (
    <div className="space-y-3 lg:space-y-5">
      <EventsPageHero onRegisterInquiry={() => setModal({ title: "대회 등록 문의", message: "공식 대회 정보는 PUL 플랫폼 운영자가 확인한 뒤 등록합니다. 일반 회원은 커뮤니티에서 대회 소식을 공유할 수 있습니다." })} onParticipationGuide={() => setModal({ title: "참가 안내", message: "PUL은 참가 신청이나 결제를 직접 받지 않습니다. 일정·자격·접수 여부는 반드시 주최 측 공식 안내와 외부 접수 페이지에서 최종 확인해 주세요." })} />
      {promotion ? <PromotionBanner promotion={promotion} variant="horizontal" /> : null}

      <div className="scrollbar-none overflow-x-auto" role="tablist" aria-label="대회·이벤트 카테고리"><div className="flex min-w-max gap-2">{eventCategoryTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeCategory === tab.id} onClick={() => selectCategory(tab.id)} className={cn("min-h-11 rounded-full border px-4 text-sm font-bold", activeCategory === tab.id ? "border-pul-deep bg-pul-point text-white" : "border-pul-border bg-white text-pul-muted hover:text-pul-deep")}>{tab.label}</button>)}</div></div>

      {reviewMode ? <EventReviews reviews={eventReviews} /> : (
        <>
          <EventFiltersPanel filters={filters} onChange={(next) => navigate(next)} />
          {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</p> : null}

          <Card title="대회·이벤트 일정" dense>
            <p className="text-sm text-pul-muted">공개된 실제 대회 정보를 다가오는 일정부터 확인하세요.</p>
            {dateChips.length > 0 ? <div className="mt-3 flex flex-wrap gap-2" aria-label="현재 페이지 일정"><span className="text-sm font-bold text-pul-deep">일정</span>{dateChips.map((date) => <span key={date} className="rounded-full bg-pul-light px-3 py-1 text-xs font-semibold text-pul-deep">{date}</span>)}</div> : null}
            {page.items.length > 0 ? <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{page.items.map((event) => <EventCard key={event.eventKey} event={event} />)}</div> : <div className="mt-4 rounded-xl border border-dashed border-pul-border bg-pul-page p-6 text-center"><p className="text-base font-bold text-foreground">현재 등록된 대회·이벤트가 없습니다.</p><p className="mt-2 text-sm text-pul-muted">새 일정이 확인되면 업데이트됩니다.</p></div>}
            {page.total > 0 ? <nav className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label="대회 목록 페이지"><p className="text-sm text-pul-muted">{pageNumber} / {totalPages} 페이지 · 총 {page.total}건</p><div className="flex w-full gap-2 sm:w-auto">{pageNumber > 1 ? <Link href={buildListHref(filters, pageNumber - 1)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep sm:flex-none">이전</Link> : null}{page.hasMore ? <Link href={buildListHref(filters, pageNumber + 1)} className={cn(linkClass, "flex-1 sm:flex-none")}>다음</Link> : null}</div></nav> : null}
          </Card>

          {regionSummaries.length > 0 && filters.matchType !== "screen" ? <Card title="지역별 필드 대회" dense><p className="text-sm text-pul-muted">같은 공개 대회 데이터에서 지역별 현황을 집계했습니다.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{regionSummaries.map((region) => <article key={region.region} className={cardClass}><h3 className="text-lg font-bold text-foreground">{region.region}</h3><p className="mt-2 text-sm text-pul-muted">예정·진행 {region.upcomingCount}건 · 접수중 {region.openCount}건 · 확인 필요 {region.needCheckCount}건</p><p className="mt-2 line-clamp-2 text-sm font-semibold text-pul-deep">{region.representativeTitle}</p><button type="button" onClick={() => navigate({ ...filters, matchType: "field", region: region.region })} className={cn(linkClass, "mt-auto w-full [margin-top:1rem]")}>{region.region} 대회 보기</button></article>)}</div></Card> : null}

          {screenEvents.length > 0 && filters.matchType !== "field" ? <Card title="스크린 시합" dense><p className="text-sm text-pul-muted">공개된 대회 중 스크린 시합만 모았습니다.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{screenEvents.map((event) => <EventCard key={event.eventKey} event={event} />)}</div><button type="button" onClick={() => navigate({ ...filters, matchType: "screen" })} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light">스크린 시합 전체 보기</button></Card> : null}

          <aside className="rounded-xl border border-pul-border bg-white p-4"><h2 className="text-base font-bold text-foreground">동호회 행사와 심판·운영 모집</h2><p className="mt-2 text-sm leading-relaxed text-pul-muted">동호회 월례회와 친선전은 동호회 메뉴에서, 심판·운영요원 정보는 자격증·심판 메뉴에서 확인하세요.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Link href="/clubs" className={cn(linkClass, "flex-1")}>동호회 행사 보기</Link><Link href="/certification" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light">자격증·심판 보기</Link></div></aside>
          <EventReviews reviews={eventReviews} />
        </>
      )}

      <aside className="rounded-lg border border-pul-border bg-white p-4 text-sm leading-relaxed text-pul-muted"><p className="whitespace-pre-line">{EVENTS_PAGE_COPY.disclaimer}</p></aside>
      {modal ? <InfoModal title={modal.title} message={modal.message} onClose={() => setModal(null)} /> : null}
    </div>
  );
}
