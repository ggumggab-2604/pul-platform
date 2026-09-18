"use client";
import type { BuyRequestDetail } from "@/lib/market/marketPhaseOne";
import { categoryLabels } from "@/data/marketData";
import { MarketDialog } from "./MarketDialog";
import { MarketContactPanel } from "./MarketContact";
export function BuyRequestDetailModal({
  item,
  authenticated,
  onClose,
  onEdit,
  onEnd,
  onDelete,
}: {
  item: BuyRequestDetail;
  authenticated: boolean;
  onClose: () => void;
  onEdit: () => void;
  onEnd: () => void;
  onDelete: () => void;
}) {
  return (
    <MarketDialog title={item.title} onClose={onClose}>
      <p className="text-lg font-bold">희망 {item.budget}</p>
      <p className="mt-2 text-sm text-pul-muted">
        {categoryLabels[item.category]} · {item.region} ·{" "}
        {item.requestStatus === "closed" ? "요청 종료" : "구매 희망"}
      </p>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
        {item.summary}
      </p>
      <p className="mt-3 text-xs text-pul-muted">
        {item.authorNickname} · {item.createdAt}
      </p>
      <MarketContactPanel
        contact={item}
        owner={Boolean(item.canEdit)}
        ended={item.requestStatus === "closed"}
        authenticated={authenticated}
        onEdit={onEdit}
      />
      {item.canEdit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.requestStatus === "open" ? (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="min-h-11 rounded-lg border px-3"
              >
                내용 수정
              </button>
              <button
                type="button"
                onClick={onEnd}
                className="min-h-11 rounded-lg border px-3"
              >
                요청 종료
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            className="min-h-11 rounded-lg border border-rose-200 px-3 text-rose-700"
          >
            삭제
          </button>
        </div>
      ) : null}
    </MarketDialog>
  );
}
