"use client";

import type { CoursePhoto } from "@/data/courseDetailPageData";
import { BadgeCheck, Users } from "lucide-react";
import Image from "next/image";

type CoursePhotoOverlayProps = {
  photo: CoursePhoto;
  x: number;
  y: number;
  onClick: () => void;
};

export function CoursePhotoOverlay({ photo, x, y, onClick }: CoursePhotoOverlayProps) {
  return (
    <div
      className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%`, width: "4.5rem", height: "3.25rem" }}
    >
      <button
        type="button"
        onClick={onClick}
        className="relative h-full w-full overflow-hidden rounded-lg shadow-lg ring-2 ring-white transition hover:scale-105 hover:ring-pul-point/60"
        aria-label={`${photo.alt} 사진 보기`}
      >
        <Image src={photo.src} alt={photo.alt} fill className="object-cover" sizes="72px" />
        <span className="absolute left-0.5 top-0.5 inline-flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white">
          {photo.source === "operator" ? (
            <BadgeCheck className="h-2.5 w-2.5" aria-hidden="true" />
          ) : (
            <Users className="h-2.5 w-2.5" aria-hidden="true" />
          )}
          {photo.source === "operator" ? "인증" : "동호회"}
        </span>
      </button>
    </div>
  );
}
