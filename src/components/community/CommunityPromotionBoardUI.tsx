"use client";

import { Card } from "@/components/ui/Card";
import { courseProvinces } from "@/lib/courses/courseRegions";
import { emptyFilters, fields, recruitmentLabel, regionLabel, sourceHref, type Field, type Filters, type Post, type Source, type SourceKind } from "@/lib/community/communityPromotionsPreview";
import { ArrowUpRight, CalendarDays, ChevronRight, ListFilter, MapPin, Megaphone, PencilLine, Pin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SelectField, primary, secondary } from "./CommunityPromotionForms";

export const sourceNames: Record<SourceKind, string> = {
  event: "대회 상세", club: "동호회 상세", education: "교육과정 상세", lesson: "레슨·교육 상세", course: "구장 상세", sale: "장터 판매 상세",
};
export function Destination({ source, className, children }: { source: Source; className: string; children: ReactNode }) {
  const href = sourceHref(source);
  if (!href) return null;
  return <Link className={className} href={href} prefetch={false} onNavigate={source.example ? (event) => {
    event.preventDefault();
    window.history.pushState(null, "", href);
  } : undefined}>{children}</Link>;
}

export function PostCard({ post, paid, now, onOpen, href }: { post: Post; paid?: boolean; now: number; onOpen?: () => void; href?: string }) {
  const status = recruitmentLabel(post, now);
  const summary = (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold sm:text-sm">
        {paid ? <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-amber-950"><Pin size={14} aria-hidden="true" /> 유료 광고</span> : null}
        <span className="inline-flex items-center gap-1 text-pul-point"><MapPin size={15} aria-hidden="true" className="shrink-0" /><span className="[overflow-wrap:anywhere]">{regionLabel(post)}</span></span>
        <span aria-hidden="true" className="text-slate-400">·</span>
        <span className="text-pul-muted">{post.trade || fields[post.field].label}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <h3 className="min-w-0 text-base font-extrabold leading-snug text-pul-deep [overflow-wrap:anywhere] group-hover:underline sm:text-lg">{post.title}</h3>
        <ChevronRight className="shrink-0 text-pul-point" size={19} aria-hidden="true" />
      </div>
      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-pul-muted [overflow-wrap:anywhere]">{post.body}</p>
      {status || post.source ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
        {status ? <span className={`rounded-full px-2 py-1 ${status === "모집 마감" ? "bg-slate-100 text-slate-700" : "bg-pul-light text-pul-deep"}`}>{status}</span> : null}
        {post.deadline ? <span className="inline-flex items-center gap-1 text-pul-muted"><CalendarDays size={14} aria-hidden="true" /> {post.deadline.replaceAll("-", ".")} 마감</span> : null}
        {post.source ? <span className="inline-flex items-center gap-1 text-pul-point">{sourceNames[post.source.kind]}{post.source.example ? " · 예시" : ""}<ArrowUpRight size={14} aria-hidden="true" /></span> : null}
      </div> : null}
    </>
  );
  const className = "group block w-full rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pul-point";
  return (
    <li className={`min-w-0 rounded-xl border bg-white p-3.5 sm:p-4 ${paid ? "border-amber-200 border-l-[3px] border-l-pul-gold shadow-sm" : "border-pul-border"}`}>
      {post.source ? <Destination source={post.source} className={className}>{summary}</Destination> : href ? <Link href={href} prefetch={false} className={className}>{summary}</Link> : <button type="button" className={className} onClick={onOpen}>{summary}</button>}
      {post.source && href ? <Link href={href} prefetch={false} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-pul-point">홍보 글 보기</Link> : null}
    </li>
  );
}

export function PromotionFilters({ filters, districtOptions, setFilters, onWrite, onBanner, preview = false }: {
  filters: Filters; districtOptions: string[]; setFilters: (value: Filters) => void;
  onWrite: () => void; onBanner: () => void; preview?: boolean;
}) {
  const trades = filters.field ? fields[filters.field].trades : [...new Set(Object.values(fields).flatMap((field) => field.trades))];
  return <>
      <section className="rounded-2xl border border-emerald-900/10 bg-gradient-to-br from-pul-light via-white to-white p-4 shadow-sm sm:p-7" aria-labelledby="promotion-title">
        <div className="flex flex-col gap-3.5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0">
            {preview ? <p className="text-xs font-bold text-pul-point">로컬 시연</p> : null}
            <h1 id="promotion-title" className="mt-1.5 text-3xl font-extrabold tracking-tight text-pul-deep sm:text-4xl">커뮤니티</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-700 sm:text-base">우리 동네 업체, 서비스와 파크골프 모집 소식을 찾아보세요.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <button type="button" className={primary} onClick={onWrite}><PencilLine size={17} aria-hidden="true" /> 글쓰기</button>
            <button type="button" className={secondary} onClick={onBanner}><Megaphone size={17} aria-hidden="true" /> 배너 신청</button>
          </div>
        </div>
        <nav aria-label="커뮤니티 게시판" className="mt-3 flex flex-wrap items-center gap-x-5 border-t border-emerald-900/10 pt-1 sm:mt-5">
          <span aria-current="page" className="inline-flex min-h-11 items-center border-b-2 border-pul-point text-sm font-extrabold text-pul-deep">홍보·광고</span>
          <Link href="/community?board=members" prefetch={false} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-pul-muted hover:text-pul-deep">회원 게시판 <ChevronRight size={15} aria-hidden="true" /></Link>
        </nav>
      </section>

      <Card dense bodyClassName="flex min-w-0 flex-col gap-3 sm:gap-4 sm:px-5 sm:py-4">
        <div className="order-2 sm:order-1">
          <h2 className="flex items-center gap-2 text-sm font-bold text-pul-deep"><ListFilter size={18} aria-hidden="true" /> 분야</h2>
          <div className="mt-2 flex flex-wrap gap-1.5 sm:gap-2" aria-label="분야 선택">
            {([["", "전체"], ...Object.entries(fields).map(([key, item]) => [key, item.label])] as [Field | "", string][]).map(([key, label]) => (
              <button type="button" key={key} aria-pressed={filters.field === key} onClick={() => setFilters({ ...filters, field: key, trade: "" })} className={`min-h-10 rounded-full border px-3 text-xs font-bold transition-colors sm:min-h-11 sm:px-4 sm:text-sm ${filters.field === key ? "border-pul-deep bg-pul-deep text-white" : "border-pul-border bg-white text-pul-deep hover:border-pul-point hover:bg-pul-light"}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="order-1 grid grid-cols-2 gap-2 sm:order-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-end sm:gap-3">
          <SelectField label="시·도" value={filters.province} onChange={(event) => setFilters({ ...filters, province: event.target.value, district: "" })}>
            <option value="">전체 시·도</option>{courseProvinces.map((province) => <option key={province}>{province}</option>)}
          </SelectField>
          <SelectField label="시·군·구" value={filters.district} disabled={!filters.province} onChange={(event) => setFilters({ ...filters, district: event.target.value })}>
            <option value="">전체 시·군·구</option>{filters.district && !districtOptions.includes(filters.district) ? <option>{filters.district}</option> : null}{districtOptions.map((district) => <option key={district}>{district}</option>)}
          </SelectField>
          <SelectField label="세부 업종" value={filters.trade} disabled={!trades.length} onChange={(event) => setFilters({ ...filters, trade: event.target.value })}>
            <option value="">전체 업종</option>{trades.map((trade) => <option key={trade}>{trade}</option>)}
          </SelectField>
          <button type="button" className={`${secondary} self-end`} onClick={() => setFilters(emptyFilters)}>초기화</button>
        </div>
      </Card>

  </>;
}
