"use client";

import type { CoursePhoto } from "@/data/courseDetailPageData";
import { cn } from "@/lib/utils";
import { BadgeCheck, ChevronLeft, ChevronRight, Users, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

type CoursePhotoLightboxProps = {
  photos: CoursePhoto[];
  initialIndex: number;
  onClose: () => void;
};

export function CoursePhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: CoursePhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index];

  const goPrev = useCallback(
    () => setIndex((i) => (i === 0 ? photos.length - 1 : i - 1)),
    [photos.length],
  );
  const goNext = useCallback(
    () => setIndex((i) => (i === photos.length - 1 ? 0 : i + 1)),
    [photos.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          aria-label="닫기"
        >
          <X className="h-6 w-6" />
        </button>

        <div className="relative aspect-[16/10] w-full bg-black">
          <Image src={photo.src} alt={photo.alt} fill className="object-contain" sizes="768px" />
        </div>

        <div className="space-y-2 p-4 lg:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {photo.source === "operator" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200/70">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                운영자 인증
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-pul-light px-2.5 py-1 text-xs font-bold text-pul-deep ring-1 ring-pul-border">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                동호회 공개사진
              </span>
            )}
            <span className="text-sm text-pul-muted">
              {index + 1} / {photos.length}
            </span>
          </div>
          <p className="text-lg font-bold text-foreground">{photo.caption ?? photo.alt}</p>
          <dl className="grid gap-1.5 text-sm text-pul-muted lg:text-base">
            {photo.takenAt ? (
              <div>
                <dt className="inline font-semibold text-foreground">촬영일 </dt>
                <dd className="inline">{photo.takenAt}</dd>
              </div>
            ) : null}
            {photo.caption ? (
              <div>
                <dt className="inline font-semibold text-foreground">설명 </dt>
                <dd className="inline">{photo.caption}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline font-semibold text-foreground">업로드 출처 </dt>
              <dd className="inline">
                {photo.source === "operator"
                  ? "골프장 운영자 인증"
                  : photo.clubName
                    ? `${photo.clubName} 동호회 공개`
                    : "동호회 회원 공개"}
                {photo.uploaderNickname ? ` · ${photo.uploaderNickname}` : null}
              </dd>
            </div>
          </dl>
        </div>

        {photos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-pul-deep shadow"
              aria-label="이전"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-pul-deep shadow"
              aria-label="다음"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
