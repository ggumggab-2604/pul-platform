import { Card } from "@/components/ui/Card";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import type { CourseMapItem } from "@/data/courseMapData";
import { Icon } from "@/components/ui/Icon";
import { MapPin, Phone } from "lucide-react";

type CourseMapCardProps = {
  course: CourseMapItem;
  detail: CourseDetailPageData;
  mapsUrl: string;
  phoneHref: string;
};

export function CourseMapCard({ course, detail, mapsUrl, phoneHref }: CourseMapCardProps) {
  return (
    <Card title="지도 · 위치 · 길찾기" dense>
      <p className="text-base font-semibold text-pul-deep lg:text-lg">{course.address}</p>

      <div
        id="course-map-root"
        data-map-provider="kakao"
        data-map-ready="false"
        data-lat={course.lat}
        data-lng={course.lng}
        className="relative mt-3 flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-pul-point/30 bg-gradient-to-br from-pul-light via-white to-emerald-50 sm:h-44"
      >
        <div className="text-center">
          <Icon name="flag" className="mx-auto h-6 w-6 text-pul-point" />
          <p className="mt-1 text-sm font-bold text-pul-deep">지도 연동 예정</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-pul-muted lg:text-base">
        <span className="font-semibold text-pul-deep">주차 </span>
        {detail.location.parkingGuide}
      </p>
      <p className="mt-1 text-sm text-pul-muted lg:text-base">
        <span className="font-semibold text-pul-deep">입구·접수 </span>
        {detail.location.entranceGuide}
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-pul-point px-4 text-base font-bold text-white hover:bg-pul-deep"
        >
          <MapPin className="h-5 w-5" aria-hidden="true" />
          길찾기
        </a>
        <a
          href={phoneHref}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light"
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
          전화 문의
        </a>
      </div>
    </Card>
  );
}
