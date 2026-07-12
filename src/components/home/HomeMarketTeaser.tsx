import { Card } from "@/components/ui/Card";
import { marketItems } from "@/data/homeData";
import { equipmentPriceSnapshots } from "@/data/marketData";
import Link from "next/link";

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

export function HomeMarketTeaser() {
  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-3 lg:items-stretch">
      <Card dense fullHeight title="장터 인기 상품" className="min-h-0 lg:h-full" bodyClassName="flex flex-1 flex-col p-3.5">
        <p className="mb-2 text-xs text-pul-muted">
          운영 준비 샘플 매물입니다. 실제 거래 전 주최·판매자 정보를 확인하세요.
        </p>
        <ul className="flex-1 space-y-2">
          {marketItems.map((item) => (
            <li key={item.id}>
              <Link
                href="/market"
                className="flex items-center justify-between gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-pul-light/60"
              >
                <span className="truncate text-sm font-semibold">{item.name}</span>
                <span className="shrink-0 text-sm font-bold text-pul-point">
                  {formatPrice(item.price)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/market"
          className="mt-auto inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
        >
          장터 둘러보기
        </Link>
      </Card>

      <Card dense fullHeight title="인기 장비 시세" className="min-h-0 lg:h-full" bodyClassName="flex flex-1 flex-col p-3.5">
        <ul className="flex-1 space-y-2">
          {equipmentPriceSnapshots.slice(0, 3).map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-pul-border/70 bg-pul-page/40 px-2.5 py-2"
            >
              <span className="text-sm font-semibold text-foreground">{item.name}</span>
              <span className="text-sm font-bold text-pul-deep">{item.priceRange}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row">
          <Link
            href="/market#market-price-guide"
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
          >
            시세 더보기
          </Link>
          <Link
            href="/market#equipment-care"
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-muted hover:text-pul-deep"
          >
            장비관리센터
          </Link>
        </div>
      </Card>
    </section>
  );
}
