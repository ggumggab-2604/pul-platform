"use client";

import { FeaturedYoutubeInstructors } from "@/components/lessons/FeaturedYoutubeInstructors";
import { VideoLessonCard } from "@/components/lessons/VideoLessonCard";
import { VideoLessonRegisterPromo } from "@/components/lessons/VideoLessonRegisterPromo";
import {
  videoLessonCategories,
  videoLessonCategoryLabels,
} from "@/data/videoLessonData";
import type { PublicLessonVideo } from "@/lib/lessons/lessonDirectory";
import { cn } from "@/lib/utils";
import type {
  FeaturedYoutubeInstructor,
  VideoLessonCategory,
} from "@/types";
import { useMemo } from "react";

type FreeVideoLessonsSectionProps = {
  videos: PublicLessonVideo[];
  total: number;
  hasMore: boolean;
  pageNumber: number;
  category: VideoLessonCategory | "all";
  error: string | null;
  bookmarkError: string | null;
  bookmarkNotice: string | null;
  isAuthenticated: boolean;
  savedOnly: boolean;
  savedVideoKeys: ReadonlySet<string>;
  pendingVideoKeys: ReadonlySet<string>;
  onCategoryChange: (category: VideoLessonCategory | "all") => void;
  onPageChange: (page: number) => void;
  onSavedOnlyChange: (savedOnly: boolean) => void;
  onToggleInterest: (lesson: PublicLessonVideo) => void;
  onVideoRegister: () => void;
  hiddenCategories?: VideoLessonCategory[];
};

function VideoLessonGrid({
  lessons,
  savedVideoKeys,
  pendingVideoKeys,
  onToggleInterest,
}: {
  lessons: PublicLessonVideo[];
  savedVideoKeys: ReadonlySet<string>;
  pendingVideoKeys: ReadonlySet<string>;
  onToggleInterest: (lesson: PublicLessonVideo) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
      {lessons.map((lesson) => (
        <VideoLessonCard
          key={lesson.videoKey}
          lesson={lesson}
          isSaved={savedVideoKeys.has(lesson.videoKey)}
          isPending={pendingVideoKeys.has(lesson.videoKey)}
          onToggleInterest={onToggleInterest}
        />
      ))}
    </div>
  );
}

function deriveFeaturedInstructors(videos: PublicLessonVideo[]) {
  const seen = new Set<string>();
  const result: FeaturedYoutubeInstructor[] = [];
  for (const video of videos) {
    if (!video.featured || seen.has(video.channelName)) continue;
    seen.add(video.channelName);
    result.push({
      id: `channel-${video.videoKey}`,
      channelName: video.channelName,
      instructorName: video.instructorName,
      mainCategory: videoLessonCategoryLabels[video.category],
      representativeVideoTitle: video.title,
      description: video.description,
      youtubeChannelUrl: video.youtubeChannelUrl ?? video.youtubeUrl,
      youtubeVideoUrl: video.youtubeUrl,
      promotionType: "editor_pick",
    });
    if (result.length === 3) break;
  }
  return result;
}

