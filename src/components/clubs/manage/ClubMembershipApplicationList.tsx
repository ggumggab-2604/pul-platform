"use client";

import { ChevronRight, Inbox } from "lucide-react";

import { useClubMembershipApplicationManagement } from "@/components/clubs/manage/ClubMembershipApplicationManagementProvider";
import { cn } from "@/lib/utils";
import type { ClubMembershipApplicationStatus } from "@/lib/clubs/membershipApplicationManagement";

export const statusLabels: Record<ClubMembershipApplicationStatus, string> = {
  submitted: "접수 완료",
  reviewing: "검토 중",
  additional_info_required: "추가 정보 대기",
  interview_requested: "면담 요청",
  waitlisted: "가입 대기",
  approved: "승인 완료",
  rejected: "거절",
  withdrawn: "신청 철회",
};

const statusStyles: Record<ClubMembershipApplicationStatus, string> = {
  submitted: "bg-amber-50 text-amber-800",
  reviewing: "bg-blue-50 text-blue-800",
  additional_info_required: "bg-orange-50 text-orange-800",
  interview_requested: "bg-violet-50 text-violet-800",
  waitlisted: "bg-cyan-50 text-cyan-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-rose-50 text-rose-800",
  withdrawn: "bg-gray-100 text-gray-700",
};

const experienceLabels: Record<string, string> = {
  beginner: "입문",
  underOneYear: "1년 미만",
  oneToThreeYears: "1~3년",
  overThreeYears: "3년 이상",
};
const dayLabels: Record<string, string> = {
  weekday: "평일",
  weekend: "주말",
  both: "평일·주말",
  flexible: "협의 가능",
};
const interestLabels: Record<string, string> = {
  regularRound: "정기 라운드",
  friendlyMatch: "친선 경기",
  screenPractice: "스크린 연습",
  beginnerEducation: "초보 교육",
  clubEvent: "동호회 행사",
};

const filters: Array<{ value: ClubMembershipApplicationStatus | null; label: string }> = [
  { value: null, label: "전체" },
  { value: "submitted", label: "새 신청" },
  { value: "reviewing", label: "검토 진행" },
  { value: "additional_info_required", label: "응답 대기" },
  { value: "interview_requested", label: "면담 요청" },
  { value: "waitlisted", label: "가입 대기" },
  { value: "approved", label: "승인 완료" },
  { value: "rejected", label: "거절" },
  { value: "withdrawn", label: "철회" },
];

export function formatManagementDate(value: string, includeTime = false): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function experienceLabel(value: string) {
  return experienceLabels[value] ?? "확인 필요";
}

export function dayLabel(value: string) {
  return dayLabels[value] ?? "확인 필요";
}

export function interestLabel(value: string) {
  return interestLabels[value] ?? "확인 필요";
}

function needsAttention(status: ClubMembershipApplicationStatus) {
  if (status === "submitted") return "새 신청 확인 필요";
  if (status === "reviewing") return "검토 진행 중";
  if (status === "additional_info_required") return "신청자 응답 대기";
  if (status === "interview_requested" || status === "waitlisted") return "후속 확인 필요";
  return "처리 완료";
}

export function ClubMembershipApplicationList() {
  const management = useClubMembershipApplicationManagement();

  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)]",
        management.mobileDetailOpen && "hidden lg:block",
      )}
      aria-label="가입 신청 목록"
    >
      <div className="border-b border-pul-border p-4 lg:p-5">
        <h2 className="text-xl font-bold text-foreground">가입 신청 목록</h2>
        <p className="mt-1 text-[15px] text-pul-muted">상태를 선택해 필요한 신청을 확인하세요.</p>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="신청 상태 필터">
          {filters.map((option) => (
            <button
              key={option.value ?? "all"}
              type="button"
              onClick={() => management.setFilter(option.value)}
              aria-pressed={management.filter === option.value}
              className={cn(
                "min-h-11 shrink-0 rounded-lg border px-3 text-[15px] font-bold",
                management.filter === option.value
                  ? "border-pul-point bg-pul-point text-white"
                  : "border-pul-border bg-white text-pul-deep hover:bg-pul-light",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 lg:p-4">
        {management.listLoading ? (
          <div className="space-y-3" aria-label="가입 신청 목록을 불러오는 중">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-xl bg-pul-light/50" />
            ))}
          </div>
        ) : management.listError ? (
          <div className="rounded-xl bg-rose-50 p-5 text-center">
            <p className="font-semibold text-rose-800">{management.listError}</p>
            <button type="button" onClick={() => void management.refreshSelected()} className="mt-4 min-h-11 rounded-lg border border-rose-200 bg-white px-4 font-bold text-rose-800">
              다시 불러오기
            </button>
          </div>
        ) : management.items.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-pul-border px-5 text-center">
            <Inbox className="h-10 w-10 text-pul-muted/50" aria-hidden="true" />
            <p className="mt-3 font-bold text-foreground">해당 상태의 가입 신청이 없습니다.</p>
            <p className="mt-1 text-[15px] text-pul-muted">다른 상태 필터를 선택해 확인할 수 있습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {management.items.map((item) => (
              <button
                key={item.applicationId}
                type="button"
                onClick={() => management.selectApplication(item.applicationId)}
                aria-current={management.selectedApplicationId === item.applicationId ? "true" : undefined}
                className={cn(
                  "w-full rounded-xl border p-4 text-left transition hover:border-pul-point hover:bg-pul-light/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point",
                  management.selectedApplicationId === item.applicationId ? "border-pul-point bg-pul-light/30" : "border-pul-border bg-white",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-foreground">{item.applicantDisplayName}</p>
                    <p className="mt-1 text-sm font-semibold text-pul-muted">신청일 {formatManagementDate(item.submittedAt)}</p>
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-pul-muted" aria-hidden="true" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-md px-2.5 py-1 text-sm font-bold", statusStyles[item.status])}>{statusLabels[item.status]}</span>
                  <span className="text-sm font-semibold text-pul-deep">{needsAttention(item.status)}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><dt className="text-pul-muted">경력</dt><dd className="font-semibold text-foreground">{experienceLabel(item.experienceCode)}</dd></div>
                  <div><dt className="text-pul-muted">활동 요일</dt><dd className="font-semibold text-foreground">{dayLabel(item.availableDayCode)}</dd></div>
                  <div className="col-span-2"><dt className="text-pul-muted">희망 활동</dt><dd className="mt-0.5 line-clamp-2 font-semibold text-foreground">{item.interestCodes.map(interestLabel).join(" · ")}</dd></div>
                  <div className="col-span-2"><dt className="text-pul-muted">최근 변경</dt><dd className="font-semibold text-foreground">{formatManagementDate(item.statusChangedAt, true)}</dd></div>
                </dl>
              </button>
            ))}
            {management.hasMore ? (
              <button
                type="button"
                disabled={management.listLoadingMore}
                onClick={() => void management.loadMore()}
                className="min-h-12 w-full rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light disabled:opacity-60"
              >
                {management.listLoadingMore ? "불러오는 중..." : "더 보기"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
