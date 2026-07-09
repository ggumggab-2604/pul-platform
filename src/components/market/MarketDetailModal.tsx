"use client";

import { MarketProductThumbnail } from "@/components/market/MarketProductThumbnail";
import { SellerTypeBadge } from "@/components/market/SellerTypeBadge";
import {
  categoryLabels,
  conditionLabels,
  saleStatusLabels,
  saleStatusStyles,
  tradeTypeLabels,
} from "@/data/marketData";
import { cn } from "@/lib/utils";
import type { MarketListing } from "@/types";

type MarketDetailModalProps = {
  item: MarketListing | null;
  onClose: () => void;
};

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

export function MarketDetailModal({ item, onClose }: MarketDetailModalProps) {
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-detail-title"
      onClick={onClose}
    >
      <article
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-pul-border bg-white shadow-[0_12px_40px_rgba(6,78,59,0.2)] sm:max-w-lg sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <MarketProductThumbnail
          item={item}
          className="h-[220px] sm:h-[240px]"
          badge={
            <div className="absolute left-3 top-3 z-10">
              <SellerTypeBadge sellerType={item.sellerType} />
            </div>
          }
          saleStatusBadge={
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-pul-muted shadow-sm"
              aria-label="닫기"
            >
              ×
            </button>
          }
        />

        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-md bg-pul-light px-2 py-0.5 text-xs font-bold text-pul-deep">
              {categoryLabels[item.category]}
            </span>
            <span className="rounded-md bg-[#fafbfa] px-2 py-0.5 text-xs font-medium text-pul-muted">
              {conditionLabels[item.condition]}
            </span>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-bold",
                saleStatusStyles[item.saleStatus],
              )}
            >
              {saleStatusLabels[item.saleStatus]}
            </span>
          </div>

          <h2
            id="market-detail-title"
            className="mt-3 text-xl font-bold leading-snug text-foreground"
          >
            {item.name}
          </h2>
          <p className="mt-2 text-2xl font-bold text-pul-deep">
            {formatPrice(item.price)}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-[#fafbfa] p-2.5">
              <dt className="text-xs font-semibold text-pul-muted">지역</dt>
              <dd className="mt-0.5 font-bold text-foreground">{item.region}</dd>
            </div>
            <div className="rounded-lg bg-[#fafbfa] p-2.5">
              <dt className="text-xs font-semibold text-pul-muted">거래 방식</dt>
              <dd className="mt-0.5 font-bold text-foreground">
                {tradeTypeLabels[item.tradeType]}
              </dd>
            </div>
            <div className="rounded-lg bg-[#fafbfa] p-2.5">
              <dt className="text-xs font-semibold text-pul-muted">판매자</dt>
              <dd className="mt-0.5 font-bold text-foreground">
                {item.sellerNickname}
              </dd>
            </div>
            <div className="rounded-lg bg-[#fafbfa] p-2.5">
              <dt className="text-xs font-semibold text-pul-muted">등록</dt>
              <dd className="mt-0.5 font-bold text-foreground">{item.createdAt}</dd>
            </div>
          </dl>

          <p className="mt-4 text-sm leading-relaxed text-foreground">
            {item.description}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
            >
              문의하기
            </button>
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-pul-border text-sm font-bold text-pul-muted hover:text-pul-deep"
            >
              신고하기
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
