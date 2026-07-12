"use client";

import { FilterChip } from "@/components/ui/FilterChip";
import { Icon } from "@/components/ui/Icon";
import {
  clubEventOperationFilters,
  clubHomeCourses,
  clubMemberStyles,
  clubProvinces,
  clubRecruitStatuses,
  clubScheduleTypes,
  getDistrictsForProvince,
} from "@/data/clubData";
import { cn } from "@/lib/utils";
import type { ParkGolfClub } from "@/types";
import { useState, type ReactNode } from "react";

export type ClubFilters = {
  province: string;
  district: string;
  homeCourse: string;
  recruitStatus: string;
  schedule: string;
  memberStyle: string;
  eventOperation: string;
  keyword: string;
};

export function createDefaultClubFilters(): ClubFilters {
  return {
    province: "전체",
    district: "전체",
    homeCourse: "all",
    recruitStatus: "all",
    schedule: "all",
    memberStyle: "all",
    eventOperation: "all",
    keyword: "",
  };
}

export function isDefaultClubFilters(filters: ClubFilters) {
  return (
    filters.province === "전체" &&
    filters.district === "전체" &&
    filters.homeCourse === "all" &&
    filters.recruitStatus === "all" &&
    filters.schedule === "all" &&
    filters.memberStyle === "all" &&
    filters.eventOperation === "all" &&
    filters.keyword.trim() === ""
  );
}

function matchesEventOperation(club: ParkGolfClub, operation: string) {
  if (operation === "all") return true;
  if (operation === "none") return club.eventStatus === "none";
  if (operation === "beginnerEvent") {
    return club.beginnerFriendly && club.eventStatus !== "none";
  }
  if (operation === "monthlyMeeting") return club.eventStatus === "monthlyMeeting";
  if (operation === "friendlyMatch") return club.eventStatus === "friendlyMatch";
  if (operation === "regularRound") return club.eventStatus === "regularRound";
  if (operation === "memberEvent") return club.eventStatus === "memberEvent";
  return true;
}

