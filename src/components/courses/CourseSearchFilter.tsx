"use client";

import { Icon } from "@/components/ui/Icon";
import {
  courseDistricts,
  courseRegions,
  holeOptions,
  reservableOptions,
} from "@/data/courseData";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

export type CourseFilters = {
  region: string;
  district: string;
  holes: string;
  reservable: string;
  keyword: string;
};

type CourseSearchFilterProps = {
  filters: CourseFilters;
  onChange: (filters: CourseFilters) => void;
  resultCount: number;
};

const selectClass =
  "h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-sm text-foreground outline-none transition-shadow focus:border-pul-point focus:ring-2 focus:ring-pul-point/20";

export function CourseSearchFilter({
  filters,
  onChange,
  resultCount,
}: CourseSearchFilterProps) {
  const [draft, setDraft] = useState(filters);

  const districtOptions = useMemo(
    () => courseDistricts[draft.region] ?? ["전체"],
    [draft.region],
  );

  const updateDraft = (patch: Partial<CourseFilters>) => {
    const next = { ...draft, ...patch };
    if (patch.region) {
      next.district = "전체";
    }
    setDraft(next);
  };

  const handleSearch = () => {
    onChange(draft);
  };

  const handleReset = () => {
    const reset: CourseFilters = {
      region: "전체",
      district: "전체",
      holes: "전체",
      reservable: "all",
      keyword: "",
    };
    setDraft(reset);
    onChange(reset);
  };

  return (
    <section className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">검색 · 필터</h2>
        <p className="text-sm text-pul-muted">
          검색 결과{" "}
          <span className="font-bold text-pul-deep">{resultCount}</span>개
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            지역
          </span>
          <select
            className={selectClass}
            value={draft.region}
            onChange={(e) => updateDraft({ region: e.target.value })}
          >
            {courseRegions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            시군구
          </span>
          <select
            className={selectClass}
            value={draft.district}
            onChange={(e) => updateDraft({ district: e.target.value })}
          >
            {districtOptions.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            홀 수
          </span>
          <select
            className={selectClass}
            value={draft.holes}
            onChange={(e) => updateDraft({ holes: e.target.value })}
          >
            {holeOptions.map((holes) => (
              <option key={holes} value={holes}>
                {holes}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            예약 가능
          </span>
          <select
            className={selectClass}
            value={draft.reservable}
            onChange={(e) => updateDraft({ reservable: e.target.value })}
          >
            {reservableOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <label className="block min-w-0 flex-1">
          <span className="sr-only">검색어</span>
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pul-point"
            />
            <input
              type="search"
              value={draft.keyword}
              onChange={(e) => updateDraft({ keyword: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="골프장명, 주소 검색"
              className={cn(selectClass, "pl-10")}
            />
          </div>
        </label>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex h-11 min-w-[96px] flex-1 items-center justify-center gap-2 rounded-lg bg-pul-point px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-pul-deep sm:flex-none"
          >
            <Icon name="search" className="h-4 w-4" />
            검색
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-pul-border bg-[#fafbfa] px-4 text-sm font-medium text-pul-muted transition-colors hover:border-pul-point/40 hover:text-pul-deep"
          >
            초기화
          </button>
        </div>
      </div>
    </section>
  );
}
