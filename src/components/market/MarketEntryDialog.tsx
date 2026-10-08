"use client";
import type {MarketListingDetail} from "@/types";
import type {MarketListingInput} from "@/lib/market/market";
import type {BuyRequestDetail,BuyRequestInputV2} from "@/lib/market/marketPhaseOne";
import {MarketDialog} from "./MarketDialog";
import {MarketListingEntryDialog} from "./MarketListingEntryDialog";
import {MarketBuyExchangeEntryDialog} from "./MarketBuyExchangeEntryDialog";
type Common={photoStatus?:string;busy:boolean;saved?:boolean;error?:string;onClose:()=>void};
type Props=Common&({kind:"listing";item?:MarketListingDetail;onSubmit:(input:MarketListingInput,files:File[])=>void}|{kind:"buy";item?:BuyRequestDetail;onSubmit:(input:BuyRequestInputV2,files:File[])=>void});
export function MarketEntryDialog(props:Props){return props.kind==="listing"?<MarketListingEntryDialog {...props}/>:<MarketBuyExchangeEntryDialog {...props}/>;}
export function MarketConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  destructive = false,
  onClose,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <MarketDialog title={title} busy={busy} onClose={onClose}>
      <p className="text-sm leading-6">{message}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="min-h-11 rounded-lg border"
        >
          취소
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={`min-h-11 rounded-lg font-bold text-white ${destructive ? "bg-rose-700" : "bg-pul-point"}`}
        >
          {busy ? "처리 중…" : confirmLabel}
        </button>
      </div>
    </MarketDialog>
  );
}
