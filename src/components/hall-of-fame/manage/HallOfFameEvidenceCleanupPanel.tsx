"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import { CheckCircle2, FileWarning, RefreshCw, Trash2 } from "lucide-react";

import {
  cleanupHallOfFameEvidenceAction,
  type HallOfFameEvidenceCleanupActionResult,
} from "@/app/hall-of-fame/manage/evidence-cleanup/actions";
import { HallOfFameDialog } from "@/components/hall-of-fame/HallOfFameDialog";
import type {
  HallOfFameEvidenceCleanupCandidate,
  HallOfFameEvidenceCleanupStatus,
} from "@/lib/hall-of-fame/hallOfFameEvidenceStorage";

const statusLabels: Readonly<Record<HallOfFameEvidenceCleanupStatus, string>> = {
  pending_upload: "업로드 기한 만료",
  failed: "업로드 실패",
  expired: "만료됨",
  replaced: "교체됨",
  deleted: "삭제 처리됨",
};

type DialogState = {
  candidate: HallOfFameEvidenceCleanupCandidate;
  trigger: HTMLButtonElement;
  expireRequestId: string;
  storageRequestId: string;
};

export function HallOfFameEvidenceCleanupPanel({
  candidates,
}: {
  candidates: HallOfFameEvidenceCleanupCandidate[];
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [result, setResult] = useState<HallOfFameEvidenceCleanupActionResult>();
  const [isPending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!result || dialog) return;
    let secondFrame: number | undefined;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (resultRef.current?.isConnected) {
          resultRef.current.focus({ preventScroll: true });
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
    };
  }, [dialog, result]);

  const openDialog = (
    candidate: HallOfFameEvidenceCleanupCandidate,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    setResult(undefined);
    setDialog({
      candidate,
      trigger: event.currentTarget,
      expireRequestId: crypto.randomUUID(),
      storageRequestId: crypto.randomUUID(),
    });
  };

  const submit = () => {
    if (!dialog || submittingRef.current) return;
    submittingRef.current = true;
    const request = dialog;
    startTransition(async () => {
      try {
        const nextResult = await cleanupHallOfFameEvidenceAction({
          evidenceId: request.candidate.evidenceId,
          expectedEvidenceVersion: request.candidate.evidenceVersion,
          expectedBatchVersion: request.candidate.batchVersion,
          expireRequestId: request.expireRequestId,
          storageRequestId: request.storageRequestId,
        });
        setResult(nextResult);
        setDialog(null);
      } catch {
        setResult({
          ok: false,
          message: "서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
          shouldRefresh: true,
        });
        setDialog(null);
      } finally {
        submittingRef.current = false;
      }
    });
  };

  return (
    <section aria-labelledby="cleanup-list-title" className="space-y-4">
      <div className="rounded-2xl border border-pul-border bg-white p-5 shadow-[0_3px_18px_rgba(6,78,59,0.07)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold text-pul-point">수동 안전 실행</p>
            <h2 id="cleanup-list-title" className="mt-1 text-xl font-black text-foreground sm:text-2xl">
              정리 대기 증빙
            </h2>
            <p className="mt-2 max-w-3xl text-base leading-7 text-pul-muted">
              공개 중인 증빙은 포함하지 않습니다. 각 항목은 한 건씩 확인한 뒤
              Storage 객체만 정리하며, 데이터베이스 이력은 보존됩니다.
            </p>
          </div>
          <span className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-pul-light px-4 text-sm font-black text-pul-deep">
            {candidates.length}건
          </span>
        </div>
      </div>

      {result ? (
        <div
          ref={resultRef}
          role={result.ok ? "status" : "alert"}
          tabIndex={-1}
          className={`flex items-start gap-3 rounded-2xl border p-4 outline-none ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <p className="font-bold leading-6">{result.message}</p>
        </div>
      ) : null}

      {candidates.length === 0 ? (
        <div className="rounded-2xl border border-pul-border bg-white px-5 py-12 text-center shadow-[0_3px_18px_rgba(6,78,59,0.07)]">
          <CheckCircle2 className="mx-auto h-12 w-12 text-pul-point" aria-hidden="true" />
          <h3 className="mt-4 text-xl font-black text-foreground">정리할 증빙이 없습니다.</h3>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            현재 canonical cleanup 후보가 0건입니다.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {candidates.map((candidate, index) => (
            <li
              key={candidate.evidenceId}
              className="rounded-2xl border border-pul-border bg-white p-5 shadow-[0_3px_18px_rgba(6,78,59,0.07)]"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <FileWarning className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-pul-muted">정리 대기 #{index + 1}</p>
                  <p className="mt-1 text-lg font-black text-foreground">
                    {statusLabels[candidate.status]}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-pul-muted">
                    서버가 최신 상태와 정리 대상 경로를 다시 확인한 뒤 처리합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => openDialog(candidate, event)}
                disabled={isPending}
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-pul-deep px-4 font-bold text-white hover:bg-pul-point disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-5 w-5" aria-hidden="true" />
                증빙 정리
              </button>
            </li>
          ))}
        </ul>
      )}

      {dialog ? (
        <HallOfFameDialog
          title="증빙 Storage 객체를 정리할까요?"
          description="이 작업은 되돌릴 수 없습니다. 공개 중인 증빙은 대상이 아니며 데이터베이스 상태·이력·감사 기록은 그대로 보존됩니다."
          busy={isPending}
          onClose={() => {
            if (!isPending) setDialog(null);
          }}
          returnFocus={dialog.trigger}
          initialFocusRef={cancelRef}
        >
          <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            한 건만 처리합니다. 실패하면 정상 데이터는 바꾸지 않고 실패 결과를
            기록해 다시 시도할 수 있게 합니다.
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              ref={cancelRef}
              type="button"
              disabled={isPending}
              onClick={() => setDialog(null)}
              className="min-h-12 rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={submit}
              className="min-h-12 rounded-xl bg-red-700 px-4 font-bold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
            >
              {isPending ? "정리 중…" : "Storage 객체 정리"}
            </button>
          </div>
        </HallOfFameDialog>
      ) : null}
    </section>
  );
}
