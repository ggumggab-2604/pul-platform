import { Card } from "@/components/ui/Card";
import type { ScreenCourseMapItem } from "@/data/courseMapData";

type ScreenFacilityOverviewProps = {
  course: ScreenCourseMapItem;
};

function booleanLabel(value: boolean | undefined): string {
  if (value === true) return "가능";
  if (value === false) return "불가";
  return "정보 확인 중";
}

export function ScreenFacilityOverview({ course }: ScreenFacilityOverviewProps) {
  const screen = course.screenDetails;
  const roomOrBay = screen?.roomCount
    ? `${screen.roomCount}개 룸`
    : screen?.bayCount
      ? `${screen.bayCount}개 타석`
      : "정보 확인 중";

  const items = [
    ["이용요금", screen?.pricing ?? "정보 확인 중"],
    ["룸·타석 수", roomOrBay],
    ["운영시간", course.hours],
    ["예약 방식", screen?.reservationMethod ?? "정보 확인 중"],
    ["주차", course.parking ? "가능" : "불가"],
    ["장비 대여", booleanLabel(screen?.equipmentRental)],
    ["레슨", booleanLabel(screen?.lessonAvailable)],
    ["단체 이용", booleanLabel(screen?.groupAvailable)],
  ];

  return (
    <Card title="핵심 이용정보">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-pul-border/70 bg-pul-light/25 p-3">
            <dt className="text-sm font-semibold text-pul-muted">{label}</dt>
            <dd className="mt-1 text-base font-bold text-pul-deep">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
