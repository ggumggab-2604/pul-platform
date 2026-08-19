"use client";

import { marketRegisterNotes } from "@/data/marketData";

type MarketActionButtonsProps = {
  onRegister: (trigger: HTMLButtonElement) => void;
  onBuyRegister: (trigger: HTMLButtonElement) => void;
  onSafety: () => void;
};

export function MarketActionButtons({
  onRegister,
  onBuyRegister,
  onSafety,
}: MarketActionButtonsProps) {
  return (
    <div className="space-y-2.5 lg:space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-row lg:flex-wrap">
        <button
          type="button"
          onClick={(event) => onRegister(event.currentTarget)}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-pul-point px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-pul-deep lg:px-5"
        >
          판매글 등록하기
        </button>
        <button
          type="button"
          onClick={(event) => onBuyRegister(event.currentTarget)}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-pul-point/30 bg-pul-light px-4 text-sm font-bold text-pul-deep transition-colors hover:bg-emerald-100 lg:px-5"
        >
          삽니다 글 등록하기
        </button>
        <button
          type="button"
          onClick={onSafety}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-muted transition-colors hover:border-pul-point/40 hover:text-pul-deep lg:px-5"
        >
          안전거래 안내
        </button>
      </div>
      <ul className="space-y-1 rounded-lg bg-pul-light/60 px-3 py-2 text-xs leading-relaxed text-pul-deep lg:space-y-1 lg:py-2.5 lg:text-sm">
        {marketRegisterNotes.map((note) => (
          <li key={note} className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pul-point lg:mt-2" />
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}
