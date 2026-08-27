import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";

type HomeRailPromotionGroupProps = {
  longPromotion: ActiveSlotPromotion | null;
  shortPromotions: ActiveSlotPromotion[];
};

export function HomeRailPromotionGroup({
  longPromotion,
  shortPromotions,
}: HomeRailPromotionGroupProps) {
  if (longPromotion) {
    return (
      <div className="w-[172px]" data-rail-mode="long">
        <PromotionBanner promotion={longPromotion} variant="rail" />
      </div>
    );
  }

  if (shortPromotions.length === 0) return null;

  return (
    <div className="flex w-[172px] flex-col gap-2" data-rail-mode="short">
      {shortPromotions.map((promotion) => (
        <PromotionBanner
          key={promotion.slotCode}
          promotion={promotion}
          variant="railShort"
        />
      ))}
    </div>
  );
}
