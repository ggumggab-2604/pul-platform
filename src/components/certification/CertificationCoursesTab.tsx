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
import type {
  CertificationCourseFilters,
  CertificationPage,
  PublicQualificationCourse,
} from "@/lib/certification/certificationDirectory";
import { useState, type FormEvent } from "react";

type CourseFilterKey =
  | "courseKeyword"
  | "courseCategory"
  | "courseProviderType"
  | "courseRegion"
  | "courseMethod"
  | "courseStatus";

type CertificationCoursesTabProps = {
  coursePage: CertificationPage<PublicQualificationCourse>;
  filters: CertificationCourseFilters;
  error: string | null;
  onFilterChange: (key: CourseFilterKey, value?: string) => void;
  onPageChange: (page: number) => void;
  onInquiry: (course: PublicQualificationCourse) => void;
  onDetail: (course: PublicQualificationCourse) => void;
  onRegister: (trigger: HTMLButtonElement) => void;
};

function valueOrAll(value?: string) {
  return value ?? "all";
}

export function CertificationCoursesTab({
  coursePage,
  filters,
  error,
  onFilterChange,
  onPageChange,
  onInquiry,
  onDetail,
  onRegister,
}: CertificationCoursesTabProps) {
  const [showFilters, setShowFilters] = useState(false);
  const featuredCourses = coursePage.items.filter((course) => course.featured);
  const courses = coursePage.items.filter((course) => !course.featured);
  const currentPage = Math.floor(coursePage.offset / coursePage.limit) + 1;

  const submitKeyword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const keyword = String(data.get("courseKeyword") ?? "").trim();
    onFilterChange("courseKeyword", keyword || undefined);
  };

  return (
    <div className="space-y-3 lg:space-y-4">
      <section className="rounded-xl border border-pul-border bg-white p-3 lg:p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground lg:text-xl">자격증·심판 교육과정</h2>
            <p className="mt-1 text-sm text-pul-muted">공개 중인 공식 과정 {coursePage.total}건</p>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
            aria-controls="certification-course-filters"
            className="inline-flex min-h-11 items-center rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep lg:hidden"
          >
            필터
          </button>
        </div>

        <div id="certification-course-filters" className={`${showFilters ? "block" : "hidden"} mt-3 space-y-3 lg:block`}>
          <form onSubmit={submitKeyword} className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">과정명·기관·지역 검색</span>
              <input
                key={filters.keyword ?? ""}
                name="courseKeyword"
                type="search"
                defaultValue={filters.keyword ?? ""}
                placeholder="과정명, 기관, 지역 검색"
                className="h-11 w-full rounded-lg border border-pul-border px-3 text-sm outline-none focus:border-pul-point"
              />
            </label>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-4 text-sm font-bold text-white hover:bg-pul-deep">검색</button>
          </form>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-semibold text-pul-muted">
              자격 구분
              <select value={valueOrAll(filters.category)} onChange={(event) => onFilterChange("courseCategory", event.target.value === "all" ? undefined : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-pul-border px-3 text-sm text-foreground">
                {courseCategoryFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-pul-muted">
              주관기관 유형
              <select value={valueOrAll(filters.providerType)} onChange={(event) => onFilterChange("courseProviderType", event.target.value === "all" ? undefined : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-pul-border px-3 text-sm text-foreground">
                {providerTypeFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-pul-muted">
              지역
              <select value={filters.region ?? "전체"} onChange={(event) => onFilterChange("courseRegion", event.target.value === "전체" ? undefined : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-pul-border px-3 text-sm text-foreground">
                {regionFilters.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-pul-muted">
              교육 방식
              <select value={valueOrAll(filters.method)} onChange={(event) => onFilterChange("courseMethod", event.target.value === "all" ? undefined : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-pul-border px-3 text-sm text-foreground">
                {methodFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-pul-muted">
              모집 상태
              <select value={valueOrAll(filters.status)} onChange={(event) => onFilterChange("courseStatus", event.target.value === "all" ? undefined : event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-pul-border px-3 text-sm text-foreground">
                {statusFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      {featuredCourses.length > 0 ? (
        <section aria-labelledby="featured-certification-courses">
          <h3 id="featured-certification-courses" className="mb-3 text-lg font-bold text-foreground">추천 과정</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {featuredCourses.map((course) => <CertificationCourseCard key={course.courseKey} course={course} onInquiry={onInquiry} onDetail={onDetail} featured />)}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="certification-course-list">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 id="certification-course-list" className="text-lg font-bold text-foreground">교육과정 목록</h3>
          <button type="button" onClick={(event) => onRegister(event.currentTarget)} className="inline-flex min-h-10 items-center rounded-lg border border-pul-border px-3 text-xs font-bold text-pul-deep hover:bg-pul-light">과정 등록 문의</button>
        </div>
        {coursePage.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-pul-border px-6 py-12 text-center text-sm text-pul-muted">현재 등록된 교육과정이 없습니다.</p>
        ) : courses.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {courses.map((course) => <CertificationCourseCard key={course.courseKey} course={course} onInquiry={onInquiry} onDetail={onDetail} />)}
          </div>
        ) : (
          <p className="rounded-xl border border-pul-border bg-white px-4 py-3 text-sm text-pul-muted">현재 페이지의 과정은 위 추천 목록에 모두 표시되었습니다.</p>
        )}

        {coursePage.total > coursePage.limit ? (
          <nav aria-label="교육과정 페이지" className="mt-4 flex items-center justify-center gap-3">
            <button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} className="min-h-10 rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep disabled:cursor-not-allowed disabled:opacity-40">이전</button>
            <span className="text-sm text-pul-muted">{currentPage}페이지</span>
            <button type="button" disabled={!coursePage.hasMore} onClick={() => onPageChange(currentPage + 1)} className="min-h-10 rounded-lg border border-pul-border px-4 text-sm font-bold text-pul-deep disabled:cursor-not-allowed disabled:opacity-40">다음</button>
          </nav>
        ) : null}
      </section>

      <aside className="rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-2.5">
        <p className="text-xs leading-relaxed text-pul-muted">{COURSES_TAB_DISCLAIMER}</p>
      </aside>
    </div>
  );
}
