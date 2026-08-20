import {
  clubRegions,
  type PublicClubFilters,
  type PublicClubPage,
} from "@/lib/clubs/clubDirectory";
import { cn } from "@/lib/utils";
import { CalendarDays, MapPin, Search, Users } from "lucide-react";
import Link from "next/link";

const recruitmentLabels = {
  recruiting: "모집 중",
  waiting: "대기 접수",
  closed: "모집 마감",
} as const;

const recruitmentStyles = {
  recruiting: "bg-emerald-100 text-emerald-800",
  waiting: "bg-amber-100 text-amber-800",
  closed: "bg-gray-100 text-gray-700",
} as const;

const registeredDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

type ClubsPageContentProps = {
  page: PublicClubPage;
  filters: PublicClubFilters;
  pageNumber: number;
  error?: string;
};

function queryHref(filters: PublicClubFilters, pageNumber: number) {
  const params = new URLSearchParams();
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.region) params.set("region", filters.region);
  if (filters.district) params.set("district", filters.district);
  if (filters.recruitmentStatus) params.set("recruitment", filters.recruitmentStatus);
  if (pageNumber > 1) params.set("page", String(pageNumber));
  const query = params.toString();
  return query ? `/clubs?${query}` : "/clubs";
}

export function ClubsPageContent({ page, filters, pageNumber, error }: ClubsPageContentProps) {
  return (
    <div className="space-y-5 pb-8 lg:space-y-7">
      <section className="rounded-xl border border-pul-border bg-white p-4 shadow-sm sm:p-5">
        <form method="get" className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_minmax(130px,0.7fr)_minmax(170px,0.9fr)_minmax(140px,0.7fr)_auto]">
          <label className="min-w-0 text-sm font-bold text-pul-deep">
            검색
            <span className="relative mt-1.5 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pul-muted" aria-hidden="true" />
              <input type="search" name="keyword" defaultValue={filters.keyword ?? ""} maxLength={100} placeholder="동호회명·지역·소개" className="min-h-11 w-full rounded-lg border border-pul-border bg-white pl-9 pr-3 font-normal outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20" />
            </span>
          </label>
          <label className="text-sm font-bold text-pul-deep">
            시·도
            <select name="region" defaultValue={filters.region ?? ""} className="mt-1.5 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 font-normal outline-none focus:border-pul-point">
              <option value="">전체</option>
              {clubRegions.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-pul-deep">
            시·군·구·활동 지역
            <input name="district" defaultValue={filters.district ?? ""} maxLength={80} className="mt-1.5 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 font-normal outline-none focus:border-pul-point" />
          </label>
          <label className="text-sm font-bold text-pul-deep">
            모집 상태
            <select name="recruitment" defaultValue={filters.recruitmentStatus ?? ""} className="mt-1.5 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 font-normal outline-none focus:border-pul-point">
              <option value="">전체</option>
              <option value="recruiting">모집 중</option>
              <option value="waiting">대기 접수</option>
              <option value="closed">모집 마감</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="min-h-11 flex-1 rounded-lg bg-pul-point px-5 text-sm font-bold text-white hover:bg-pul-deep lg:flex-none">찾아보기</button>
            <Link href="/clubs" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep hover:bg-pul-light">초기화</Link>
          </div>
        </form>
      </section>

      <section aria-labelledby="club-directory-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-pul-point">최근 등록순</p>
            <h2 id="club-directory-title" className="mt-0.5 text-xl font-bold text-foreground sm:text-2xl">동호회 목록</h2>
            <p className="mt-1 text-sm text-pul-muted">실제 공개 동호회 {page.total}곳</p>
          </div>
          <Link href="/clubs/register" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-4 text-sm font-bold text-white hover:bg-pul-deep">+ 동호회 등록하기</Link>
        </div>

        {error ? (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-8 text-center text-sm font-semibold text-amber-900">{error}</div>
        ) : page.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-pul-border bg-white px-6 py-14 text-center">
            <p className="font-bold text-foreground">조건에 맞는 동호회가 없습니다.</p>
            <p className="mt-1 text-sm text-pul-muted">검색 조건을 바꾸거나 새 동호회를 등록해 보세요.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {page.items.map((club) => (
              <article key={club.publicKey} className="flex min-w-0 flex-col rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)]">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 break-words text-lg font-bold text-pul-deep">{club.name}</h3>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", recruitmentStyles[club.recruitmentStatus])}>{recruitmentLabels[club.recruitmentStatus]}</span>
                </div>
                <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-pul-muted"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pul-point" aria-hidden="true" />{club.regionLabel}</p>
                <p className="mt-3 line-clamp-3 min-h-[3.75rem] text-sm leading-relaxed text-pul-muted">{club.summary ?? "동호회 소개가 아직 등록되지 않았습니다."}</p>
                <p className="mt-3 flex items-center gap-2 text-xs text-pul-muted"><CalendarDays className="h-4 w-4" aria-hidden="true" />등록 {registeredDateFormatter.format(new Date(club.createdAt))}</p>
                <Link href={`/clubs/${encodeURIComponent(club.publicKey)}`} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-point px-4 text-sm font-bold text-pul-point hover:bg-pul-light"><Users className="h-4 w-4" aria-hidden="true" />상세·가입 안내</Link>
              </article>
            ))}
          </div>
        )}

        {!error && page.total > page.limit ? (
          <nav aria-label="동호회 목록 페이지" className="mt-5 flex items-center justify-center gap-3">
            {pageNumber > 1 ? <Link href={queryHref(filters, pageNumber - 1)} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light">이전</Link> : null}
            <span className="text-sm font-semibold text-pul-muted">{pageNumber}페이지</span>
            {page.hasMore ? <Link href={queryHref(filters, pageNumber + 1)} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light">다음</Link> : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
