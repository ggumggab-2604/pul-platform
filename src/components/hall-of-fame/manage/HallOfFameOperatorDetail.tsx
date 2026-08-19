"use client";

import { ArrowLeft, FileSearch2, ShieldAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import { HallOfFameOperatorActions } from "@/components/hall-of-fame/manage/HallOfFameOperatorActions";
import { useHallOfFameOperatorManagement } from "@/components/hall-of-fame/manage/HallOfFameOperatorProvider";
import {
  HALL_OF_FAME_OPERATOR_OUTCOME_LABELS,
  HALL_OF_FAME_OPERATOR_STATUS_LABELS,
} from "@/lib/hall-of-fame/hallOfFameOperatorUi";
import { HALL_OF_FAME_DISPUTE_TYPE_LABELS } from "@/lib/hall-of-fame/hallOfFameMemberUi";

const categoryLabels: Readonly<Record<string, string>> = {
  factual_error: "사실 정보 오류",
  wrong_record_type: "기록 유형 오류",
  administrative_error: "운영 처리 오류",
  evidence_clarification: "증빙 확인 요청",
  decision_error: "결정 오류",
  overlooked_evidence: "증빙 누락",
  procedural_error: "절차 오류",
  other: "기타",
  wrong_subject: "대상 회원 오류",
  false_record: "허위 기록",
  invalid_evidence: "무효 증빙",
  duplicate: "중복 기록",
  impersonation: "명의 도용",
};

const reviewKindLabels: Readonly<Record<string, string>> = {
  review_started: "검토 시작",
  internal_note: "내부 메모",
  resolution: "최종 처리",
  correction: "기록 정정",
  revoke: "기록 무효화",
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

export function HallOfFameOperatorDetail() {
  const {
    selectedDisputeId,
    mobileDetailOpen,
    closeMobileDetail,
    detail,
    notes,
    detailLoading,
    detailError,
    successMessage,
    mutationError,
  } = useHallOfFameOperatorManagement();
  const statusFocusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!successMessage) return;
    const frame = window.requestAnimationFrame(() => {
      statusFocusRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [successMessage]);

  return (
    <section
      aria-labelledby="hall-of-fame-operator-detail-title"
      className={`${
        mobileDetailOpen ? "fixed inset-0 z-50 block overflow-y-auto" : "hidden"
      } min-w-0 bg-pul-page p-3 lg:static lg:z-auto lg:block lg:overflow-visible lg:bg-transparent lg:p-0`}
    >
      <div className="min-h-full rounded-2xl border border-pul-border bg-white p-4 shadow-[0_3px_18px_rgba(6,78,59,0.07)] sm:p-6 lg:min-h-[32rem]">
        <button
          type="button"
          onClick={closeMobileDetail}
          className="mb-4 inline-flex min-h-12 items-center gap-2 rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep lg:hidden"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" /> 목록으로
        </button>

        {!selectedDisputeId ? (
          <div className="flex min-h-[28rem] flex-col items-center justify-center text-center">
            <FileSearch2 className="h-12 w-12 text-pul-muted" aria-hidden="true" />
            <h2 id="hall-of-fame-operator-detail-title" className="mt-4 text-xl font-bold text-foreground">
              처리할 요청을 선택해 주세요.
            </h2>
            <p className="mt-2 max-w-md text-base leading-7 text-pul-muted">
              목록에서 요청을 선택하면 제출 내용과 운영 이력을 확인할 수 있습니다.
            </p>
          </div>
        ) : detailLoading ? (
          <div role="status" className="flex min-h-[28rem] items-center justify-center font-bold text-pul-muted">
            요청 상세를 불러오는 중입니다.
          </div>
        ) : detailError || !detail ? (
          <div role="alert" className="flex min-h-[28rem] flex-col items-center justify-center text-center text-red-800">
            <ShieldAlert className="h-10 w-10" aria-hidden="true" />
            <h2 id="hall-of-fame-operator-detail-title" className="mt-3 text-xl font-bold">
              상세 내용을 불러올 수 없습니다.
            </h2>
            <p className="mt-2">{detailError ?? "목록에서 다시 선택해 주세요."}</p>
          </div>
        ) : (
          <div>
            <div
              ref={statusFocusRef}
              tabIndex={-1}
              className="rounded-xl border border-pul-border bg-pul-page/45 p-4 outline-none focus:ring-2 focus:ring-pul-point"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-pul-point">회원 요청 상세</p>
                  <h2 id="hall-of-fame-operator-detail-title" className="mt-1 text-2xl font-bold text-foreground">
                    {HALL_OF_FAME_DISPUTE_TYPE_LABELS[detail.disputeType]}
                  </h2>
                </div>
                <span className="rounded-full bg-white px-3 py-1.5 text-sm font-bold text-pul-deep ring-1 ring-pul-border">
                  {HALL_OF_FAME_OPERATOR_STATUS_LABELS[detail.status]}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="font-bold text-pul-muted">요청자</dt><dd className="mt-1 font-semibold text-foreground">요청 회원</dd></div>
                <div><dt className="font-bold text-pul-muted">요청 사유</dt><dd className="mt-1 font-semibold text-foreground">{categoryLabels[detail.category] ?? "기타"}</dd></div>
                <div><dt className="font-bold text-pul-muted">대상</dt><dd className="mt-1 font-semibold text-foreground">{detail.targetKind === "canonical_record" ? "승인된 명예 기록" : "명예의 전당 신청 기록"}</dd></div>
                <div><dt className="font-bold text-pul-muted">접수 일시</dt><dd className="mt-1 font-semibold text-foreground">{formatTimestamp(detail.createdAt)}</dd></div>
                <div><dt className="font-bold text-pul-muted">최근 변경</dt><dd className="mt-1 font-semibold text-foreground">{formatTimestamp(detail.updatedAt)}</dd></div>
              </dl>
            </div>

            {successMessage ? (
              <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-900">
                {successMessage}
              </p>
            ) : null}
            {mutationError ? (
              <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">
                {mutationError}
              </p>
            ) : null}

            <section aria-labelledby="hall-of-fame-dispute-statement-title" className="mt-5">
              <h3 id="hall-of-fame-dispute-statement-title" className="text-lg font-bold text-foreground">
                회원 요청 내용
              </h3>
              <p className="mt-2 whitespace-pre-wrap rounded-xl border border-pul-border bg-white p-4 text-base leading-7 text-foreground">
                {detail.statement}
              </p>
            </section>

            {detail.resolutionOutcome ? (
              <section aria-labelledby="hall-of-fame-resolution-title" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <h3 id="hall-of-fame-resolution-title" className="font-bold text-emerald-950">처리 결과</h3>
                <p className="mt-2 font-bold text-emerald-900">
                  {HALL_OF_FAME_OPERATOR_OUTCOME_LABELS[detail.resolutionOutcome]}
                </p>
                {detail.resolutionMessage ? <p className="mt-2 whitespace-pre-wrap leading-7 text-emerald-950">{detail.resolutionMessage}</p> : null}
              </section>
            ) : null}

            <section aria-labelledby="hall-of-fame-internal-notes-title" className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="hall-of-fame-internal-notes-title" className="text-lg font-bold text-foreground">운영자 내부 이력</h3>
                <span className="text-sm font-bold text-pul-muted">회원에게 비공개</span>
              </div>
              {notes.length === 0 ? (
                <p className="mt-2 rounded-xl bg-pul-page p-4 text-pul-muted">아직 기록된 운영 이력이 없습니다.</p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {notes.map((note) => (
                    <li key={note.reviewId} className="rounded-xl border border-pul-border bg-pul-page/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-pul-deep">{reviewKindLabels[note.reviewKind] ?? "운영 기록"}</span>
                        <time className="text-xs font-medium text-pul-muted">{formatTimestamp(note.createdAt)}</time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{note.note}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <div className="mt-6 border-t border-pul-border pt-5">
              <HallOfFameOperatorActions />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
