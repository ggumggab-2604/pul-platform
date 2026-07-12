"use client";

import {
  FeatureBadge,
  OperationStatusBadge,
  COURSE_FAVORITE_MESSAGE,
  COURSE_SHARE_MESSAGE,
} from "@/components/courses/detail/courseDetailShared";
import {
  infoSourceLabels,
  operationStatusLabels,
  type CourseDetailPageData,
} from "@/data/courseDetailPageData";
import { type CourseMapItem } from "@/data/courseMapData";
import { Heart, MapPin, Share2 } from "lucide-react";
import { useState } from "react";

type CourseTitleHeaderProps = {
  course: CourseMapItem;
  detail: CourseDetailPageData;
  onFavoriteHint?: (message: string) => void;
  onShareHint?: (message: string) => void;
};

export function CourseTitleHeader({
  course,
  detail,
  onFavoriteHint,
  onShareHint,
}: CourseTitleHeaderProps) {
  const [favorited, setFavorited] = useState(false);
  const featureBadges = detail.keyFeatureBadges.slice(0, 2);

  const handleFavorite = () => {
    setFavorited((prev) => !prev);
    onFavoriteHint?.(COURSE_FAVORITE_MESSAGE);
  };

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: course.name,
          text: detail.oneLineIntro ?? course.description,
          url: window.location.href,
        });
        return;
      } catch {
        /* user cancelled or unsupported — fall through */
      }
    }
    onShareHint?.(COURSE_SHARE_MESSAGE);
  };

  return (
    <header className="rounded-xl border border-pul-border bg-white px-4 py-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:px-5 lg:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <OperationStatusBadge status={detail.operationStatus} />
            {featureBadges.map((badge) => (
              <FeatureBadge key={badge} label={badge} />
            ))}
          </div>

          <h1 className="mt-3 text-2xl font-bold leading-snug text-foreground lg:text-3xl">
            {course.name}
          </h1>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold text-pul-deep lg:text-base">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4 shrink-0 text-pul-point" aria-hidden="true" />
              {detail.distanceFromLocation}
            </span>
            <span className="text-pul-border" aria-hidden="true">
              ·
            </span>
            <span>
              {course.region} {course.city}
            </span>
            <span className="text-pul-border" aria-hidden="true">
              ·
            </span>
            <span>
              {course.holes}홀 · {course.address}
            </span>
          </p>

          {detail.oneLineIntro ? (
            <p className="mt-2 text-[15px] leading-relaxed text-pul-muted lg:text-base">
              {detail.oneLineIntro}
            </p>
          ) : null}

          <dl className="mt-3 grid gap-2 rounded-lg border border-pul-border/70 bg-pul-light/30 px-3 py-2.5 text-[15px] sm:grid-cols-2 lg:text-base">
            <div>
              <dt className="text-[13px] font-semibold text-pul-muted lg:text-sm">운영 상태</dt>
              <dd className="font-bold text-pul-deep">
                {operationStatusLabels[detail.operationStatus]}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-pul-muted lg:text-sm">정보 확인일</dt>
              <dd className="font-bold text-pul-deep">{detail.operationVerifiedAt}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-pul-muted lg:text-sm">정보 출처</dt>
              <dd className="font-bold text-pul-deep">{infoSourceLabels[detail.infoSource]}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-pul-muted lg:text-sm">전화</dt>
              <dd className="font-bold text-pul-deep">{course.phone}</dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={handleFavorite}
            aria-pressed={favorited}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-pul-border bg-white px-3 text-[15px] font-bold text-pul-muted hover:bg-pul-light hover:text-pul-deep"
          >
            <Heart
              className={`h-5 w-5 ${favorited ? "fill-rose-500 text-rose-500" : ""}`}
              aria-hidden="true"
            />
            즐겨찾기
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-pul-border bg-white px-3 text-[15px] font-bold text-pul-muted hover:bg-pul-light hover:text-pul-deep"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
            공유
          </button>
        </div>
      </div>
    </header>
  );
}
