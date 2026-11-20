"use client";

import { CertificationCourseCard } from "@/components/certification/CertificationCourseCard";
import {
  COURSES_TAB_DISCLAIMER,
  courseCategoryFilters,
  methodFilters,
  providerTypeFilters,
  regionFilters,
  statusFilters,
} from "@/data/certificationData";
import type { certificationCourseFilterKeys } from "@/lib/certification/certificationCourseComparison";
import type {
  CertificationCourseFilters,
  CertificationPage,
  PublicCertificationCourseComparison,
} from "@/lib/certification/certificationDirectory";
import { useState, type FormEvent } from "react";

type CourseFilterKey = (typeof certificationCourseFilterKeys)[number];

type CertificationCoursesTabProps = {
  coursePage: CertificationPage<PublicCertificationCourseComparison>;
  hasPublicCourses: boolean;
  filters: CertificationCourseFilters;
  error: string | null;
  returnTo: string;
  onFilterChange: (key: CourseFilterKey, value?: string) => void;
  onResetFilters: () => void;
  onPageChange: (page: number) => void;
  onRegister: (trigger: HTMLButtonElement) => void;
};

const fields = [
  { key: "courseCategory", field: "category", label: "자격 구분", options: courseCategoryFilters },
  { key: "courseRegion", field: "region", label: "지역", options: regionFilters.map((region) => ({ value: region === "전체" ? "all" : region, label: region })) },
  { key: "courseStatus", field: "status", label: "모집 상태", options: statusFilters },
  { key: "courseProviderType", field: "providerType", label: "주관기관 유형", options: providerTypeFilters },
  { key: "courseMethod", field: "method", label: "교육 방식", options: methodFilters },
] as const;

const outline = "inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-point/40 bg-white px-3 text-center text-sm font-bold text-pul-deep hover:bg-pul-light disabled:opacity-50";

