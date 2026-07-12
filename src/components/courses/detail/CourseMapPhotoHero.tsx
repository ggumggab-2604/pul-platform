"use client";

import {
  getUsageGuideLabel,
  scrollToUsageGuide,
} from "@/components/courses/detail/courseDetailShared";
import { CourseMapPanel } from "@/components/courses/detail/CourseMapPanel";
import { CoursePhotoLightbox } from "@/components/courses/detail/CoursePhotoLightbox";
import {
  pickCourseHeroPhoto,
  type CourseDetailPageData,
  type CoursePhoto,
} from "@/data/courseDetailPageData";
import type { CourseMapItem } from "@/data/courseMapData";
import { BadgeCheck, CalendarDays, Camera, Images, MapPin, Phone, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

type CourseMapPhotoHeroProps = {
  course: CourseMapItem;
  detail: CourseDetailPageData;
  mapsUrl: string;
  phoneHref: string;
  onUploadPhoto: () => void;
};

function sortPhotos(photos: CoursePhoto[]): CoursePhoto[] {
  const operator = photos.filter((p) => p.source === "operator");
  const club = photos.filter((p) => p.source === "club");
  return [...operator, ...club];
}

/**
 * 사진 영역 순서:
 * 1) 대표사진(우선순위) 또는 empty state
 * 2) 지도·코스 안내
 * 3) 회원·동호회 공개 사진
 * 4) 전체 사진 보기
 * 5) 모바일 빠른 이용 2×2
 */
export function CourseMapPhotoHero({
  course,
  detail,
  mapsUrl,
  phoneHref,
  onUploadPhoto,
}: CourseMapPhotoHeroProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const photos = useMemo(() => sortPhotos(detail.photos), [detail.photos]);
  const hero = useMemo(() => pickCourseHeroPhoto(detail.photos), [detail.photos]);
  const clubPhotos = photos.filter((p) => p.source === "club").slice(0, 6);
  const heroIndex = hero ? photos.findIndex((p) => p.id === hero.id) : 0;
  const usageGuideLabel = getUsageGuideLabel(course);
  const isBookable = usageGuideLabel === "예약·이용 안내";

  return (
    <section
      id="course-map"
      className="overflow-hidden rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)]"
    >
      {/* 1. Representative hero or empty state — never promo as fake course photo */}
      {hero ? (
        <button
          type="button"
          onClick={() => setLightboxIndex(Math.max(0, heroIndex))}
          className="relative block h-[220px] w-full overflow-hidden sm:h-[260px] lg:h-[300px]"
          aria-label="대표 사진 크게 보기"
        >
          <Image
            src={hero.src}
            alt={hero.alt}
            fill
            priority
            className="object-cover object-center"
            sizes="(max-width:1024px) 100vw, 800px"
          />
          {hero.source === "operator" ? (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded bg-emerald-600/90 px-2 py-1 text-xs font-bold text-white lg:text-sm">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              운영자·관리자 인증
            </span>
          ) : null}
          {hero.caption ? (
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-3 pb-3 pt-8 text-left text-[15px] font-semibold text-white lg:text-base">
              {hero.caption}
            </span>
          ) : null}
        </button>
      ) : (
        <div
          className="flex h-[220px] w-full flex-col items-center justify-center gap-2 bg-pul-light/50 px-4 text-center sm:h-[260px] lg:h-[300px]"
          role="img"
          aria-label="등록된 대표사진이 없습니다"
        >
          <Camera className="h-8 w-8 text-pul-point/70" aria-hidden="true" />
          <p className="text-base font-bold text-pul-deep lg:text-lg">
            등록된 대표사진이 없습니다.
          </p>
          <p className="max-w-sm text-[15px] text-pul-muted lg:text-base">
            이 골프장의 최신 현장사진을 올려주세요.
          </p>
          <button
            type="button"
            onClick={onUploadPhoto}
            className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pul-point px-4 text-[15px] font-bold text-white hover:bg-pul-deep lg:min-h-12 lg:text-base"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            현장사진 올리기
          </button>
        </div>
      )}

      {/* 2. Map / course guide */}
      <div className="border-t border-pul-border/80">
        <CourseMapPanel course={course} detail={detail} className="lg:h-[280px] lg:min-h-[280px]" />
      </div>

      {/* 3. Member/club public photos + 4. View all */}
      <div className="border-t border-pul-border/80 p-3 lg:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-[15px] font-bold text-pul-deep lg:text-base">
            <Users className="h-4 w-4 text-pul-point" aria-hidden="true" />
            회원·동호회 공개 사진
          </p>
          <button
            type="button"
            onClick={() => {
              if (photos.length > 0) setLightboxIndex(0);
            }}
            disabled={photos.length === 0}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-[15px] font-bold text-pul-point hover:text-pul-deep disabled:cursor-default disabled:opacity-50 lg:text-base"
          >
            <Images className="h-4 w-4" aria-hidden="true" />
            전체 사진 보기 ({photos.length})
          </button>
        </div>

        {clubPhotos.length > 0 ? (
          <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {clubPhotos.map((photo) => {
              const index = photos.findIndex((p) => p.id === photo.id);
              return (
                <li key={photo.id} className="shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(index >= 0 ? index : 0)}
                    className="relative h-24 w-[7.5rem] overflow-hidden rounded-lg sm:h-28 sm:w-36"
                    title={photo.clubName ?? photo.alt}
                  >
                    <Image
                      src={photo.src}
                      alt={photo.alt}
                      fill
                      className="object-cover"
                      sizes="144px"
                    />
                    <span className="absolute left-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[10px] font-bold text-white">
                      동호회
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-pul-border bg-pul-light/30 px-3 py-4 text-[15px] text-pul-muted lg:text-base">
            아직 등록된 회원·동호회 공개 사진이 없습니다.
          </p>
        )}
      </div>

      {/* Mobile primary actions — 2×2 (PC uses sidebar quick-actions) */}
      <div className="border-t border-pul-border/80 p-3 lg:hidden">
        <div className="grid grid-cols-2 gap-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 min-h-11 items-center justify-center gap-1.5 rounded-lg bg-pul-point px-2 text-[15px] font-bold text-white hover:bg-pul-deep"
          >
            <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
            길찾기
          </a>
          <a
            href={phoneHref}
            className="inline-flex h-12 min-h-11 items-center justify-center gap-1.5 rounded-lg border border-pul-border bg-white px-2 text-[15px] font-bold text-pul-deep hover:bg-pul-light"
          >
            <Phone className="h-5 w-5 shrink-0" aria-hidden="true" />
            전화 문의
          </a>
          <Link
            href="#using-clubs"
            className="inline-flex h-12 min-h-11 items-center justify-center gap-1.5 rounded-lg border border-pul-border bg-white px-2 text-[15px] font-bold text-pul-deep hover:bg-pul-light"
          >
            <Users className="h-5 w-5 shrink-0" aria-hidden="true" />
            동호회 보기
          </Link>
          <button
            type="button"
            onClick={scrollToUsageGuide}
            className="inline-flex h-12 min-h-11 items-center justify-center gap-1.5 rounded-lg border border-pul-border bg-white px-2 text-[15px] font-bold text-pul-deep hover:bg-pul-light"
            title={detail.reservationGuideSummary}
          >
            <CalendarDays className="h-5 w-5 shrink-0" aria-hidden="true" />
            {isBookable ? (
              <>
                <span className="min-[360px]:hidden">이용 안내</span>
                <span className="hidden min-[360px]:inline">예약·이용 안내</span>
              </>
            ) : (
              "이용 안내"
            )}
          </button>
        </div>
        <p className="mt-2 text-[13px] text-pul-muted">
          {detail.reservationUrl ? "예약 안내" : "예약·이용"} · {detail.reservationGuideSummary}
        </p>
      </div>

      {lightboxIndex !== null && photos.length > 0 ? (
        <CoursePhotoLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </section>
  );
}
