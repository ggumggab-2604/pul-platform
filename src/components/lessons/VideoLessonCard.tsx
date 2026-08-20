import {
  videoLessonCategoryLabels,
  videoLessonLevelLabels,
  videoLessonLevelStyles,
  videoThumbnailStyles,
} from "@/data/videoLessonData";
import { cn } from "@/lib/utils";
import type { VideoLesson } from "@/types";

type VideoLessonThumbnailProps = {
  lesson: VideoLesson;
};

export function VideoLessonThumbnail({ lesson }: VideoLessonThumbnailProps) {
  return (
    <div
      className={cn(
        "relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br",
        videoThumbnailStyles[lesson.thumbnailType],
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(255,255,255,0.08) 8px, rgba(255,255,255,0.08) 16px)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-pul-deep shadow-md lg:h-12 lg:w-12">
        <svg
          viewBox="0 0 24 24"
          className="ml-0.5 h-5 w-5 fill-current lg:h-6 lg:w-6"
          aria-hidden="true"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      <span className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white lg:text-xs">
        {lesson.duration}
      </span>
      <span className="absolute left-2 top-2 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-pul-deep lg:text-[10px]">
        YouTube
      </span>
    </div>
  );
}

type VideoLessonCardProps = {
  lesson: VideoLesson;
  onSaveInterest: (lesson: VideoLesson) => void;
};

export function VideoLessonCard({ lesson, onSaveInterest }: VideoLessonCardProps) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-emerald-200/50 bg-white shadow-[0_2px_10px_rgba(6,78,59,0.05)]">
      <div className="p-2 lg:p-3">
        <VideoLessonThumbnail lesson={lesson} />
      </div>

      <div className="flex flex-1 flex-col px-2.5 pb-2.5 max-lg:px-2 max-lg:pb-2 lg:px-3.5 lg:pb-3.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-1 max-lg:mb-1 lg:mb-2 lg:gap-1.5">
          <span className="rounded-full bg-pul-light px-2 py-0.5 text-[10px] font-bold text-pul-deep ring-1 ring-pul-point/15 lg:text-[11px]">
            {videoLessonCategoryLabels[lesson.category]}
          </span>
          <span
            className={cn(
              "hidden rounded-full px-2 py-0.5 text-[10px] font-bold lg:inline-flex lg:text-[11px]",
              videoLessonLevelStyles[lesson.level],
            )}
          >
            {videoLessonLevelLabels[lesson.level]}
          </span>
        </div>

        <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground max-lg:text-xs lg:text-base lg:leading-snug">
          {lesson.title}
        </h3>
        <p className="mt-0.5 truncate text-[11px] text-pul-muted lg:mt-1 lg:text-xs">
          <span className="lg:hidden">{lesson.channelName}</span>
          <span className="max-lg:hidden">
            {lesson.instructorName} · {lesson.channelName}
          </span>
        </p>
        <p className="mt-1 hidden text-[11px] leading-snug text-pul-muted lg:mt-2 lg:line-clamp-2 lg:text-sm lg:leading-relaxed">
          {lesson.description}
        </p>

        <div className="mt-auto flex gap-1.5 pt-2 max-lg:pt-1.5 lg:pt-3">
          <a
            href={lesson.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${lesson.title} — YouTube에서 보기 (새 창)`}
            className="inline-flex h-10 min-h-[40px] flex-1 items-center justify-center rounded-lg bg-red-600 text-xs font-bold text-white transition-colors hover:bg-red-700 max-lg:min-h-10 max-lg:py-2 lg:h-11 lg:text-sm"
          >
            YouTube에서 보기
          </a>
          <button
            type="button"
            onClick={() => onSaveInterest(lesson)}
            className="hidden h-10 min-h-[40px] w-14 shrink-0 items-center justify-center rounded-lg border border-pul-border bg-[#fafbfa] text-[11px] font-bold text-pul-muted lg:inline-flex lg:h-11 lg:w-auto lg:px-3 lg:text-sm"
            title="관심 목록 준비중"
          >
            관심
          </button>
        </div>
      </div>
    </article>
  );
}
