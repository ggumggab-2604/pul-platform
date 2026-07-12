import { Card } from "@/components/ui/Card";
import type { CourseFacilityItem } from "@/data/courseDetailPageData";
import { facilityStatusLabels } from "@/data/courseDetailPageData";
import { cn } from "@/lib/utils";
import {
  Accessibility,
  Car,
  Droplets,
  Lock,
  PawPrint,
  ShoppingBag,
  Sofa,
  Toilet,
  Umbrella,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

const iconMap: Record<string, ReactNode> = {
  car: <Car className="h-5 w-5" />,
  restroom: <Toilet className="h-5 w-5" />,
  sofa: <Sofa className="h-5 w-5" />,
  droplet: <Droplets className="h-5 w-5" />,
  store: <ShoppingBag className="h-5 w-5" />,
  umbrella: <Umbrella className="h-5 w-5" />,
  cart: <Wrench className="h-5 w-5" />,
  lock: <Lock className="h-5 w-5" />,
  accessibility: <Accessibility className="h-5 w-5" />,
  paw: <PawPrint className="h-5 w-5" />,
};

const statusStyles = {
  available: "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  unavailable: "bg-gray-100 text-gray-600 ring-gray-200/80",
  unknown: "bg-amber-50 text-amber-800 ring-amber-200/70",
};

export function FacilityList({ facilities }: { facilities: CourseFacilityItem[] }) {
  return (
    <Card title="시설 및 편의정보" dense>
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {facilities.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-3 rounded-lg border border-pul-border/80 px-3 py-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pul-light text-pul-point">
              {iconMap[item.icon] ?? <Wrench className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground lg:text-base">{item.label}</p>
              <span
                className={cn(
                  "mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1",
                  statusStyles[item.status],
                )}
              >
                {facilityStatusLabels[item.status]}
              </span>
              {item.note ? (
                <p className="mt-1 text-xs text-pul-muted lg:text-sm">{item.note}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
