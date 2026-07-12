import { MarketProductCard } from "@/components/market/MarketProductCard";
import type { MarketListing } from "@/types";

type FeaturedMarketCardsProps = {
  items: MarketListing[];
  onSelect: (item: MarketListing) => void;
  /** 모바일 첫 화면 노출 개수 (PC는 items 전체) */
  mobileVisibleCount?: number;
};

export function FeaturedMarketCards({
  items,
  onSelect,
  mobileVisibleCount,
}: FeaturedMarketCardsProps) {
  const mobileItems =
    mobileVisibleCount != null ? items.slice(0, mobileVisibleCount) : items;

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-foreground">추천 · 인기 상품</h2>
        <p className="mt-1 text-sm text-pul-muted">
          PUL 회원들이 많이 찾는 중고 파크골프 용품입니다.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:hidden">
        {mobileItems.map((item) => (
          <MarketProductCard
            key={item.id}
            item={item}
            onSelect={onSelect}
            featured
          />
        ))}
      </div>
      <div className="hidden grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid lg:grid-cols-4 lg:gap-4">
        {items.map((item) => (
          <MarketProductCard
            key={item.id}
            item={item}
            onSelect={onSelect}
            featured
          />
        ))}
      </div>
    </section>
  );
}
