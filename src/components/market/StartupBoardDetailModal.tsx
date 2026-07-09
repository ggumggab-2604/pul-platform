"use client";

import {
  startupBoardAuthorLabels,
  startupBoardCategoryLabels,
  startupBoardCategoryStyles,
  startupBoardConsultationLabels,
  startupBoardStatusLabels,
  startupBoardStatusStyles,
} from "@/data/marketData";
import { cn } from "@/lib/utils";
import type { StartupBoardPost } from "@/types";

type StartupBoardDetailModalProps = {
  post: StartupBoardPost | null;
  onClose: () => void;
};

export function StartupBoardDetailModal({ post, onClose }: StartupBoardDetailModalProps) {
  if (!post) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="startup-board-detail-title"
      onClick={onClose}
    >
      <article
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-pul-border bg-white shadow-[0_12px_40px_rgba(6,78,59,0.2)] sm:max-w-lg sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-pul-border bg-gradient-to-r from-orange-50/80 to-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  "inline-flex rounded-md border px-2 py-0.5 text-xs font-bold",
                  startupBoardCategoryStyles[post.category],
                )}
              >
                {startupBoardCategoryLabels[post.category]}
              </span>
              <span
                className={cn(
                  "inline-flex rounded-md px-2 py-0.5 text-xs font-bold",
                  startupBoardStatusStyles[post.status],
                )}
              >
                {startupBoardStatusLabels[post.status]}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-pul-muted shadow-sm"
              aria-label="닫기"
            >
              ×
            </button>
          </div>

          <h2
            id="startup-board-detail-title"
            className="mt-3 text-xl font-bold leading-snug text-foreground"
          >
            {post.title}
          </h2>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-base leading-relaxed text-foreground">{post.summary}</p>

          <dl className="grid gap-3 rounded-lg bg-[#fafbfa] p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-foreground">지역</dt>
              <dd className="text-right text-pul-muted">{post.region}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-foreground">희망 규모</dt>
              <dd className="text-right text-pul-muted">{post.desiredScale}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-foreground">상담 유형</dt>
              <dd className="text-right text-pul-muted">
                {startupBoardConsultationLabels[post.consultationType]}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-foreground">작성자 유형</dt>
              <dd className="text-right text-pul-muted">
                {startupBoardAuthorLabels[post.authorType]}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-foreground">답변 / 조회</dt>
              <dd className="text-right text-pul-muted">
                {post.answerCount}건 · {post.viewCount.toLocaleString("ko-KR")}회
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-foreground">작성일</dt>
              <dd className="text-right text-pul-muted">{post.createdAt}</dd>
            </div>
          </dl>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
            본 게시글은 참고용이며, 실제 계약·매매·창업 비용·수익성은 반드시
            당사자와 전문가 확인이 필요합니다.
          </p>
        </div>
      </article>
    </div>
  );
}
