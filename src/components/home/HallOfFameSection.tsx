"use client";

import { Card } from "@/components/ui/Card";
import { hallOfFamePeople } from "@/data/homeData";
import { cn } from "@/lib/utils";
import type { HallOfFameTab } from "@/types";
import { useMemo, useState } from "react";

const tabs: { key: HallOfFameTab; label: string }[] = [
  { key: "holeInOne", label: "홀인원" },
  { key: "bestScore", label: "베스트스코어" },
  { key: "winner", label: "우승자" },
];

const medalStyles = [
  "bg-gradient-to-br from-amber-300 to-amber-600 text-amber-950 ring-1 ring-amber-200/80",
  "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 ring-1 ring-slate-300/80",
  "bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950 ring-1 ring-orange-200/80",
];

const profileColors = [
  "from-emerald-400 to-pul-deep",
  "from-teal-400 to-emerald-700",
  "from-lime-400 to-green-700",
];

const CORE_CARD_CLASS = "lg:min-h-[400px]";

export function HallOfFameSection() {
  const [activeTab, setActiveTab] = useState<HallOfFameTab>("holeInOne");

  const filtered = useMemo(
    () => hallOfFamePeople.filter((p) => p.tab === activeTab),
    [activeTab],
  );

  return (
    <Card
      dense
      fullHeight
      className={CORE_CARD_CLASS}
      title="명예의 전당"
      bodyClassName="flex flex-1 flex-col p-3.5"
    >
      <div className="mb-3 flex gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-bold transition-colors lg:text-sm",
              activeTab === tab.key
                ? "bg-pul-deep text-white shadow-sm"
                : "bg-pul-light text-pul-muted hover:text-pul-deep",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ul className="flex-1 space-y-2">
        {filtered.map((person, index) => (
          <li
            key={person.id}
            className="flex items-center gap-3 rounded-lg border border-pul-border/70 bg-white px-2.5 py-2.5 shadow-[0_1px_4px_rgba(6,78,59,0.04)]"
          >
            <div className="relative shrink-0">
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-base font-bold text-white shadow-md ring-2 ring-white",
                  profileColors[index % profileColors.length],
                )}
              >
                {person.name.charAt(0)}
              </div>
              <span
                className={cn(
                  "absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black shadow-sm",
                  medalStyles[index] ?? medalStyles[2],
                )}
              >
                {index + 1}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">{person.name}</p>
              <p className="truncate text-xs text-pul-muted">
                {person.achievement}
              </p>
            </div>
            {index === 0 && (
              <span className="shrink-0 rounded-full bg-pul-gold/20 px-2 py-0.5 text-[10px] font-bold text-pul-gold">
                TOP
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
