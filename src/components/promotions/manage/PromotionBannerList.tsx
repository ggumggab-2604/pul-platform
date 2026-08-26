import Link from "next/link";

import type {
  PromotionManagementOverviewPage,
  PromotionOverviewDisplayStatus,
  PromotionSlotDefinition,
} from "@/lib/promotions/promotionManagement";
import type { PromotionContentKind } from "@/lib/promotions/promotionDirectory";
import {
  formatKstDateTime,
  friendlySlotName,
  promotionAreaLabels,
  promotionContentKindLabels,
  promotionLinkTypeLabels,
  promotionStatusLabels,
  type PromotionAreaKey,
} from "@/lib/promotions/promotionManagementUi";
import { cn } from "@/lib/utils";

type Filters = {
  query: string;
  area: PromotionAreaKey | "";
  status: PromotionOverviewDisplayStatus | "";
  contentKind: PromotionContentKind | "";
};

const statusOptions = Object.entries(promotionStatusLabels) as [PromotionOverviewDisplayStatus, string][];
const kindOptions = Object.entries(promotionContentKindLabels) as [PromotionContentKind, string][];
const areaOptions = Object.entries(promotionAreaLabels) as [PromotionAreaKey, string][];

function statusClass(status: PromotionOverviewDisplayStatus) {
  if (status === "live") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "scheduled") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "hidden" || status === "archived") return "border-slate-200 bg-slate-100 text-slate-700";
  if (status === "ended") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-pul-border bg-pul-light text-pul-deep";
}

function pageHref(page: number, filters: Filters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.area) params.set("area", filters.area);
  if (filters.status) params.set("status", filters.status);
  if (filters.contentKind) params.set("kind", filters.contentKind);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/manage/banners?${query}` : "/manage/banners";
}

export function PromotionBannerList({
  page,
  slots,
  filters,
  currentPage,
}: {
  page: PromotionManagementOverviewPage;
  slots: PromotionSlotDefinition[];
  filters: Filters;
  currentPage: number;
}) {
  const slotMap = new Map(slots.map((slot) => [slot.slotCode, slot]));
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit));

  return (
    <>
      <section className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5" aria-labelledby="banner-filter-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="banner-filter-heading" className="text-xl font-black text-foreground">배너 찾기</h2>
            <p className="mt-1 text-sm text-pul-muted">제목·위치·상태로 필요한 항목만 확인하세요.</p>
          </div>
          <Link
            href="/manage/banners/new"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-pul-point px-5 font-black text-white hover:bg-pul-deep"
          >
            새 배너 등록
          </Link>
        </div>

        <form action="/manage/banners" method="get" className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(150px,0.8fr))_auto]">
          <label className="grid gap-1 text-sm font-bold text-foreground">
            제목 검색
            <input
              type="search"
              name="q"
              defaultValue={filters.query}
              maxLength={100}
              placeholder="제목 또는 요약"
              className="min-h-12 min-w-0 rounded-xl border border-pul-border bg-white px-3 text-base"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold text-foreground">
            위치
            <select name="area" defaultValue={filters.area} className="min-h-12 min-w-0 rounded-xl border border-pul-border bg-white px-3 text-base">
              <option value="">전체</option>
              {areaOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold text-foreground">
            상태
            <select name="status" defaultValue={filters.status} className="min-h-12 min-w-0 rounded-xl border border-pul-border bg-white px-3 text-base">
              <option value="">전체</option>
              {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold text-foreground">
            콘텐츠 구분
            <select name="kind" defaultValue={filters.contentKind} className="min-h-12 min-w-0 rounded-xl border border-pul-border bg-white px-3 text-base">
              <option value="">전체</option>
              {kindOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="submit" className="min-h-12 self-end rounded-xl border border-pul-deep bg-pul-deep px-5 font-black text-white">
            적용
          </button>
        </form>
      </section>

      <section className="mt-5" aria-labelledby="banner-list-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="banner-list-heading" className="text-xl font-black text-foreground">등록된 배너</h2>
            <p className="mt-1 text-sm text-pul-muted">전체 {page.total}건 · {currentPage}/{totalPages}쪽</p>
          </div>
        </div>

        {page.items.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-pul-border bg-white px-5 py-12 text-center">
            <p className="text-lg font-black text-foreground">
              {filters.query || filters.area || filters.status || filters.contentKind
                ? "조건에 맞는 배너가 없습니다."
                : "아직 등록된 배너가 없습니다."}
            </p>
            <p className="mt-2 text-base text-pul-muted">새 배너 등록에서 초안부터 시작할 수 있습니다.</p>
          </div>
        ) : (
          <ul className="mt-3 grid gap-3">
            {page.items.map((item) => {
              const placement = item.primaryPlacement;
              const slot = placement ? slotMap.get(placement.slotCode) : undefined;
              return (
                <li key={item.promotionKey}>
                  <Link
                    href={`/manage/banners/${item.promotionKey}`}
                    className="grid gap-4 rounded-2xl border border-pul-border bg-white p-4 transition hover:border-pul-point hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point md:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.4fr)_minmax(170px,0.8fr)_auto] md:items-center sm:p-5"
                  >
                    <span>
                      <span className="block text-xs font-bold text-pul-muted">위치</span>
                      <span className="mt-1 block font-black text-foreground">
                        {slot ? friendlySlotName(slot) : "위치 미지정"}
                      </span>
                      {slot ? <span className="mt-1 block break-all text-xs text-pul-muted">{slot.slotCode}</span> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block break-words text-lg font-black text-foreground">{item.title}</span>
                      <span className="mt-1 block line-clamp-2 text-sm leading-6 text-pul-muted">{item.summary}</span>
                      <span className="mt-2 block text-sm font-bold text-pul-deep">
                        {promotionContentKindLabels[item.contentKind]} · {promotionLinkTypeLabels[item.linkType]}
                      </span>
                    </span>
                    <span>
                      <span className="block text-xs font-bold text-pul-muted">게시 기간</span>
                      {placement ? (
                        <span className="mt-1 block text-sm leading-6 text-foreground">
                          {formatKstDateTime(placement.startsAt)}<br aria-hidden="true" />~ {formatKstDateTime(placement.endsAt)}
                        </span>
                      ) : <span className="mt-1 block text-sm text-pul-muted">미지정</span>}
                    </span>
                    <span className="flex items-center justify-between gap-3 md:justify-end">
                      <span className={cn("inline-flex rounded-full border px-3 py-1 text-sm font-black", statusClass(item.displayStatus))}>
                        {promotionStatusLabels[item.displayStatus]}
                      </span>
                      <span aria-hidden="true" className="text-2xl font-bold text-pul-point">›</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 ? (
          <nav aria-label="배너 목록 페이지" className="mt-5 flex items-center justify-center gap-3">
            {currentPage > 1 ? (
              <Link href={pageHref(currentPage - 1, filters)} className="inline-flex min-h-11 items-center rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep">
                이전
              </Link>
            ) : null}
            <span className="text-sm font-bold text-pul-muted">{currentPage} / {totalPages}</span>
            {page.hasMore ? (
              <Link href={pageHref(currentPage + 1, filters)} className="inline-flex min-h-11 items-center rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep">
                다음
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </>
  );
}