function applyNonRegionFilters(clubs: ParkGolfClub[], filters: ClubFilters) {
  const keyword = filters.keyword.trim().toLowerCase();

  return clubs.filter((club) => {
    if (filters.homeCourse !== "all" && club.homeCourse !== filters.homeCourse) {
      return false;
    }
    if (
      filters.recruitStatus !== "all" &&
      club.recruitStatus !== filters.recruitStatus
    ) {
      return false;
    }
    if (filters.schedule !== "all" && club.schedule !== filters.schedule) {
      return false;
    }
    if (
      filters.memberStyle !== "all" &&
      !club.memberStyles.includes(
        filters.memberStyle as ParkGolfClub["memberStyles"][number],
      )
    ) {
      return false;
    }
    if (!matchesEventOperation(club, filters.eventOperation)) {
      return false;
    }
    if (keyword) {
      const haystack =
        `${club.name} ${club.province} ${club.district} ${club.regionLabel} ${club.homeCourse}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

export type ClubFilterResult = {
  clubs: ParkGolfClub[];
  districtEmpty: boolean;
  provinceFallbackClubs: ParkGolfClub[];
};

export function filterClubsWithMeta(
  clubs: ParkGolfClub[],
  filters: ClubFilters,
): ClubFilterResult {
  const base = applyNonRegionFilters(clubs, filters);

  if (filters.province === "전체") {
    return { clubs: base, districtEmpty: false, provinceFallbackClubs: [] };
  }

  const byProvince = base.filter((club) => club.province === filters.province);

  if (filters.district === "전체") {
    return { clubs: byProvince, districtEmpty: false, provinceFallbackClubs: [] };
  }

  const byDistrict = byProvince.filter((club) => club.district === filters.district);

  if (byDistrict.length === 0) {
    return {
      clubs: [],
      districtEmpty: true,
      provinceFallbackClubs: byProvince,
    };
  }

  return { clubs: byDistrict, districtEmpty: false, provinceFallbackClubs: [] };
}

export function filterClubs(clubs: ParkGolfClub[], filters: ClubFilters) {
  return filterClubsWithMeta(clubs, filters).clubs;
}

type ClubSearchFilterProps = {
  filters: ClubFilters;
  onChange: (filters: ClubFilters) => void;
  onReset: () => void;
  resultCount: number;
  showSearch?: boolean;
  onClose?: () => void;
};

const selectClass =
  "h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-sm outline-none transition-shadow focus:border-pul-point focus:ring-2 focus:ring-pul-point/20";

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

function ProvinceFilterSection({
  filters,
  update,
  compact = false,
}: {
  filters: ClubFilters;
  update: (patch: Partial<ClubFilters>) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-2",
        compact
          ? "-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "flex-wrap",
      )}
    >
      {clubProvinces.map((province) => (
        <FilterChip
          key={province}
          label={province}
          size={compact ? "sm" : "md"}
          active={filters.province === province && province !== "전체"}
          onClick={() =>
            update({
              province,
              district: "전체",
            })
          }
        />
      ))}
    </div>
  );
}

function DistrictChipList({
  filters,
  update,
  compact = false,
}: {
  filters: ClubFilters;
  update: (patch: Partial<ClubFilters>) => void;
  compact?: boolean;
}) {
  const districts = getDistrictsForProvince(filters.province);

  return (
    <div
      className={cn(
        "flex gap-2",
        compact
          ? "-mx-0.5 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "flex-wrap",
      )}
      role="group"
      aria-label="기초자치단체 선택"
    >
      {districts.map((district) => (
        <FilterChip
          key={district}
          label={district}
          size={compact ? "sm" : "md"}
          active={filters.district === district}
          onClick={() => update({ district })}
        />
      ))}
    </div>
  );
}

function DistrictFilterSection({
  filters,
  update,
  compact = false,
  flat = false,
}: {
  filters: ClubFilters;
  update: (patch: Partial<ClubFilters>) => void;
  compact?: boolean;
  flat?: boolean;
}) {
  const provinceSelected = filters.province !== "전체";

  const inner = !provinceSelected ? (
    <p className="text-[11px] leading-snug text-pul-muted lg:text-sm">
      광역자치단체를 먼저 선택해주세요.
    </p>
  ) : (
    <>
      <p className="mb-1 text-[10px] font-medium text-pul-deep lg:mb-2 lg:text-xs">
        <span className="font-bold text-pul-point">{filters.province}</span>{" "}
        <span className="lg:hidden">기초자치단체</span>
        <span className="hidden lg:inline">기초자치단체를 선택하세요</span>
      </p>
      <DistrictChipList filters={filters} update={update} compact={compact} />
    </>
  );

  if (flat) return inner;

  return (
    <div
      className={cn(
        "rounded-lg border",
        compact ? "px-2 py-2" : "px-3 py-3",
        provinceSelected
          ? "border-pul-point/30 bg-white shadow-[0_1px_6px_rgba(6,78,59,0.04)]"
          : "border-dashed border-pul-border bg-[#fafbfa]",
      )}
    >
      {inner}
    </div>
  );
}

function getRegionSummary(filters: ClubFilters) {
  if (filters.province === "전체") return "전국";
  if (filters.district === "전체") return filters.province;
  return `${filters.province} > ${filters.district}`;
}

function getRecruitSummary(value: string) {
  return clubRecruitStatuses.find((item) => item.value === value)?.label ?? "전체";
}

function getScheduleSummary(value: string) {
  return clubScheduleTypes.find((item) => item.value === value)?.label ?? "전체";
}

function getMemberStyleSummary(value: string) {
  return clubMemberStyles.find((item) => item.value === value)?.label ?? "전체";
}

function getEventOperationSummary(value: string) {
  return clubEventOperationFilters.find((item) => item.value === value)?.label ?? "전체";
}

function getHomeCourseSummary(value: string) {
  return clubHomeCourses.find((item) => item.value === value)?.label ?? "전체";
}

function RegionFilterBlock({
  filters,
  update,
  compactProvince = false,
  compactDistrict = false,
}: {
  filters: ClubFilters;
  update: (patch: Partial<ClubFilters>) => void;
  compactProvince?: boolean;
  compactDistrict?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">광역자치단체</p>
        <ProvinceFilterSection
          filters={filters}
          update={update}
          compact={compactProvince}
        />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">기초자치단체</p>
        <DistrictFilterSection
          filters={filters}
          update={update}
          compact={compactDistrict}
        />
      </div>
    </div>
  );
}

export function ClubSearchFilter({
  filters,
  onChange,
  onReset,
  resultCount,
  showSearch = true,
  onClose,
}: ClubSearchFilterProps) {
  const update = (patch: Partial<ClubFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const isMobilePanel = Boolean(onClose);

  const desktopSections = (
    <>
      <RegionFilterBlock filters={filters} update={update} />

      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">활동 구장</p>
        <select
          className={selectClass}
          value={filters.homeCourse}
          onChange={(event) => update({ homeCourse: event.target.value })}
        >
          {clubHomeCourses.map((course) => (
            <option key={course.value} value={course.value}>
              {course.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">모집 상태</p>
          <select
            className={selectClass}
            value={filters.recruitStatus}
            onChange={(event) => update({ recruitStatus: event.target.value })}
          >
            {clubRecruitStatuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">활동 요일</p>
          <select
            className={selectClass}
            value={filters.schedule}
            onChange={(event) => update({ schedule: event.target.value })}
          >
            {clubScheduleTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">회원 성향</p>
          <select
            className={selectClass}
            value={filters.memberStyle}
            onChange={(event) => update({ memberStyle: event.target.value })}
          >
            {clubMemberStyles.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">행사 운영</p>
          <select
            className={selectClass}
            value={filters.eventOperation}
            onChange={(event) => update({ eventOperation: event.target.value })}
          >
            {clubEventOperationFilters.map((item) => (
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
        title="활동 구장"
        summary={getHomeCourseSummary(filters.homeCourse)}
      >
        <select
          className={selectClass}
          value={filters.homeCourse}
          onChange={(event) => update({ homeCourse: event.target.value })}
        >
          {clubHomeCourses.map((course) => (
            <option key={course.value} value={course.value}>
              {course.label}
            </option>
          ))}
        </select>
      </MobileAccordionSection>

      <MobileAccordionSection
        title="모집 상태 · 활동 요일 · 회원 성향 · 행사 운영"
        summary={`${getRecruitSummary(filters.recruitStatus)} · ${getScheduleSummary(filters.schedule)} · ${getMemberStyleSummary(filters.memberStyle)} · ${getEventOperationSummary(filters.eventOperation)}`}
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-pul-muted">모집 상태</p>
            <select
              className={selectClass}
              value={filters.recruitStatus}
              onChange={(event) => update({ recruitStatus: event.target.value })}
            >
              {clubRecruitStatuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-pul-muted">활동 요일</p>
            <select
              className={selectClass}
              value={filters.schedule}
              onChange={(event) => update({ schedule: event.target.value })}
            >
              {clubScheduleTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-pul-muted">회원 성향</p>
            <select
              className={selectClass}
              value={filters.memberStyle}
              onChange={(event) => update({ memberStyle: event.target.value })}
            >
              {clubMemberStyles.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-pul-muted">행사 운영</p>
            <select
              className={selectClass}
              value={filters.eventOperation}
              onChange={(event) => update({ eventOperation: event.target.value })}
            >
              {clubEventOperationFilters.map((item) => (
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
            CLUB FILTER
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
              placeholder="동호회명, 지역, 골프장명 검색"
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
          <span className="sr-only">동호회 검색</span>
          <Icon
            name="search"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pul-point"
          />
          <input
            type="search"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="동호회명, 지역, 골프장명 검색"
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

export { MobileSearchToolbar, MobileRegionQuickFilter };

function MobileRegionQuickFilter({
  filters,
  onChange,
}: {
  filters: ClubFilters;
  onChange: (filters: ClubFilters) => void;
}) {
  const update = (patch: Partial<ClubFilters>) => {
    onChange({ ...filters, ...patch });
  };

  return (
    <div className="rounded-lg border border-pul-border bg-white p-2 shadow-[0_1px_8px_rgba(6,78,59,0.05)] lg:hidden">
      <div>
        <p className="mb-1 text-[11px] font-semibold text-pul-muted">광역자치단체</p>
        <ProvinceFilterSection filters={filters} update={update} compact />
      </div>
      <div className="mt-2 border-t border-pul-border/60 pt-2">
        <p className="mb-1 text-[11px] font-semibold text-pul-muted">기초자치단체</p>
        <DistrictFilterSection filters={filters} update={update} compact flat />
      </div>
    </div>
  );
}
