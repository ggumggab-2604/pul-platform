import {
  getLessonRecruitDisplay,
  lessonFormatLabels,
  lessonRecruitLabels,
  lessonRecruitStyles,
  lessonTargetLabels,
  lessonTypeBadgeStyles,
  lessonTypeLabels,
} from "@/data/lessonData";
import { cn } from "@/lib/utils";
import type { LessonRecruitStatus, ParkGolfLesson } from "@/types";
import type { ReactNode } from "react";

type LessonTypeBadgeProps = {
  type: ParkGolfLesson["type"];
  compact?: boolean;
};

export function LessonTypeBadge({ type, compact = false }: LessonTypeBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-bold",
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
        lessonTypeBadgeStyles[type],
      )}
    >
      {lessonTypeLabels[type]}
    </span>
  );
}

type RecruitBadgeProps = {
  lesson?: ParkGolfLesson;
  status?: LessonRecruitStatus;
  compact?: boolean;
};

export function LessonRecruitBadge({
  lesson,
  status,
  compact = false,
}: RecruitBadgeProps) {
  const display = lesson
    ? getLessonRecruitDisplay(lesson)
    : {
        label: lessonRecruitLabels[status ?? "recruiting"],
        className: lessonRecruitStyles[status ?? "recruiting"],
      };

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-bold",
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
        display.className,
      )}
    >
      {display.label}
    </span>
  );
}

function InfoBlock({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("leading-snug", compact ? "space-y-0" : "space-y-0.5")}>
      <p
        className={cn(
          "font-semibold text-pul-muted",
          compact ? "text-[10px]" : "text-xs",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "font-medium text-foreground",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {children}
      </p>
    </div>
  );
}

type LessonCardProps = {
  lesson: ParkGolfLesson;
  onInquiry: (lesson: ParkGolfLesson) => void;
  onDetail: (lesson: ParkGolfLesson) => void;
  featured?: boolean;
};

export function LessonCard({
  lesson,
  onInquiry,
  onDetail,
  featured = false,
}: LessonCardProps) {
  const targetText = lesson.target
    .map((t) => lessonTargetLabels[t])
    .join(" · ");

  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)] transition-shadow hover:shadow-[0_4px_16px_rgba(6,78,59,0.1)]",
        featured
          ? "border-pul-point/30 ring-1 ring-pul-point/10"
          : "border-pul-border",
      )}
    >
      <div
        className={cn(
          "border-b border-pul-border/50 px-3 py-2.5 lg:px-4 lg:py-3",
          featured
            ? "bg-gradient-to-r from-pul-light/70 via-pul-light/40 to-white"
            : "bg-gradient-to-r from-pul-light/40 to-white",
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {featured && (
            <span className="inline-flex items-center rounded-full bg-pul-point px-2 py-0.5 text-[10px] font-bold text-white lg:text-[11px]">
              추천
            </span>
          )}
          <LessonTypeBadge type={lesson.type} compact />
          <LessonRecruitBadge lesson={lesson} compact />
        </div>
        <h3 className="mt-2 text-sm font-bold leading-snug text-foreground lg:text-base">
          {lesson.title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          <span className="font-medium text-pul-deep">{lesson.regionLabel}</span>
          <span className="mx-1 text-pul-border">·</span>
          <span>{lesson.location}</span>
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-3 py-2.5 lg:gap-3 lg:px-4 lg:py-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:gap-2.5">
          <InfoBlock label="대상" compact>
            {targetText}
          </InfoBlock>
          <InfoBlock label="일정" compact>
            {lesson.schedule}
          </InfoBlock>
          <InfoBlock label="교육 방식" compact>
            {lessonFormatLabels[lesson.format]}
          </InfoBlock>
          <InfoBlock label="비용" compact>
            <span className="font-bold text-pul-deep">{lesson.price}</span>
          </InfoBlock>
        </div>

        <p className="line-clamp-1 text-xs leading-relaxed text-pul-muted lg:line-clamp-2 lg:text-sm">
          {lesson.description}
        </p>
      </div>

      <div className="mt-auto flex gap-1.5 border-t border-pul-border/80 px-3 py-2 lg:gap-2 lg:px-4 lg:py-3">
        <button
          type="button"
          onClick={() => onInquiry(lesson)}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-pul-point text-xs font-bold text-white transition-colors hover:bg-pul-deep lg:h-11 lg:text-sm"
        >
          신청 문의
        </button>
        <button
          type="button"
          onClick={() => onDetail(lesson)}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-xs font-bold text-pul-deep transition-colors hover:border-pul-point/40 lg:h-11 lg:text-sm"
        >
          자세히 보기
        </button>
      </div>
    </article>
  );
}
