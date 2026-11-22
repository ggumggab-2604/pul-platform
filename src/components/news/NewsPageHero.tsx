"use client";

import { NEWS_PAGE_COPY } from "@/data/newsData";

type NewsPageHeroProps = {
  onReport?: (trigger: HTMLButtonElement) => void;
  onPromotionInquiry?: (trigger: HTMLButtonElement) => void;
};

export function NewsPageHero({ onReport, onPromotionInquiry }: NewsPageHeroProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h1 className="text-xl font-bold tracking-tight text-pul-deep sm:text-3xl">{NEWS_PAGE_COPY.title}</h1>
      <div className="flex flex-wrap gap-1 sm:gap-2">
        <button
          type="button"
          onClick={(event) => onReport?.(event.currentTarget)}
          className="min-h-11 rounded-lg px-2 text-sm font-bold text-pul-deep hover:bg-pul-light sm:px-3"
        >
          소식 제보
        </button>
        <button
          type="button"
          onClick={(event) => onPromotionInquiry?.(event.currentTarget)}
          className="min-h-11 rounded-lg px-2 text-sm font-bold text-pul-deep hover:bg-pul-light sm:px-3"
        >
          홍보 문의
        </button>
      </div>
    </header>
  );
}
