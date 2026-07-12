"use client";

import {
  CourseTypeBadge,
  MockDataBadge,
  OperationStatusBadge,
  ReservationTypeBadge,
} from "@/components/courses/detail/courseDetailShared";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import type { CourseMapItem } from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import { Heart, MapPin, Pencil } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type CourseHeroProps = {
  course: CourseMapItem;
  detail: CourseDetailPageData;
  onFavorite: () => void;
  onReport: () => void;
};

export function CourseHero({ course, detail, onFavorite, onReport }: CourseHeroProps) {
  const [activeImage, setActiveImage] = useState(0);
  const images = detail.images.length > 0 ? detail.images : ["/images/banner-course.jpg"];

  return (
    <section className="overflow-hidden rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
      <div className="relative aspect-[16/9] w-full bg-pul-light sm:aspect-[21/9]">
        <Image
          src={images[activeImage] ?? images[0]}
          alt={`${course.name} 대표 이미지`}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 720px"
          priority
        />
        {detail.isMock ? (
          <div className="absolute left-3 top-3 z-10">
            <MockDataBadge />
          </div>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto border-b border-pul-border/80 px-3 py-2">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setActiveImage(index)}
              className={cn(
                "relative h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2",
                activeImage === index ? "ring-pul-point" : "ring-transparent",
              )}
            >
              <Image src={src} alt="" fill className="object-cover" sizes="80px" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="space-y-3 p-4 lg:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CourseTypeBadge type={course.type} />
          <OperationStatusBadge status={detail.operationStatus} />
          <ReservationTypeBadge course={course} />
        </div>

        <div>
          <p className="flex items-center gap-1 text-sm font-semibold text-pul-muted lg:text-base">
            <MapPin className="h-4 w-4 text-pul-point" aria-hidden="true" />
            {course.region} {course.city}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground lg:text-3xl">{course.name}</h1>
          <p className="mt-2 text-base leading-relaxed text-pul-muted lg:text-lg">{detail.tagline}</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={onFavorite}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
          >
            <Heart className="h-5 w-5 text-pul-point" aria-hidden="true" />
            관심 골프장
          </button>
          <button
            type="button"
            onClick={onReport}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
          >
            <Pencil className="h-5 w-5 text-pul-point" aria-hidden="true" />
            정보 수정 제보
          </button>
        </div>
      </div>
    </section>
  );
}
