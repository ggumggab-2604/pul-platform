"use client";

import { ArrowLeft, ClipboardList, LockKeyhole, MessageSquareText, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";

import { ClubMembershipApplicationActions } from "@/components/clubs/manage/ClubMembershipApplicationActions";
import {
  dayLabel,
  experienceLabel,
  formatManagementDate,
  interestLabel,
  statusLabels,
} from "@/components/clubs/manage/ClubMembershipApplicationList";
import { useClubMembershipApplicationManagement } from "@/components/clubs/manage/ClubMembershipApplicationManagementProvider";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const eventLabels: Record<string, string> = {
  "application.submitted": "신청자가 가입 신청을 제출했습니다.",
  "application.review_started": "운영진이 검토를 시작했습니다.",
  "application.additional_info_requested": "운영진이 추가 정보를 요청했습니다.",
  "application.supplement_submitted": "신청자가 보완 답변을 제출했습니다.",
  "application.interview_requested": "운영진이 면담 요청 상태로 변경했습니다.",
  "application.waitlisted": "운영진이 가입 대기로 변경했습니다.",
  "application.review_resumed": "운영진이 검토를 재개했습니다.",
  "application.withdrawn": "신청자가 신청을 철회했습니다.",
  "application.approved": "회장 또는 부회장이 가입 신청을 승인했습니다.",
  "application.rejected": "회장 또는 부회장이 가입 신청을 거절했습니다.",
};

const recruitmentLabels: Record<string, string> = {
  recruiting: "회원 모집 중",
  waiting: "대기 신청",
  closed: "모집 마감",
};

function DetailLoading() {
  return (
    <div className="space-y-4" aria-label="가입 신청 상세를 불러오는 중">
      {[0, 1, 2].map((item) => <div key={item} className="h-40 animate-pulse rounded-xl bg-pul-light/50" />)}
    </div>
  );
}

function InternalNotes() {
  const management = useClubMembershipApplicationManagement();
  const [body, setBody] = useState("");
  const notes = management.detailBundle?.internalNotes ?? [];
  const locked = Boolean(management.mutationKey);

  const submit = async () => {
    const succeeded = await management.addInternalNote(body);
    if (succeeded) setBody("");
  };

  return (
    <Card title="운영진 내부 메모">
      <div className="rounded-lg bg-amber-50 p-3 text-[15px] font-bold text-amber-900">
        <LockKeyhole className="mr-2 inline h-4 w-4" aria-hidden="true" />
        이 메모는 신청자에게 공개되지 않습니다.
      </div>
      {notes.length ? (
        <ol className="mt-4 space-y-3">
          {notes.map((note) => (
            <li key={note.noteId} className="rounded-lg border border-pul-border bg-gray-50 p-3">
              <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">{note.body}</p>
              <p className="mt-2 text-sm text-pul-muted">{formatManagementDate(note.createdAt, true)}</p>
            </li>
          ))}
        </ol>
      ) : <p className="mt-4 text-[15px] text-pul-muted">등록된 내부 메모가 없습니다.</p>}
      {management.permissions.canManage ? (
        <div className="mt-4 border-t border-pul-border pt-4">
          <label htmlFor="internal-note" className="font-bold text-foreground">내부 메모 추가</label>
          <textarea
            id="internal-note"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            maxLength={1000}
            className="mt-2 w-full rounded-lg border border-pul-border p-3 text-base outline-none focus:border-pul-point"
          />
          <div className="mt-1 flex justify-end text-sm text-pul-muted">{body.length}/1000</div>
          <button type="button" disabled={locked} onClick={() => void submit()} className="mt-2 min-h-12 w-full rounded-lg bg-pul-deep px-4 font-bold text-white disabled:opacity-55">
            {management.mutationKey === "internalNote" ? "저장 중..." : "내부 메모 저장"}
          </button>
        </div>
      ) : null}
    </Card>
  );
}

export function ClubMembershipApplicationDetail() {
  const management = useClubMembershipApplicationManagement();
  const bundle = management.detailBundle;
  const detailFocusRef = useRef<HTMLElement>(null);
  const latestApplicantResponse = bundle?.supplements.filter((entry) => entry.entryType === "applicant_response").at(-1);

  return (
    <section
      ref={detailFocusRef}
      className={cn("min-w-0", !management.mobileDetailOpen && "hidden lg:block")}
      aria-label="가입 신청 상세"
      data-membership-application-detail-focus
      tabIndex={-1}
    >
      <button type="button" onClick={management.closeMobileDetail} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep lg:hidden">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />신청 목록으로
      </button>

      {!management.selectedApplicationId ? (
        <div className="hidden min-h-[520px] flex-col items-center justify-center rounded-xl border border-dashed border-pul-border bg-white p-8 text-center lg:flex">
          <ClipboardList className="h-12 w-12 text-pul-muted/45" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-bold text-foreground">확인할 신청을 선택해 주세요.</h2>
          <p className="mt-2 text-[15px] text-pul-muted">왼쪽 목록에서 신청자를 선택하면 상세 내용과 처리 이력이 표시됩니다.</p>
        </div>
      ) : management.detailLoading ? <DetailLoading /> : management.detailError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-center">
          <p className="font-semibold text-rose-800">{management.detailError}</p>
          <button type="button" onClick={() => void management.refreshSelected()} className="mt-4 min-h-11 rounded-lg border border-rose-200 bg-white px-4 font-bold text-rose-800">다시 불러오기</button>
        </div>
      ) : bundle ? (
        <div className="space-y-4 pb-28 lg:pb-12">
          {(management.successMessage || management.mutationError) ? (
            <div role="status" className={cn("rounded-lg border p-4 font-semibold", management.mutationError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
              {management.mutationError ?? management.successMessage}
            </div>
          ) : null}

          <Card
            title="신청 상세"
            action={<button type="button" onClick={() => void management.refreshSelected()} disabled={management.detailLoading || Boolean(management.mutationKey)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-pul-border px-3 font-bold text-pul-deep disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />새로고침</button>}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xl font-bold text-foreground">{bundle.detail.applicantDisplayName}</h3>
              <span className="rounded-md bg-pul-light px-3 py-1.5 font-bold text-pul-deep">{statusLabels[bundle.detail.status]}</span>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div><dt className="text-sm font-semibold text-pul-muted">신청일</dt><dd className="mt-1 font-bold text-foreground">{formatManagementDate(bundle.detail.submittedAt, true)}</dd></div>
              <div><dt className="text-sm font-semibold text-pul-muted">최근 상태 변경</dt><dd className="mt-1 font-bold text-foreground">{formatManagementDate(bundle.detail.statusChangedAt, true)}</dd></div>
              <div><dt className="text-sm font-semibold text-pul-muted">모집 상태 스냅샷</dt><dd className="mt-1 font-bold text-foreground">{recruitmentLabels[bundle.detail.recruitmentStatusAtSubmission] ?? "확인 필요"}</dd></div>
              <div><dt className="text-sm font-semibold text-pul-muted">파크골프 경력</dt><dd className="mt-1 font-bold text-foreground">{experienceLabel(bundle.detail.experienceCode)}</dd></div>
              <div><dt className="text-sm font-semibold text-pul-muted">활동 가능 요일</dt><dd className="mt-1 font-bold text-foreground">{dayLabel(bundle.detail.availableDayCode)}</dd></div>
              <div><dt className="text-sm font-semibold text-pul-muted">희망 활동</dt><dd className="mt-1 font-bold text-foreground">{bundle.detail.interestCodes.map(interestLabel).join(" · ")}</dd></div>
              <div><dt className="text-sm font-semibold text-pul-muted">운영 기준 확인</dt><dd className="mt-1 font-bold text-foreground">{formatManagementDate(bundle.detail.guidelinesConfirmedAt, true)}</dd></div>
              {bundle.detail.finalizedAt ? <div><dt className="text-sm font-semibold text-pul-muted">처리 완료</dt><dd className="mt-1 font-bold text-foreground">{formatManagementDate(bundle.detail.finalizedAt, true)}</dd></div> : null}
            </dl>
            <div className="mt-5 space-y-4 border-t border-pul-border pt-5">
              <div><h4 className="font-bold text-foreground">가입 신청 이유</h4><p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-4 text-[15px] leading-7">{bundle.detail.applicationReason}</p></div>
              <div><h4 className="font-bold text-foreground">운영진에게 전한 내용</h4><p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-4 text-[15px] leading-7">{bundle.detail.message || "전달된 내용이 없습니다."}</p></div>
            </div>
          </Card>

          {bundle.detail.status === "additional_info_required" && latestApplicantResponse ? (
            <div className="rounded-xl border-2 border-pul-point bg-pul-light/40 p-5">
              <h2 className="text-lg font-bold text-pul-deep">최근 신청자 답변</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">{latestApplicantResponse.body}</p>
              <p className="mt-2 text-sm text-pul-muted">{formatManagementDate(latestApplicantResponse.createdAt, true)}</p>
            </div>
          ) : null}

          <Card title="신청자와 주고받은 내용">
            {bundle.supplements.length ? (
              <ol className="space-y-3">
                {bundle.supplements.map((entry) => (
                  <li key={entry.supplementId} className={cn("rounded-lg border p-4", entry.entryType === "applicant_response" ? "border-pul-border bg-pul-light/25" : "border-blue-100 bg-blue-50/60")}>
                    <p className="font-bold text-pul-deep">{entry.entryType === "applicant_response" ? "신청자 답변" : "운영진 요청"}</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">{entry.body}</p>
                    <p className="mt-2 text-sm text-pul-muted">{formatManagementDate(entry.createdAt, true)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center text-center text-pul-muted"><MessageSquareText className="h-8 w-8 opacity-45" aria-hidden="true" /><p className="mt-2">주고받은 추가 내용이 없습니다.</p></div>
            )}
          </Card>

          <Card title="처리 이력">
            <ol className="space-y-4 border-l-2 border-pul-border pl-4">
              {bundle.history.map((entry) => (
                <li key={entry.historyId} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full bg-pul-point" aria-hidden="true" />
                  <p className="font-semibold text-foreground">{eventLabels[entry.eventCode] ?? "가입 신청 상태가 변경되었습니다."}</p>
                  <p className="mt-1 text-sm text-pul-muted">{formatManagementDate(entry.createdAt, true)}</p>
                </li>
              ))}
            </ol>
          </Card>

          <InternalNotes />
          <ClubMembershipApplicationActions
            key={bundle.detail.applicationId}
            successFocusRef={detailFocusRef}
          />
        </div>
      ) : null}
    </section>
  );
}
