"use client";

import { MarketProductThumbnail } from "@/components/market/MarketProductThumbnail";
import { SellerTypeBadge } from "@/components/market/SellerTypeBadge";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  categoryLabels,
  conditionLabels,
  saleStatusLabels,
  saleStatusStyles,
  tradeTypeLabels,
} from "@/data/marketData";
import { cn } from "@/lib/utils";
import type { MarketListing } from "@/types";
import Link from "next/link";
import { useEffect } from "react";

type MarketDetailModalProps = {
  item: MarketListing | null;
  onClose: () => void;
};

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

export function MarketDetailModal({ item, onClose }: MarketDetailModalProps) {
  useBodyScrollLock(Boolean(item));

  useEffect(() => {
    if (!item) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-detail-title"
      onClick={onClose}
    >
      <article
        className={cn(
          "flex w-full max-h-[calc(100dvh-24px)] flex-col overflow-hidden rounded-t-2xl border border-pul-border bg-white shadow-[0_12px_40px_rgba(6,78,59,0.2)]",
          "resize-none overscroll-contain",
          "sm:max-w-lg sm:rounded-xl",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative shrink-0">
          <MarketProductThumbnail
            item={item}
            className="h-[180px] max-h-[220px] sm:h-[200px]"
            badge={
              <div className="absolute left-3 top-3 z-10">
                <SellerTypeBadge sellerType={item.sellerType} />
              </div>
            }
            saleStatusBadge={
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 z-20 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/95 text-2xl leading-none font-bold text-pul-muted shadow-sm ring-1 ring-pul-border"
                aria-label="닫기"
              >
                ×
              </button>
            }
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
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

          <div className="mt-4 rounded-lg border border-pul-border/80 bg-pul-page/40 p-3">
            <p className="text-xs font-bold text-pul-deep">관련 안내</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
              <Link href="/market#market-safety" className="text-pul-point hover:underline">
                안전거래 안내
              </Link>
              <Link href="/market#market-buy-guide" className="text-pul-point hover:underline">
                장비 구매 가이드
              </Link>
              <Link href="/market#equipment-care" className="text-pul-point hover:underline">
                장비관리센터
              </Link>
            </div>
          </div>
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-pul-border/70 px-5 py-3 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+3.5rem))] lg:pb-3">
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
        </footer>
      </article>
    </div>
  );
}
