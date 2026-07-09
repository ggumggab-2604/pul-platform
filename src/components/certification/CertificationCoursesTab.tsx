"use client";

import { CertificationCourseCard } from "@/components/certification/CertificationCourseCard";
import { Icon } from "@/components/ui/Icon";
import {
  CERT_AD_INQUIRY_FORM_URL,
  COURSES_TAB_DISCLAIMER,
  courseCategoryFilters,
  createDefaultCourseFilters,
  featuredQualificationCourses,
  filterQualificationCourses,
  methodFilters,
  plannedCourseAdProducts,
  priceRangeFilters,
  providerTypeFilters,
  qualificationAdTargets,
  qualificationCourses,
  regionFilters,
  statusFilters,
  type CourseFilters,
  type QualificationCourse,
} from "@/data/certificationData";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

const PC_FEATURED_PREVIEW = 4;
const MOBILE_FEATURED_PREVIEW = 3;
const PC_LIST_PREVIEW = 4;
const MOBILE_LIST_PREVIEW = 3;
const AD_PREVIEW = 3;

type CertificationCoursesTabProps = {
  onInquiry: (course: QualificationCourse) => void;
  onDetail: (course: QualificationCourse) => void;
  onAdInquiry: () => void;
  initialFilters?: Partial<CourseFilters>;
  filterSeed?: number;
};

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium",
        active
          ? "border-pul-point bg-pul-light text-pul-deep"
          : "border-pul-border bg-white text-pul-muted",
      )}
    >
      {label}
    </button>
  );
}

