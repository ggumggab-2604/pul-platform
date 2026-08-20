import { Card } from "@/components/ui/Card";
import { equipmentPriceSnapshots } from "@/data/marketData";
import type { MarketListing } from "@/types";
import Link from "next/link";

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

export function HomeMarketTeaser({
  listings,
  loadFailed = false,
}: {
  listings: MarketListing[];
  loadFailed?: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-3 lg:items-stretch">
      <Card dense fullHeight title="최근 장터 매물" className="min-h-0 lg:h-full" bodyClassName="flex flex-1 flex-col p-3.5">
        {loadFailed ? (
          <p role="status" className="text-sm leading-6 text-pul-muted">
            장터 매물을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
          </p>
        ) : listings.length === 0 ? (
          <p className="text-sm leading-6 text-pul-muted">
            현재 등록된 장터 매물이 없습니다.
          </p>
        ) : (
        <ul className="flex-1 space-y-2">
          {listings.map((item) => (
            <li key={item.id}>
              <Link
                href="/market"
                className="flex items-center justify-between gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-pul-light/60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.name}</span>
                  <span className="block text-xs text-pul-muted">{item.region}</span>
                </span>
                <span className="shrink-0 text-sm font-bold text-pul-point">{formatPrice(item.price)}</span>
              </Link>
            </li>
          ))}
        </ul>
        )}
        <Link
          href="/market"
          className="mt-auto inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
        >
          장터 둘러보기
        </Link>
      </Card>

      <Card dense fullHeight title="참고 장비 시세" className="min-h-0 lg:h-full" bodyClassName="flex flex-1 flex-col p-3.5">
        <p className="mb-2 text-xs leading-5 text-pul-muted">
          실시간 거래가가 아닌 장비 선택용 참고 범위입니다.
        </p>
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
