import {
  getProductImageConfig,
  marketCategoryPlaceholderLabels,
} from "@/components/market/marketProductImage";
import { categoryLabels } from "@/data/marketData";
import { cn } from "@/lib/utils";
import type { MarketListing } from "@/types";
import type { ReactNode } from "react";
import Image from "next/image";

type MarketProductThumbnailProps = {
  item: MarketListing;
  className?: string;
  badge?: ReactNode;
  saleStatusBadge?: ReactNode;
};

export function MarketProductThumbnail({
  item,
  className,
  badge,
  saleStatusBadge,
}: MarketProductThumbnailProps) {
  const { src, position } = getProductImageConfig(item);
  const usePlaceholder = /banner-/.test(item.image);

  return (
    <div
      className={cn(
        "relative h-[152px] shrink-0 overflow-hidden bg-[#eef3f0] min-[480px]:h-[168px] sm:h-[176px]",
        className,
      )}
    >
      {usePlaceholder ? (
        <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-pul-light via-white to-emerald-50 px-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-sm ring-1 ring-pul-border/80">
            {item.category === "club" && "🏌️"}
            {item.category === "ball" && "⛳"}
            {item.category === "bag" && "🎒"}
            {item.category === "apparel" && "👕"}
            {item.category === "shoes" && "👟"}
            {item.category === "practice" && "📐"}
            {item.category === "other" && "📦"}
          </div>
          <p className="mt-3 text-sm font-bold text-pul-deep">
            {marketCategoryPlaceholderLabels[item.category]}
          </p>
          <p className="mt-1 text-xs text-pul-muted">중고 상품 이미지</p>
        </div>
      ) : (
        <>
          <Image
            src={src}
            alt={item.name}
            fill
            unoptimized
            className={cn("object-cover", position)}
            sizes="(max-width: 640px) 50vw, 320px"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent"
            aria-hidden="true"
          />
        </>
      )}
      {badge}
      {saleStatusBadge}
      <span className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-pul-muted shadow-sm backdrop-blur">
        {categoryLabels[item.category]}
      </span>
    </div>
  );
}
