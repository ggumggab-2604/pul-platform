import { sellerTypeLabels, sellerTypeStyles } from "@/data/marketData";
import { cn } from "@/lib/utils";
import type { MarketSellerType } from "@/types";

type SellerTypeBadgeProps = {
  sellerType: MarketSellerType;
  className?: string;
  compact?: boolean;
};

export function SellerTypeBadge({
  sellerType,
  className,
  compact = false,
}: SellerTypeBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md font-bold",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        sellerTypeStyles[sellerType],
        className,
      )}
    >
      {sellerTypeLabels[sellerType]}
    </span>
  );
}
