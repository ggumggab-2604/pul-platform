"use client";

import { cn } from "@/lib/utils";

export type LessonsPageTab =
  | "intro-guide"
  | "free-videos"
  | "paid-lessons"
  | "instructor-promotion"
  | "university-departments";

const tabs: { id: LessonsPageTab; label: string; mobileLabel: string }[] = [
  { id: "intro-guide", label: "입문 가이드", mobileLabel: "입문" },
  { id: "free-videos", label: "무료 영상", mobileLabel: "무료 영상" },
  { id: "paid-lessons", label: "유료 레슨·교육", mobileLabel: "유료 교육" },
  { id: "instructor-promotion", label: "교습가 홍보", mobileLabel: "교습가" },
  { id: "university-departments", label: "대학·학과", mobileLabel: "대학" },
];

type LessonsPageTabsProps = {
  activeTab: LessonsPageTab;
  onChange: (tab: LessonsPageTab) => void;
};

export function LessonsPageTabs({ activeTab, onChange }: LessonsPageTabsProps) {
  return (
    <nav
      className="relative rounded-xl border border-pul-border bg-white p-1 shadow-[0_2px_10px_rgba(6,78,59,0.05)]"
      aria-label="레슨·교육 탭"
    >
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 rounded-r-xl bg-gradient-to-l from-white via-white/90 to-transparent lg:hidden"
        aria-hidden="true"
      />
      <div className="flex gap-1 overflow-x-auto overscroll-x-contain px-0.5 pb-0.5 pr-6 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] lg:overflow-visible lg:pr-0.5 [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-2.5 text-xs font-bold transition-colors lg:px-4 lg:text-sm",
                isActive
                  ? "bg-pul-point text-white shadow-sm"
                  : "text-pul-muted hover:bg-pul-light/80 hover:text-pul-deep",
              )}
              aria-selected={isActive}
              role="tab"
            >
              <span className="lg:hidden">{tab.mobileLabel}</span>
              <span className="hidden lg:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
