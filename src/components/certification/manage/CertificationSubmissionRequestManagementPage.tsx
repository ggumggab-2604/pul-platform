"use client";

import { resolveCertificationSubmissionRequestAction } from "@/app/certification/manage/requests/actions";
import type {
  CertificationSubmissionRequestPage,
  CertificationSubmissionRequestType,
  CertificationSubmissionResolution,
} from "@/lib/certification/certificationSubmissionRequests";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  initialPage: CertificationSubmissionRequestPage;
};

const typeLabels: Record<CertificationSubmissionRequestType, string> = {
  course_registration: "교육과정 등록 문의",
  job_registration: "구인 공고 등록 문의",
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function CertificationSubmissionRequestManagementPage({ initialPage }: Props) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const resolve = (
    requestKey: string,
    resolution: CertificationSubmissionResolution,
  ) => {
    if (pendingKey) return;
    setPendingKey(requestKey);
    setNotice("");
    setError("");
    startTransition(async () => {
      const result = await resolveCertificationSubmissionRequestAction({ requestKey, resolution });
      if (result.ok) {
        setNotice(result.message);
        router.refresh();
      } else {
        setError(result.message);
        if (result.shouldRefresh) router.refresh();
      }
      setPendingKey(null);
    });
  };

  return (
    <section aria-busy={isPending} aria-labelledby="certification-request-list-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="certification-request-list-title" className="text-xl font-black text-foreground">
            처리 대기 등록 문의
          </h2>
          <p className="mt-1 text-sm text-pul-muted">총 {initialPage.total}건</p>
        </div>
        <p className="text-sm text-pul-muted">
          최근 접수 순으로 최대 {initialPage.limit}건을 표시합니다.
        </p>
      </div>

      {notice ? (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-900" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-semibold text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {initialPage.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-pul-border bg-white px-5 py-14 text-center">
          <p className="text-lg font-bold text-foreground">처리할 자격증·심판 등록 문의가 없습니다.</p>
          <p className="mt-2 text-sm text-pul-muted">새 문의가 접수되면 이 화면에 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {initialPage.items.map((request) => {
            const itemPending = pendingKey === request.requestKey;
            return (
              <article
                key={request.requestKey}
                className="rounded-2xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)] sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-pul-point">{typeLabels[request.requestType]}</p>
                    <h3 className="mt-1 text-lg font-black text-foreground">{request.title}</h3>
                    <p className="mt-1 text-sm font-semibold text-pul-muted">
                      {request.organizationName}{request.region ? ` · ${request.region}` : ""}
                    </p>
                  </div>
                  <time className="text-xs text-pul-muted" dateTime={request.createdAt}>
                    {dateFormatter.format(new Date(request.createdAt))}
                  </time>
                </div>
                <p className="mt-4 whitespace-pre-wrap rounded-xl bg-pul-page p-4 text-sm leading-7 text-foreground">
                  {request.summary}
                </p>
                {request.sourceUrl ? (
                  <a
                    href={request.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-11 items-center font-bold text-pul-deep underline"
                  >
                    공식 확인 URL 열기
                    <span className="sr-only"> (새 창)</span>
                  </a>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => resolve(request.requestKey, "dismissed")}
                    className="min-h-11 rounded-lg border border-pul-border px-4 font-bold text-pul-muted disabled:opacity-50"
                  >
                    {itemPending ? "처리 중…" : "종료"}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => resolve(request.requestKey, "resolved")}
                    className="min-h-11 rounded-lg bg-pul-point px-4 font-bold text-white disabled:opacity-50"
                  >
                    {itemPending ? "처리 중…" : "처리 완료"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
