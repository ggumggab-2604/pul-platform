"use client";
import type { MarketListingDetail } from "@/types";
import {
  categoryLabels,
  conditionLabels,
  saleStatusLabels,
  tradeTypeLabels,
} from "@/data/marketData";
import { MarketDialog } from "./MarketDialog";
import { MarketPhotoGallery } from "./MarketPhotos";
import { MarketContactPanel } from "./MarketContact";
type Props = {
  item: MarketListingDetail | null;
  authenticated: boolean;
  onClose: () => void;
  onEdit: (item: MarketListingDetail) => void;
  onStatus: (item: MarketListingDetail, operation: "reserve" | "sell") => void;
  onDelete: (item: MarketListingDetail) => void;
  onReport: (item: MarketListingDetail) => void;
};
export function MarketDetailModal({
  item,
  authenticated,
  onClose,
  onEdit,
  onStatus,
  onDelete,
  onReport,
}: Props) {
  if (!item) return null;
  return (
    <MarketDialog title={item.name} onClose={onClose}>
      <MarketPhotoGallery images={item.images ?? []} title={item.name} />
      <p className="mt-3 text-2xl font-bold text-pul-deep">
        {item.price.toLocaleString("ko-KR")}원
      </p>
      <p className="mt-2 text-sm text-pul-muted">
        {categoryLabels[item.category]} · {saleStatusLabels[item.saleStatus]} ·{" "}
        {conditionLabels[item.condition]} · {tradeTypeLabels[item.tradeType]}
      </p>
      <p className="mt-2 text-sm text-pul-muted">
        {item.region} · {item.sellerNickname} · {item.createdAt}
      </p>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">
        {item.description}
      </p>
      <MarketContactPanel
        contact={item}
        owner={Boolean(item.canEdit)}
        ended={item.saleStatus === "sold"}
        authenticated={authenticated}
        onEdit={() => onEdit(item)}
      />
      {item.canEdit ? (
        <section className="mt-4">
          <h3 className="font-bold">내 판매글 관리</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.saleStatus !== "sold" ? (
              <button
                type="button"
                className="min-h-11 rounded-lg border px-3"
                onClick={() => onEdit(item)}
              >
                내용 수정
              </button>
            ) : null}
            {item.saleStatus === "selling" ? (
              <button
                type="button"
                className="min-h-11 rounded-lg border px-3"
                onClick={() => onStatus(item, "reserve")}
              >
                예약중 전환
              </button>
            ) : null}
            {item.saleStatus === "reserved" ? (
              <button
                type="button"
                className="min-h-11 rounded-lg border px-3"
                onClick={() => onStatus(item, "sell")}
              >
                거래완료 전환
              </button>
            ) : null}
            <button
              type="button"
              className="min-h-11 rounded-lg border border-rose-200 px-3 text-rose-700"
              onClick={() => onDelete(item)}
            >
              판매글 삭제
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className="mt-4 min-h-11 w-full rounded-lg border font-bold"
          onClick={() => onReport(item)}
        >
          신고하기
        </button>
      )}
      <p className="mt-3 text-xs text-pul-muted">
        상품 상태·결제·배송은 거래 당사자끼리 확인해 주세요.
      </p>
    </MarketDialog>
  );
}
