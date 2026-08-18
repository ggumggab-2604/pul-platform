"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { withdrawHallOfFameDisputeAction } from "@/app/hall-of-fame/actions";
import { HallOfFameDialog } from "@/components/hall-of-fame/HallOfFameDialog";
import { createClient } from "@/lib/supabase/client";
import {
  getMyHallOfFameDispute,
  HALL_OF_FAME_DISPUTE_CATEGORY_OPTIONS,
  HALL_OF_FAME_DISPUTE_STATUS_LABELS,
  HALL_OF_FAME_DISPUTE_TYPE_LABELS,
  HALL_OF_FAME_RESOLUTION_OUTCOME_LABELS,
  toHallOfFameMemberUiError,
  type MyHallOfFameDispute,
} from "@/lib/hall-of-fame/hallOfFameMemberUi";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function categoryLabel(dispute: MyHallOfFameDispute) {
  return (
    HALL_OF_FAME_DISPUTE_CATEGORY_OPTIONS[dispute.disputeType].find(
      (option) => option.value === dispute.category,
    )?.label ?? "요청 사유"
  );
}

export function HallOfFameRequestDetailDialog({
  request,
  returnFocus,
  onClose,
  onSuccess,
}: {
  request: MyHallOfFameDispute;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [detail, setDetail] = useState<MyHallOfFameDispute>();
  const [loadError, setLoadError] = useState<string>();
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const [mutationError, setMutationError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const withdrawalTriggerRef = useRef<HTMLButtonElement>(null);
  const withdrawalKeepRef = useRef<HTMLButtonElement>(null);
  const restoreWithdrawalFocus = useRef(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void getMyHallOfFameDispute(supabase, request.disputeId)
      .then((result) => {
        if (!active) return;
        if (!result || result.disputeId !== request.disputeId) {
          setLoadError("요청 상세를 찾을 수 없습니다.");
          return;
        }
        setDetail(result);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(toHallOfFameMemberUiError(error).userMessage);
      });
    return () => {
      active = false;
    };
  }, [request.disputeId]);

  useEffect(() => {
    const target = confirmWithdrawal
      ? withdrawalKeepRef.current
      : restoreWithdrawalFocus.current
        ? withdrawalTriggerRef.current
        : null;
    restoreWithdrawalFocus.current = false;
    if (!target) return;

    const focusFrame = window.requestAnimationFrame(() => {
      if (target.isConnected) target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [confirmWithdrawal]);

  const withdraw = () => {
    if (!detail || !["open", "under_review"].includes(detail.status)) return;
    setMutationError(undefined);
    startTransition(async () => {
      const result = await withdrawHallOfFameDisputeAction({
        disputeId: detail.disputeId,
        expectedVersion: detail.version,
      });
      if (!result.ok) {
        setMutationError(result.message);
        return;
      }
      onSuccess(result.message);
    });
  };

  return (
    <HallOfFameDialog
      title="내 요청 상세"
      description="접수한 내용과 운영자 처리 결과를 확인합니다."
      busy={pending}
      onClose={onClose}
      returnFocus={returnFocus}
    >
      {!detail && !loadError ? (
        <div className="py-12 text-center" aria-live="polite">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-pul-border border-t-pul-point" />
          <p className="mt-3 text-base font-semibold text-pul-muted">요청을 불러오는 중입니다.</p>
        </div>
      ) : null}

      {loadError ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-base text-rose-800">
          {loadError}
        </div>
      ) : null}

      {detail ? (
        <div className="space-y-5">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-pul-light/35 p-4">
              <dt className="text-sm font-semibold text-pul-muted">요청 종류</dt>
              <dd className="mt-1 text-base font-bold text-pul-deep">
                {HALL_OF_FAME_DISPUTE_TYPE_LABELS[detail.disputeType]}
              </dd>
            </div>
            <div className="rounded-xl bg-pul-light/35 p-4">
              <dt className="text-sm font-semibold text-pul-muted">현재 상태</dt>
              <dd className="mt-1 text-base font-bold text-pul-deep">
                {HALL_OF_FAME_DISPUTE_STATUS_LABELS[detail.status]}
              </dd>
            </div>
            <div className="rounded-xl bg-pul-light/35 p-4 sm:col-span-2">
              <dt className="text-sm font-semibold text-pul-muted">요청 사유</dt>
              <dd className="mt-1 text-base font-bold text-foreground">
                {categoryLabel(detail)}
              </dd>
            </div>
          </dl>

          <section aria-labelledby="hall-of-fame-request-statement-title">
            <h3 id="hall-of-fame-request-statement-title" className="text-lg font-bold text-foreground">
              접수한 내용
            </h3>
            <p className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-pul-border bg-white p-4 text-base leading-7 text-foreground">
              {detail.statement}
            </p>
            <p className="mt-2 text-sm text-pul-muted">
              접수일 {formatTimestamp(detail.createdAt)}
            </p>
          </section>

          {detail.status === "resolved" ? (
            <section
              aria-labelledby="hall-of-fame-request-resolution-title"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"
            >
              <h3 id="hall-of-fame-request-resolution-title" className="text-lg font-bold text-emerald-950">
                처리 결과
              </h3>
              <p className="mt-2 font-bold text-emerald-900">
                {detail.resolutionOutcome
                  ? HALL_OF_FAME_RESOLUTION_OUTCOME_LABELS[detail.resolutionOutcome] ??
                    "처리 완료"
                  : "처리 완료"}
              </p>
              {detail.resolutionMessage ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-emerald-950">
                  {detail.resolutionMessage}
                </p>
              ) : null}
              {detail.resolvedAt ? (
                <p className="mt-2 text-sm text-emerald-800">
                  처리일 {formatTimestamp(detail.resolvedAt)}
                </p>
              ) : null}
            </section>
          ) : null}

          {mutationError ? (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[15px] font-semibold text-rose-800">
              {mutationError}
            </p>
          ) : null}

          {["open", "under_review"].includes(detail.status) ? (
            <div className="border-t border-pul-border pt-4">
              {confirmWithdrawal ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-bold text-amber-950">이 요청을 취소하시겠습니까?</p>
                  <p className="mt-1 text-[15px] leading-6 text-amber-900">
                    취소한 요청은 다시 처리 중 상태로 되돌릴 수 없습니다.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      ref={withdrawalKeepRef}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        restoreWithdrawalFocus.current = true;
                        setConfirmWithdrawal(false);
                      }}
                      className="min-h-12 rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep disabled:opacity-50"
                    >
                      계속 유지
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={withdraw}
                      className="min-h-12 rounded-xl bg-rose-700 px-4 font-bold text-white disabled:opacity-50"
                    >
                      {pending ? "취소 중..." : "요청 취소 확인"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  ref={withdrawalTriggerRef}
                  type="button"
                  onClick={() => setConfirmWithdrawal(true)}
                  className="min-h-12 w-full rounded-xl border border-rose-300 bg-white px-4 text-base font-bold text-rose-800 hover:bg-rose-50"
                >
                  요청 취소
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </HallOfFameDialog>
  );
}
