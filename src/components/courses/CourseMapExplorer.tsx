"use client";

import { CourseMapWeatherSummary, CourseWeatherPanel } from "@/components/courses/CourseWeatherPanel";
import { FilterChip } from "@/components/ui/FilterChip";
import { Icon } from "@/components/ui/Icon";
import {
  courseMapItems,
  courseTypeLabels,
  mapFilterOptions,
  operationLabels,
  type CourseMapItem,
} from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type MapFilters = {
  type: string;
  region: string;
  operation: string;
  holes: string;
  features: string[];
  keyword: string;
};

const defaultFilters: MapFilters = {
  type: "전체",
  region: "전체",
  operation: "전체",
  holes: "전체",
  features: [],
  keyword: "",
};

const fieldRegions = ["서울", "경기", "인천", "충청", "강원", "전라", "경상", "제주"];

function formatPhoneLink(phone: string) {
  return `tel:${phone.replace(/-/g, "")}`;
}

function getCourseTypeValue(label: string) {
  if (label === "실제 필드") return "field";
  if (label === "스크린 파크골프장") return "screen";
  return "전체";
}

function getOperationValue(label: string) {
  if (label === "예약 가능") return "reservation";
  if (label === "전화 문의") return "phone";
  if (label === "현장 접수") return "walkIn";
  return "전체";
}

function getHoleMatch(course: CourseMapItem, holes: string) {
  if (holes === "전체") return true;
  if (holes === "27홀 이상") return course.holes >= 27;
  return course.holes === Number.parseInt(holes, 10);
}

