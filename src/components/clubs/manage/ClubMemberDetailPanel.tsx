"use client";

import { ArrowLeft, Clock3, History, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";

import {
  MembershipStatusBadge,
  clubMemberStatusLabels,
} from "@/components/clubs/manage/ClubMemberList";
import { useClubMemberManagement } from "@/components/clubs/manage/ClubMemberManagementProvider";
import { formatManagementDate } from "@/components/clubs/manage/ClubMembershipApplicationList";
import { getClubMemberDisplayName } from "@/lib/clubs/clubMemberManagement";
import { cn } from "@/lib/utils";

function DetailLoadingState() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-24 animate-pulse rounded-xl bg-pul-light/50 motion-reduce:animate-none" />
      <div className="h-36 animate-pulse rounded-xl bg-pul-light/50 motion-reduce:animate-none" />
      <div className="h-28 animate-pulse rounded-xl bg-pul-light/50 motion-reduce:animate-none" />
    </div>
  );
}

function EmptyHistory({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-pul-border px-4 py-5 text-center text-[15px] text-pul-muted">
      {message}
    </p>
  );
}

export function ClubMemberDetailPanel() {
  const management = useClubMemberManagement();
  const detail = management.detail;
  const member = detail?.member;
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!management.mobileDetailOpen || !management.selectedMembershipId) return;
    const frameId = window.requestAnimationFrame(() => {
      if (headingRef.current?.isConnected) {
        headingRef.current.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [management.mobileDetailOpen, management.selectedMembershipId]);

  return (
    <section
      aria-labelledby="club-member-detail-heading"
      className={cn(
        "min-w-0 rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)] xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto",
        management.mobileDetailOpen ? "block" : "hidden md:block",
      )}
    >
      <div className="border-b border-pul-border p-4 lg:p-5">
        {management.mobileDetailOpen ? (
          <button
            type="button"
            onClick={management.closeMobileDetail}
            className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-pul-border bg-white px-3 text-[15px] font-bold text-pul-deep hover:bg-pul-light md:hidden"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            회원 목록으로 돌아가기
          </button>
        ) : null}
        <h2
          id="club-member-detail-heading"
          ref={headingRef}
          tabIndex={-1}
          className="break-words text-xl font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-pul-point focus-visible:ring-offset-2"
        >
          {member ? `${getClubMemberDisplayName(member.displayName)} 회원 상세` : "회원 상세"}
        </h2>
        <p className="mt-1 text-[15px] leading-6 text-pul-muted">
          현재 회원 상태와 역할 정보를 확인합니다.
        </p>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {management.detailLiveMessage}
      </p>

      <div className="p-4 lg:p-5">
        {!management.selectedMembershipId ? (
          <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-dashed border-pul-border px-5 py-8 text-center">
            <UserRound className="h-10 w-10 text-pul-muted/50" aria-hidden="true" />
            <p className="mt-3 font-bold text-foreground">
              회원을 선택하면 상세 정보를 확인할 수 있습니다.
            </p>
          </div>
        ) : management.detailLoading ? (
          <DetailLoadingState />
        ) : management.detailError ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-center">
            <p className="font-semibold text-rose-800">{management.detailError}</p>
            <p className="mt-1 text-sm text-rose-700">다시 시도해 주세요.</p>
            <div className="mt-4">
              <button
                type="button"
                onClick={management.retryDetail}
                className="min-h-11 w-full rounded-lg border border-rose-200 bg-white px-4 font-bold text-rose-800 hover:bg-rose-100"
              >
                다시 불러오기
              </button>
            </div>
          </div>
        ) : detail && member ? (
          <div className="space-y-5">
            <section aria-labelledby="club-member-current-summary-heading">
              <h3 id="club-member-current-summary-heading" className="flex items-center gap-2 text-lg font-bold text-foreground">
                <ShieldCheck className="h-5 w-5 text-pul-point" aria-hidden="true" />
                현재 회원 요약
              </h3>
              <dl className="mt-3 grid gap-3 rounded-xl bg-pul-light/30 p-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-pul-muted">표시명</dt>
                  <dd className="mt-1 break-words font-bold text-foreground">
                    {getClubMemberDisplayName(member.displayName)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-pul-muted">현재 회원 상태</dt>
                  <dd className="mt-1"><MembershipStatusBadge status={member.membershipStatus} /></dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-pul-muted">가입일</dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    {formatManagementDate(member.joinedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-pul-muted">현재 상태 변경일</dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    {formatManagementDate(member.statusChangedAt, true)}
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="club-member-current-roles-heading">
              <h3 id="club-member-current-roles-heading" className="text-lg font-bold text-foreground">
                현재 역할
              </h3>
              {member.currentRoles.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-pul-border px-4 py-5 text-center text-[15px] text-pul-muted">
                  역할 없음
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {member.currentRoles.map((role) => (
                    <li
                      key={role.roleKey}
                      className="flex flex-col gap-1 rounded-lg border border-pul-border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <span className="inline-flex w-fit rounded-full border border-pul-point/25 bg-pul-light px-2.5 py-1 text-sm font-bold text-pul-deep">
                        {role.roleName}
                      </span>
                      <span className="text-sm font-semibold text-pul-muted">
                        역할 시작일 {formatManagementDate(role.assignedAt, true)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {detail.historyScope === "limited_history" ? (
              <>
                <section aria-labelledby="club-member-status-history-heading">
                  <h3 id="club-member-status-history-heading" className="flex items-center gap-2 text-lg font-bold text-foreground">
                    <History className="h-5 w-5 text-pul-point" aria-hidden="true" />
                    상태 변경 이력
                  </h3>
                  {detail.statusHistory.length === 0 ? (
                    <div className="mt-3">
                      <EmptyHistory message="표시할 상태 변경 이력이 없습니다." />
                    </div>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {detail.statusHistory.map((item, index) => (
                        <li
                          key={`${item.occurredAt}:${index}`}
                          className="rounded-lg border border-pul-border p-3"
                        >
                          <p className="break-words font-bold text-foreground">
                            {item.fromStatus === null && item.toStatus === "active"
                              ? "회원 가입"
                              : `${item.fromStatus ? clubMemberStatusLabels[item.fromStatus] : "이전 상태 없음"} → ${clubMemberStatusLabels[item.toStatus]}`}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-pul-muted">
                            <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {formatManagementDate(item.occurredAt, true)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {detail.historyMeta.statusHistoryTruncated ? (
                    <p className="mt-2 text-sm font-semibold text-pul-muted">
                      최근 상태 변경 이력 50건만 표시합니다.
                    </p>
                  ) : null}
                </section>

                <section aria-labelledby="club-member-role-history-heading">
                  <h3 id="club-member-role-history-heading" className="flex items-center gap-2 text-lg font-bold text-foreground">
                    <History className="h-5 w-5 text-pul-point" aria-hidden="true" />
                    역할 변경 이력
                  </h3>
                  {detail.roleHistory.length === 0 ? (
                    <div className="mt-3">
                      <EmptyHistory message="표시할 역할 변경 이력이 없습니다." />
                    </div>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {detail.roleHistory.map((item, index) => (
                        <li
                          key={`${item.roleKey}:${item.occurredAt}:${index}`}
                          className="rounded-lg border border-pul-border p-3"
                        >
                          <p className="break-words font-bold text-foreground">
                            {item.roleName} 역할 {item.event === "granted" ? "부여" : "회수"}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-pul-muted">
                            <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {formatManagementDate(item.occurredAt, true)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {detail.historyMeta.roleHistoryTruncated ? (
                    <p className="mt-2 text-sm font-semibold text-pul-muted">
                      최근 역할 변경 이력 50건만 표시합니다.
                    </p>
                  ) : null}
                </section>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