export function CertificationCoursesTab({
  onInquiry,
  onDetail,
  onAdInquiry,
  initialFilters,
  filterSeed = 0,
}: CertificationCoursesTabProps) {
  const [filters, setFilters] = useState<CourseFilters>({
    ...createDefaultCourseFilters(),
    ...initialFilters,
  });
  const [showAll, setShowAll] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAllAds, setShowAllAds] = useState(false);

  useEffect(() => {
    setFilters({ ...createDefaultCourseFilters(), ...initialFilters });
    setShowAll(false);
    setShowAllAds(false);
  }, [filterSeed, initialFilters]);

  const filtered = useMemo(
    () => filterQualificationCourses(qualificationCourses, filters),
    [filters],
  );

  const featuredIds = useMemo(
    () => new Set(featuredQualificationCourses.map((course) => course.id)),
    [],
  );
  const listCourses = useMemo(
    () => filtered.filter((course) => !featuredIds.has(course.id)),
    [filtered, featuredIds],
  );

  const displayedFeatured = useMemo(() => {
    const fromFilter = filtered.filter((course) => course.featured);
    return fromFilter.length > 0 ? fromFilter : featuredQualificationCourses;
  }, [filtered]);

  const hasMore =
    !showAll &&
    (listCourses.length > MOBILE_LIST_PREVIEW ||
      listCourses.length > PC_LIST_PREVIEW);

  const visibleAds = showAllAds
    ? plannedCourseAdProducts
    : plannedCourseAdProducts.slice(0, AD_PREVIEW);
  const hasMoreAds =
    !showAllAds && plannedCourseAdProducts.length > AD_PREVIEW;

  const update = (patch: Partial<CourseFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setShowAll(false);
  };

  return (
    <div className="space-y-3 lg:space-y-4">
      <section className="rounded-xl border border-pul-border bg-white p-2.5 lg:p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground lg:text-xl">
              추천 자격증·심판 교육과정
            </h2>
            <p className="mt-0.5 text-xs text-pul-muted">
              검색 결과{" "}
              <span className="font-bold text-pul-deep">{filtered.length}</span>개
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-pul-point px-4 text-sm font-bold text-white lg:hidden"
          >
            필터
          </button>
        </div>

        <div className={cn("space-y-3", !showFilters && "hidden lg:block")}>
          <label className="relative block">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pul-point"
            />
            <input
              type="search"
              value={filters.keyword}
              onChange={(event) => update({ keyword: event.target.value })}
              placeholder="과정명, 기관, 지역 검색"
              className="h-11 w-full rounded-lg border border-pul-border bg-[#fafbfa] pl-10 pr-3 text-sm outline-none focus:border-pul-point"
            />
          </label>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-pul-muted">자격 구분</p>
            <div className="flex flex-wrap gap-1.5 lg:gap-2">
              {courseCategoryFilters.map((item) => (
                <FilterChip
                  key={item.value}
                  label={item.label}
                  active={filters.category === item.value}
                  onClick={() => update({ category: item.value })}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-pul-muted">지역</p>
              <select
                value={filters.region}
                onChange={(event) => update({ region: event.target.value })}
                className="h-10 w-full rounded-lg border border-pul-border px-3 text-sm"
              >
                {regionFilters.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-pul-muted">교육 방식</p>
              <select
                value={filters.method}
                onChange={(event) => update({ method: event.target.value })}
                className="h-10 w-full rounded-lg border border-pul-border px-3 text-sm"
              >
                {methodFilters.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-pul-muted">모집 상태</p>
              <select
                value={filters.status}
                onChange={(event) => update({ status: event.target.value })}
                className="h-10 w-full rounded-lg border border-pul-border px-3 text-sm"
              >
                {statusFilters.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-pul-muted">비용 구간</p>
              <select
                value={filters.priceRange}
                onChange={(event) => update({ priceRange: event.target.value })}
                className="h-10 w-full rounded-lg border border-pul-border px-3 text-sm"
              >
                {priceRangeFilters.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-pul-muted">주관기관 유형</p>
              <select
                value={filters.providerType}
                onChange={(event) => update({ providerType: event.target.value })}
                className="h-10 w-full rounded-lg border border-pul-border px-3 text-sm"
              >
                {providerTypeFilters.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3">
          {displayedFeatured.map((course, index) => (
            <div
              key={course.id}
              className={cn(
                index >= MOBILE_FEATURED_PREVIEW && "hidden lg:block",
                index >= PC_FEATURED_PREVIEW && "lg:hidden",
              )}
            >
              <CertificationCourseCard
                course={course}
                onInquiry={onInquiry}
                onDetail={onDetail}
                featured
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-base font-bold text-foreground lg:text-lg">
          교육과정 목록
        </h3>
        {listCourses.length === 0 && displayedFeatured.length === 0 ? (
          <div className="rounded-xl border border-dashed border-pul-border px-6 py-12 text-center text-sm text-pul-muted">
            조건에 맞는 교육과정이 없습니다.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 lg:hidden">
              {(showAll ? listCourses : listCourses.slice(0, MOBILE_LIST_PREVIEW)).map(
                (course) => (
                  <CertificationCourseCard
                    key={course.id}
                    course={course}
                    onInquiry={onInquiry}
                    onDetail={onDetail}
                  />
                ),
              )}
            </div>
            <div className="hidden grid-cols-1 gap-3 lg:grid lg:grid-cols-2 xl:grid-cols-2">
              {(showAll ? listCourses : listCourses.slice(0, PC_LIST_PREVIEW)).map(
                (course) => (
                  <CertificationCourseCard
                    key={course.id}
                    course={course}
                    onInquiry={onInquiry}
                    onDetail={onDetail}
                  />
                ),
              )}
            </div>
          </>
        )}

        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:mt-4"
          >
            전체 교육과정 보기
          </button>
        )}
      </section>

      <section className="rounded-xl border border-pul-border bg-white p-2.5 lg:p-4">
        <h3 className="text-base font-bold text-foreground lg:text-lg">
          교육기관·강사·협회 과정 등록 안내
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          평생교육원, 협회, 민간재단, 사설 교육기관, 강사, 온라인 강의 운영자는 PUL에
          자격증·심판 교육과정을 홍보할 수 있습니다.
        </p>

        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold text-pul-muted">홍보 대상 예시</p>
          <div className="flex flex-wrap gap-1.5">
            {qualificationAdTargets.slice(0, 6).map((target) => (
              <span
                key={target}
                className="rounded-full border border-pul-border bg-[#fafbfa] px-2.5 py-1 text-[11px] font-medium text-foreground"
              >
                {target}
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onAdInquiry}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep sm:w-auto sm:px-6"
        >
          교육과정 등록 문의
        </button>
        {/* TODO: 교육기관 직접 등록 · 광고 결제 연동 */}
        <a href={CERT_AD_INQUIRY_FORM_URL} className="sr-only">
          교육과정 등록 문의 양식
        </a>
      </section>

      <section>
        <h3 className="mb-3 text-base font-bold text-foreground lg:text-lg">
          향후 광고 상품 예정
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleAds.map((ad) => (
            <article
              key={ad.id}
              className="rounded-xl border border-orange-200/50 bg-orange-50/30 p-3"
            >
              <h4 className="text-sm font-bold text-foreground">{ad.title}</h4>
              <p className="mt-1 text-[11px] leading-snug text-pul-muted lg:text-xs">
                {ad.description}
              </p>
            </article>
          ))}
        </div>
        {hasMoreAds && (
          <button
            type="button"
            onClick={() => setShowAllAds(true)}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-xs font-bold text-pul-deep hover:bg-pul-light"
          >
            광고 상품 전체 보기
          </button>
        )}
        <p className="mt-3 text-xs leading-relaxed text-pul-muted lg:text-sm">
          초기에는 운영자가 확인 후 수동 등록하고, 이후에는 교육기관 직접 등록 및
          광고 상품으로 확장할 예정입니다.
        </p>
      </section>

      <aside className="rounded-lg border border-pul-border/80 bg-[#fafbfa] px-3 py-2.5 lg:px-4 lg:py-3">
        <p className="text-[11px] leading-relaxed text-pul-muted lg:text-xs lg:leading-relaxed">
          {COURSES_TAB_DISCLAIMER}
        </p>
      </aside>
    </div>
  );
}
