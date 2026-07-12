import type { SponsoredLocalCard } from "@/data/courseDetailPageData";
import { cn } from "@/lib/utils";
import { Phone } from "lucide-react";
import Link from "next/link";

const badgeStyles: Record<SponsoredLocalCard["badge"], string> = {
  광고: "bg-orange-50 text-orange-800 ring-orange-200/70",
  협찬: "bg-purple-50 text-purple-800 ring-purple-200/70",
  "PUL 제휴": "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  "유료 노출": "bg-gray-100 text-gray-700 ring-gray-200/80",
};

type SponsoredBusinessCardProps = {
  card: SponsoredLocalCard;
};

export function SponsoredBusinessCard({ card }: SponsoredBusinessCardProps) {
  return (
    <div className="rounded-lg border border-dashed border-pul-border/80 bg-[#fafbfa] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-pul-muted lg:text-sm">{card.category}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 lg:text-xs",
            badgeStyles[card.badge],
          )}
        >
          {card.badge}
        </span>
      </div>
      <p className="mt-1 text-base font-bold text-foreground lg:text-lg">{card.name}</p>
      {card.description ? (
        <p className="mt-1 text-sm text-pul-muted">{card.description}</p>
      ) : null}
      <ul className="mt-2 space-y-0.5 text-sm text-pul-muted">
        <li>{card.distance} · {card.driveTime}</li>
        <li>단체 {card.groupCapacity}</li>
        <li>주차 {card.parking}</li>
      </ul>
      <div className="mt-3 flex gap-2">
        <a
          href={`tel:${card.phone.replace(/-/g, "")}`}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          전화
        </a>
        <Link
          href={card.href}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
        >
          상세보기
        </Link>
      </div>
    </div>
  );
}

/** @deprecated use SponsoredBusinessCard */
export const SponsoredLocalCardView = SponsoredBusinessCard;
