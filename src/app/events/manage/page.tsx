import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/Container";
import {
  eventScaleLabels,
  formatEventSchedule,
  registrationStatusLabels,
  type EventPublicationStatus,
  type RegistrationStatus,
} from "@/lib/events/eventDirectory";
import {
  EventManagementError,
  formatEventManagementTimestamp,
  listEventsForManagement,
  type EventFreshnessStatus,
} from "@/lib/events/eventManagement";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "대회·이벤트 운영 관리",
  description: "대회·이벤트 등록·수정과 일정 최신성 확인",
};

type Search = {
  q?: string | string[];
  publication?: string | string[];
  registration?: string | string[];
  freshness?: string | string[];
  page?: string | string[];
};

const publicationLabels: Record<EventPublicationStatus, string> = { published: "공개", hidden: "숨김", removed: "제거" };
const freshnessLabels: Record<Exclude<EventFreshnessStatus, null>, string> = {
  "starting-soon": "7일 이내 시작",
  "status-mismatch": "날짜·접수 상태 확인",
};
const PAGE_SIZE = 30;

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function pageNumber(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function filterHref(values: { q: string; publication: string; registration: string; freshness: string }, page: number) {
  const params = new URLSearchParams();
  if (values.q) params.set("q", values.q);
  if (values.publication) params.set("publication", values.publication);
  if (values.registration) params.set("registration", values.registration);
  if (values.freshness) params.set("freshness", values.freshness);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/events/manage${query ? `?${query}` : ""}`;
}

export default async function EventManagementRoute({ searchParams }: { searchParams: Promise<Search> }) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/events/manage");
  const search = await searchParams;
  const keyword = one(search.q).trim();
  const publication = one(search.publication) as EventPublicationStatus;
  const registration = one(search.registration) as RegistrationStatus;
  const freshness = one(search.freshness) as Exclude<EventFreshnessStatus, null>;
  const currentPage = pageNumber(one(search.page));
  const filters = {
    q: keyword,
    publication: (["published", "hidden", "removed"] as const).includes(publication) ? publication : "",
    registration: (["open", "scheduled", "closed", "needCheck", "ended"] as const).includes(registration) ? registration : "",
    freshness: (["starting-soon", "status-mismatch"] as const).includes(freshness) ? freshness : "",
  };

  let page;
  try {
    page = await listEventsForManagement(context.supabase, {
      keyword: filters.q || undefined,
      publicationStatus: filters.publication as EventPublicationStatus || undefined,
      registrationStatus: filters.registration as RegistrationStatus || undefined,
      freshness: filters.freshness as Exclude<EventFreshnessStatus, null> || undefined,
      referenceAt: new Date().toISOString(),
    }, PAGE_SIZE, (currentPage - 1) * PAGE_SIZE);
  } catch (error) {
    return <ManagementAccessError loadFailed={!(error instanceof EventManagementError && error.code === "permission")} />;
  }

  const totalPages = Math.max(1, Math.ceil(page.total / PAGE_SIZE));
  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-6xl px-3 py-6 pb-20 sm:py-10">
        <header className="rounded-2xl border border-pul-border bg-white p-5 sm:p-7">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-2 text-sm text-pul-muted">
            <Link href="/manage" className="font-bold hover:text-pul-point">운영 관리</Link><span aria-hidden="true">›</span><span>대회·이벤트</span>
          </nav>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div><h1 className="text-2xl font-black text-foreground sm:text-3xl">대회·이벤트 운영 관리</h1><p className="mt-2 max-w-3xl text-base leading-7 text-pul-muted">공식 일정을 숨김 상태로 등록한 뒤 공개하고, 날짜와 접수 상태의 최신성 신호를 직접 확인합니다.</p></div>
            <Link href="/events/manage/new" className="inline-flex min-h-12 items-center rounded-xl bg-pul-deep px-4 font-black text-white">새 대회·이벤트 등록</Link>
          </div>
        </header>

        <form action="/events/manage" method="get" className="mt-5 grid gap-3 rounded-2xl border border-pul-border bg-white p-4 md:grid-cols-[minmax(0,1fr)_150px_150px_180px_auto] md:p-5">
          <label className="min-w-0 font-bold text-foreground">검색<span className="sr-only"> (제목, 지역, 장소, 주최)</span><input name="q" defaultValue={filters.q} maxLength={100} placeholder="제목·장소 검색" className="mt-2 min-h-12 w-full min-w-0 rounded-xl border border-pul-border px-3 text-base" /></label>
          <label className="font-bold text-foreground">공개 상태<select name="publication" defaultValue={filters.publication} className="mt-2 min-h-12 w-full rounded-xl border border-pul-border px-3 text-base"><option value="">전체</option>{Object.entries(publicationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="font-bold text-foreground">접수 상태<select name="registration" defaultValue={filters.registration} className="mt-2 min-h-12 w-full rounded-xl border border-pul-border px-3 text-base"><option value="">전체</option>{Object.entries(registrationStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="font-bold text-foreground">일정 확인<select name="freshness" defaultValue={filters.freshness} className="mt-2 min-h-12 w-full rounded-xl border border-pul-border px-3 text-base"><option value="">전체</option>{Object.entries(freshnessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button type="submit" className="min-h-12 self-end rounded-xl bg-pul-point px-5 font-black text-white">검색</button>
        </form>

        <section className="mt-5 rounded-2xl border border-pul-border bg-white p-4 sm:p-6" aria-labelledby="managed-event-list-title">
          <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 id="managed-event-list-title" className="text-xl font-black text-foreground">대회·이벤트 목록</h2><p className="text-sm text-pul-muted">전체 {page.total}건 · {currentPage}/{totalPages}페이지</p></div>
          {page.items.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-pul-border p-7 text-center text-pul-muted">조건에 맞는 대회·이벤트가 없습니다.</p> : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {page.items.map((event) => <li key={event.eventKey} className="min-w-0 rounded-xl border border-pul-border p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-lg font-black text-foreground">{event.title}</h3><p className="mt-1 text-sm text-pul-muted">{event.region} · {eventScaleLabels[event.eventScale]} · {formatEventSchedule(event)}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${event.publicationStatus === "published" ? "bg-emerald-100 text-emerald-800" : event.publicationStatus === "hidden" ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-800"}`}>{publicationLabels[event.publicationStatus]}</span></div>
                <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-pul-light px-3 py-1 text-xs font-bold text-pul-deep">{registrationStatusLabels[event.registrationStatus]}</span>{event.freshnessStatus ? <span className={`rounded-full px-3 py-1 text-xs font-black ${event.freshnessStatus === "status-mismatch" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900"}`}>{freshnessLabels[event.freshnessStatus]}</span> : null}</div>
                {event.freshnessStatus === "status-mismatch" ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-900">종료일이 지났지만 접수 상태가 아직 진행 중입니다. 실제 운영 상태를 확인해 주세요.</p> : null}
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-pul-muted">{event.summary}</p>
                <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-pul-muted">v{event.version} · {formatEventManagementTimestamp(event.updatedAt, false)} 수정</span><Link href={`/events/manage/${encodeURIComponent(event.eventKey)}`} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border px-4 font-bold text-pul-deep">수정</Link></div>
              </li>)}
            </ul>
          )}
          {totalPages > 1 ? <nav aria-label="대회·이벤트 목록 페이지" className="mt-6 flex items-center justify-center gap-3">{currentPage > 1 ? <Link href={filterHref(filters, currentPage - 1)} className="inline-flex min-h-11 items-center rounded-xl border border-pul-border px-4 font-bold text-pul-deep">이전</Link> : null}<span className="text-sm font-bold text-pul-muted">{currentPage} / {totalPages}</span>{page.hasMore ? <Link href={filterHref(filters, currentPage + 1)} className="inline-flex min-h-11 items-center rounded-xl border border-pul-border px-4 font-bold text-pul-deep">다음</Link> : null}</nav> : null}
        </section>
      </Container>
    </main>
  );
}

function ManagementAccessError({ loadFailed }: { loadFailed: boolean }) {
  return <main className="min-h-screen bg-pul-page"><Container className="max-w-3xl px-3 py-12"><div className="rounded-2xl border border-pul-border bg-white p-7 text-center"><h1 className="text-2xl font-black text-foreground">{loadFailed ? "대회·이벤트 운영 정보를 불러오지 못했습니다." : "대회·이벤트 운영 권한이 없습니다."}</h1><p className="mt-2 leading-7 text-pul-muted">{loadFailed ? "잠시 후 다시 시도해 주세요." : "이 화면은 active 플랫폼 운영자만 이용할 수 있습니다."}</p><Link href="/manage" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-pul-deep px-5 font-bold text-white">운영 관리로 돌아가기</Link></div></Container></main>;
}
