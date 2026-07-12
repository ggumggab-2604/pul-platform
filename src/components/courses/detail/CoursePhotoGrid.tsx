"use client";

import type { CoursePhoto } from "@/data/courseDetailPageData";
import { CoursePhotoLightbox } from "@/components/courses/detail/CoursePhotoLightbox";
import { cn } from "@/lib/utils";
import { BadgeCheck, Images, Users } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";

type CoursePhotoGridProps = {
  photos: CoursePhoto[];
  isMock?: boolean;
  variant?: "standalone" | "embedded";
};

type GalleryPhoto = {
  id: string;
  src: string;
  alt: string;
  sourceType: CoursePhoto["source"];
  sourceName: string;
  takenAt?: string;
};

const DISPLAY_COUNT = 9;
const THUMB_COUNT = 8;

const MOCK_SRCS = [
  "/images/hero-park-golf.jpg",
  "/images/banner-course.jpg",
  "/images/banner-community.jpg",
  "/images/banner-equipment.jpg",
];

const THUMB_GRID_CLASS = [
  "col-start-3 row-start-1",
  "col-start-4 row-start-1",
  "col-start-3 row-start-2",
  "col-start-4 row-start-2",
  "col-start-1 row-start-3",
  "col-start-2 row-start-3",
  "col-start-3 row-start-3",
  "col-start-4 row-start-3",
] as const;

function getSourceName(photo: CoursePhoto): string {
  if (photo.source === "operator") return "골프장 운영자";
  return photo.clubName ?? photo.uploaderNickname ?? "동호회 공개";
}

function toGalleryPhoto(photo: CoursePhoto): GalleryPhoto {
  return {
    id: photo.id,
    src: photo.src,
    alt: photo.alt,
    sourceType: photo.source,
    sourceName: getSourceName(photo),
    takenAt: photo.takenAt,
  };
}

function buildMockPhoto(index: number): GalleryPhoto {
  const isOperator = index % 3 === 0;
  return {
    id: `mock-photo-${index}`,
    src: MOCK_SRCS[index % MOCK_SRCS.length],
    alt: `골프장 현장 사진 ${index + 1}`,
    sourceType: isOperator ? "operator" : "club",
    sourceName: isOperator ? "골프장 운영자" : "파크골프 동호회",
    takenAt: "2026.06.01",
  };
}

function galleryToCoursePhoto(photo: GalleryPhoto): CoursePhoto {
  return {
    id: photo.id,
    src: photo.src,
    alt: photo.alt,
    source: photo.sourceType,
    takenAt: photo.takenAt,
    clubName: photo.sourceType === "club" ? photo.sourceName : undefined,
    uploaderNickname: photo.sourceType === "club" ? photo.sourceName : undefined,
  };
}

function ensureGalleryPhotos(photos: CoursePhoto[]): {
  display: GalleryPhoto[];
  all: CoursePhoto[];
} {
  const sorted = [...photos].sort((a, b) => {
    if (a.source === b.source) return 0;
    return a.source === "operator" ? -1 : 1;
  });

  if (sorted.length === 0) {
    const mock = Array.from({ length: DISPLAY_COUNT }, (_, i) => buildMockPhoto(i));
    return { display: mock, all: mock.map(galleryToCoursePhoto) };
  }

  const gallery = sorted.map(toGalleryPhoto);
  const padded = [...gallery];
  while (padded.length < DISPLAY_COUNT) {
    padded.push(buildMockPhoto(padded.length));
  }

  const allForLightbox = [...sorted];
  for (let i = sorted.length; i < padded.length; i += 1) {
    allForLightbox.push(galleryToCoursePhoto(padded[i]));
  }

  return { display: padded.slice(0, DISPLAY_COUNT), all: allForLightbox };
}

function SourceBadge({ sourceType, compact }: { sourceType: GalleryPhoto["sourceType"]; compact?: boolean }) {
  if (sourceType === "operator") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded bg-emerald-600/90 font-bold text-white",
          compact ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]",
        )}
      >
        <BadgeCheck className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden="true" />
        {compact ? "인증" : "운영자 인증"}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded bg-black/55 font-bold text-white",
        compact ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]",
      )}
    >
      <Users className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden="true" />
      {compact ? "동호회" : "동호회 공개"}
    </span>
  );
}

type PhotoCellProps = {
  photo: GalleryPhoto;
  index: number;
  onOpen: (index: number) => void;
  className?: string;
  showOverlay?: boolean;
  totalCount: number;
  priority?: boolean;
};

