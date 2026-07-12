"use client";

import { FilterChip } from "@/components/ui/FilterChip";
import { Icon } from "@/components/ui/Icon";
import {
  lessonFormats,
  lessonRegions,
  lessonSchedules,
  lessonTargets,
  lessonTypes,
} from "@/data/lessonData";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";

export type LessonFilters = {
  type: string;
  region: string;
  format: string;
  target: string;
  schedule: string;
  keyword: string;
};

export function createDefaultLessonFilters(): LessonFilters {
  return {
    type: "all",
    region: "전체",
    format: "all",
    target: "all",
    schedule: "all",
    keyword: "",
  };
}

export function isDefaultLessonFilters(filters: LessonFilters) {
  return (
    filters.type === "all" &&
    filters.region === "전체" &&
    filters.format === "all" &&
    filters.target === "all" &&
    filters.schedule === "all" &&
    filters.keyword.trim() === ""
  );
}

type LessonSearchFilterProps = {
  filters: LessonFilters;
  onChange: (filters: LessonFilters) => void;
  onReset: () => void;
  resultCount: number;
  showSearch?: boolean;
  onClose?: () => void;
  typeOptions?: typeof lessonTypes;
  targetOptions?: typeof lessonTargets;
};

const selectClass =
  "h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-sm outline-none transition-shadow focus:border-pul-point focus:ring-2 focus:ring-pul-point/20";

