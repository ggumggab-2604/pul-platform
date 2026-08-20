"use client";

import {
  startupBoardCategoryLabels,
  startupBoardCategoryStyles,
  startupBoardConsultationLabels,
  startupBoardStatusLabels,
  startupBoardStatusStyles,
} from "@/data/marketData";
import { cn } from "@/lib/utils";
import type { StartupBoardPost } from "@/types";

type StartupBoardPostCardProps = {
  post: StartupBoardPost;
  onDetail: (post: StartupBoardPost, trigger: HTMLButtonElement) => void;
  compact?: boolean;
};

export function StartupBoardPostCard({
  post,
  onDetail,
  compact = false,
}: StartupBoardPostCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(6,78,59,0.08)]",
        compact ? "p-3" : "p-4 lg:p-5",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold lg:text-xs",
            startupBoardCategoryStyles[post.category],
          )}
        >
          {startupBoardCategoryLabels[post.category]}
        </span>
        <span
          className={cn(
            "inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold lg:text-xs",
            startupBoardStatusStyles[post.status],
          )}
        >
          {startupBoardStatusLabels[post.status]}
        </span>
      </div>

      <button
        type="button"
        onClick={(event) => onDetail(post, event.currentTarget)}
        className="mt-2 text-left"
      >
        <h3
          className={cn(
            "font-bold leading-snug text-foreground hover:text-pul-deep",
            compact ? "text-sm line-clamp-2" : "text-base lg:text-lg",
          )}
        >
          {post.title}
        </h3>
      </button>

      <p
        className={cn(
          "mt-2 leading-relaxed text-pul-muted",
          compact ? "line-clamp-2 text-xs" : "line-clamp-2 text-sm",
        )}
      >
        {post.summary}
      </p>

      <dl
        className={cn(
          "mt-3 grid gap-1.5 text-pul-muted",
          compact ? "text-[11px]" : "text-xs lg:text-sm",
        )}
      >
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span>
            <span className="font-semibold text-foreground">지역</span> {post.region}
          </span>
          <span>
            <span className="font-semibold text-foreground">희망 규모</span>{" "}
            {post.desiredScale}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span>
            <span className="font-semibold text-foreground">상담 유형</span>{" "}
            {startupBoardConsultationLabels[post.consultationType]}
          </span>
          <span>
            <span className="font-semibold text-foreground">작성자</span>{" "}
            {post.authorNickname}
          </span>
        </div>
      </dl>

      <div
        className={cn(
          "mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-pul-border/60 pt-3",
          compact ? "text-[10px]" : "text-xs",
        )}
      >
        <div className="flex flex-wrap items-center gap-3 text-pul-muted">
          <span>{post.createdAt}</span>
        </div>
        <button
          type="button"
          onClick={(event) => onDetail(post, event.currentTarget)}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-lg bg-pul-point font-bold text-white hover:bg-pul-deep",
            compact ? "h-8 px-3 text-[11px]" : "h-9 px-4 text-xs",
          )}
        >
          자세히 보기
        </button>
      </div>
    </article>
  );
}
