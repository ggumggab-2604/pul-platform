"use client";

import { Card } from "@/components/ui/Card";
import type { CourseHomeClub } from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type UsingClubGridProps = {
  clubs: CourseHomeClub[];
  region: string;
  onRegister: () => void;
};

function RecruitBadge({ status }: { status: string }) {
  const isOpen = status === "모집 중";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[13px] font-bold ring-1 lg:text-xs",
        isOpen
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
          : "bg-gray-100 text-gray-600 ring-gray-200/80",
      )}
    >
      {status}
    </span>
  );
}

function ClubCard({
  club,
  region,
}: {
  club: CourseHomeClub;
  region: string;
}) {
  return (
    <li className="flex flex-col rounded-xl border border-pul-border/80 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-foreground lg:text-lg">{club.name}</h3>
          <p className="mt-0.5 text-[15px] text-pul-muted lg:text-sm">{region}</p>
        </div>
        <RecruitBadge status={club.recruitStatus} />
      </div>
      <p className="mt-2 flex items-center gap-1 text-[15px] text-pul-muted lg:text-base">
        <Users className="h-4 w-4 text-pul-point" aria-hidden="true" />
        {club.memberCount}명 · {club.schedule}
      </p>
      <Link
        href="/clubs"
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white text-[15px] font-bold text-pul-deep hover:bg-pul-light lg:text-base"
      >
        동호회 상세보기
      </Link>
    </li>
  );
}

export function UsingClubGrid({ clubs, region, onRegister }: UsingClubGridProps) {
  const [expanded, setExpanded] = useState(false);
  const mobileVisible = expanded ? clubs : clubs.slice(0, 2);
  const hasMore = clubs.length > 2;

  return (
    <Card title="이 구장을 이용하는 동호회" dense>
      <p className="text-[15px] leading-relaxed text-pul-muted lg:text-base">
        이 골프장을 주 활동 장소로 등록한 동호회입니다.
      </p>

      {clubs.length > 0 ? (
        <>
          <ul className="mt-4 grid gap-3 lg:hidden">
            {mobileVisible.map((club) => (
              <ClubCard key={club.id} club={club} region={region} />
            ))}
          </ul>
          {hasMore ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-[15px] font-bold text-pul-deep hover:bg-pul-light lg:hidden"
            >
              {expanded ? "접기" : "동호회 더보기"}
            </button>
          ) : null}

          <ul className="mt-4 hidden gap-3 lg:grid lg:grid-cols-2">
            {clubs.map((club) => (
              <ClubCard key={club.id} club={club} region={region} />
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-pul-border bg-pul-light/40 px-4 py-6 text-center">
          <p className="text-base font-bold text-pul-deep lg:text-lg">
            이 골프장을 이용하는 동호회를 등록해 주세요.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onRegister}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pul-point text-[15px] font-bold text-white hover:bg-pul-deep lg:min-h-12 lg:text-base"
      >
        이 구장을 이용하는 동호회 등록하기
      </button>
    </Card>
  );
}
