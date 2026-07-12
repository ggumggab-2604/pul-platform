import type { CourseMapMarkerType } from "@/data/courseDetailPageData";
import {
  Car,
  CircleDot,
  Coffee,
  DoorOpen,
  Flag,
  MapPin,
  Toilet,
  Users,
  type LucideIcon,
} from "lucide-react";

const markerIcons: Record<CourseMapMarkerType, LucideIcon> = {
  course: MapPin,
  hole: Flag,
  entrance: DoorOpen,
  parking: Car,
  reception: CircleDot,
  restroom: Toilet,
  rest: Coffee,
  "club-meet": Users,
};

type CourseMapMarkerProps = {
  type: CourseMapMarkerType;
  label: string;
  x: number;
  y: number;
};

export function CourseMapMarker({ type, label, x, y }: CourseMapMarkerProps) {
  const Icon = markerIcons[type];

  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="max-w-[5.5rem] truncate rounded-md bg-white/95 px-1.5 py-0.5 text-center text-[10px] font-bold text-pul-deep shadow-sm ring-1 ring-pul-border/60 lg:max-w-[7rem] lg:text-xs">
          {label}
        </span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pul-point text-white shadow-md ring-2 ring-white lg:h-8 lg:w-8">
          <Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
