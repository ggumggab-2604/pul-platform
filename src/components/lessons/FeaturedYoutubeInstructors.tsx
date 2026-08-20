import {
  FEATURED_YOUTUBE_OPERATION_NOTICE,
  youtubePromotionTypeLabels,
} from "@/data/videoLessonData";
import { cn } from "@/lib/utils";
import type { FeaturedYoutubeInstructor } from "@/types";

type FeaturedYoutubeInstructorsProps = {
  instructors?: FeaturedYoutubeInstructor[];
  title?: string;
  mobileVisibleCount?: number;
  showOperationNotice?: boolean;
  className?: string;
};

function InstructorCard({ instructor }: { instructor: FeaturedYoutubeInstructor }) {
  return (
    <article
      data-promotion-slot={`youtube-instructor-${instructor.id}`}
      className="flex h-full flex-col rounded-xl border border-pul-point/20 bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] max-lg:p-2.5 lg:p-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5 max-lg:mb-1.5 max-lg:gap-1">
        <span
          className={cn(
            "hidden rounded-full px-2 py-0.5 text-[10px] font-bold lg:inline-flex lg:text-[11px]",
            instructor.promotionType === "editor_pick" &&
              "bg-pul-light text-pul-deep ring-1 ring-pul-point/20",
            instructor.promotionType === "popular_channel" &&
              "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70",
            instructor.promotionType === "paid_ad_ready" &&
              "bg-orange-50 text-orange-700 ring-1 ring-orange-200/70",
          )}
        >
          {youtubePromotionTypeLabels[instructor.promotionType]}
        </span>
        <span className="rounded-full bg-[#fafbfa] px-2 py-0.5 text-[10px] font-medium text-pul-muted max-lg:text-[11px] lg:text-[11px]">
          {instructor.mainCategory}
        </span>
      </div>

      <h3 className="text-sm font-bold text-foreground max-lg:text-xs lg:text-base">
        {instructor.channelName}
      </h3>
      <p className="mt-0.5 text-xs text-pul-deep max-lg:text-[11px]">
        대표 강사 · {instructor.instructorName}
      </p>
      <p className="mt-2 hidden line-clamp-2 text-xs leading-snug text-pul-muted lg:block lg:text-sm lg:leading-relaxed">
        {instructor.description}
      </p>
      <p className="mt-2 hidden rounded-lg bg-pul-light/50 px-2.5 py-1.5 text-[11px] leading-snug text-pul-deep lg:block lg:py-2 lg:text-xs">
        <span className="font-semibold">대표 영상</span>
        <span className="mx-1 text-pul-muted">·</span>
        <span className="lg:line-clamp-none">{instructor.representativeVideoTitle}</span>
      </p>

      <div className="mt-auto flex flex-col gap-2 pt-3 max-lg:gap-1.5 max-lg:pt-2 lg:flex-row lg:gap-1.5">
        <a
          href={instructor.youtubeChannelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-xs font-bold text-pul-deep transition-colors hover:border-pul-point/40 max-lg:min-h-10 max-lg:py-2 lg:h-11 lg:text-sm"
        >
          채널 보기
        </a>
        <a
          href={instructor.youtubeVideoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-red-600 text-xs font-bold text-white transition-colors hover:bg-red-700 max-lg:min-h-10 max-lg:py-2 lg:h-11 lg:text-sm"
        >
          대표 영상 보기
        </a>
      </div>
    </article>
  );
}

export function FeaturedYoutubeInstructors({
  instructors = [],
  title = "PUL 추천 유튜브 교습가",
  mobileVisibleCount = 2,
  showOperationNotice = true,
  className,
}: FeaturedYoutubeInstructorsProps = {}) {
  return (
    <div
      className={cn(
        "mb-3 rounded-xl border border-pul-point/15 bg-gradient-to-br from-white to-pul-light/30 p-2.5 max-lg:mb-2.5 lg:mb-5 lg:p-4",
        className,
      )}
    >
      <div className="mb-3 max-lg:mb-2">
        <p className="text-[10px] font-bold tracking-[0.12em] text-pul-point lg:text-[11px]">
          FEATURED INSTRUCTORS
        </p>
        <h3 className="mt-1 text-base font-bold text-foreground max-lg:text-sm lg:text-lg">
          {title}
        </h3>
        <p className="mt-1 hidden text-xs leading-relaxed text-pul-muted lg:block lg:text-sm">
          초보자에게 도움이 되는 파크골프 강의 채널을 소개합니다.
        </p>
      </div>

      {instructors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-pul-border bg-white px-4 py-6 text-center text-sm text-pul-muted">
          현재 등록된 추천 YouTube 교습가가 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 max-lg:gap-2 lg:grid-cols-3 lg:gap-4">
          {instructors.map((instructor, index) => (
            <div
              key={instructor.id}
              className={cn(index >= mobileVisibleCount && "hidden lg:block")}
            >
              <InstructorCard instructor={instructor} />
            </div>
          ))}
        </div>
      )}

      {showOperationNotice && (
        <p className="mt-2.5 hidden rounded-lg border border-dashed border-pul-point/25 bg-white/70 px-2.5 py-2 text-[10px] leading-snug text-pul-muted lg:mt-3 lg:block lg:line-clamp-none lg:px-3 lg:py-2.5 lg:text-xs lg:leading-relaxed">
          {FEATURED_YOUTUBE_OPERATION_NOTICE}
        </p>
      )}
    </div>
  );
}
