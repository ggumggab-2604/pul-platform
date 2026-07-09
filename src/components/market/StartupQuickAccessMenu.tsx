"use client";

import { startupQuickAccessItems } from "@/data/startupQuickAccessData";
import type { StartupBoardCategoryFilter } from "@/types";

type StartupQuickAccessMenuProps = {
  onNavigate: (boardCategory?: StartupBoardCategoryFilter) => void;
};

export function StartupQuickAccessMenu({ onNavigate }: StartupQuickAccessMenuProps) {
  return (
    <section className="rounded-xl border border-pul-border/80 bg-[#fafbfa] p-3 shadow-[0_2px_8px_rgba(6,78,59,0.04)] lg:p-4">
      <div className="mb-3">
        <h2 className="text-base font-bold text-foreground lg:text-lg">
          창업·매매 문의도 가능합니다
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          스크린 창업, 매장 매매, 필드 구장 신설, 시설·시공 문의는 창업·매매
          게시판에서 확인할 수 있습니다.
        </p>
      </div>

      <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-3 lg:overflow-visible lg:pb-0">
        {startupQuickAccessItems.map((item) => (
          <article
            key={item.id}
            className="flex w-[min(78vw,220px)] shrink-0 flex-col rounded-lg border border-pul-border bg-white p-3 lg:w-auto"
          >
            <h3 className="text-sm font-bold text-pul-deep">{item.title}</h3>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-pul-muted">
              {item.description}
            </p>
            <button
              type="button"
              onClick={() => {
                console.log("[market] 창업·매매 빠른 안내:", item.title);
                onNavigate(item.boardCategory);
              }}
              className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-pul-point/30 bg-pul-light text-xs font-bold text-pul-deep hover:bg-emerald-100"
            >
              바로가기
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
