"use client";

import { FeaturedYoutubeInstructors } from "@/components/lessons/FeaturedYoutubeInstructors";
import { VideoLessonCard } from "@/components/lessons/VideoLessonCard";
import { VideoLessonRegisterPromo } from "@/components/lessons/VideoLessonRegisterPromo";
import {
  filterVideoLessons,
  videoLessonCategories,
  videoLessons,
} from "@/data/videoLessonData";
import { cn } from "@/lib/utils";
import type { VideoLesson, VideoLessonCategory } from "@/types";
import { useMemo, useState } from "react";

const MOBILE_RECOMMENDED_LIMIT = 3;
const MOBILE_LATEST_LIMIT = 3;
const PC_RECOMMENDED_LIMIT = 4;
const PC_LATEST_LIMIT = 4;

type FreeVideoLessonsSectionProps = {
  onSaveInterest: (lesson: VideoLesson) => void;
  onVideoRegister: () => void;
  initialCategory?: VideoLessonCategory | "all";
  hiddenCategories?: VideoLessonCategory[];
};

function getMobilePreviewVideos(filtered: VideoLesson[]) {
  return getPreviewVideos(filtered, MOBILE_RECOMMENDED_LIMIT, MOBILE_LATEST_LIMIT);
}

function getPcPreviewVideos(filtered: VideoLesson[]) {
  return getPreviewVideos(filtered, PC_RECOMMENDED_LIMIT, PC_LATEST_LIMIT);
}

function getPreviewVideos(
  filtered: VideoLesson[],
  recommendedLimit: number,
  latestLimit: number,
) {
  const recommended = filtered.slice(0, recommendedLimit);
  const recommendedIds = new Set(recommended.map((video) => video.id));
  const latest = [...filtered]
    .reverse()
    .filter((video) => !recommendedIds.has(video.id))
    .slice(0, latestLimit);

  return { recommended, latest };
}

function VideoLessonGrid({
  lessons,
  onSaveInterest,
  className,
}: {
  lessons: VideoLesson[];
  onSaveInterest: (lesson: VideoLesson) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4",
        className,
      )}
    >
      {lessons.map((lesson) => (
        <VideoLessonCard
          key={lesson.id}
          lesson={lesson}
          onSaveInterest={onSaveInterest}
        />
      ))}
    </div>
  );
}

