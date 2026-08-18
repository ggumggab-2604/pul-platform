"use client";

import { Card } from "@/components/ui/Card";
import {
  dashboardBodyClass,
  dashboardCardClass,
  dashboardFooterClass,
  dashboardListClass,
} from "@/components/courses/courseDetailDashboardLayout";
import type { CourseHallOfFameEntry } from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import Link from "next/link";

const MOBILE_HOF_LIMIT = 2;
const PC_HOF_LIMIT = 3;

type CourseHallOfFameSectionProps = {
  entries: CourseHallOfFameEntry[];
  className?: string;
};

export function CourseHallOfFameSection({ entries, className }: CourseHallOfFameSectionProps) {
  return (
    <Card
        title="이 구장 명예의 전당"
        dense
        className={cn(dashboardCardClass, className)}
        bodyClassName={dashboardBodyClass}
      >
        {entries.length > 0 ? (
          <>
            <ul className={cn("divide-y divide-pul-border/60", dashboardListClass)}>
              {entries.map((entry, index) => (
                <li
                  key={entry.id}
                  className={cn(
                    "flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0 max-lg:py-1.5",
                    index >= MOBILE_HOF_LIMIT && "hidden lg:flex",
                    index >= PC_HOF_LIMIT && "lg:hidden",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground max-lg:text-xs">
                      {entry.name}{" "}
                      <span className="font-semibold text-pul-point">/ {entry.recordType}</span>
                    </p>
                    <p className="truncate text-xs text-pul-muted max-lg:hidden lg:line-clamp-1">
                      {entry.clubName}
                    </p>
                  </div>
                  <div className="shrink-0 max-w-[5.5rem] text-right text-xs font-semibold text-pul-deep max-lg:max-w-[4.5rem] max-lg:text-[11px] lg:max-w-none">
                    <p className="truncate">{entry.record}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              href="/hall-of-fame"
              className={cn(
                "mt-3 inline-flex w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 py-2.5 text-sm font-bold text-pul-deep hover:bg-pul-light max-lg:min-h-12",
                dashboardFooterClass,
              )}
            >
              전체 보기
            </Link>
          </>
        ) : (
          <p className="text-sm text-pul-muted">등록된 명예의 전당 기록이 없습니다.</p>
        )}
    </Card>
  );
}