function PhotoCell({ photo, index, onOpen, className, showOverlay, totalCount, priority }: PhotoCellProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      className={cn("relative h-full min-h-0 w-full overflow-hidden rounded-lg", className)}
      title={photo.sourceName}
    >
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        className="object-cover"
        sizes="(max-width:1024px) 40vw, 200px"
        priority={priority}
      />
      <span className="absolute left-1 top-1">
        <SourceBadge sourceType={photo.sourceType} compact />
      </span>
      {showOverlay ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 px-1 text-center text-[10px] font-bold leading-snug text-white lg:text-xs">
          <Images className="mb-0.5 h-3.5 w-3.5 lg:h-4 lg:w-4" aria-hidden="true" />
          전체 사진 보기
          <span className="mt-0.5 text-[9px] font-semibold">{totalCount}장</span>
        </span>
      ) : null}
    </button>
  );
}

export function CoursePhotoGrid({ photos, isMock, variant = "standalone" }: CoursePhotoGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { display, all } = useMemo(() => ensureGalleryPhotos(photos), [photos]);
  const embedded = variant === "embedded";

  const main = display[0];
  const thumbs = display.slice(1, 1 + THUMB_COUNT);
  const totalPhotoCount = Math.max(all.length, DISPLAY_COUNT);

  const embeddedDesktopGrid = (
    <div className="box-border hidden h-full min-h-0 grid-cols-4 grid-rows-3 gap-1.5 p-2 lg:grid">
      <PhotoCell
        photo={main}
        index={0}
        onOpen={setLightboxIndex}
        className="col-span-2 row-span-2"
        totalCount={totalPhotoCount}
        priority
      />
      {thumbs.map((photo, i) => (
        <PhotoCell
          key={photo.id}
          photo={photo}
          index={i + 1}
          onOpen={setLightboxIndex}
          className={THUMB_GRID_CLASS[i]}
          showOverlay={i === thumbs.length - 1}
          totalCount={totalPhotoCount}
        />
      ))}
    </div>
  );

  const embeddedMobileGrid = (
    <div className="flex flex-col gap-2 p-2 lg:hidden">
      <PhotoCell
        photo={main}
        index={0}
        onOpen={setLightboxIndex}
        className="min-h-[200px] w-full"
        totalCount={totalPhotoCount}
        priority
      />
      <div
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]"
        aria-label="골프장 사진 갤러리"
      >
        {thumbs.map((photo, i) => (
          <PhotoCell
            key={photo.id}
            photo={photo}
            index={i + 1}
            onOpen={setLightboxIndex}
            className="h-24 w-[30%] min-w-[7.5rem] shrink-0 snap-start sm:h-28 sm:min-w-[8.5rem]"
            showOverlay={i === thumbs.length - 1}
            totalCount={totalPhotoCount}
          />
        ))}
      </div>
      <p className="px-0.5 text-[13px] font-medium text-pul-muted">
        사진을 좌우로 밀어 더 볼 수 있습니다
      </p>
    </div>
  );

  const standaloneGrid = (
    <div className="grid grid-cols-4 grid-rows-3 gap-2 p-2">
      <PhotoCell
        photo={main}
        index={0}
        onOpen={setLightboxIndex}
        className="col-span-2 row-span-2 min-h-[200px]"
        totalCount={totalPhotoCount}
        priority
      />
      {thumbs.map((photo, i) => (
        <PhotoCell
          key={photo.id}
          photo={photo}
          index={i + 1}
          onOpen={setLightboxIndex}
          className={cn(THUMB_GRID_CLASS[i], "min-h-[72px]")}
          showOverlay={i === thumbs.length - 1}
          totalCount={totalPhotoCount}
        />
      ))}
    </div>
  );

  return (
    <>
      {embedded ? (
        <>
          {embeddedDesktopGrid}
          {embeddedMobileGrid}
        </>
      ) : (
        <section className="overflow-hidden rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
          {standaloneGrid}
          {isMock ? (
            <p className="border-t border-pul-border/60 px-3 py-2 text-xs text-pul-muted lg:text-sm">
              골프장 전경·코스·동호회 활동 사진 갤러리 (개발용 mock)
            </p>
          ) : null}
        </section>
      )}

      {lightboxIndex !== null ? (
        <CoursePhotoLightbox
          photos={all}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </>
  );
}
