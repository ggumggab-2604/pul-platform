"use client";

import { Card } from "@/components/ui/Card";
import {
  dashboardBodyClass,
  dashboardCardClass,
  dashboardFooterClass,
  dashboardListClass,
} from "@/components/courses/courseDetailDashboardLayout";
import {
  courseBoardCategories,
  type CourseBoardPost,
} from "@/data/courseBoardPosts";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";
import { useState } from "react";

/**
 * TODO:
 * - 회원 로그인 후 글쓰기
 * - 작성자 본인 수정/삭제
 * - 동호회 회장/부회장/운영진 블라인드 권한
 * - PUL 운영자 전체 관리 권한
 * - 신고 누적 시 임시 블라인드
 * - 댓글 기능
 * - 카테고리별 필터
 * - 구장별 게시판 전체 보기
 * - 분실물/카풀/불편사항 알림 기능
 * - 욕설/개인정보 노출 신고 처리
 */

const BOARD_PREP_MESSAGE =
  "정식 오픈 후 회원은 이 구장 이야기방에 글을 작성할 수 있습니다.\n작성자는 본인 글을 수정·삭제할 수 있고, 동호회 운영진과 PUL 운영자는 부적절한 글을 블라인드 처리할 수 있습니다.";

const BOARD_LIST_PREP_MESSAGE =
  "구장별 이야기방 전체 보기 페이지는 준비 중입니다.\n정식 오픈 후 카테고리별 필터와 댓글 기능이 제공됩니다.";

const categoryStyles: Record<CourseBoardPost["category"], string> = {
  공지: "bg-pul-light text-pul-deep ring-pul-border/80",
  "분실·습득": "bg-violet-50 text-violet-800 ring-violet-200/70",
  카풀: "bg-sky-50 text-sky-800 ring-sky-200/70",
  공략팁: "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  "구장 상태": "bg-amber-50 text-amber-800 ring-amber-200/70",
  "봉사·정화": "bg-teal-50 text-teal-800 ring-teal-200/70",
  불편사항: "bg-orange-50 text-orange-800 ring-orange-200/70",
  질문: "bg-blue-50 text-blue-800 ring-blue-200/70",
  자유글: "bg-gray-100 text-gray-700 ring-gray-200/80",
  기타: "bg-gray-100 text-gray-600 ring-gray-200/80",
};