function filterCourses(courses: CourseMapItem[], filters: MapFilters) {
  const typeValue = getCourseTypeValue(filters.type);
  const operationValue = getOperationValue(filters.operation);
  const keyword = filters.keyword.trim().toLowerCase();

  return courses.filter((course) => {
    if (typeValue !== "전체" && course.type !== typeValue) return false;
    if (filters.region !== "전체" && course.region !== filters.region) return false;
    if (operationValue !== "전체" && course.operation !== operationValue) return false;
    if (!getHoleMatch(course, filters.holes)) return false;
    if (filters.features.length > 0) {
      const hasAllFeatures = filters.features.every((feature) => {
        if (feature === "주차 가능") return course.parking;
        return course.features.includes(feature);
      });
      if (!hasAllFeatures) return false;
    }
    if (keyword) {
      const haystack =
        `${course.name} ${course.region} ${course.city} ${course.address}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function FilterPanel({
  filters,
  onChange,
  onReset,
  resultCount,
  showSearch = true,
  onClose,
}: {
  filters: MapFilters;
  onChange: (filters: MapFilters) => void;
  onReset: () => void;
  resultCount: number;
  showSearch?: boolean;
  onClose?: () => void;
}) {
  const update = (patch: Partial<MapFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const toggleFeature = (feature: string) => {
    const exists = filters.features.includes(feature);
    update({
      features: exists
        ? filters.features.filter((item) => item !== feature)
        : [...filters.features, feature],
    });
  };

  return (
    <div className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] text-pul-point">
            COURSE MAP
          </p>
          <h2 className="mt-1 text-xl font-bold text-foreground">탐색 조건</h2>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-pul-border px-3 py-1 text-xs font-bold text-pul-muted lg:hidden"
            >
              닫기
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            className="rounded-full bg-pul-light px-3 py-1 text-xs font-bold text-pul-deep"
          >
            초기화
          </button>
        </div>
      </div>

      {showSearch && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-foreground">검색어</span>
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pul-point"
            />
            <input
              type="search"
              value={filters.keyword}
              onChange={(event) => update({ keyword: event.target.value })}
              placeholder="골프장명, 지역, 주소 검색"
              className="h-11 w-full rounded-lg border border-pul-border bg-[#fafbfa] pl-10 pr-3 text-sm outline-none transition-shadow focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
            />
          </div>
        </label>
      )}

      <div className={cn("space-y-4", showSearch && "mt-4")}>
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">구장 유형</p>
          <div className="flex flex-wrap gap-2">
            {mapFilterOptions.types.map((type) => (
              <FilterChip
                key={type}
                label={type}
                active={filters.type === type}
                onClick={() => update({ type })}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">지역</p>
          <div className="grid grid-cols-3 gap-2">
            {mapFilterOptions.regions.map((region) => (
              <FilterChip
                key={region}
                label={region}
                active={filters.region === region}
                onClick={() => update({ region })}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">운영 방식</p>
          <div className="grid grid-cols-2 gap-2">
            {mapFilterOptions.operations.map((operation) => (
              <FilterChip
                key={operation}
                label={operation}
                active={filters.operation === operation}
                onClick={() => update({ operation })}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">홀 수</p>
          <div className="grid grid-cols-2 gap-2">
            {mapFilterOptions.holes.map((holes) => (
              <FilterChip
                key={holes}
                label={holes}
                active={filters.holes === holes}
                onClick={() => update({ holes })}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">부가 정보</p>
          <div className="flex flex-wrap gap-2">
            {mapFilterOptions.features.map((feature) => (
              <FilterChip
                key={feature}
                label={feature}
                active={filters.features.includes(feature)}
                onClick={() => toggleFeature(feature)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-pul-light px-3 py-2 text-sm text-pul-deep">
        현재 조건에 맞는 골프장{" "}
        <span className="font-bold">{resultCount}</span>개
      </div>
    </div>
  );
}

function MapBackground() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(15,118,110,0.12),transparent_24%),linear-gradient(135deg,#e8f7ed_0%,#f8fffb_45%,#dff4ee_100%)]" />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(30deg, transparent 0 46%, rgba(15,118,110,0.18) 47% 49%, transparent 50% 100%), linear-gradient(145deg, transparent 0 42%, rgba(217,164,65,0.22) 43% 45%, transparent 46% 100%)",
          backgroundSize: "180px 120px, 220px 150px",
        }}
        aria-hidden="true"
      />
      <div className="absolute left-[18%] top-[18%] h-[68%] w-[2px] rotate-[28deg] rounded-full bg-white/80 shadow-[0_0_0_3px_rgba(15,118,110,0.08)]" />
      <div className="absolute left-[31%] top-[5%] h-[80%] w-[3px] rotate-[-20deg] rounded-full bg-amber-200/80 shadow-[0_0_0_3px_rgba(217,164,65,0.12)]" />
      <div className="absolute left-[52%] top-[11%] h-[72%] w-[2px] rotate-[42deg] rounded-full bg-white/80 shadow-[0_0_0_3px_rgba(15,118,110,0.08)]" />
      <div className="absolute bottom-[22%] left-[8%] h-[3px] w-[78%] rotate-[-8deg] rounded-full bg-white/85 shadow-[0_0_0_3px_rgba(15,118,110,0.08)]" />
      {fieldRegions.map((region, index) => (
        <span
          key={region}
          className="absolute hidden rounded-full bg-white/65 px-2 py-0.5 text-xs font-semibold text-pul-muted shadow-sm sm:inline-block"
          style={{
            left: `${18 + (index % 4) * 18}%`,
            top: `${20 + Math.floor(index / 4) * 38 + (index % 2) * 8}%`,
          }}
        >
          {region}
        </span>
      ))}
    </>
  );
}

function CourseMarker({
  course,
  selected,
  onSelect,
}: {
  course: CourseMapItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const isField = course.type === "field";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "absolute z-20 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-[0_6px_14px_rgba(0,0,0,0.25)] transition-transform hover:scale-110 sm:h-9 sm:w-9 sm:text-xs",
        isField ? "bg-pul-point" : "bg-blue-600",
        selected && "scale-125 ring-4 ring-pul-gold/40",
      )}
      style={{ left: `${course.markerX}%`, top: `${course.markerY}%` }}
      aria-label={`${course.name} 선택`}
    >
      {isField ? course.holes : "S"}
    </button>
  );
}

function CourseMapFloatingPanel({ course }: { course: CourseMapItem }) {
  return (
    <article className="absolute right-3 top-14 z-30 hidden w-[292px] overflow-hidden rounded-xl border border-pul-border bg-white/97 shadow-[0_8px_24px_rgba(6,78,59,0.14)] backdrop-blur-sm lg:block">
      <div className="p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                course.type === "field"
                  ? "bg-pul-light text-pul-deep"
                  : "bg-blue-50 text-blue-700",
              )}
            >
              {courseTypeLabels[course.type]}
            </span>
            <span className="rounded-full bg-pul-deep px-2 py-0.5 text-[10px] font-bold text-white">
              {course.holes}홀
            </span>
            <span className="text-[10px] font-semibold text-pul-deep">
              {operationLabels[course.operation]}
            </span>
          </div>
          <h3 className="mt-1 line-clamp-2 text-base font-bold leading-tight text-foreground">
            {course.name}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-pul-muted">
            {course.region} {course.city} · {course.address}
          </p>
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <div className="min-w-0">
            <dt className="text-pul-muted">운영 시간</dt>
            <dd className="truncate font-semibold text-foreground">{course.hours}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-pul-muted">문의 번호</dt>
            <dd className="truncate font-semibold text-foreground">{course.phone}</dd>
          </div>
        </dl>

        <div className="mt-2">
          <CourseMapWeatherSummary weather={course.weather} />
        </div>

        <p className="mt-2 line-clamp-1 rounded-md bg-pul-light/70 px-2 py-1 text-[11px] leading-snug text-pul-deep">
          이용 팁 · {course.tips}
        </p>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Link
            href={`/courses/${course.id}`}
            className="inline-flex min-h-9 items-center justify-center rounded-lg bg-pul-point text-xs font-bold text-white hover:bg-pul-deep"
          >
            자세히 보기
          </Link>
          <button
            type="button"
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-pul-border text-xs font-bold text-pul-muted hover:text-pul-deep"
          >
            길찾기
          </button>
          <a
            href={formatPhoneLink(course.phone)}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-pul-border text-xs font-bold text-pul-muted hover:text-pul-deep"
          >
            전화 문의
          </a>
          <Link
            href="/clubs"
            className="inline-flex min-h-9 items-center justify-center rounded-lg bg-pul-light text-xs font-bold text-pul-deep hover:bg-emerald-100"
          >
            동호회 보기
          </Link>
        </div>
      </div>
    </article>
  );
}

function CourseDetailPanel({ course }: { course: CourseMapItem }) {
  return (
    <article className="w-full rounded-xl border border-pul-border bg-white shadow-[0_8px_24px_rgba(6,78,59,0.14)]">
      <div className="border-b border-pul-border/80 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-bold",
                course.type === "field"
                  ? "bg-pul-light text-pul-deep"
                  : "bg-blue-50 text-blue-700",
              )}
            >
              {courseTypeLabels[course.type]}
            </span>
            <h3 className="mt-2 text-lg font-bold leading-snug text-foreground sm:text-xl">
              {course.name}
            </h3>
          </div>
          <span className="shrink-0 rounded-lg bg-pul-deep px-2.5 py-1 text-sm font-bold text-white">
            {course.holes}홀
          </span>
        </div>
        <p className="mt-2 break-words text-sm leading-relaxed text-pul-muted">
          {course.region} {course.city} · {course.address}
        </p>
      </div>

      <div className="space-y-4 p-4">
        <CourseWeatherPanel weather={course.weather} />

        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-[#fafbfa] p-2.5">
            <dt className="text-xs font-semibold text-pul-muted">운영 시간</dt>
            <dd className="mt-0.5 break-words font-bold text-foreground">{course.hours}</dd>
          </div>
          <div className="rounded-lg bg-[#fafbfa] p-2.5">
            <dt className="text-xs font-semibold text-pul-muted">문의</dt>
            <dd className="mt-0.5 break-words font-bold text-foreground">{course.phone}</dd>
          </div>
          <div className="rounded-lg bg-[#fafbfa] p-2.5">
            <dt className="text-xs font-semibold text-pul-muted">예약</dt>
            <dd className="mt-0.5 font-bold text-foreground">
              {operationLabels[course.operation]}
            </dd>
          </div>
          <div className="rounded-lg bg-[#fafbfa] p-2.5">
            <dt className="text-xs font-semibold text-pul-muted">주차</dt>
            <dd className="mt-0.5 font-bold text-foreground">
              {course.parking ? "가능" : "확인 필요"}
            </dd>
          </div>
        </dl>

        <div>
          <p className="text-sm leading-relaxed text-foreground">{course.description}</p>
          <p className="mt-2 rounded-lg bg-pul-light px-3 py-2 text-sm text-pul-deep">
            이용 팁: {course.tips}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-pul-border px-2 py-2">
            <p className="text-lg font-bold text-pul-deep">{course.clubCount}</p>
            <p className="text-xs text-pul-muted">동호회</p>
          </div>
          <div className="rounded-lg border border-pul-border px-2 py-2">
            <p className="text-lg font-bold text-pul-deep">
              {course.hallOfFameCount}
            </p>
            <p className="text-xs text-pul-muted">명예 기록</p>
          </div>
          <div className="rounded-lg border border-pul-border px-2 py-2">
            <p className="text-lg font-bold text-pul-deep">{course.eventCount}</p>
            <p className="text-xs text-pul-muted">대회 이력</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/courses/${course.id}`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
          >
            자세히 보기
          </Link>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-pul-border text-sm font-bold text-pul-muted hover:text-pul-deep"
          >
            길찾기
          </button>
          <a
            href={formatPhoneLink(course.phone)}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-pul-border text-sm font-bold text-pul-muted hover:text-pul-deep"
          >
            전화 문의
          </a>
          <Link
            href="/clubs"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-pul-light text-sm font-bold text-pul-deep hover:bg-emerald-100"
          >
            동호회 보기
          </Link>
        </div>
      </div>
    </article>
  );
}

function CourseMap({
  courses,
  selectedCourse,
  onSelect,
  className,
}: {
  courses: CourseMapItem[];
  selectedCourse: CourseMapItem;
  onSelect: (course: CourseMapItem) => void;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative h-[360px] overflow-hidden rounded-xl border border-pul-border bg-pul-light shadow-[0_4px_18px_rgba(6,78,59,0.08)] sm:h-[400px] lg:h-full lg:min-h-[820px] xl:min-h-[860px]",
        className,
      )}
    >
      <MapBackground />

      <div className="absolute left-2 right-2 top-2 z-30 rounded-full border border-pul-border/70 bg-white/92 px-3 py-1.5 text-center text-xs font-medium text-pul-muted shadow-sm backdrop-blur sm:left-3 sm:right-3 sm:top-3 sm:px-4 sm:py-2 sm:text-sm">
        지도 범위가 바뀌면 골프장이 자동으로 다시 조회됩니다.
      </div>

      <div className="absolute bottom-3 left-3 z-30 flex gap-2 rounded-full bg-white/92 px-3 py-2 text-xs font-bold shadow-sm">
        <span className="inline-flex items-center gap-1 text-pul-deep">
          <span className="h-2.5 w-2.5 rounded-full bg-pul-point" />
          실제 필드
        </span>
        <span className="inline-flex items-center gap-1 text-blue-700">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
          스크린
        </span>
      </div>

      {courses.map((course) => (
        <CourseMarker
          key={course.id}
          course={course}
          selected={selectedCourse.id === course.id}
          onSelect={() => onSelect(course)}
        />
      ))}

      <CourseMapFloatingPanel course={selectedCourse} />
    </section>
  );
}

