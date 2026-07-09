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
import { useState } from "react";

const MOBILE_HOF_LIMIT = 2;
const PC_HOF_LIMIT = 3;

const HOF_PREP_MESSAGE =
  "구장별 명예의 전당 전체 보기 페이지는 준비 중입니다.\n정식 오픈 후 기록 유형별 필터와 상세 기록을 확인할 수 있습니다.";

function PrepModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-pul-border bg-white p-5 shadow-[0_12px_40px_rgba(6,78,59,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-foreground">전체 보기 준비 중</h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-pul-muted">
          {HOF_PREP_MESSAGE}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
        >
          확인
        </button>
      </div>
    </div>
  );
}

type CourseHallOfFameSectionProps = {
  entries: CourseHallOfFameEntry[];
  className?: string;
};

export function CourseHallOfFameSection({ entries, className }: CourseHallOfFameSectionProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
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
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className={cn(
                "mt-3 inline-flex w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 py-2.5 text-sm font-bold text-pul-deep hover:bg-pul-light max-lg:min-h-12",
                dashboardFooterClass,
              )}
            >
              전체 보기
            </button>
          </>
        ) : (
          <p className="text-sm text-pul-muted">등록된 명예의 전당 기록이 없습니다.</p>
        )}
      </Card>

      {showModal && <PrepModal onClose={() => setShowModal(false)} />}
    </>
  );
}
