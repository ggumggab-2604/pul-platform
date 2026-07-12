"use client";

import type { NearbyGeneralPlace } from "@/data/courseDetailPageData";
import { cn } from "@/lib/utils";
import { Phone } from "lucide-react";
import Link from "next/link";

const badgeStyles = {
  "PUL 제휴": "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  광고: "bg-orange-50 text-orange-800 ring-orange-200/70",
  협찬: "bg-purple-50 text-purple-800 ring-purple-200/70",
  "유료 노출": "bg-gray-100 text-gray-700 ring-gray-200/80",
  일반: "bg-slate-50 text-slate-600 ring-slate-200/80",
} as const;

type NearbyPlaceCardProps = {
  place: NearbyGeneralPlace;
  onReport?: () => void;
};

export function NearbyPlaceCard({ place, onReport }: NearbyPlaceCardProps) {
  const badge = place.listingBadge ?? "일반";
  const showBadge = badge !== "일반";

  return (
    <article className="rounded-xl border border-pul-border/80 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-pul-point max-md:text-[13px] lg:text-sm">
            {place.categoryLabel}
          </p>
          <h3 className="mt-0.5 text-base font-bold text-foreground lg:text-lg">{place.name}</h3>
        </div>
        {showBadge ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-bold ring-1 max-md:text-[13px]",
              badgeStyles[badge as keyof typeof badgeStyles] ?? badgeStyles.일반,
            )}
          >
            {badge}
          </span>
        ) : (
          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/80 max-md:text-[13px]">
            일반 정보
          </span>
        )}
      </div>

      <ul className="mt-2 space-y-0.5 text-sm text-pul-muted max-md:text-[15px] lg:text-base">
        <li>{place.distance} · {place.driveTime}</li>
        {place.groupCapacity ? <li>단체 수용 {place.groupCapacity}</li> : null}
        {place.parking ? <li>주차 {place.parking}</li> : null}
        {place.menuOrType ? <li>{place.menuOrType}</li> : null}
      </ul>

      {place.tags && place.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {place.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-pul-light px-2 py-0.5 text-xs font-semibold text-pul-deep max-md:text-[13px]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <a
          href={`tel:${place.phone.replace(/-/g, "")}`}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          전화 문의
        </a>
        <Link
          href={place.href}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
        >
          상세보기
        </Link>
        {onReport ? (
          <button
            type="button"
            onClick={onReport}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-muted hover:bg-pul-light hover:text-pul-deep"
          >
            정보 수정 제보
          </button>
        ) : null}
      </div>
    </article>
  );
}

export const NearbyScreenGolfCard = NearbyPlaceCard;
export const NearbyRestaurantCard = NearbyPlaceCard;
export const NearbyMeetingPlaceCard = NearbyPlaceCard;
export const NearbyRepairShopCard = NearbyPlaceCard;
