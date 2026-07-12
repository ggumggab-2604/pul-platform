"use client";

import type { CourseHallOfFameEntry } from "@/data/courseDetailExtras";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { BadgeCheck, Trophy } from "lucide-react";
import { useMemo, useState } from "react";

const tabs = [
  { key: "all", label: "전체" },
  { key: "홀인원", label: "홀인원" },
  { key: "베스트 스코어", label: "베스트" },
  { key: "월례회 우승", label: "우승" },
] as const;

const medalStyles = [
  "bg-gradient-to-br from-amber-300 to-amber-600 text-amber-950",
  "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800",
  "bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950",
];

type CourseHallOfFameDetailProps = {
  entries: CourseHallOfFameEntry[];
};

export function CourseHallOfFameDetail({ entries }: CourseHallOfFameDetailProps) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("all");

  const filtered = useMemo(() => {
    if (activeTab === "all") return entries;
    if (activeTab === "베스트 스코어") {
      return entries.filter((e) => e.recordType.includes("베스트"));
    }
    if (activeTab === "월례회 우승") {
      return entries.filter(
        (e) => e.recordType.includes("우승") || e.recordType.includes("월례회"),
      );
    }
    return entries.filter((e) => e.recordType.includes(activeTab));
  }, [entries, activeTab]);

  return (
    <Card
      dense
      title="명예의 전당"
      action={
        <Trophy className="h-5 w-5 text-amber-500" aria-hidden="true" />
      }
    >
      <p className="text-sm text-pul-muted lg:text-base">
        이 골프장에서 기록을 남긴 회원과 동호회를 확인하세요.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-bold lg:text-sm",
              activeTab === tab.key
                ? "bg-pul-deep text-white"
                : "bg-pul-light text-pul-muted hover:text-pul-deep",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {filtered.map((entry, index) => (
            <li
              key={entry.id}
              className="flex items-start gap-3 rounded-xl border border-pul-border/80 px-3 py-3 lg:px-4"
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  medalStyles[index % medalStyles.length],
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-bold text-foreground lg:text-lg">{entry.name}</p>
                  {entry.verified ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200/70 lg:text-xs">
                      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                      인증
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-pul-muted lg:text-base">{entry.clubName}</p>
                <p className="mt-1 text-sm font-semibold text-pul-point lg:text-base">
                  {entry.recordType} · {entry.record}
                </p>
                <time className="mt-0.5 block text-xs text-pul-muted lg:text-sm">{entry.date}</time>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-pul-border bg-pul-light/40 px-4 py-6 text-center text-base text-pul-muted">
          등록된 명예의 전당 기록이 없습니다.
        </p>
      )}
    </Card>
  );
}
