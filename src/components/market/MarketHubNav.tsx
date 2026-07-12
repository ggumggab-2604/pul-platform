"use client";

import { cn } from "@/lib/utils";

export type MarketHubSection =
  | "browse"
  | "wanted"
  | "price"
  | "guide"
  | "safety";

const sections: { id: MarketHubSection; label: string }[] = [
  { id: "browse", label: "상품 둘러보기" },
  { id: "wanted", label: "삽니다" },
  { id: "price", label: "장비 시세" },
  { id: "guide", label: "장비 구매 가이드" },
  { id: "safety", label: "안전거래 안내" },
];

type MarketHubNavProps = {
  active: MarketHubSection;
  onChange: (section: MarketHubSection) => void;
};

export function MarketHubNav({ active, onChange }: MarketHubNavProps) {
  return (
    <nav
      className="scrollbar-none -mx-1 overflow-x-auto px-1"
      aria-label="장터 섹션"
    >
      <div className="flex min-w-max gap-1.5 lg:flex-wrap lg:gap-2">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => onChange(section.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition-colors lg:px-4 lg:text-sm",
              active === section.id
                ? "border-pul-deep bg-pul-point text-white shadow-sm"
                : "border-pul-border bg-white text-pul-muted hover:border-pul-point/40 hover:text-pul-deep",
            )}
          >
            {section.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
