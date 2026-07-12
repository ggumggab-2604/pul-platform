import type { MeetingPlaceListingBadge, NearbyMeetingPlace } from "@/data/courseDetailPageData";
import { cn } from "@/lib/utils";
import { Phone } from "lucide-react";
import Link from "next/link";

const listingBadgeStyles: Record<MeetingPlaceListingBadge, string> = {
  일반: "bg-slate-50 text-slate-600 ring-slate-200/80",
  "PUL 제휴": "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  광고: "bg-orange-50 text-orange-800 ring-orange-200/70",
  협찬: "bg-purple-50 text-purple-800 ring-purple-200/70",
  "유료 노출": "bg-gray-100 text-gray-700 ring-gray-200/80",
};

type NearbyMeetingPlaceCardProps = {
  places: NearbyMeetingPlace[];
};

export function NearbyMeetingPlaceCard({ places }: NearbyMeetingPlaceCardProps) {
  const place = places[0];
  if (!place) return null;

  const showBadge = place.listingBadge !== "일반";

  return (
    <div className="rounded-lg border border-pul-border/80 bg-pul-light/30 p-3">
      <h3 className="text-sm font-bold text-pul-deep lg:text-base">
        라운드 후 모임 장소
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
        이 구장 이용 동호회가 모이기 좋은 식당·카페·단체 장소입니다.
      </p>
      <p className="mt-2 text-xs font-semibold text-pul-point">{place.category}</p>
      <p className="mt-0.5 text-base font-bold text-foreground">{place.name}</p>
      <ul className="mt-2 space-y-0.5 text-sm text-pul-muted lg:text-base">
        <li>거리 {place.distance} · {place.driveTime}</li>
        <li>단체 수용 {place.groupCapacity}</li>
        <li>주차 {place.parking}</li>
      </ul>
      {showBadge ? (
        <span
          className={cn(
            "mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1",
            listingBadgeStyles[place.listingBadge],
          )}
        >
          {place.listingBadge}
        </span>
      ) : (
        <span className="mt-2 inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/80">
          일반 정보
        </span>
      )}
      <div className="mt-3 flex gap-2">
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
      </div>
    </div>
  );
}
