"use client";

import { cn } from "@/lib/utils";
import { useRef } from "react";

export type CertificationPageTab =
  | "guide"
  | "exam-prep"
  | "courses"
  | "activity";

const tabs: { id: CertificationPageTab; label: string; mobileLabel: string }[] = [
  { id: "guide", label: "자격증 안내", mobileLabel: "안내" },
  { id: "exam-prep", label: "시험 준비자료", mobileLabel: "준비" },
  { id: "courses", label: "교육과정·광고", mobileLabel: "과정·광고" },
  { id: "activity", label: "심판·강사 구인구직", mobileLabel: "구인구직" },
];

type CertificationPageTabsProps = {
  activeTab: CertificationPageTab;
  onChange: (tab: CertificationPageTab) => void;
};

export function CertificationPageTabs({
  activeTab,
  onChange,
}: CertificationPageTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <nav
      className="relative rounded-xl border border-pul-border bg-white p-1 shadow-[0_2px_10px_rgba(6,78,59,0.05)]"
      aria-label="자격증·심판 탭"
    >
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 rounded-r-xl bg-gradient-to-l from-white via-white/90 to-transparent lg:hidden"
        aria-hidden="true"
      />
      <div role="tablist" className="flex gap-1 overflow-x-auto overscroll-x-contain px-0.5 pb-0.5 pr-6 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] lg:overflow-visible lg:pr-0.5 [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={element => { tabRefs.current[index] = element; }}
              type="button"
              onClick={() => onChange(tab.id)}
              onKeyDown={event => {
                const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
                    : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
                if (next === null) return;
                event.preventDefault();
                tabRefs.current[next]?.focus();
                onChange(tabs[next].id);
              }}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-2.5 text-xs font-bold transition-colors lg:px-4 lg:text-sm",
                isActive
                  ? "bg-pul-point text-white shadow-sm"
                  : "text-pul-muted hover:bg-pul-light/80 hover:text-pul-deep",
              )}
              aria-selected={isActive}
              aria-controls={`certification-panel-${tab.id}`}
              id={`certification-tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
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
