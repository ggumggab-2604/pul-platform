"use client";

import { resolveMarketPartnershipInquiryAction } from "@/app/market/manage/partnership-inquiries/actions";
import type {
  MarketPartnershipInquiryPage,
  MarketPartnershipInquiryResolution,
  MarketPartnershipInquiryType,
} from "@/lib/market/marketPartnershipInquiries";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  initialPage: MarketPartnershipInquiryPage;
};

const inquiryTypeLabels: Record<MarketPartnershipInquiryType, string> = {
  advertising: "광고 문의",
  shop_entry: "장터 입점 제안",
  partnership: "제휴 문의",
};

export function MarketPartnershipInquiryManagementPage({ initialPage }: Props) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const resolve = (
    inquiryKey: string,
    resolution: MarketPartnershipInquiryResolution,
  ) => {
    if (pendingKey) return;
    setPendingKey(inquiryKey);
    setNotice("");
    setError("");
    startTransition(async () => {
      const result = await resolveMarketPartnershipInquiryAction({ inquiryKey, resolution });
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
    <section aria-busy={isPending} aria-labelledby="market-partnership-inquiry-list-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="market-partnership-inquiry-list-title" className="text-xl font-black text-foreground">
            처리 대기 문의
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
          <p className="text-lg font-bold text-foreground">처리할 광고·입점·제휴 문의가 없습니다.</p>
          <p className="mt-2 text-sm text-pul-muted">새 문의가 접수되면 이 화면에 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {initialPage.items.map((inquiry) => {
            const itemPending = pendingKey === inquiry.inquiryKey;
            return (
              <article
                key={inquiry.inquiryKey}
                className="rounded-2xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)] sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-pul-point">
                      {inquiryTypeLabels[inquiry.inquiryType]}
                    </p>
                    <h3 className="mt-1 text-lg font-black text-foreground">
                      {inquiry.organizationName}
                    </h3>
                  </div>
                  <time className="text-xs text-pul-muted" dateTime={inquiry.createdAt}>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(inquiry.createdAt))}
                  </time>
                </div>
                <p className="mt-4 whitespace-pre-wrap rounded-xl bg-pul-page p-4 text-sm leading-7 text-foreground">
                  {inquiry.proposalSummary}
                </p>
                {inquiry.sourceUrl ? (
                  <a
                    href={inquiry.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex min-h-11 items-center break-all font-bold text-pul-deep underline"
                  >
                    공식 확인 URL 열기
                    <span className="sr-only">(새 창)</span>
                  </a>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-pul-border pt-4 sm:flex sm:justify-end">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => resolve(inquiry.inquiryKey, "dismissed")}
                    className="min-h-11 rounded-lg border border-pul-border px-4 font-bold text-pul-muted disabled:opacity-50"
                  >
                    {itemPending ? "처리 중…" : "종료"}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => resolve(inquiry.inquiryKey, "resolved")}
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
