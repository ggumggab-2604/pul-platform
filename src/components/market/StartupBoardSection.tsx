"use client";

import { StartupBoardPostCard } from "@/components/market/StartupBoardPostCard";
import { startupBoardCategoryTabs } from "@/data/marketData";
import { cn } from "@/lib/utils";
import type { StartupBoardCategoryFilter, StartupBoardPost } from "@/types";

type StartupBoardSectionProps = {
  posts: StartupBoardPost[];
  mode: "summary" | "full";
  boardCategory: StartupBoardCategoryFilter;
  onBoardCategoryChange: (category: StartupBoardCategoryFilter) => void;
  onDetail: (post: StartupBoardPost, trigger: HTMLButtonElement) => void;
  onViewAll?: () => void;
  showCategories?: boolean;
  loading?: boolean;
  loadError?: string;
  hasMore?: boolean;
  onRetry?: () => void;
  onLoadMore?: () => void;
};

export function StartupBoardSection({
  posts,
  mode,
  boardCategory,
  onBoardCategoryChange,
  onDetail,
  onViewAll,
  showCategories = false,
  loading = false,
  loadError,
  hasMore = false,
  onRetry,
  onLoadMore,
}: StartupBoardSectionProps) {
  const isSummary = mode === "summary";

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-foreground">창업·매매 게시판</h2>
        <p className="mt-1 text-sm text-pul-muted lg:text-base">
          스크린 파크골프 창업, 기존 매장 매매, 필드 구장 신설, 유휴지 활용,
          시설·시공 상담을 질문하고 정보를 확인하는 공간입니다.
        </p>
      </div>

      {showCategories ? (
        <div className="scrollbar-none -mx-1 mb-3 overflow-x-auto px-1 lg:mx-0 lg:mb-4">
          <div className="flex min-w-max gap-1.5 lg:flex-wrap lg:gap-2">
            {startupBoardCategoryTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onBoardCategoryChange(tab.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition-colors lg:px-4 lg:text-sm",
                  boardCategory === tab.id
                    ? "border-pul-deep bg-pul-point text-white shadow-sm"
                    : "border-pul-border bg-white text-pul-muted hover:border-pul-point/40 hover:text-pul-deep",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-8 text-center" role="alert">
          <p className="font-semibold text-rose-800">{loadError}</p>
          {onRetry ? <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-lg border border-rose-300 bg-white px-4 text-sm font-bold text-rose-800">다시 불러오기</button> : null}
        </div>
      ) : loading && posts.length === 0 ? (
        <div className="rounded-xl border border-pul-border bg-white px-6 py-12 text-center text-pul-muted" role="status">창업·매매 게시글을 불러오는 중입니다.</div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-pul-border bg-white px-6 py-12 text-center">
          <p className="text-base font-semibold text-foreground">
            해당 카테고리의 게시글이 없습니다.
          </p>
          <p className="mt-1 text-sm text-pul-muted">
            다른 카테고리를 선택하거나 검색어를 수정해 보세요.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <StartupBoardPostCard
              key={post.postKey}
              post={post}
              onDetail={onDetail}
              compact={isSummary}
            />
          ))}
        </div>
      )}

      {hasMore && onLoadMore ? (
        <button type="button" onClick={onLoadMore} disabled={loading} className="mt-4 min-h-11 w-full rounded-lg border border-pul-border bg-white font-bold disabled:opacity-50">{loading ? "불러오는 중…" : "게시글 더 보기"}</button>
      ) : null}

      {isSummary && onViewAll ? (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
        >
          창업·매매 게시판 더보기
        </button>
      ) : null}
    </section>
  );
}
