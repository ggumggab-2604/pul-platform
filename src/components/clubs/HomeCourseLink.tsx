import { getHomeCourseHref } from "@/data/clubData";
import { cn } from "@/lib/utils";
import Link from "next/link";

type HomeCourseLinkProps = {
  courseName: string;
  courseId: string;
  compact?: boolean;
};

export function HomeCourseLink({
  courseName,
  courseId,
  compact = false,
}: HomeCourseLinkProps) {
  return (
    <div
      className={cn(
        compact
          ? "flex flex-col items-stretch gap-2 lg:flex-row lg:flex-wrap lg:items-center"
          : "space-y-2",
      )}
    >
      <span
        className={cn(
          "font-medium text-foreground",
          compact ? "text-sm leading-snug lg:text-base" : "text-base",
        )}
      >
        {courseName}
      </span>
      <Link
        href={getHomeCourseHref(courseId)}
        className={cn(
          "inline-flex items-center justify-center rounded-md border border-pul-point/30 bg-pul-light font-bold text-pul-deep transition-colors hover:bg-emerald-100",
          compact
            ? "h-9 w-full shrink-0 px-2.5 text-xs lg:h-8 lg:w-auto"
            : "h-9 rounded-lg px-3 text-xs",
        )}
      >
        골프장 보기
      </Link>
    </div>
  );
}
