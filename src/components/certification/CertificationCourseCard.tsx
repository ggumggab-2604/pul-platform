import {
  courseCategoryLabels,
  courseMethodLabels,
  courseStatusLabels,
  providerTypeLabels,
} from "@/data/certificationData";
import type { PublicQualificationCourse } from "@/lib/certification/certificationDirectory";
import { cn } from "@/lib/utils";

type CertificationCourseCardProps = {
  course: PublicQualificationCourse;
  onInquiry: (course: PublicQualificationCourse) => void;
  onDetail: (course: PublicQualificationCourse) => void;
  featured?: boolean;
};

export function CertificationCourseCard({
  course,
  onInquiry,
  onDetail,
  featured = false,
}: CertificationCourseCardProps) {
  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-xl border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)]",
        featured ? "border-pul-point/30 ring-1 ring-pul-point/10" : "border-pul-border",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-pul-light px-2 py-0.5 text-[10px] font-bold text-pul-deep">
          {courseCategoryLabels[course.category]}
        </span>
        <span className="rounded-full bg-[#fafbfa] px-2 py-0.5 text-[10px] font-medium text-pul-muted">
          {providerTypeLabels[course.providerType]}
        </span>
        <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
          {courseStatusLabels[course.status]}
        </span>
      </div>

      <h3 className="text-sm font-bold leading-snug text-foreground lg:text-base">
        {course.title}
      </h3>
      <p className="mt-1 text-xs text-pul-muted">{course.provider}</p>

      <dl className="mt-2 space-y-1 text-[11px] text-foreground lg:text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-pul-muted">지역</dt>
          <dd className="font-medium">{course.region}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-pul-muted">방식</dt>
          <dd className="font-medium">{courseMethodLabels[course.method]}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-pul-muted">대상</dt>
          <dd className="truncate font-medium">{course.target}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-pul-muted">일정</dt>
          <dd className="text-right font-medium">{course.schedule}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-pul-muted">비용</dt>
          <dd className="font-bold text-pul-deep">{course.price}</dd>
        </div>
      </dl>

      <div className="mt-auto flex gap-1.5 pt-3">
        <button
          type="button"
          onClick={() => onInquiry(course)}
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-pul-point text-xs font-bold text-white hover:bg-pul-deep"
        >
          문의·신청 정보
        </button>
        <button
          type="button"
          onClick={() => onDetail(course)}
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-pul-border text-xs font-bold text-pul-deep hover:bg-pul-light"
        >
          자세히 보기
        </button>
      </div>
    </article>
  );
}
