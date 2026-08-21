"use client";

import { resolveNewsInquiryAction } from "@/app/news/manage/inquiries/actions";
import type {
  NewsInquiryPage,
  NewsInquiryResolution,
  NewsInquiryType,
} from "@/lib/news/newsInquiries";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  initialPage: NewsInquiryPage;
};

const typeLabels: Record<NewsInquiryType, string> = {
  news_report: "소식 제보",
  promotion_inquiry: "홍보 문의",
};

export function NewsInquiryManagementPage({ initialPage }: Props) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const resolve = (inquiryKey: string, resolution: NewsInquiryResolution) => {
    if (pendingKey) return;
    setPendingKey(inquiryKey);
    setNotice("");
    setError("");
    startTransition(async () => {
      const result = await resolveNewsInquiryAction({ inquiryKey, resolution });
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
    <section aria-busy={isPending} aria-labelledby="news-inquiry-list-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="news-inquiry-list-title" className="text-xl font-black text-foreground">
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
          <p className="text-lg font-bold text-foreground">처리할 뉴스 제보·홍보 문의가 없습니다.</p>
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
                  <h3 className="text-lg font-black text-foreground">
                    {typeLabels[inquiry.inquiryType]}
                  </h3>
                  <time className="text-xs text-pul-muted" dateTime={inquiry.createdAt}>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(inquiry.createdAt))}
                  </time>
                </div>
                <p className="mt-4 whitespace-pre-wrap rounded-xl bg-pul-page p-4 text-sm leading-7 text-foreground">
                  {inquiry.inquiryBody}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
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
