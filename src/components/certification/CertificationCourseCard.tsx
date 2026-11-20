import {
  courseCategoryLabels,
  courseMethodLabels,
  courseStatusLabels,
} from "@/data/certificationData";
import {
  certificationCourseDetailHref,
  certificationCourseQualification,
  certificationCourseTotal,
} from "@/lib/certification/certificationCourseComparison";
import { getCertificationDateRangeDisplay } from "@/lib/certification/certificationDateDisplay";
import type { PublicCertificationCourseComparison } from "@/lib/certification/certificationDirectory";
import Link from "next/link";
import type { ReactNode } from "react";

const cellClass = "grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] gap-2 border-t border-pul-border px-3 py-2 text-sm break-keep [overflow-wrap:anywhere] lg:table-cell lg:p-4 lg:align-top";

function ComparisonCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <td role="cell" className={cellClass}>
      <span aria-hidden="true" className="font-medium text-pul-muted lg:hidden">{label}</span>
      <div className="min-w-0">{children}</div>
    </td>
  );
}

export function CertificationCourseCard({ comparison, returnTo }: {
  comparison: PublicCertificationCourseComparison;
  returnTo: string;
}) {
  const { course, summary } = comparison;
  const range = getCertificationDateRangeDisplay(
    course.startsOn, course.endsOn, { range: "교육 일정", start: "시작일", end: "종료일" },
  );
  const destination = new URL(course.applicationUrl ?? course.officialUrl);
  return (
    <tr role="row" className="block min-w-0 rounded-xl border border-pul-border bg-white lg:table-row lg:rounded-none lg:border-0">
      <td role="cell" className="block min-w-0 px-3 py-3 break-keep [overflow-wrap:anywhere] lg:table-cell lg:border-t lg:border-pul-border lg:p-4 lg:align-top">
        <h3 className="font-bold leading-snug text-pul-deep">{course.title}</h3>
        <p className="mt-1 text-sm text-pul-muted">{course.provider}</p>
        {course.featured && <span className="mt-1 inline-block rounded bg-pul-light px-2 py-0.5 text-xs font-semibold text-pul-deep">추천 과정</span>}
      </td>
      <ComparisonCell label="자격명·급수">
        <span className="font-semibold">{certificationCourseQualification(course, summary)}</span>
        {summary.qualification && <p className="mt-1 text-xs text-pul-muted">{courseCategoryLabels[course.category]}</p>}
      </ComparisonCell>
      <ComparisonCell label="교육 일정">
        <span className="whitespace-pre-line font-semibold">{range?.value ?? course.schedule}</span>
        {range && range.value !== course.schedule && <p className="mt-0.5 text-xs text-pul-muted">{course.schedule}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-pul-muted">
          <span className="rounded bg-pul-light px-2 py-0.5 font-bold text-pul-deep">{courseStatusLabels[course.status]}</span>
          <span>{course.region} · {courseMethodLabels[course.method]}</span>
        </div>
      </ComparisonCell>
      <ComparisonCell label="총비용">
        <span className="font-extrabold tabular-nums text-pul-deep">{certificationCourseTotal(summary)}</span>
      </ComparisonCell>
      <ComparisonCell label="신청처">
        <span className="font-semibold">{course.applicationUrl ? "교육 신청 사이트" : "기관 공식 사이트"}</span>
        <p className="mt-0.5 break-normal text-xs text-pul-muted [overflow-wrap:anywhere]">{destination.host}</p>
      </ComparisonCell>
      <td role="cell" className="block p-3 lg:table-cell lg:border-t lg:border-pul-border lg:p-4 lg:align-top">
        <Link
          href={certificationCourseDetailHref(course.courseKey, returnTo)}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-point/40 bg-white px-2 text-center text-sm font-bold text-pul-deep hover:bg-pul-light"
        >
          상세 보기
        </Link>
      </td>
    </tr>
  );
}