function ChipRow({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function MobileAccordionSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-pul-border/60 pb-3 last:border-0 last:pb-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 py-1 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {!open && summary && (
            <p className="mt-0.5 truncate text-xs text-pul-muted">{summary}</p>
          )}
        </div>
        <span
          className={cn(
            "text-lg text-pul-muted transition-transform",
            open && "rotate-90",
          )}
        >
          ›
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function getTypeSummary(value: string, options: typeof lessonTypes) {
  return options.find((item) => item.value === value)?.label ?? "전체";
}

function getRegionSummary(value: string) {
  return lessonRegions.find((item) => item.value === value)?.label ?? "전체";
}

function getFormatSummary(value: string) {
  return lessonFormats.find((item) => item.value === value)?.label ?? "전체";
}

function getTargetSummary(value: string, options: typeof lessonTargets) {
  return options.find((item) => item.value === value)?.label ?? "전체";
}

function getScheduleSummary(value: string) {
  return lessonSchedules.find((item) => item.value === value)?.label ?? "전체";
}

export function LessonSearchFilter({
  filters,
  onChange,
  onReset,
  resultCount,
  showSearch = true,
  onClose,
  typeOptions = lessonTypes,
  targetOptions = lessonTargets,
}: LessonSearchFilterProps) {
  const update = (patch: Partial<LessonFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const isMobilePanel = Boolean(onClose);

  const desktopSections = (
    <>
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">교육 유형</p>
        <select
          className={selectClass}
          value={filters.type}
          onChange={(event) => update({ type: event.target.value })}
        >
          {typeOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">지역</p>
          <select
            className={selectClass}
            value={filters.region}
            onChange={(event) => update({ region: event.target.value })}
          >
            {lessonRegions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">교육 방식</p>
          <select
            className={selectClass}
            value={filters.format}
            onChange={(event) => update({ format: event.target.value })}
          >
            {lessonFormats.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">대상</p>
          <select
            className={selectClass}
            value={filters.target}
            onChange={(event) => update({ target: event.target.value })}
          >
            {targetOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">일정</p>
          <select
            className={selectClass}
            value={filters.schedule}
            onChange={(event) => update({ schedule: event.target.value })}
          >
            {lessonSchedules.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );

  const mobileSections = (
    <div className="max-h-[52vh] space-y-3 overflow-y-auto overscroll-contain pr-0.5">
      <MobileAccordionSection
        title="교육 방식 · 대상 · 일정"
        summary={`${getFormatSummary(filters.format)} · ${getTargetSummary(filters.target, targetOptions)} · ${getScheduleSummary(filters.schedule)}`}
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-pul-muted">교육 방식</p>
            <select
              className={selectClass}
              value={filters.format}
              onChange={(event) => update({ format: event.target.value })}
            >
              {lessonFormats.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-pul-muted">대상</p>
            <select
              className={selectClass}
              value={filters.target}
              onChange={(event) => update({ target: event.target.value })}
            >
              {targetOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-pul-muted">일정</p>
            <select
              className={selectClass}
              value={filters.schedule}
              onChange={(event) => update({ schedule: event.target.value })}
            >
              {lessonSchedules.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </MobileAccordionSection>
    </div>
  );

  return (
    <div className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] text-pul-point">
            LESSON FILTER
          </p>
          <h2 className="mt-1 text-xl font-bold text-foreground">검색 · 필터</h2>
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
          <span className="mb-1.5 block text-sm font-semibold text-foreground">
            검색어
          </span>
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pul-point"
            />
            <input
              type="search"
              value={filters.keyword}
              onChange={(event) => update({ keyword: event.target.value })}
              placeholder="강의명, 지역, 강사명, 교육기관 검색"
              className={cn(selectClass, "pl-10")}
            />
          </div>
        </label>
      )}

      <div className={cn("space-y-4", showSearch && "mt-4")}>
        {isMobilePanel ? mobileSections : desktopSections}
      </div>

      <div className="mt-4 rounded-lg bg-pul-light px-3 py-2 text-sm text-pul-deep">
        검색 결과 <span className="font-bold">{resultCount}</span>개
      </div>
    </div>
  );
}

function MobileSearchToolbar({
  keyword,
  onKeywordChange,
  onFilterToggle,
  showFilters,
  resultCount,
  regionSummary,
}: {
  keyword: string;
  onKeywordChange: (value: string) => void;
  onFilterToggle: () => void;
  showFilters: boolean;
  resultCount: number;
  regionSummary: string;
}) {
  return (
    <div className="rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:hidden">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">교육 검색</span>
          <Icon
            name="search"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pul-point"
          />
          <input
            type="search"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="강의명, 지역, 강사명, 교육기관 검색"
            className="h-11 w-full rounded-lg border border-pul-border bg-[#fafbfa] pl-10 pr-3 text-sm outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
          />
        </label>
        <button
          type="button"
          onClick={onFilterToggle}
          className={cn(
            "inline-flex h-11 shrink-0 items-center rounded-lg px-4 text-sm font-bold text-white",
            showFilters ? "bg-pul-deep" : "bg-pul-point hover:bg-pul-deep",
          )}
        >
          필터
        </button>
      </div>
      <p className="mt-1.5 text-xs text-pul-muted">
        <span className="font-medium text-pul-deep">{regionSummary}</span>
        {" · "}
        검색 결과 <span className="font-bold text-pul-deep">{resultCount}</span>개
      </p>
    </div>
  );
}

function MobileLessonQuickFilter({
  filters,
  onChange,
  typeOptions = lessonTypes,
}: {
  filters: LessonFilters;
  onChange: (filters: LessonFilters) => void;
  typeOptions?: typeof lessonTypes;
}) {
  const update = (patch: Partial<LessonFilters>) => {
    onChange({ ...filters, ...patch });
  };

  return (
    <div className="rounded-lg border border-pul-border bg-white p-2 shadow-[0_1px_8px_rgba(6,78,59,0.05)] lg:hidden">
      <div>
        <p className="mb-1 text-[11px] font-semibold text-pul-muted">교육 유형</p>
        <ChipRow>
          {typeOptions.map((item) => (
            <FilterChip
              key={item.value}
              label={item.label}
              size="sm"
              active={filters.type === item.value}
              onClick={() => update({ type: item.value })}
            />
          ))}
        </ChipRow>
      </div>
      <div className="mt-2 border-t border-pul-border/60 pt-2">
        <p className="mb-1 text-[11px] font-semibold text-pul-muted">지역</p>
        <ChipRow>
          {lessonRegions.map((item) => (
            <FilterChip
              key={item.value}
              label={item.label}
              size="sm"
              active={filters.region === item.value}
              onClick={() => update({ region: item.value })}
            />
          ))}
        </ChipRow>
      </div>
    </div>
  );
}

export { MobileSearchToolbar, MobileLessonQuickFilter };
