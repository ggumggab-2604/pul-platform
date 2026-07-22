"use client";

import { RotateCcw, Search } from "lucide-react";

import { useClubMemberManagement } from "@/components/clubs/manage/ClubMemberManagementProvider";
import {
  CLUB_MEMBER_SEARCH_MAX_LENGTH,
  clubMemberRoleFilters,
  isClubMemberRoleFilterKey,
  isClubMembershipStatus,
} from "@/lib/clubs/clubMemberManagement";

export function ClubMemberFilters() {
  const management = useClubMemberManagement();

  return (
    <section
      aria-labelledby="club-member-filter-heading"
      className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h2 id="club-member-filter-heading" className="text-xl font-bold text-foreground">
            회원 검색·필터
          </h2>
          <p className="mt-1 text-[15px] leading-6 text-pul-muted">
            표시명과 현재 회원 상태·역할을 기준으로 확인할 수 있습니다.
          </p>
        </div>
        {management.hasActiveFilters ? (
          <button
            type="button"
            onClick={management.resetFilters}
            className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg border border-pul-border bg-white px-4 text-[15px] font-bold text-pul-deep hover:bg-pul-light sm:mt-0"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            필터 초기화
          </button>
        ) : null}
      </div>

      <form onSubmit={management.submitSearch} className="mt-4" noValidate>
        <label htmlFor="club-member-search" className="text-sm font-bold text-foreground">
          표시명 검색
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            id="club-member-search"
            type="search"
            value={management.draftSearch}
            onChange={(event) => management.setDraftSearch(event.target.value)}
            maxLength={CLUB_MEMBER_SEARCH_MAX_LENGTH}
            aria-invalid={Boolean(management.searchError)}
            aria-describedby={management.searchError ? "club-member-search-error" : "club-member-search-help"}
            placeholder="회원 이름 검색"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-pul-border bg-white px-3 text-base text-foreground outline-none placeholder:text-pul-muted/70 focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
          />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pul-point px-5 text-[15px] font-bold text-white hover:bg-pul-deep"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            검색
          </button>
        </div>
        <p id="club-member-search-help" className="mt-1.5 text-sm text-pul-muted">
          검색 버튼을 누르거나 Enter 키로 적용합니다.
        </p>
        {management.searchError ? (
          <p id="club-member-search-error" role="alert" className="mt-1.5 text-sm font-semibold text-rose-700">
            {management.searchError}
          </p>
        ) : null}
      </form>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="club-member-status-filter" className="text-sm font-bold text-foreground">
            회원 상태
          </label>
          <select
            id="club-member-status-filter"
            value={management.membershipStatus ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              management.setMembershipStatus(isClubMembershipStatus(value) ? value : null);
            }}
            className="mt-1.5 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base font-semibold text-foreground outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
          >
            <option value="">전체</option>
            <option value="active">활동 중</option>
            <option value="suspended">정지</option>
            <option value="left">탈퇴</option>
          </select>
        </div>

        <div>
          <label htmlFor="club-member-role-filter" className="text-sm font-bold text-foreground">
            현재 역할
          </label>
          <select
            id="club-member-role-filter"
            value={management.roleKey ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              management.setRoleKey(isClubMemberRoleFilterKey(value) ? value : null);
            }}
            className="mt-1.5 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base font-semibold text-foreground outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
          >
            <option value="">전체 역할</option>
            {clubMemberRoleFilters.map(({ roleKey, roleName }) => (
              <option key={roleKey} value={roleKey}>{roleName}</option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
