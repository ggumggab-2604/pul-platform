import { Card } from "@/components/ui/Card";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import type { CourseMapItem } from "@/data/courseMapData";
import { Icon } from "@/components/ui/Icon";
import { MapPin } from "lucide-react";

type CourseMapSectionProps = {
  course: CourseMapItem;
  detail: CourseDetailPageData;
  mapsUrl: string;
};

export function CourseMapSection({ course, detail, mapsUrl }: CourseMapSectionProps) {
  return (
    <Card title="위치 · 길찾기" dense>
      <p className="text-base font-semibold text-pul-deep lg:text-lg">{course.address}</p>

      <div
        id="course-map-root"
        data-map-provider="kakao"
        data-map-ready="false"
        data-lat={course.lat}
        data-lng={course.lng}
        className="relative mt-3 flex h-48 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-pul-point/30 bg-gradient-to-br from-pul-light via-white to-emerald-50 sm:h-56"
      >
        <div className="relative z-10 px-4 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-pul-border">
            <Icon name="flag" className="h-5 w-5 text-pul-point" />
          </div>
          <p className="mt-2 text-sm font-bold text-pul-deep">지도 연동 예정</p>
        </div>
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:text-base">
        <div>
          <dt className="font-semibold text-pul-muted">주차</dt>
          <dd className="text-pul-deep">{detail.location.parkingGuide}</dd>
        </div>
        <div>
          <dt className="font-semibold text-pul-muted">입구·접수처</dt>
          <dd className="text-pul-deep">{detail.location.entranceGuide}</dd>
        </div>
      </dl>

      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-pul-point px-4 text-base font-bold text-white hover:bg-pul-deep sm:w-auto sm:min-w-[11rem]"
      >
        <MapPin className="h-5 w-5" aria-hidden="true" />
        길찾기
      </a>
    </Card>
  );
}
