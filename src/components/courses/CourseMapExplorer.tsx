"use client";

import { FilterChip } from "@/components/ui/FilterChip";
import { Icon } from "@/components/ui/Icon";
import {
  courseFeatureLabels,
  courseOperationLabels,
  courseRegionOptions,
  courseTypeLabels,
  type CourseFeatureCode,
  type CourseFilters,
  type CourseHolesFilter,
  type CourseOperation,
  type CourseType,
  type PublicCourse,
  type PublicCoursePage,
} from "@/lib/courses/courseDirectory";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type Props = { page: PublicCoursePage; initialFilters: CourseFilters; error?: string };

const typeOptions: { value?: CourseType; label: string }[] = [
  { label: "전체" }, { value: "field", label: "실제 필드" }, { value: "screen", label: "스크린 파크골프장" },
];
const operationOptions: { value?: CourseOperation; label: string }[] = [
  { label: "전체" }, { value: "reservation", label: "예약 가능" }, { value: "phone", label: "전화 문의" }, { value: "walkIn", label: "현장 접수" },
];
const holesOptions: { value?: CourseHolesFilter; label: string }[] = [
  { label: "전체" }, { value: "9", label: "9홀" }, { value: "18", label: "18홀" }, { value: "27_plus", label: "27홀 이상" },
];
const featureOptions: CourseFeatureCode[] = ["club_available", "event_history", "lesson_available", "equipment_rental", "parking"];

function buildQuery(filters: CourseFilters, pageNumber: number) {
  const params = new URLSearchParams();
  if (filters.keyword) params.set("q", filters.keyword);
  if (filters.courseType) params.set("type", filters.courseType);
  if (filters.region) params.set("region", filters.region);
  if (filters.operation) params.set("operation", filters.operation);
  if (filters.holes) params.set("holes", filters.holes);
  for (const feature of filters.features ?? []) params.append("feature", feature);
  if (pageNumber > 1) params.set("page", String(pageNumber));
  const query = params.toString();
  return query ? `/courses?${query}` : "/courses";
}

function courseMapPosition(course: PublicCourse) {
  if (course.latitude === null || course.longitude === null) return null;
  return {
    x: Math.min(94, Math.max(6, ((course.longitude - 124) / 8) * 100)),
    y: Math.min(91, Math.max(9, ((39 - course.latitude) / 6) * 100)),
  };
}

function phoneHref(phone: string) { return `tel:${phone.replace(/[^0-9+]/g, "")}`; }

