"use client";

import {
  OperationStatusBadge,
  ReservationTypeBadge,
} from "@/components/courses/detail/courseDetailShared";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import type { CourseMapItem } from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import { MapPin, Pencil, Phone, Trophy, Users } from "lucide-react";
import Link from "next/link";

type CourseBookingCardProps = {
  course: CourseMapItem;
  detail: CourseDetailPageData;
  mapsUrl: string;
  phoneHref: string;
  className?: string;
  onReport: () => void;
};

/** 레거시 사이드 카드 — 날씨 패널 없음 (상세는 CompactCourseWeather만 사용) */
export function CourseBookingCard({
  course,
  detail,
  mapsUrl,
  phoneHref,
  className,
  onReport,
}: CourseBookingCardProps) {
  return (
    <aside className={cn("static space-y-4", className)}>
      <div className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <OperationStatusBadge status={detail.operationStatus} />
          <ReservationTypeBadge course={course} />
        </div>
        <p className="mt-3 text-sm text-pul-muted lg:text-base">
          예약·이용 문의는 전화 확인을 이용해 주세요.
        </p>
        <p className="mt-1 text-lg font-bold text-pul-deep">{course.phone}</p>

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
            href="/clubs"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
          >
            <Users className="h-5 w-5" aria-hidden="true" />
            동호회 보기
          </Link>
          <Link
            href="/events"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
          >
            <Trophy className="h-5 w-5" aria-hidden="true" />
            대회 보기
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
