"use client";

import { Inbox, Users } from "lucide-react";

import { useClubMemberManagement } from "@/components/clubs/manage/ClubMemberManagementProvider";
import { formatManagementDate } from "@/components/clubs/manage/ClubMembershipApplicationList";
import { cn } from "@/lib/utils";
import {
  getClubMemberDisplayName,
  type ClubMemberListItem,
  type ClubMembershipStatus,
} from "@/lib/clubs/clubMemberManagement";

const statusLabels: Record<ClubMembershipStatus, string> = {
  active: "활동 중",
  suspended: "정지",
  left: "탈퇴",
};

const statusStyles: Record<ClubMembershipStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  suspended: "border-amber-200 bg-amber-50 text-amber-800",
  left: "border-gray-200 bg-gray-100 text-gray-700",
};

function MembershipStatusBadge({ status }: { status: ClubMembershipStatus }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-sm font-bold", statusStyles[status])}>
      {statusLabels[status]}
    </span>
  );
}

function MemberRoles({ item }: { item: ClubMemberListItem }) {
  if (item.currentRoles.length === 0) {
    return <span className="text-sm font-semibold text-pul-muted">역할 없음</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.currentRoles.map((role) => (
        <span
          key={role.roleKey}
          className="inline-flex rounded-full border border-pul-point/25 bg-pul-light px-2.5 py-1 text-sm font-bold text-pul-deep"
        >
          {role.roleName}
        </span>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div aria-label="회원 목록을 불러오는 중" aria-busy="true">
      <p className="sr-only">회원 목록을 불러오는 중입니다.</p>
      <div className="space-y-3 md:hidden" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-40 animate-pulse rounded-xl bg-pul-light/50 motion-reduce:animate-none" />
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl border border-pul-border md:block" aria-hidden="true">
        <div className="h-12 bg-pul-light/50" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-20 animate-pulse border-t border-pul-border bg-white motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}

export function ClubMemberList() {
  const management = useClubMemberManagement();

  return (
    <section
      aria-labelledby="club-member-list-heading"
      className="min-w-0 rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)]"
    >
      <div className="flex flex-col gap-1 border-b border-pul-border p-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 lg:p-5">
        <div>
          <h2 id="club-member-list-heading" className="text-xl font-bold text-foreground">회원 목록</h2>
          <p className="mt-1 text-[15px] text-pul-muted">표시명, 가입일, 회원 상태와 현재 역할을 확인합니다.</p>
        </div>
        {!management.initialLoading && !management.initialError ? (
          <p className="mt-2 text-sm font-bold text-pul-deep sm:mt-0">
            현재 불러온 회원 {management.items.length}명
          </p>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">{management.liveMessage}</p>

      <div className="p-3 lg:p-4">
        {management.initialLoading ? (
          <LoadingState />
        ) : management.initialError ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-center">
            <p className="font-semibold text-rose-800">{management.initialError}</p>
            <button
              type="button"
              onClick={management.retryInitial}
              className="mt-4 min-h-11 rounded-lg border border-rose-200 bg-white px-4 font-bold text-rose-800 hover:bg-rose-100"
            >
              다시 불러오기
            </button>
          </div>
        ) : management.items.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-pul-border px-5 py-8 text-center">
            <Inbox className="h-10 w-10 text-pul-muted/50" aria-hidden="true" />
            <p className="mt-3 font-bold text-foreground">
              {management.hasActiveFilters ? "조건에 맞는 회원이 없습니다." : "등록된 회원이 없습니다."}
            </p>
            <p className="mt-1 text-[15px] leading-6 text-pul-muted">
              {management.hasActiveFilters
                ? "검색어나 필터를 변경해 다시 확인해 주세요."
                : "회원이 등록되면 이 목록에서 확인할 수 있습니다."}
            </p>
            {management.hasActiveFilters ? (
              <button
                type="button"
                onClick={management.resetFilters}
                className="mt-4 min-h-11 rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light"
              >
                필터 초기화
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {management.items.map((item) => (
                <li key={item.membershipId}>
                  <article className="rounded-xl border border-pul-border bg-white p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pul-light text-pul-deep" aria-hidden="true">
                        <Users className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-lg font-bold text-foreground">{getClubMemberDisplayName(item.displayName)}</h3>
                        <p className="mt-1 text-sm font-semibold text-pul-muted">가입일 {formatManagementDate(item.joinedAt)}</p>
                      </div>
                    </div>
                    <dl className="mt-4 grid gap-3 border-t border-pul-border pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <dt className="text-sm font-semibold text-pul-muted">회원 상태</dt>
                        <dd><MembershipStatusBadge status={item.membershipStatus} /></dd>
                      </div>
                      <div>
                        <dt className="text-sm font-semibold text-pul-muted">현재 역할</dt>
                        <dd className="mt-1.5"><MemberRoles item={item} /></dd>
                      </div>
                    </dl>
                  </article>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-hidden rounded-xl border border-pul-border md:block">
              <table className="w-full table-fixed border-collapse text-left">
                <caption className="sr-only">동호회 회원 표시명, 가입일, 회원 상태, 현재 역할 목록</caption>
                <thead className="bg-pul-light/40 text-sm font-bold text-pul-deep">
                  <tr>
                    <th scope="col" className="w-[26%] px-4 py-3">표시명</th>
                    <th scope="col" className="w-[20%] px-4 py-3">가입일</th>
                    <th scope="col" className="w-[18%] px-4 py-3">회원 상태</th>
                    <th scope="col" className="px-4 py-3">현재 역할</th>
                  </tr>
                </thead>
                <tbody>
                  {management.items.map((item) => (
                    <tr key={item.membershipId} className="border-t border-pul-border align-top">
                      <th scope="row" className="break-words px-4 py-4 text-base font-bold text-foreground">{getClubMemberDisplayName(item.displayName)}</th>
                      <td className="px-4 py-4 text-[15px] font-semibold text-pul-muted">{formatManagementDate(item.joinedAt)}</td>
                      <td className="px-4 py-4"><MembershipStatusBadge status={item.membershipStatus} /></td>
                      <td className="px-4 py-4"><MemberRoles item={item} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {management.loadMoreError ? (
              <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                <p className="font-semibold text-amber-900">{management.loadMoreError}</p>
                <button
                  type="button"
                  onClick={() => void management.loadMore()}
                  disabled={management.loadingMore}
                  className="mt-3 min-h-11 rounded-lg border border-amber-300 bg-white px-4 font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                >
                  {management.loadingMore ? "불러오는 중..." : "추가 회원 다시 불러오기"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void management.loadMore()}
                disabled={!management.hasMore || management.loadingMore}
                className="mt-4 min-h-12 w-full rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light disabled:cursor-default disabled:bg-gray-50 disabled:text-pul-muted"
              >
                {management.loadingMore
                  ? "불러오는 중..."
                  : management.hasMore
                    ? "회원 더 보기"
                    : "모든 회원을 불러왔습니다"}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
