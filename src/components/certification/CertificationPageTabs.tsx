"use client";

import { cn } from "@/lib/utils";
import { useRef } from "react";

export type CertificationPageTab =
  | "guide"
  | "exam-prep"
  | "courses"
  | "activity";

const tabs: { id: CertificationPageTab; label: string }[] = [
  { id: "exam-prep", label: "국가자격 시험 준비" },
  { id: "guide", label: "심판 자격 안내" },
  { id: "courses", label: "민간 교육과정·광고" },
  { id: "activity", label: "심판·강사 구인구직" },
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
      <div role="tablist" className="grid grid-cols-2 gap-1 lg:grid-cols-4">
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
                "min-h-12 rounded-lg px-1 py-2.5 text-sm font-bold transition-colors lg:px-4 lg:text-base",
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
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