function CourseSummary({ course, compact = false }: { course: PublicCourse; compact?: boolean }) {
  return <article className={cn("rounded-xl border border-pul-border bg-white shadow-[0_8px_24px_rgba(6,78,59,0.12)]", compact ? "p-3" : "p-4")}>
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", course.courseType === "field" ? "bg-pul-light text-pul-deep" : "bg-blue-50 text-blue-700")}>{courseTypeLabels[course.courseType]}</span>
      <span className="rounded-full bg-pul-deep px-2.5 py-1 text-xs font-bold text-white">{course.holes}홀</span>
      <span className="text-xs font-bold text-pul-muted">{courseOperationLabels[course.operation]}</span>
    </div>
    <h3 className="mt-2 break-words text-lg font-bold leading-snug text-foreground">{course.name}</h3>
    <p className="mt-1 break-words text-sm leading-relaxed text-pul-muted">{course.region} {course.city} · {course.address}</p>
    {!compact ? <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground">{course.description}</p> : null}
    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
      <div className="rounded-lg bg-[#fafbfa] p-2.5"><dt className="text-xs font-semibold text-pul-muted">운영 시간</dt><dd className="mt-0.5 font-bold">{course.operatingHours ?? "확인 중"}</dd></div>
      <div className="rounded-lg bg-[#fafbfa] p-2.5"><dt className="text-xs font-semibold text-pul-muted">연락처</dt><dd className="mt-0.5 font-bold">{course.phone ?? "확인 중"}</dd></div>
    </dl>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Link href={`/courses/${course.courseKey}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-3 text-sm font-bold text-white hover:bg-pul-deep">자세히 보기</Link>
      {course.phone ? <a href={phoneHref(course.phone)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-3 text-sm font-bold text-pul-deep">전화 문의</a> : <span className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-3 text-sm font-bold text-pul-muted">연락처 확인 중</span>}
    </div>
  </article>;
}

function FilterPanel({ filters, total, onChange, onApply, onReset, onClose }: { filters: CourseFilters; total: number; onChange: (next: CourseFilters) => void; onApply: () => void; onReset: () => void; onClose?: () => void }) {
  const toggleFeature = (feature: CourseFeatureCode) => {
    const current = filters.features ?? [];
    onChange({ ...filters, features: current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature] });
  };
  return <section className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:h-full lg:overflow-y-auto" aria-label="골프장 검색 필터">
    <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">검색·필터</h2>{onClose ? <button type="button" onClick={onClose} className="min-h-11 px-2 font-bold text-pul-muted">닫기</button> : null}</div>
    <label className="mt-3 block"><span className="text-sm font-bold">골프장 검색</span><input type="search" value={filters.keyword ?? ""} onChange={(event) => onChange({ ...filters, keyword: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") onApply(); }} placeholder="골프장명, 지역, 주소" className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20" /></label>
    <button type="button" onClick={onApply} className="mt-2 min-h-11 w-full rounded-lg bg-pul-point px-4 font-bold text-white">검색 적용</button>
    <div className="mt-5 space-y-5">
      <div><p className="mb-2 text-sm font-semibold">유형</p><div className="flex flex-wrap gap-2">{typeOptions.map((item) => <FilterChip key={item.label} label={item.label} active={filters.courseType === item.value} onClick={() => onChange({ ...filters, courseType: item.value })} />)}</div></div>
      <div><p className="mb-2 text-sm font-semibold">지역</p><div className="grid grid-cols-3 gap-2"><FilterChip label="전체" active={!filters.region} onClick={() => onChange({ ...filters, region: undefined })} />{courseRegionOptions.map((region) => <FilterChip key={region} label={region} active={filters.region === region} onClick={() => onChange({ ...filters, region })} />)}</div></div>
      <div><p className="mb-2 text-sm font-semibold">운영 방식</p><div className="grid grid-cols-2 gap-2">{operationOptions.map((item) => <FilterChip key={item.label} label={item.label} active={filters.operation === item.value} onClick={() => onChange({ ...filters, operation: item.value })} />)}</div></div>
      <div><p className="mb-2 text-sm font-semibold">홀 수</p><div className="grid grid-cols-2 gap-2">{holesOptions.map((item) => <FilterChip key={item.label} label={item.label} active={filters.holes === item.value} onClick={() => onChange({ ...filters, holes: item.value })} />)}</div></div>
      <div><p className="mb-2 text-sm font-semibold">부가 정보</p><div className="flex flex-wrap gap-2">{featureOptions.map((feature) => <FilterChip key={feature} label={courseFeatureLabels[feature]} active={(filters.features ?? []).includes(feature)} onClick={() => toggleFeature(feature)} />)}</div></div>
    </div>
    <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={onReset} className="min-h-11 rounded-lg border border-pul-border font-bold text-pul-deep">초기화</button><button type="button" onClick={onApply} className="min-h-11 rounded-lg bg-pul-deep font-bold text-white">필터 적용</button></div>
    <p className="mt-3 rounded-lg bg-pul-light px-3 py-2 text-sm text-pul-deep" aria-live="polite">검색 결과 <strong>{total}</strong>개</p>
  </section>;
}

export function CourseMapExplorer({ page, initialFilters, error }: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [selectedKey, setSelectedKey] = useState(page.items[0]?.courseKey ?? null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [pending, startTransition] = useTransition();
  const selectedCourse = page.items.find((course) => course.courseKey === selectedKey) ?? page.items[0] ?? null;
  const currentPage = Math.floor(page.offset / page.limit) + 1;
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit));
  const mappedCourses = useMemo(() => page.items.map((course) => ({ course, position: courseMapPosition(course) })).filter((item) => item.position !== null), [page.items]);
  const navigate = (next: CourseFilters, pageNumber = 1) => startTransition(() => router.push(buildQuery(next, pageNumber)));
  const reset = () => { setFilters({}); navigate({}); };

  return <div className="space-y-4 pb-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
    <div className="rounded-xl border border-pul-border bg-white p-3 shadow-sm lg:hidden">
      <div className="flex gap-2"><label className="min-w-0 flex-1"><span className="sr-only">골프장 검색</span><input type="search" value={filters.keyword ?? ""} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") navigate(filters); }} placeholder="골프장명, 지역, 주소 검색" className="min-h-11 w-full rounded-lg border border-pul-border px-3 text-base" /></label><button type="button" onClick={() => setShowMobileFilters((value) => !value)} aria-expanded={showMobileFilters} aria-controls="mobile-course-filter" className="min-h-11 rounded-lg bg-pul-point px-4 font-bold text-white">필터</button></div>
      <p className="mt-2 text-sm text-pul-muted" aria-live="polite">검색 결과 <strong className="text-pul-deep">{page.total}</strong>개</p>
    </div>
    {showMobileFilters ? <div id="mobile-course-filter" className="lg:hidden"><FilterPanel filters={filters} total={page.total} onChange={setFilters} onApply={() => { navigate(filters); setShowMobileFilters(false); }} onReset={reset} onClose={() => setShowMobileFilters(false)} /></div> : null}
    {pending ? <p className="rounded-lg bg-pul-light px-4 py-3 text-sm font-bold text-pul-deep" role="status">골프장 정보를 불러오는 중입니다…</p> : null}
    {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">{error}</p> : null}

    <div className="space-y-4 lg:grid lg:min-h-[760px] lg:flex-1 lg:grid-cols-[280px_minmax(0,1fr)_310px] lg:items-stretch lg:gap-4 lg:space-y-0">
      <aside className="hidden lg:block"><FilterPanel filters={filters} total={page.total} onChange={setFilters} onApply={() => navigate(filters)} onReset={reset} /></aside>
      <section className="space-y-4">
        {page.items.length === 0 ? <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-pul-border bg-white px-5 text-center"><Icon name="flag" className="h-10 w-10 text-pul-muted/50" /><h2 className="mt-3 text-xl font-bold">등록된 골프장 정보가 아직 없습니다.</h2><p className="mt-2 text-base text-pul-muted">새 골프장 정보를 알고 계시면 위의 제보 버튼으로 알려주세요.</p></div> : <>
          <div className="relative h-[360px] overflow-hidden rounded-xl border border-pul-border bg-[radial-gradient(circle_at_20%_20%,rgba(15,118,110,0.12),transparent_24%),linear-gradient(135deg,#e8f7ed_0%,#f8fffb_45%,#dff4ee_100%)] shadow-sm sm:h-[430px] lg:h-[520px]" aria-label="좌표가 등록된 골프장 지도">
            <p className="absolute left-3 right-3 top-3 rounded-full bg-white/90 px-4 py-2 text-center text-sm font-semibold text-pul-muted">좌표가 확인된 골프장만 지도에 표시됩니다.</p>
            {mappedCourses.map(({ course, position }) => position ? <button key={course.courseKey} type="button" onClick={() => setSelectedKey(course.courseKey)} style={{ left: `${position.x}%`, top: `${position.y}%` }} aria-label={`${course.name} 선택`} className={cn("absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg", course.courseType === "field" ? "bg-pul-point" : "bg-blue-600", selectedCourse?.courseKey === course.courseKey && "scale-125 ring-4 ring-pul-gold/40")}>{course.courseType === "field" ? course.holes : "S"}</button> : null)}
            {mappedCourses.length === 0 ? <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm font-semibold text-pul-muted">현재 페이지의 골프장에는 확인된 좌표가 없습니다.</p> : null}
          </div>
          {selectedCourse ? <div className="lg:hidden"><CourseSummary course={selectedCourse} /></div> : null}
        </>}
      </section>
      <aside className="rounded-xl border border-pul-border bg-white shadow-sm lg:min-h-0 lg:overflow-y-auto">
        <div className="border-b border-pul-border px-4 py-3"><p className="text-xs font-bold tracking-[0.15em] text-pul-point">LIVE RESULT</p><h2 className="mt-1 text-lg font-bold">검색 결과</h2></div>
        <div className="space-y-2 p-3">{page.items.map((course) => <button key={course.courseKey} type="button" onClick={() => setSelectedKey(course.courseKey)} className={cn("w-full rounded-lg border p-3 text-left", selectedCourse?.courseKey === course.courseKey ? "border-pul-point bg-pul-light" : "border-pul-border hover:bg-[#fafbfa]")}><span className="text-xs font-bold text-pul-point">{courseTypeLabels[course.courseType]} · {course.region}</span><strong className="mt-1 block break-words text-base">{course.name}</strong><span className="mt-1 block text-sm text-pul-muted">{course.city} · {course.holes}홀 · {courseOperationLabels[course.operation]}</span></button>)}</div>
      </aside>
    </div>
    {selectedCourse ? <div className="hidden lg:block"><CourseSummary course={selectedCourse} compact /></div> : null}
    {page.total > 0 ? <nav aria-label="골프장 결과 페이지" className="flex items-center justify-center gap-3 rounded-xl border border-pul-border bg-white p-3"><button type="button" disabled={currentPage <= 1 || pending} onClick={() => navigate(initialFilters, currentPage - 1)} className="min-h-11 rounded-lg border border-pul-border px-4 font-bold disabled:opacity-40">이전</button><span className="text-sm font-bold text-pul-deep">{currentPage} / {totalPages}</span><button type="button" disabled={!page.hasMore || pending} onClick={() => navigate(initialFilters, currentPage + 1)} className="min-h-11 rounded-lg border border-pul-border px-4 font-bold disabled:opacity-40">다음</button></nav> : null}
  </div>;
}