export function FreeVideoLessonsSection({
  videos,
  total,
  hasMore,
  pageNumber,
  category,
  error,
  bookmarkError,
  bookmarkNotice,
  isAuthenticated,
  savedOnly,
  savedVideoKeys,
  pendingVideoKeys,
  onCategoryChange,
  onPageChange,
  onSavedOnlyChange,
  onToggleInterest,
  onVideoRegister,
  hiddenCategories = [],
}: FreeVideoLessonsSectionProps) {
  const visibleCategories = useMemo(
    () =>
      videoLessonCategories.filter(
        (item) => !hiddenCategories.includes(item.value as VideoLessonCategory),
      ),
    [hiddenCategories],
  );
  const featuredInstructors = useMemo(
    () => deriveFeaturedInstructors(videos),
    [videos],
  );

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
          공개된 파크골프 강의를 주제별로 정리했습니다. 영상은 YouTube에서 재생되며,
          PUL은 원본 영상을 저장하거나 재배포하지 않습니다.
        </p>
      </div>

      <div className="relative mb-3 lg:mb-4">
        <p id="video-category-label" className="mb-1.5 text-[11px] font-semibold text-pul-muted">
          카테고리
        </p>
        <div
          role="group"
          aria-labelledby="video-category-label"
          className={cn(
            "flex gap-1.5 overflow-x-auto pb-0.5 pr-4 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "lg:flex-wrap lg:gap-2 lg:overflow-visible lg:pr-0",
          )}
        >
          {visibleCategories.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={category === item.value}
              onClick={() => onCategoryChange(item.value)}
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
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 lg:mb-4" role="group" aria-label="무료 영상 보기 범위">
        <button
          type="button"
          aria-pressed={!savedOnly}
          onClick={() => onSavedOnlyChange(false)}
          className={cn(
            "min-h-10 rounded-full border px-4 text-sm font-bold",
            !savedOnly ? "border-pul-point bg-pul-point text-white" : "border-pul-border bg-white text-pul-muted",
          )}
        >
          전체 영상
        </button>
        <button
          type="button"
          aria-pressed={savedOnly}
          onClick={() => onSavedOnlyChange(true)}
          className={cn(
            "min-h-10 rounded-full border px-4 text-sm font-bold",
            savedOnly ? "border-pul-point bg-pul-point text-white" : "border-pul-border bg-white text-pul-muted",
          )}
        >
          내 관심영상
        </button>
        {!isAuthenticated ? <p className="text-xs text-pul-muted">로그인하면 관심 영상을 저장할 수 있습니다.</p> : null}
      </div>

      {featuredInstructors.length > 0 && (
        <FeaturedYoutubeInstructors instructors={featuredInstructors} />
      )}

      <div aria-live="polite">
        {bookmarkError ? (
          <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {bookmarkError}
          </p>
        ) : bookmarkNotice ? (
          <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
            {bookmarkNotice}
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-800">
            {error}
          </div>
        ) : bookmarkError && videos.length === 0 ? null : videos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-pul-border bg-white px-6 py-14 text-center">
            <p className="text-base font-semibold text-foreground">
              {savedOnly ? "아직 저장한 관심 영상이 없습니다." : "현재 등록된 무료 강의 영상이 없습니다."}
            </p>
            <p className="mt-1 text-sm text-pul-muted">
              {savedOnly
                ? "전체 영상에서 관심 있는 강의를 저장해 보세요."
                : "운영자가 검증한 공개 YouTube 강의가 등록되면 이곳에 표시됩니다."}
            </p>
            {savedOnly ? (
              <button type="button" onClick={() => onSavedOnlyChange(false)} className="mt-4 min-h-11 rounded-lg border border-pul-border bg-white px-5 text-sm font-bold text-pul-deep">
                무료 영상 전체보기
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-pul-muted">
              검색 결과 <span className="font-bold text-pul-deep">{total}</span>개 영상
            </p>
            <VideoLessonGrid
              lessons={videos}
              savedVideoKeys={savedVideoKeys}
              pendingVideoKeys={pendingVideoKeys}
              onToggleInterest={onToggleInterest}
            />
            <nav className="mt-4 flex items-center justify-center gap-2" aria-label="무료 영상 페이지">
              <button
                type="button"
                disabled={pageNumber <= 1}
                onClick={() => onPageChange(pageNumber - 1)}
                className="min-h-11 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>
              <span className="px-2 text-sm font-semibold text-pul-muted">{pageNumber}페이지</span>
              <button
                type="button"
                disabled={!hasMore}
                onClick={() => onPageChange(pageNumber + 1)}
                className="min-h-11 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
            </nav>
          </>
        )}
      </div>

      <div className="mt-5">
        <VideoLessonRegisterPromo onRegisterLink={onVideoRegister} />
      </div>
    </section>
  );
}
