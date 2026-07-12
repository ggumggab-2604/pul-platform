"use client";

import type { NearbyPlaceTabId } from "@/data/courseDetailPageData";
import { cn } from "@/lib/utils";

const tabs: { id: NearbyPlaceTabId; label: string }[] = [
  { id: "screen", label: "스크린장" },
  { id: "restaurant", label: "음식점" },
  { id: "meeting", label: "모임 장소" },
  { id: "cafe", label: "카페" },
  { id: "repair", label: "수리·리폼" },
];

type NearbyPlaceTabsProps = {
  active: NearbyPlaceTabId;
  onChange: (tab: NearbyPlaceTabId) => void;
};

export function NearbyPlaceTabs({ active, onChange }: NearbyPlaceTabsProps) {
  return (
    <div
      className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]"
      role="tablist"
      aria-label="주변 이용정보 카테고리"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-[15px] font-bold transition lg:px-4 lg:text-base",
            active === tab.id
              ? "bg-pul-point text-white shadow-sm"
              : "border border-pul-border bg-white text-pul-deep hover:bg-pul-light",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
