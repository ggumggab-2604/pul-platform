import { SoftBadge } from "@/components/ui/SoftBadge";
import {
  eventScaleLabels,
  formatEventSchedule,
  matchTypeLabels,
  recruitmentStatusLabels,
  registrationStatusLabels,
  venueTypeLabels,
  type PublicEvent,
} from "@/lib/events/eventDirectory";
import Link from "next/link";

export function EventDetailContent({ event }: { event: PublicEvent }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-pul-border bg-white shadow-[0_6px_24px_rgba(6,78,59,0.08)]">
      <header className="bg-gradient-to-br from-pul-deep via-pul-point to-emerald-700 px-4 py-6 text-white sm:px-7 sm:py-8">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">{matchTypeLabels[event.matchType]}</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">{eventScaleLabels[event.eventScale]}</span>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-pul-deep">{registrationStatusLabels[event.registrationStatus]}</span>
        </div>
        <h1 className="mt-4 text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">{event.title}</h1>
        <p className="mt-3 text-base text-white/90 sm:text-lg">{formatEventSchedule(event)} · {event.region}</p>
      </header>

      <div className="grid gap-5 p-4 sm:p-7 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <section aria-labelledby="event-summary-title">
            <h2 id="event-summary-title" className="text-xl font-bold text-foreground">대회 안내</h2>
            <p className="mt-3 whitespace-pre-line text-base leading-8 text-pul-muted">{event.summary}</p>
          </section>

          <section aria-labelledby="event-information-title">
            <h2 id="event-information-title" className="text-xl font-bold text-foreground">기본 정보</h2>
            <dl className="mt-3 grid gap-3 rounded-xl bg-pul-page p-4 sm:grid-cols-2">
              <div><dt className="text-sm font-bold text-pul-deep">일정</dt><dd className="mt-1 text-base text-foreground">{formatEventSchedule(event)}</dd></div>
              <div><dt className="text-sm font-bold text-pul-deep">개최 장소</dt><dd className="mt-1 text-base text-foreground">{event.venueName}</dd></div>
              <div><dt className="text-sm font-bold text-pul-deep">장소 유형</dt><dd className="mt-1 text-base text-foreground">{venueTypeLabels[event.venueType]}</dd></div>
              <div><dt className="text-sm font-bold text-pul-deep">주최·주관</dt><dd className="mt-1 text-base text-foreground">{event.organizer}</dd></div>
              <div className="sm:col-span-2"><dt className="text-sm font-bold text-pul-deep">참가 대상</dt><dd className="mt-1 flex flex-wrap gap-2">{event.targetAudience.map((target) => <SoftBadge key={target} tone="point">{target}</SoftBadge>)}</dd></div>
              <div className="sm:col-span-2"><dt className="text-sm font-bold text-pul-deep">심판·운영 모집</dt><dd className="mt-1 text-base text-foreground">{recruitmentStatusLabels[event.recruitmentStatus]}</dd></div>
            </dl>
          </section>

          {event.benefits.length > 0 ? <section aria-labelledby="event-benefits-title"><h2 id="event-benefits-title" className="text-xl font-bold text-foreground">부대행사·혜택</h2><ul className="mt-3 grid gap-2 sm:grid-cols-2">{event.benefits.map((benefit) => <li key={benefit} className="rounded-lg border border-pul-border bg-white px-4 py-3 text-base font-semibold text-pul-deep">{benefit}</li>)}</ul></section> : null}

          {event.relatedCourse ? <section aria-labelledby="event-course-title"><h2 id="event-course-title" className="text-xl font-bold text-foreground">관련 골프장</h2><div className="mt-3 rounded-xl border border-pul-border bg-pul-page p-4"><p className="text-base font-bold text-foreground">{event.relatedCourse.name}</p><Link href={`/courses/${event.relatedCourse.courseKey}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light sm:w-auto">골프장 상세 보기</Link></div></section> : null}
        </div>

        <aside className="h-fit space-y-3 rounded-xl border border-pul-border bg-pul-page p-4 lg:sticky lg:top-24" aria-label="공식 안내와 접수">
          <h2 className="text-lg font-bold text-foreground">공식 안내 확인</h2>
          <p className="text-sm leading-relaxed text-pul-muted">PUL은 참가 신청이나 결제를 직접 받지 않습니다. 접수 전 주최 측의 최신 공지를 확인하세요.</p>
          {event.registrationNote ? <p className="rounded-lg bg-white p-3 text-sm leading-relaxed text-pul-deep">{event.registrationNote}</p> : null}
          {event.registrationUrl ? <a href={event.registrationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-pul-point px-4 text-base font-bold text-white hover:bg-pul-deep" aria-label={`${event.title} 외부 공식 접수 페이지 열기`}>공식 접수 페이지 열기 ↗</a> : null}
          {event.officialUrl ? <a href={event.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light" aria-label={`${event.title} 외부 공식 안내 페이지 열기`}>공식 안내 페이지 열기 ↗</a> : null}
          {!event.registrationUrl && !event.officialUrl ? <p className="rounded-lg border border-dashed border-pul-border bg-white p-3 text-sm text-pul-muted">등록된 공식 외부 링크가 없습니다. 주최 측 안내를 직접 확인해 주세요.</p> : null}
          {event.recruitmentStatus !== "none" ? <Link href="/certification" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light">자격증·심판 메뉴 보기</Link> : null}
        </aside>
      </div>
    </article>
  );
}
