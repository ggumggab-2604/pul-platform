import { Card } from "@/components/ui/Card";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import { operationLabels, type CourseMapItem } from "@/data/courseMapData";
import { Clock, Flag, ParkingCircle, Sparkles, Toilet, Wrench } from "lucide-react";
import type { ReactNode } from "react";

type CourseSummaryGridProps = {
  course: CourseMapItem;
  detail: CourseDetailPageData;
};

function SummaryChip({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-pul-border/70 bg-pul-light/40 px-3 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-pul-point">
        {icon}
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-pul-muted">{label}</dt>
        <dd className="text-sm font-bold text-pul-deep lg:text-base">{value}</dd>
      </div>
    </div>
  );
}

function yesNoUnknown(available?: boolean) {
  if (available === true) return "가능";
  if (available === false) return "불가";
  return "확인 필요";
}

export function CourseSummaryGrid({ course, detail }: CourseSummaryGridProps) {
  const rental =
    course.features.includes("장비 대여") ? "가능 (방문 전 확인)" : "확인 필요";

  return (
    <Card title="핵심 요약" dense bodyClassName="py-3">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryChip icon={<Flag className="h-4 w-4" />} label="홀 수" value={`${course.holes}홀`} />
        <SummaryChip icon={<Clock className="h-4 w-4" />} label="운영시간" value={course.hours} />
        <SummaryChip
          icon={<Clock className="h-4 w-4" />}
          label="예약 방식"
          value={operationLabels[course.operation]}
        />
        <SummaryChip
          icon={<ParkingCircle className="h-4 w-4" />}
          label="주차"
          value={yesNoUnknown(course.amenities.parking.available)}
        />
        <SummaryChip
          icon={<Toilet className="h-4 w-4" />}
          label="화장실"
          value={yesNoUnknown(course.amenities.restroom.available)}
        />
        <SummaryChip icon={<Wrench className="h-4 w-4" />} label="장비 대여" value={rental} />
        <SummaryChip
          icon={<Sparkles className="h-4 w-4" />}
          label="초보자 적합"
          value={
            detail.about.recommendedFor.some((r) => r.includes("초보"))
              ? "추천"
              : "확인 필요"
          }
        />
      </dl>
      <p className="mt-3 text-xs text-pul-muted lg:text-sm">
        연락처 {course.phone} · {detail.reservationMethod}
      </p>
    </Card>
  );
}
