"use client";

import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import type { CourseMapItem } from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import { MapPin, Pencil, Phone, Trophy, Users } from "lucide-react";
import Link from "next/link";

type CourseActionSidebarProps = {
  course: CourseMapItem;
  detail: CourseDetailPageData;
  mapsUrl: string;
  phoneHref: string;
  className?: string;
  onReport: () => void;
  onClubsAnchor?: () => void;
  onEventsAnchor?: () => void;
};

/** 레거시 액션 사이드바 — 날씨 요약 제거 (상세는 CompactCourseWeather만 사용) */
export function CourseActionSidebar({
  course,
  mapsUrl,
  phoneHref,
  className,
  onReport,
}: CourseActionSidebarProps) {
  return (
    <aside className={cn("static", className)}>
      <div className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5">
        <p className="text-base font-bold text-pul-deep">{course.name}</p>
        <p className="mt-1 text-sm text-pul-muted lg:text-base">{course.phone}</p>

        <div className="mt-4 space-y-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-pul-point px-4 text-base font-bold text-white hover:bg-pul-deep"
          >
            <MapPin className="h-5 w-5" aria-hidden="true" />
            길찾기
          </a>
          <a
            href={phoneHref}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light"
          >
            <Phone className="h-5 w-5" aria-hidden="true" />
            전화 문의
          </a>
          <Link
            href="#using-clubs"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
          >
            <Users className="h-5 w-5" aria-hidden="true" />
            이 구장 이용 동호회
          </Link>
          <Link
            href="#course-events"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
          >
            <Trophy className="h-5 w-5" aria-hidden="true" />
            이 구장 대회
          </Link>
          <button
            type="button"
            onClick={onReport}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
          >
            <Pencil className="h-5 w-5" aria-hidden="true" />
            정보 수정 제보
          </button>
        </div>
      </div>
    </aside>
  );
}
