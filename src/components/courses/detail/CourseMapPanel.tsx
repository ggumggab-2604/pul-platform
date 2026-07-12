import { CourseMapMarker } from "@/components/courses/detail/CourseMapMarker";
import { MAP_PANEL_HEIGHT } from "@/components/courses/detail/courseMapPhotoConstants";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";
import type { CourseMapItem } from "@/data/courseMapData";
import { cn } from "@/lib/utils";

type CourseMapPanelProps = {
  course: CourseMapItem;
  detail: CourseDetailPageData;
  className?: string;
};

export function CourseMapPanel({ course, detail, className }: CourseMapPanelProps) {
  return (
    <div
      id="course-map-root"
      data-map-provider="kakao"
      data-map-ready="false"
      data-lat={course.lat}
      data-lng={course.lng}
      className={cn(
        "relative w-full overflow-hidden bg-[#dceee0]",
        "min-h-[265px] sm:min-h-[293px] lg:h-[345px] lg:min-h-[345px]",
        className,
      )}
      data-map-height-lg={MAP_PANEL_HEIGHT.lg}
    >
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-[#c8e6c9] via-[#dceee0] to-[#b2dfdb]" />
        <div className="absolute left-[8%] top-[18%] h-[28%] w-[38%] rotate-[-8deg] rounded-[40%] bg-[#81c784]/70" />
        <div className="absolute left-[42%] top-[12%] h-[32%] w-[42%] rotate-[6deg] rounded-[45%] bg-[#66bb6a]/75" />
        <div className="absolute bottom-[22%] left-[18%] h-[26%] w-[48%] rotate-[2deg] rounded-[40%] bg-[#4caf50]/65" />
        <div className="absolute bottom-[18%] right-[10%] h-[22%] w-[30%] rotate-[-4deg] rounded-[40%] bg-[#81c784]/60" />
        <div className="absolute left-[55%] top-[48%] h-[12%] w-[18%] rounded-full bg-sky-400/50" />
        <div className="absolute bottom-[8%] left-[5%] right-[5%] h-2 rounded-full bg-white/50" />
      </div>

      <p className="absolute left-3 top-3 z-10 max-w-[85%] truncate rounded-lg bg-white/90 px-2.5 py-1 text-xs font-bold text-pul-deep shadow-sm ring-1 ring-pul-border/50 lg:text-sm">
        {course.address}
      </p>

      {detail.mapMarkers.map((marker) => (
        <CourseMapMarker
          key={marker.id}
          type={marker.type}
          label={marker.label}
          x={marker.x}
          y={marker.y}
        />
      ))}

      {detail.isMock ? (
        <p className="absolute bottom-2 right-2 z-10 rounded bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white lg:text-xs">
          지도 mock · API 연동 예정
        </p>
      ) : null}
    </div>
  );
}
