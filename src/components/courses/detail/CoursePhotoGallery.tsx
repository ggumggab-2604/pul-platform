"use client";

import { MockDataBadge } from "@/components/courses/detail/courseDetailShared";
import type { CoursePhoto } from "@/data/courseDetailPageData";
import { cn } from "@/lib/utils";
import { BadgeCheck, Camera, ChevronLeft, ChevronRight, Users } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";

type CoursePhotoGalleryProps = {
  photos: CoursePhoto[];
  courseName: string;
  isMock?: boolean;
};

function PhotoSourceBadge({ source }: { source: CoursePhoto["source"] }) {
  if (source === "operator") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/90 px-2 py-1 text-xs font-bold text-white shadow-sm lg:text-sm">
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
        운영자 인증
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-bold text-pul-deep shadow-sm ring-1 ring-pul-border lg:text-sm">
      <Users className="h-3.5 w-3.5 text-pul-point" aria-hidden="true" />
      동호회 공개사진
    </span>
  );
}

export function CoursePhotoGallery({ photos, courseName, isMock }: CoursePhotoGalleryProps) {
  const galleryPhotos = useMemo(
    () => (photos.length > 0 ? photos : []),
    [photos],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const active = galleryPhotos[activeIndex];

  const goPrev = () =>
    setActiveIndex((i) => (i === 0 ? galleryPhotos.length - 1 : i - 1));
  const goNext = () =>
    setActiveIndex((i) => (i === galleryPhotos.length - 1 ? 0 : i + 1));

  if (!active) return null;

  const operatorPhotos = galleryPhotos.filter((p) => p.source === "operator");
  const clubPhotos = galleryPhotos.filter((p) => p.source === "club");

  return (
    <section className="overflow-hidden rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
      <div className="relative aspect-[16/10] w-full bg-pul-light sm:aspect-[2/1] lg:aspect-[21/9]">
        <Image
          src={active.src}
          alt={active.alt}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 900px"
          priority
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <PhotoSourceBadge source={active.source} />
          {isMock ? <MockDataBadge /> : null}
        </div>
        {galleryPhotos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-pul-deep shadow-md hover:bg-white"
              aria-label="이전 사진"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-pul-deep shadow-md hover:bg-white"
              aria-label="다음 사진"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 pb-3 pt-8">
          <p className="text-base font-bold text-white lg:text-lg">{active.caption ?? active.alt}</p>
          {active.clubName ? (
            <p className="mt-0.5 text-sm text-white/90">{active.clubName}</p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-pul-border/80 px-3 py-3 lg:px-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-pul-muted">
          <Camera className="h-4 w-4 text-pul-point" aria-hidden="true" />
          골프장 사진 {activeIndex + 1} / {galleryPhotos.length}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {galleryPhotos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn(
                "relative h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 lg:h-20 lg:w-28",
                activeIndex === index ? "ring-pul-point" : "ring-transparent",
              )}
            >
              <Image src={photo.src} alt={photo.alt} fill className="object-cover" sizes="112px" />
              <span
                className={cn(
                  "absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[10px] font-bold text-white",
                  photo.source === "operator" ? "bg-emerald-700/85" : "bg-pul-deep/75",
                )}
              >
                {photo.source === "operator" ? "인증" : "동호회"}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-pul-muted lg:text-sm">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
            운영자 인증 {operatorPhotos.length}장
          </span>
          <span className="rounded-full bg-pul-light px-2 py-0.5 font-semibold text-pul-deep">
            동호회 공개 {clubPhotos.length}장
          </span>
        </div>
      </div>
    </section>
  );
}
