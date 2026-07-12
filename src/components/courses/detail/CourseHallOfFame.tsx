"use client";

import { HallOfFameRecordCardView } from "@/components/courses/detail/HallOfFameRecordCard";
import { Card } from "@/components/ui/Card";
import type { HallOfFameRecordCard } from "@/data/courseDetailPageData";
import { Trophy } from "lucide-react";
import { useState } from "react";

type CourseHallOfFameProps = {
  records: HallOfFameRecordCard[];
  onViewAll: (type: string) => void;
  onVerifyApply: () => void;
};

export function CourseHallOfFame({ records, onViewAll, onVerifyApply }: CourseHallOfFameProps) {
  const [activeType, setActiveType] = useState(records[0]?.type ?? "holeInOne");
  const activeRecord = records.find((r) => r.type === activeType) ?? records[0];

  return (
    <Card
      dense
      title="이 구장 명예의 전당"
      action={<Trophy className="h-5 w-5 text-amber-500" aria-hidden="true" />}
    >
      <p className="text-[15px] leading-relaxed text-pul-muted lg:text-base">
        홀인원 · 알바트로스 · 콘도르 기록을 확인하세요. 인증되지 않은 기록은 공식 기록이 아닙니다.
      </p>

      {/* 모바일·태블릿: 탭으로 1개씩 */}
      <div className="mt-4 lg:hidden">
        <div
          className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1"
          role="tablist"
          aria-label="명예의 전당 기록 유형"
        >
          {records.map((record) => {
            const selected = record.type === activeType;
            return (
              <button
                key={record.type}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveType(record.type)}
                className={
                  selected
                    ? "inline-flex min-h-11 shrink-0 items-center rounded-lg bg-pul-point px-4 text-[15px] font-bold text-white"
                    : "inline-flex min-h-11 shrink-0 items-center rounded-lg border border-pul-border bg-white px-4 text-[15px] font-bold text-pul-deep"
                }
              >
                {record.label}
              </button>
            );
          })}
        </div>
        {activeRecord ? (
          <div className="mt-3">
            <HallOfFameRecordCardView
              record={activeRecord}
              onViewAll={() => onViewAll(activeRecord.label)}
              onVerifyApply={onVerifyApply}
            />
          </div>
        ) : null}
      </div>

      {/* 데스크톱: 3열 유지 */}
      <div className="mt-4 hidden gap-3 lg:grid lg:grid-cols-3 lg:gap-4">
        {records.map((record) => (
          <HallOfFameRecordCardView
            key={record.type}
            record={record}
            onViewAll={() => onViewAll(record.label)}
            onVerifyApply={onVerifyApply}
          />
        ))}
      </div>
    </Card>
  );
}
