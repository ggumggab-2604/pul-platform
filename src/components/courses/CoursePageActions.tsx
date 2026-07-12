"use client";

import Link from "next/link";

type CoursePageActionsProps = {
  onReport?: () => void;
};

export function CoursePageActions({ onReport }: CoursePageActionsProps) {
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button
        type="button"
        onClick={onReport}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-5 text-sm font-bold text-white hover:bg-pul-deep"
      >
        골프장 정보 제보하기
      </button>
      <Link
        href="/clubs"
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-5 text-sm font-bold text-pul-deep hover:bg-pul-light"
      >
        주변 동호회 보기
      </Link>
      <Link
        href="/events"
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-5 text-sm font-bold text-pul-deep hover:bg-pul-light"
      >
        주변 대회 보기
      </Link>
      <Link
        href="/community"
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-5 text-sm font-bold text-pul-muted hover:text-pul-deep"
      >
        이용 후기 보기
      </Link>
    </div>
  );
}
