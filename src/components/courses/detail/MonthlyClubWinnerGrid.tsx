"use client";

import { Card } from "@/components/ui/Card";
import type { MonthlyClubWinner } from "@/data/courseDetailPageData";
import Image from "next/image";
import { useState } from "react";

type MonthlyClubWinnerGridProps = {
  winners: MonthlyClubWinner[];
  onRegister: () => void;
  onViewPast: () => void;
};

export function MonthlyClubWinnerGrid({
  winners,
  onRegister,
  onViewPast,
}: MonthlyClubWinnerGridProps) {
  const [expanded, setExpanded] = useState(false);
  const all = winners.slice(0, 6);
  const mobileVisible = expanded ? all : all.slice(0, 2);
  const hasMore = all.length > 2;

  return (
    <Card title="동호회별 월례회 우승자" dense>
      {all.length > 0 ? (
        <>
          {/* 모바일: 1~2개 + 더보기 */}
          <div className="grid gap-3 lg:hidden">
            {mobileVisible.map((winner) => (
              <WinnerCard key={winner.id} winner={winner} />
            ))}
          </div>
          {hasMore ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-[15px] font-bold text-pul-deep hover:bg-pul-light lg:hidden"
            >
              {expanded ? "접기" : "우승자 더보기"}
            </button>
          ) : null}

          <div className="mt-4 hidden gap-3 lg:grid lg:grid-cols-3">
            {all.map((winner) => (
              <WinnerCard key={winner.id} winner={winner} />
            ))}
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-pul-border bg-pul-light/40 px-4 py-6 text-center text-[15px] text-pul-muted lg:text-base">
          등록된 월례회 우승 기록이 없습니다.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onRegister}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-[15px] font-bold text-white hover:bg-pul-deep lg:text-base"
        >
          월례회 결과 등록
        </button>
        <button
          type="button"
          onClick={onViewPast}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-[15px] font-bold text-pul-deep hover:bg-pul-light lg:text-base"
        >
          지난 우승자 보기
        </button>
      </div>
    </Card>
  );
}

function WinnerCard({ winner }: { winner: MonthlyClubWinner }) {
  return (
    <article className="rounded-xl border border-pul-border/80 p-4">
      <p className="text-[13px] font-bold text-pul-point lg:text-sm">{winner.yearMonth}</p>
      <h3 className="mt-1 text-base font-bold text-foreground lg:text-lg">{winner.clubName}</h3>
      <p className="text-[15px] text-pul-muted lg:text-sm">{winner.meetingName}</p>
      <div className="mt-3 flex items-center gap-3">
        {winner.photoSrc ? (
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2 ring-pul-point/20">
            <Image src={winner.photoSrc} alt="" fill className="object-cover" sizes="48px" />
          </div>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pul-light text-lg font-bold text-pul-point">
            {winner.winnerName.charAt(0)}
          </div>
        )}
        <div>
          <p className="text-lg font-bold text-foreground">{winner.winnerName}</p>
          <p className="text-[15px] font-semibold text-pul-deep lg:text-sm">{winner.score}</p>
        </div>
      </div>
      <button
        type="button"
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-[15px] font-bold text-pul-deep hover:bg-pul-light lg:text-sm"
      >
        결과 상세보기
      </button>
    </article>
  );
}
