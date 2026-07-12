"use client";

import {
  CourseTypeBadge,
  OperationStatusBadge,
  ReservationTypeBadge,
} from "@/components/courses/detail/courseDetailShared";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import type { CourseMapItem } from "@/data/courseMapData";
import { MapPin } from "lucide-react";

type CourseHeaderBarProps = {
  course: CourseMapItem;
  detail: CourseDetailPageData;
};

export function CourseHeaderBar({ course, detail }: CourseHeaderBarProps) {
  return (
    <section className="rounded-xl border border-pul-border bg-white px-4 py-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:px-5 lg:py-5">
      <div className="flex flex-wrap items-center gap-2">
        <CourseTypeBadge type={course.type} />
        <OperationStatusBadge status={detail.operationStatus} />
        <ReservationTypeBadge course={course} />
      </div>
      <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-pul-muted lg:text-base">
        <MapPin className="h-4 w-4 shrink-0 text-pul-point" aria-hidden="true" />
        {course.region} {course.city}
      </p>
      <h1 className="mt-1 text-2xl font-bold text-foreground lg:text-3xl">{course.name}</h1>
      <p className="mt-2 text-base leading-relaxed text-pul-muted lg:text-lg">{detail.tagline}</p>
    </section>
  );
}
