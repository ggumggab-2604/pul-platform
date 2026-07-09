"use client";

import { lessonBeginnerIntroText } from "@/data/lessonData";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";

type LessonsBeginnerGuideProps = {
  onGuideClick: () => void;
};

export function LessonsBeginnerGuide({ onGuideClick }: LessonsBeginnerGuideProps) {
  return (
    <section className="rounded-xl border border-pul-border bg-white p-2.5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5">
      <div className="flex items-start gap-2 lg:gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pul-light text-pul-deep lg:h-10 lg:w-10">
          <Icon name="book" className="h-4 w-4 lg:h-5 lg:w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground lg:text-lg">
            처음 시작하는 분을 위한 안내
          </h2>
          <p className="mt-1 text-xs leading-snug text-pul-muted lg:mt-2 lg:text-base lg:leading-relaxed">
            {lessonBeginnerIntroText}
          </p>
          <div className="mt-2.5 flex flex-col gap-2 lg:mt-4 lg:flex-row lg:flex-wrap">
            <button
              type="button"
              onClick={onGuideClick}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-pul-point px-3 text-xs font-bold text-white transition-colors hover:bg-pul-deep lg:h-11 lg:w-auto lg:px-4 lg:text-sm"
            >
              입문 가이드 보기
            </button>
            <Link
              href="/clubs"
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-3 text-xs font-bold text-pul-deep transition-colors hover:border-pul-point/40 lg:h-11 lg:w-auto lg:px-4 lg:text-sm"
            >
              가까운 동호회 찾기
            </Link>
            <Link
              href="/courses"
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-3 text-xs font-bold text-pul-deep transition-colors hover:border-pul-point/40 lg:h-11 lg:w-auto lg:px-4 lg:text-sm"
            >
              골프장 찾기
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
