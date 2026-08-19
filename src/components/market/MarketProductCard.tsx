"use client";

import { MarketProductThumbnail } from "@/components/market/MarketProductThumbnail";
import { SellerTypeBadge } from "@/components/market/SellerTypeBadge";
import {
  conditionLabels,
  saleStatusLabels,
  saleStatusStyles,
  tradeTypeLabels,
} from "@/data/marketData";
import { cn } from "@/lib/utils";
import type { MarketListing } from "@/types";

type MarketProductCardProps = {
  item: MarketListing;
  onSelect: (item: MarketListing, trigger: HTMLButtonElement) => void;
  featured?: boolean;
};

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

export function MarketProductCard({
  item,
  onSelect,
  featured = false,
}: MarketProductCardProps) {
  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)] transition-shadow hover:shadow-[0_4px_16px_rgba(6,78,59,0.1)]",
        featured && "ring-1 ring-pul-point/15",
      )}
    >
      <button
        type="button"
        onClick={(event) => onSelect(item, event.currentTarget)}
        className="flex flex-1 flex-col text-left"
      >
        <MarketProductThumbnail
          item={item}
          badge={
            <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-3.75rem)] flex-wrap gap-1 lg:max-w-[calc(100%-4.5rem)]">
              {item.isSample === true ? (
                <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200 lg:text-[11px]">
                  샘플
                </span>
              ) : null}
              <SellerTypeBadge sellerType={item.sellerType} compact />
            </div>
          }
          saleStatusBadge={
            <span
              className={cn(
                "absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold lg:right-2 lg:top-2 lg:px-2 lg:text-xs",
                saleStatusStyles[item.saleStatus],
              )}
            >
              {saleStatusLabels[item.saleStatus]}
            </span>
          }
        />

        <div className="flex flex-1 flex-col p-3 lg:p-4">
          <div className="flex flex-wrap gap-1 lg:gap-1.5">
            <span className="rounded-md bg-[#fafbfa] px-1.5 py-0.5 text-[10px] font-medium text-pul-muted lg:px-2 lg:text-xs">
              {conditionLabels[item.condition]}
            </span>
            <span className="rounded-md bg-pul-light/80 px-1.5 py-0.5 text-[10px] font-medium text-pul-deep lg:px-2 lg:text-xs">
              {tradeTypeLabels[item.tradeType]}
            </span>
          </div>

          <h3 className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug text-foreground lg:mt-3 lg:min-h-[2.75rem] lg:text-base">
            {item.name}
          </h3>

          <p className="mt-2 text-lg font-bold tracking-tight text-pul-deep lg:mt-3 lg:text-xl">
            {formatPrice(item.price)}
          </p>

          <p className="mt-1.5 text-xs leading-relaxed text-pul-muted lg:mt-2 lg:text-sm">
            {item.region} · {item.createdAt}
          </p>
        </div>
      </button>

      <div className="mt-auto border-t border-pul-border/80 px-3 pb-3 pt-2 lg:px-4 lg:pb-4 lg:pt-3">
        <button
          type="button"
          onClick={(event) => onSelect(item, event.currentTarget)}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white transition-colors hover:bg-pul-deep"
        >
          문의하기
        </button>
      </div>
    </article>
  );
}