export function CertificationCoursesTab({
  coursePage, hasPublicCourses, filters, error, returnTo, onFilterChange, onResetFilters, onPageChange, onRegister,
}: CertificationCoursesTabProps) {
  const [showFilters, setShowFilters] = useState(false);
  const currentPage = Math.floor(coursePage.offset / coursePage.limit) + 1;
  const activeFilters: { key: CourseFilterKey; label: string; value: string }[] = fields.flatMap(({ key, field, label, options }) => {
    const value = filters[field];
    return value ? [{ key, label, value: options.find((option) => option.value === value)?.label ?? value }] : [];
  });
  if (filters.keyword) activeFilters.unshift({ key: "courseKeyword", label: "검색어", value: filters.keyword });

  const submitKeyword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const keyword = String(new FormData(event.currentTarget).get("courseKeyword") ?? "").trim();
    onFilterChange("courseKeyword", keyword || undefined);
  };

  const filter = ({ key, field, label, options }: (typeof fields)[number]) => (
    <label key={key} className="min-w-0 text-sm font-semibold text-pul-muted">
      {label}
      <select
        aria-label={label}
        value={filters[field] ?? "all"}
        onChange={(event) => onFilterChange(key, event.target.value === "all" ? undefined : event.target.value)}
        className="mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-2 text-sm text-foreground"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );

  const register = (event: React.MouseEvent<HTMLButtonElement>) => onRegister(event.currentTarget);

  return (
    <div className="space-y-3 lg:space-y-4">
      <header>
        <h2 className="text-2xl font-extrabold tracking-tight text-pul-deep sm:text-3xl">민간 교육과정</h2>
        <p className="mt-1 text-sm text-pul-muted">교육 신청과 결제는 각 신청처에서 진행합니다.</p>
      </header>
      <section aria-label="교육과정 검색과 필터" className="space-y-3 rounded-xl border border-pul-border bg-white p-2.5 sm:p-4">
        <div className="flex gap-1.5 sm:gap-2">
          <form onSubmit={submitKeyword} role="search" className="flex min-w-0 flex-1 gap-1.5 sm:gap-2">
            <input
              key={filters.keyword ?? ""}
              name="courseKeyword"
              type="search"
              aria-label="과정명·주관기관 검색"
              maxLength={100}
              defaultValue={filters.keyword ?? ""}
              placeholder="과정명·주관기관 검색"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-pul-border px-2 text-sm outline-pul-point sm:px-3"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-pul-point px-2.5 text-sm font-bold text-white hover:bg-pul-deep sm:px-4">검색</button>
          </form>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls="certification-course-filters"
            className={outline + " shrink-0"}
          >
            필터
          </button>
        </div>
        <div id="certification-course-filters" hidden={!showFilters} className="space-y-3 border-t border-pul-border pt-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">{fields.slice(0, 3).map(filter)}</div>
          <details>
            <summary className="cursor-pointer py-2 text-sm font-bold text-pul-deep">추가 필터</summary>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">{fields.slice(3).map(filter)}</div>
          </details>
        </div>
        {activeFilters.length > 0 && (
          <ul aria-label="적용된 검색과 필터" className="flex flex-wrap gap-1.5">
            {activeFilters.map(({ key, label, value }) => (
              <li key={key} className="min-w-0 max-w-full">
                <button
                  type="button"
                  onClick={() => onFilterChange(key, undefined)}
                  aria-label={label + " " + value + " 해제"}
                  className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border border-pul-point/20 bg-pul-light px-2.5 text-left text-sm font-semibold text-pul-deep [overflow-wrap:anywhere]"
                >
                  <span>{label} · {value}</span><span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : (
        <section aria-label="교육과정 목록" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-sm text-pul-muted">
              {hasPublicCourses && activeFilters.length > 0 ? "검색 결과" : "공개 과정"} <strong className="text-pul-deep">{coursePage.total}건</strong>
            </p>
            {coursePage.total > 0 && <button type="button" onClick={register} className={outline}>과정 등록 문의</button>}
          </div>
          {coursePage.items.length ? (
            <div className="lg:overflow-hidden lg:rounded-xl lg:border lg:border-pul-border lg:bg-white">
              <table role="table" aria-label="민간 교육과정 비교" className="block w-full table-fixed border-collapse lg:table">
                <colgroup className="hidden lg:table-column-group">
                  <col className="w-[23%]" /><col className="w-[15%]" /><col className="w-[22%]" />
                  <col className="w-[13%]" /><col className="w-[17%]" /><col className="w-[10%]" />
                </colgroup>
                <thead role="rowgroup" className="bg-pul-light max-lg:sr-only">
                  <tr role="row">
                    {["과정명·주관기관", "자격명·급수", "교육 일정·모집 상태", "총비용", "신청처", "상세 보기"].map((label) => (
                      <th key={label} role="columnheader" scope="col" className="px-4 py-3 text-left text-sm font-bold text-pul-deep">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody role="rowgroup" className="grid min-w-0 gap-2.5 lg:table-row-group">
                  {coursePage.items.map((item) => <CertificationCourseCard key={item.course.courseKey} comparison={item} returnTo={returnTo} />)}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-pul-border bg-white p-6 text-center sm:p-9">
              <h3 className="font-bold text-pul-deep">{hasPublicCourses ? "검색 결과가 없습니다" : "공개 과정이 없습니다"}</h3>
              {hasPublicCourses
                ? <button type="button" onClick={onResetFilters} className={outline}>필터 초기화</button>
                : <button type="button" onClick={register} className={outline}>과정 등록 문의</button>}
            </div>
          )}
          {coursePage.total > coursePage.limit && (
            <nav aria-label="교육과정 페이지" className="flex items-center justify-center gap-3">
              <button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} className={outline}>이전</button>
              <span aria-current="page" className="text-sm text-pul-muted">{currentPage}페이지</span>
              <button type="button" disabled={!coursePage.hasMore} onClick={() => onPageChange(currentPage + 1)} className={outline}>다음</button>
            </nav>
          )}
        </section>
      )}
      <p className="rounded-lg border border-pul-border bg-white px-3 py-2.5 text-xs leading-relaxed text-pul-muted">{COURSES_TAB_DISCLAIMER}</p>
    </div>
  );
}