function PrepModal({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="board-prep-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-pul-border bg-white p-5 shadow-[0_12px_40px_rgba(6,78,59,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="board-prep-modal-title" className="text-lg font-bold text-foreground">
          {title}
        </h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-pul-muted">
          {message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
        >
          확인
        </button>
      </div>
    </div>
  );
}

const MOBILE_POST_LIMIT = 3;
const PC_POST_LIMIT = 3;

function BoardPostItem({
  post,
  className,
}: {
  post: CourseBoardPost;
  className?: string;
}) {
  const isBlinded = post.status === "블라인드";

  return (
    <li
      className={cn(
        "rounded-lg border border-pul-border/80 px-3 py-2.5 max-lg:px-2.5 max-lg:py-1.5 lg:py-2",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 max-lg:gap-1.5">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold ring-1",
            categoryStyles[post.category],
          )}
        >
          {post.category}
        </span>
        {isBlinded && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
            블라인드
          </span>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-bold leading-snug text-foreground max-lg:mt-1 max-lg:line-clamp-2 max-lg:text-xs">
        {post.title}
      </p>
      <p className="mt-1 text-xs text-pul-muted max-lg:mt-0.5 max-lg:text-[11px] max-lg:leading-snug">
        <span className="font-medium text-foreground max-lg:hidden">{post.authorName}</span>
        <span className="max-lg:hidden"> / {post.clubName} · </span>
        <span className="font-semibold text-pul-point max-lg:text-xs">댓글 {post.commentCount}</span>
      </p>
      <p className="mt-0.5 hidden text-[11px] text-pul-muted lg:block">{post.createdAt}</p>
    </li>
  );
}

type CourseStoryBoardSectionProps = {
  posts: CourseBoardPost[];
  className?: string;
  compact?: boolean;
};

export function CourseStoryBoardSection({
  posts,
  className,
  compact = false,
}: CourseStoryBoardSectionProps) {
  const [modal, setModal] = useState<"write" | "list" | null>(null);

  if (posts.length === 0) return null;

  return (
    <>
      <Card
        title="이 구장 이야기방"
        dense
        className={cn(dashboardCardClass, className)}
        bodyClassName={dashboardBodyClass}
      >
        <p
          className={cn(
            "shrink-0 text-sm leading-relaxed text-pul-muted max-lg:text-xs",
            compact ? "line-clamp-1 lg:line-clamp-1" : "line-clamp-2 lg:line-clamp-none",
          )}
        >
          분실물, 카풀, 공략팁, 구장 상태 등 회원 정보를 공유하는 공간입니다.
        </p>

        {!compact && (
          <div className="mt-3 hidden flex-wrap gap-1.5 lg:flex">
            {courseBoardCategories.slice(1, 6).map((category) => (
              <span
                key={category}
                className="rounded-full bg-pul-light px-2 py-0.5 text-[10px] font-semibold text-pul-muted"
              >
                {category}
              </span>
            ))}
            <span className="rounded-full bg-pul-light px-2 py-0.5 text-[10px] font-semibold text-pul-muted">
              +{courseBoardCategories.length - 6}
            </span>
          </div>
        )}

        <ul className={cn("mt-3 space-y-2 max-lg:mt-2 max-lg:space-y-1.5", dashboardListClass)}>
          {posts.map((post, index) => (
            <BoardPostItem
              key={post.id}
              post={post}
              className={cn(
                index >= MOBILE_POST_LIMIT && "hidden lg:list-item",
                index >= PC_POST_LIMIT && "lg:hidden",
              )}
            />
          ))}
        </ul>

        <div
          className={cn(
            "mt-4 flex shrink-0 flex-col gap-2 max-lg:mt-2.5 max-lg:gap-2 sm:flex-row lg:pt-0",
            dashboardFooterClass,
          )}
        >
          <button
            type="button"
            onClick={() => setModal("list")}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 py-3 text-sm font-bold text-pul-deep hover:bg-pul-light max-lg:min-h-11 max-lg:w-full max-lg:py-2.5 lg:min-h-0"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            전체 글 보기
          </button>
          <button
            type="button"
            onClick={() => setModal("write")}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-pul-point px-4 py-3 text-sm font-bold text-white hover:bg-pul-deep max-lg:min-h-11 max-lg:w-full max-lg:py-2.5 lg:min-h-0"
          >
            글쓰기
          </button>
        </div>

        <p
          className={cn(
            "mt-3 text-[11px] leading-relaxed text-pul-muted lg:hidden",
            compact ? "max-lg:hidden" : "max-lg:line-clamp-1",
          )}
        >
          작성자는 본인 글 수정·삭제 가능. 동호회 운영진·PUL 운영자는 블라인드 처리 권한이 있습니다.
        </p>

        {!compact && (
          <div className="mt-3 hidden rounded-lg bg-pul-light/70 px-3 py-2.5 lg:block">
            <p className="text-[11px] font-semibold text-pul-deep">권한 안내</p>
            <ul className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-pul-muted">
              <li>· 작성자는 본인이 쓴 글을 수정·삭제할 수 있습니다.</li>
              <li>· 해당 동호회 회장·부회장·운영진은 부적절한 글을 블라인드 처리할 수 있습니다.</li>
              <li>· PUL 운영자는 전체 게시글 관리 권한을 가집니다.</li>
              <li>· 욕설, 비방, 개인정보 노출, 허위사실 게시글은 제한될 수 있습니다.</li>
            </ul>
          </div>
        )}
      </Card>

      {modal === "write" && (
        <PrepModal
          title="글쓰기 준비 중"
          message={BOARD_PREP_MESSAGE}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "list" && (
        <PrepModal
          title="전체 글 보기 준비 중"
          message={BOARD_LIST_PREP_MESSAGE}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