export function FreeVideoLessonsSection({
  onSaveInterest,
  onVideoRegister,
  initialCategory = "all",
  hiddenCategories = [],
}: FreeVideoLessonsSectionProps) {
  const [category, setCategory] = useState<VideoLessonCategory | "all">(
    initialCategory,
  );
  const [showAllMobileVideos, setShowAllMobileVideos] = useState(false);
  const [showAllDesktopVideos, setShowAllDesktopVideos] = useState(false);

  const resetExpanded = () => {
    setShowAllMobileVideos(false);
    setShowAllDesktopVideos(false);
  };

  const visibleCategories = useMemo(
    () =>
      videoLessonCategories.filter(
        (item) => !hiddenCategories.includes(item.value as VideoLessonCategory),
      ),
    [hiddenCategories],
  );

  const filtered = useMemo(
    () => filterVideoLessons(videoLessons, category),
    [category],
  );

  const { recommended, latest } = useMemo(
    () => getMobilePreviewVideos(filtered),
    [filtered],
  );

  const pcPreview = useMemo(() => getPcPreviewVideos(filtered), [filtered]);
  const pcPreviewVideos = useMemo(
    () => [...pcPreview.recommended, ...pcPreview.latest],
    [pcPreview],
  );

  const mobilePreviewCount = recommended.length + latest.length;
  const hasMoreMobileVideos = filtered.length > mobilePreviewCount;
  const hasMoreDesktopVideos = filtered.length > pcPreviewVideos.length;

  return (
    <section className="rounded-xl border border-emerald-200/40 bg-gradient-to-b from-emerald-50/40 to-white p-2.5 shadow-[0_2px_10px_rgba(6,78,59,0.04)] lg:p-5">
      <div className="mb-3 lg:mb-4">
        <p className="text-[10px] font-bold tracking-[0.14em] text-pul-point lg:text-[11px]">
          FREE ON YOUTUBE
        </p>
        <h2 className="mt-1 text-lg font-bold text-foreground lg:text-xl">
          무료 영상 강의
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          유튜브에 흩어진 파크골프 강의를 주제별로 정리했습니다. 영상은 YouTube에서
          재생되며, PUL은 보기 쉽게 분류만 제공합니다.
        </p>
      </div>

      <div className="relative mb-3 lg:mb-4">
        <p className="mb-1.5 text-[11px] font-semibold text-pul-muted">카테고리</p>
        <div
          className={cn(
            "flex gap-1.5 overflow-x-auto pb-0.5 pr-4 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "lg:flex-wrap lg:gap-2 lg:overflow-visible lg:pr-0",
          )}
        >
          {visibleCategories.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setCategory(item.value);
                resetExpanded();
              }}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors lg:px-3 lg:py-1.5 lg:text-xs",
                category === item.value
                  ? "border-pul-point bg-pul-light text-pul-deep"
                  : "border-pul-border bg-white text-pul-muted hover:border-pul-point/40",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          className="pointer-events-none absolute bottom-0 right-0 top-6 w-6 bg-gradient-to-l from-emerald-50/90 to-transparent lg:hidden"
          aria-hidden="true"
        />
      </div>

      <FeaturedYoutubeInstructors />

      {/* 모바일: 추천 3 + 최신 3 요약 */}
      <div className="lg:hidden">
        <p className="mb-2 text-xs text-pul-muted">
          <span className="font-bold text-pul-deep">{filtered.length}</span>개 영상
        </p>

        {!showAllMobileVideos ? (
          <div className="space-y-3">
            {recommended.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-bold text-foreground">추천 영상</h3>
                <VideoLessonGrid
                  lessons={recommended}
                  onSaveInterest={onSaveInterest}
                  className="gap-2 sm:grid-cols-1"
                />
              </div>
            )}

            {latest.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-bold text-foreground">최신 영상</h3>
                <VideoLessonGrid
                  lessons={latest}
                  onSaveInterest={onSaveInterest}
                  className="gap-2 sm:grid-cols-1"
                />
              </div>
            )}

            {hasMoreMobileVideos && (
              <button
                type="button"
                onClick={() => setShowAllMobileVideos(true)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
              >
                전체 무료 영상 보기
              </button>
            )}
          </div>
        ) : (
          <VideoLessonGrid
            lessons={filtered}
            onSaveInterest={onSaveInterest}
            className="gap-2 sm:grid-cols-1"
          />
        )}

        {filtered.length > 0 && (
          <div className="mt-3">
            <VideoLessonRegisterPromo onRegisterLink={onVideoRegister} />
          </div>
        )}
      </div>

      {/* PC: 추천·최신 8개 요약 → 전체 보기 → 등록 배너 */}
      <div className="hidden lg:block">
        <p className="mb-3 text-sm text-pul-muted">
          <span className="font-bold text-pul-deep">{filtered.length}</span>개 영상
        </p>

        {!showAllDesktopVideos ? (
          <>
            <div className="mb-3">
              <h3 className="text-sm font-bold text-foreground">추천·최신 무료 영상</h3>
              <p className="mt-0.5 text-xs text-pul-muted">
                추천 {pcPreview.recommended.length}개 · 최신 {pcPreview.latest.length}개
              </p>
            </div>
            <VideoLessonGrid
              lessons={pcPreviewVideos}
              onSaveInterest={onSaveInterest}
            />
            {hasMoreDesktopVideos && (
              <button
                type="button"
                onClick={() => setShowAllDesktopVideos(true)}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
              >
                전체 무료 영상 보기
              </button>
            )}
          </>
        ) : (
          <>
            <div className="mb-3">
              <h3 className="text-sm font-bold text-foreground">전체 무료 영상</h3>
              <p className="mt-0.5 text-xs text-pul-muted">
                선택한 카테고리의 모든 영상입니다.
              </p>
            </div>
            <VideoLessonGrid lessons={filtered} onSaveInterest={onSaveInterest} />
          </>
        )}

        {filtered.length > 0 && (
          <div className="mt-5">
            <VideoLessonRegisterPromo onRegisterLink={onVideoRegister} />
          </div>
        )}
      </div>
    </section>
  );
}