function ResultList({
  courses,
  selectedId,
  onSelect,
}: {
  courses: CourseMapItem[];
  selectedId: string;
  onSelect: (course: CourseMapItem) => void;
}) {
  return (
    <section className="rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <div className="border-b border-pul-border/80 px-4 py-3">
        <p className="text-[11px] font-bold tracking-[0.18em] text-pul-point">
          LIVE RESULT
        </p>
        <h2 className="mt-1 text-lg font-bold text-foreground">검색 결과</h2>
      </div>

      <div className="space-y-2 p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {courses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-pul-border px-4 py-8 text-center">
            <Icon name="search" className="mx-auto h-8 w-8 text-pul-muted/50" />
            <p className="mt-2 text-sm font-semibold text-foreground">
              조건에 맞는 골프장이 없습니다.
            </p>
          </div>
        ) : (
          courses.map((course, index) => (
            <button
              key={course.id}
              type="button"
              onClick={() => onSelect(course)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors sm:p-4",
                selectedId === course.id
                  ? "border-pul-point bg-pul-light"
                  : "border-pul-border bg-white hover:border-pul-point/40 hover:bg-[#fafbfa]",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white",
                    course.type === "field" ? "bg-pul-point" : "bg-blue-600",
                  )}
                >
                  #{index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        course.type === "field"
                          ? "bg-pul-light text-pul-deep"
                          : "bg-blue-50 text-blue-700",
                      )}
                    >
                      {courseTypeLabels[course.type]}
                    </span>
                    <span className="text-xs font-semibold text-pul-muted">
                      {course.region}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold leading-snug text-foreground">
                    {course.name}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-pul-muted">
                    {course.city} · {course.holes}홀 ·{" "}
                    {operationLabels[course.operation]}
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function MobileSearchToolbar({
  keyword,
  onKeywordChange,
  onFilterToggle,
  showFilters,
  resultCount,
}: {
  keyword: string;
  onKeywordChange: (value: string) => void;
  onFilterToggle: () => void;
  showFilters: boolean;
  resultCount: number;
}) {
  return (
    <div className="rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">골프장 검색</span>
          <Icon
            name="search"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pul-point"
          />
          <input
            type="search"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="골프장명, 지역, 주소 검색"
            className="h-11 w-full rounded-lg border border-pul-border bg-[#fafbfa] pl-10 pr-3 text-sm outline-none transition-shadow focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
          />
        </label>
        <button
          type="button"
          onClick={onFilterToggle}
          className={cn(
            "inline-flex h-11 shrink-0 items-center rounded-lg px-4 text-sm font-bold transition-colors",
            showFilters
              ? "bg-pul-deep text-white"
              : "bg-pul-point text-white hover:bg-pul-deep",
          )}
        >
          필터
        </button>
      </div>
      <p className="mt-2 text-sm text-pul-muted">
        검색 결과{" "}
        <span className="font-bold text-pul-deep">{resultCount}</span>개
      </p>
    </div>
  );
}

export function CourseMapExplorer() {
  const [filters, setFilters] = useState<MapFilters>(defaultFilters);
  const [selectedId, setSelectedId] = useState(courseMapItems[0].id);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const filteredCourses = useMemo(
    () => filterCourses(courseMapItems, filters),
    [filters],
  );

  useEffect(() => {
    if (
      filteredCourses.length > 0 &&
      !filteredCourses.some((course) => course.id === selectedId)
    ) {
      setSelectedId(filteredCourses[0].id);
    }
  }, [filteredCourses, selectedId]);

  const selectedCourse =
    filteredCourses.find((course) => course.id === selectedId) ??
    filteredCourses[0] ??
    courseMapItems[0];

  const resetFilters = () => {
    setFilters(defaultFilters);
    setSelectedId(courseMapItems[0].id);
  };

  return (
    <div className="space-y-4 pb-2 lg:flex lg:h-full lg:min-h-0 lg:flex-1 lg:flex-col lg:space-y-0 lg:pb-0">
      <div className="space-y-3 lg:hidden">
        <MobileSearchToolbar
          keyword={filters.keyword}
          onKeywordChange={(keyword) => setFilters({ ...filters, keyword })}
          onFilterToggle={() => setShowMobileFilters((value) => !value)}
          showFilters={showMobileFilters}
          resultCount={filteredCourses.length}
        />
        {showMobileFilters && (
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            onReset={resetFilters}
            resultCount={filteredCourses.length}
            showSearch={false}
            onClose={() => setShowMobileFilters(false)}
          />
        )}
      </div>

      <div className="space-y-4 lg:grid lg:h-full lg:min-h-[820px] lg:flex-1 lg:grid-cols-[280px_minmax(0,1fr)_310px] lg:items-stretch lg:gap-4 lg:space-y-0 lg:[min-height:max(820px,calc(100vh-18rem))] xl:[min-height:max(860px,calc(100vh-17rem))]">
      <aside className="hidden lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden">
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onReset={resetFilters}
          resultCount={filteredCourses.length}
        />
      </aside>

      <section className="space-y-4 lg:flex lg:h-full lg:min-h-0 lg:min-w-0 lg:flex-col">
        <CourseMap
          courses={filteredCourses}
          selectedCourse={selectedCourse}
          onSelect={(course) => setSelectedId(course.id)}
          className="lg:min-h-0 lg:flex-1"
        />

        <div className="lg:hidden">
          <CourseDetailPanel course={selectedCourse} />
        </div>
      </section>

      <aside className="hidden lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden">
        <ResultList
          courses={filteredCourses}
          selectedId={selectedCourse.id}
          onSelect={(course) => setSelectedId(course.id)}
        />
      </aside>
      </div>

      <div className="lg:hidden">
        <ResultList
          courses={filteredCourses}
          selectedId={selectedCourse.id}
          onSelect={(course) => setSelectedId(course.id)}
        />
      </div>
    </div>
  );
}
