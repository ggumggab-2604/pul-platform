"use client";

import { COURSE_DISCLAIMER } from "@/components/courses/detail/courseDetailShared";
import { MapPin, Pencil, Phone } from "lucide-react";
import Link from "next/link";

type CourseDetailFooterCTAProps = {
  mapsUrl: string;
  phoneHref: string;
  onReview: () => void;
  onReport: () => void;
};

export function CourseDetailFooterCTA({
  mapsUrl,
  phoneHref,
  onReview,
  onReport,
}: CourseDetailFooterCTAProps) {
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-pul-point px-4 text-sm font-bold text-white hover:bg-pul-deep lg:text-base"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          길찾기
        </a>
        <a
          href={phoneHref}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          전화 문의
        </a>
        <button
          type="button"
          onClick={onReview}
          className="inline-flex min-h-12 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
        >
          후기 작성
        </button>
        <button
          type="button"
          onClick={onReport}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          정보 제보
        </button>
        <Link
          href="/courses"
          className="col-span-2 inline-flex min-h-12 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-muted hover:bg-pul-light hover:text-pul-deep sm:col-span-1 lg:text-base"
        >
          목록으로
        </Link>
      </div>

      <p className="rounded-lg border border-pul-border/80 bg-pul-light/50 px-4 py-3 text-sm leading-relaxed text-pul-muted lg:text-base">
        {COURSE_DISCLAIMER}
      </p>
    </section>
  );
}
