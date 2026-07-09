import { marketOperationNotes, sellerTypeLabels } from "@/data/marketData";
import { SellerTypeBadge } from "@/components/market/SellerTypeBadge";
import { Icon } from "@/components/ui/Icon";
import type { MarketSellerType } from "@/types";

const sellerTypeExamples: MarketSellerType[] = [
  "personal",
  "business",
  "verified_business",
  "official_brand",
];

export function MarketOperationGuide() {
  return (
    <section className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5">
      <div className="mb-3 flex items-center gap-2 lg:mb-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pul-light text-pul-deep lg:h-9 lg:w-9">
          <Icon name="doc" className="h-4 w-4 lg:h-5 lg:w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-foreground lg:text-lg">장터 운영 안내</h2>
          <p className="text-xs text-pul-muted lg:text-sm">
            PUL 중고장터 운영 기준 안내입니다.
          </p>
        </div>
      </div>

      <div className="mb-3 rounded-lg bg-pul-light/50 px-3 py-2.5 lg:mb-4 lg:hidden">
        <p className="mb-2 text-xs font-semibold text-foreground">판매자 유형 구분</p>
        <div className="flex flex-wrap gap-1.5">
          {sellerTypeExamples.map((type) => (
            <SellerTypeBadge key={type} sellerType={type} compact />
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-pul-muted">
          {sellerTypeExamples.map((type) => sellerTypeLabels[type]).join(" · ")}
        </p>
      </div>

      <ul className="space-y-2 lg:space-y-2.5">
        {marketOperationNotes.map((note) => (
          <li
            key={note}
            className="flex items-start gap-2 rounded-lg bg-[#fafbfa] px-3 py-2 text-sm leading-relaxed text-foreground lg:py-2.5"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}
