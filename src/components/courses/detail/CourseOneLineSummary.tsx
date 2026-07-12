import {
  infoSourceLabels,
  type CourseDetailPageData,
} from "@/data/courseDetailPageData";
import { operationLabels, type CourseMapItem } from "@/data/courseMapData";

type CourseOneLineSummaryProps = {
  course: CourseMapItem;
  detail: CourseDetailPageData;
};

function formatHours(hours: string) {
  return hours.replace(/\s/g, "").replace(/-/g, "~");
}

export function CourseOneLineSummary({ course, detail }: CourseOneLineSummaryProps) {
  const items = [
    detail.distanceFromLocation,
    `${course.holes}홀`,
    formatHours(course.hours),
    operationLabels[course.operation],
    detail.parkingLabel,
    course.phone,
    detail.equipmentRentalLabel,
  ];

  return (
    <section
      className="rounded-xl border border-pul-border bg-pul-light/40 px-3 py-3 lg:px-4 lg:py-3.5"
      aria-label="핵심 정보 요약"
    >
      <p className="hidden text-base font-semibold leading-relaxed text-pul-deep lg:block">
        {items.join(" │ ")}
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[15px] font-semibold text-pul-deep lg:hidden">
        <div className="col-span-2">
          <dt className="text-[13px] text-pul-muted">거리</dt>
          <dd className="text-base">{detail.distanceFromLocation}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-pul-muted">홀 수</dt>
          <dd className="text-base">{course.holes}홀</dd>
        </div>
        <div>
          <dt className="text-[13px] text-pul-muted">운영시간</dt>
          <dd className="text-base">{formatHours(course.hours)}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-pul-muted">예약</dt>
          <dd className="text-base">{operationLabels[course.operation]}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-pul-muted">주차</dt>
          <dd className="text-base">{detail.parkingLabel}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[13px] text-pul-muted">전화 문의</dt>
          <dd className="text-lg font-bold">{course.phone}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-pul-muted">정보 확인일</dt>
          <dd className="text-base">{detail.operationVerifiedAt}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-pul-muted">정보 출처</dt>
          <dd className="text-base">{infoSourceLabels[detail.infoSource]}</dd>
        </div>
      </dl>
      <p className="mt-2 hidden text-sm text-pul-muted lg:block">
        정보 확인일 {detail.operationVerifiedAt} · 출처 {infoSourceLabels[detail.infoSource]} ·{" "}
        {detail.reservationGuideSummary}
      </p>
    </section>
  );
}
