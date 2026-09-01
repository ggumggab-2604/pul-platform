"use client";

import { resolveClubDirectoryCorrectionRequestAction } from "@/app/clubs/actions";
import {
  clubDirectoryCorrectionStatusLabels,
  clubDirectoryCorrectionTargetLabels,
  createClubDirectoryCorrectionActionState,
  reduceClubDirectoryCorrectionActionState,
  type ClubDirectoryCorrectionDetail,
  type ClubDirectoryCorrectionPage,
  type ClubDirectoryCorrectionResolution,
  type ClubDirectoryCorrectionStatus,
} from "@/lib/clubs/clubDirectoryCorrectionRequests";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useTransition } from "react";

type ClubDirectoryCorrectionInboxProps = {
  basePath: string;
  page: ClubDirectoryCorrectionPage;
  detail?: ClubDirectoryCorrectionDetail;
  status?: ClubDirectoryCorrectionStatus;
};

const statuses: Array<{ value?: ClubDirectoryCorrectionStatus; label: string }> = [
  { label: "전체" },
  { value: "pending", label: "처리 대기" },
  { value: "completed", label: "처리 완료" },
  { value: "closed", label: "종료" },
];

function buildHref(
  basePath: string,
  options: { status?: ClubDirectoryCorrectionStatus; requestKey?: string },
) {
  const query = new URLSearchParams();
  if (options.status) query.set("status", options.status);
  if (options.requestKey) query.set("request", options.requestKey);
  const suffix = query.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function ClubDirectoryCorrectionInbox({
  basePath,
  page,
  detail,
  status,
}: ClubDirectoryCorrectionInboxProps) {
  return (
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.35fr)]">
      <section className="min-w-0 rounded-2xl border border-pul-border bg-white p-4" aria-labelledby="correction-list-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="correction-list-heading" className="text-xl font-black text-foreground">제보 목록</h2>
            <p className="mt-1 text-sm text-pul-muted">총 {page.total}건</p>
          </div>
          <nav aria-label="제보 상태 필터" className="flex flex-wrap gap-1.5">
            {statuses.map((item) => (
              <Link
                key={item.value ?? "all"}
                href={buildHref(basePath, { status: item.value })}
                aria-current={status === item.value ? "page" : undefined}
                className={`rounded-full px-3 py-2 text-sm font-bold ${status === item.value ? "bg-pul-deep text-white" : "bg-pul-page text-pul-deep"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {page.items.length === 0 ? (
          <p className="mt-5 rounded-xl bg-pul-page p-5 text-center text-pul-muted">해당 상태의 제보가 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {page.items.map((item) => (
              <li key={item.requestKey}>
                <Link
                  href={buildHref(basePath, { status, requestKey: item.requestKey })}
                  aria-current={detail?.requestKey === item.requestKey ? "page" : undefined}
                  className={`block rounded-xl border p-4 ${detail?.requestKey === item.requestKey ? "border-pul-point bg-pul-light/30" : "border-pul-border hover:bg-pul-page"}`}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-black text-foreground">{item.clubName}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-pul-deep">{clubDirectoryCorrectionStatusLabels[item.requestStatus]}</span>
                  </span>
                  <span className="mt-2 block text-sm font-bold text-pul-point">{clubDirectoryCorrectionTargetLabels[item.correctionTarget]}</span>
                  <span className="mt-1 line-clamp-2 block text-sm leading-6 text-pul-muted">{item.proposedValuePreview}</span>
                  <span className="mt-2 block text-xs text-pul-muted">{formatDate(item.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-pul-border bg-white p-5 sm:p-6" aria-labelledby="correction-detail-heading">
        {!detail ? (
          <div className="py-10 text-center">
            <h2 id="correction-detail-heading" className="text-xl font-black text-foreground">제보 상세</h2>
            <p className="mt-3 text-pul-muted">목록에서 확인할 제보를 선택해 주세요.</p>
          </div>
        ) : <ClubDirectoryCorrectionRequestDetail key={detail.requestKey} detail={detail} />}
      </section>
    </div>
  );
}

function ClubDirectoryCorrectionRequestDetail({
  detail,
}: {
  detail: ClubDirectoryCorrectionDetail;
}) {
  const router = useRouter();
  const [actionState, dispatch] = useReducer(
    reduceClubDirectoryCorrectionActionState,
    detail.requestKey,
    createClubDirectoryCorrectionActionState,
  );
  const [pending, startTransition] = useTransition();
  const activeRequestKeyRef = useRef<string | null>(detail.requestKey);

  useEffect(
    () => () => {
      activeRequestKeyRef.current = null;
    },
    [],
  );

  const resolve = (resolution: ClubDirectoryCorrectionResolution) => {
    const requestKey = detail.requestKey;
    if (detail.requestStatus !== "pending" || actionState.resolutionNote.trim().length < 2) {
      dispatch({
        type: "failure",
        requestKey,
        error: "처리 메모를 2자 이상 입력해 주세요.",
      });
      return;
    }
    const requestId = actionState.requestId ?? crypto.randomUUID();
    dispatch({ type: "start", requestKey, requestId });
    startTransition(async () => {
      const result = await resolveClubDirectoryCorrectionRequestAction({
        requestKey,
        expectedVersion: detail.version,
        resolution,
        resolutionNote: actionState.resolutionNote,
        requestId,
      });
      if (activeRequestKeyRef.current !== requestKey) return;
      if (!result.ok) {
        dispatch({ type: "failure", requestKey, error: result.error });
        if (result.shouldRefresh) router.refresh();
        return;
      }
      dispatch({ type: "success", requestKey, message: result.message });
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-pul-point">{detail.clubName}</p>
          <h2 id="correction-detail-heading" className="mt-1 text-2xl font-black text-foreground">{clubDirectoryCorrectionTargetLabels[detail.correctionTarget]} 수정 제보</h2>
        </div>
        <span className="rounded-full bg-pul-light px-3 py-1.5 text-sm font-bold text-pul-deep">{clubDirectoryCorrectionStatusLabels[detail.requestStatus]}</span>
      </div>

      <dl className="mt-5 grid gap-4">
        <div className="rounded-xl bg-pul-page p-4"><dt className="text-sm font-bold text-pul-muted">현재 표시 내용</dt><dd className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-foreground">{detail.displayedValue ?? "제공되지 않음"}</dd></div>
        <div className="rounded-xl bg-pul-light/30 p-4"><dt className="text-sm font-bold text-pul-muted">제안 내용</dt><dd className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-foreground">{detail.proposedValue}</dd></div>
        <div className="rounded-xl bg-pul-page p-4"><dt className="text-sm font-bold text-pul-muted">사유·근거</dt><dd className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-foreground">{detail.reason}</dd></div>
        {detail.note ? <div className="rounded-xl bg-pul-page p-4"><dt className="text-sm font-bold text-pul-muted">참고사항</dt><dd className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-foreground">{detail.note}</dd></div> : null}
        <div className="grid gap-3 text-sm text-pul-muted sm:grid-cols-2"><div><dt className="font-bold">제보자</dt><dd className="mt-1">{detail.requesterLabel}</dd></div><div><dt className="font-bold">접수 시각</dt><dd className="mt-1">{formatDate(detail.createdAt)}</dd></div></div>
        {detail.resolutionNote ? <div className="rounded-xl border border-pul-border p-4"><dt className="text-sm font-bold text-pul-muted">처리 메모</dt><dd className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-foreground">{detail.resolutionNote}</dd><dd className="mt-2 text-xs text-pul-muted">처리자: {detail.resolverLabel ?? "권한 있는 운영자"} · {formatDate(detail.resolvedAt)}</dd></div> : null}
      </dl>

      {detail.requestStatus === "pending" ? (
        <div className="mt-6 border-t border-pul-border pt-5">
          <label htmlFor="correction-resolution-note" className="text-base font-black text-foreground">처리 메모</label>
          <p id="correction-resolution-help" className="mt-1 text-sm leading-6 text-pul-muted">실제 동호회 정보 변경은 별도 관리 절차로 확인해 주세요. 이 처리는 제보 상태만 변경합니다.</p>
          <textarea
            id="correction-resolution-note"
            value={actionState.resolutionNote}
            onChange={(event) => dispatch({
              type: "edit",
              requestKey: detail.requestKey,
              resolutionNote: event.target.value,
            })}
            maxLength={500}
            rows={4}
            aria-describedby="correction-resolution-help"
            className="mt-2 w-full rounded-xl border border-pul-border px-3 py-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-light"
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={pending || actionState.resolutionNote.trim().length < 2} onClick={() => resolve("completed")} className="min-h-12 rounded-lg bg-pul-deep px-4 font-bold text-white disabled:opacity-60">{pending ? "처리 중…" : "처리 완료"}</button>
            <button type="button" disabled={pending || actionState.resolutionNote.trim().length < 2} onClick={() => resolve("closed")} className="min-h-12 rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep disabled:opacity-60">종료</button>
          </div>
        </div>
      ) : null}
      {actionState.error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 font-semibold text-rose-800">{actionState.error}</p> : null}
      {actionState.message ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-900">{actionState.message}</p> : null}
    </>
  );
}
