"use client";

import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  marketCategories,
  marketConditions,
  marketRegions,
  marketTradeTypes,
} from "@/data/marketData";
import type { MarketBuyRequestInput, MarketListingInput } from "@/lib/market/market";
import type { MarketBuyRequest, MarketCategory, MarketCondition, MarketListing, MarketTradeType } from "@/types";
import { useEffect, useId, useRef, useState } from "react";

type Props =
  | { kind: "listing"; item?: MarketListing; busy: boolean; error?: string; onClose: () => void; onSubmit: (input: MarketListingInput, files: File[]) => void }
  | { kind: "buy"; item?: MarketBuyRequest; busy: boolean; error?: string; onClose: () => void; onSubmit: (input: MarketBuyRequestInput) => void };

const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20";

function numeric(value: string) {
  if (!/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}

export function MarketEntryDialog(props: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listing = props.kind === "listing" ? props.item : undefined;
  const buy = props.kind === "buy" ? props.item : undefined;
  const [title, setTitle] = useState(listing?.name ?? buy?.title ?? "");
  const [category, setCategory] = useState<MarketCategory>(listing?.category ?? buy?.category ?? "club");
  const [amount, setAmount] = useState(listing ? String(listing.price) : buy ? buy.budget.replace(/[^0-9]/g, "") : "");
  const [region, setRegion] = useState(listing?.region ?? buy?.region ?? "서울");
  const [condition, setCondition] = useState<MarketCondition>(listing?.condition ?? "lightUse");
  const [tradeType, setTradeType] = useState<MarketTradeType>(listing?.tradeType ?? "negotiable");
  const [body, setBody] = useState(listing?.description ?? buy?.summary ?? "");
  const [files, setFiles] = useState<File[]>([]);
  useBodyScrollLock(true);

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !props.busy) props.onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props]);

  const isEdit = Boolean(props.item);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (props.kind === "listing") {
      props.onSubmit({ title, category, price: numeric(amount), region, condition, tradeType, description: body }, files);
    } else {
      props.onSubmit({ title, category, budget: numeric(amount), region, summary: body });
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div ref={panelRef} className="flex max-h-[calc(100dvh-16px)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-pul-border px-4 py-3 sm:px-5">
          <div>
            <h2 id={titleId} className="text-xl font-bold text-foreground">{props.kind === "listing" ? `${isEdit ? "판매글 수정" : "판매글 등록"}` : `${isEdit ? "구매요청 수정" : "삽니다 글 등록"}`}</h2>
            <p id={descriptionId} className="mt-1 text-sm text-pul-muted">필수 내용을 확인한 뒤 한 번만 저장해 주세요.</p>
          </div>
          <button type="button" onClick={props.onClose} disabled={props.busy} aria-label="닫기" className="min-h-11 min-w-11 rounded-full bg-pul-page text-2xl font-bold text-pul-muted disabled:opacity-50">×</button>
        </header>
        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="text-sm font-bold">제목</span><input ref={firstRef} required minLength={2} maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} /></label>
            <label><span className="text-sm font-bold">카테고리</span><select value={category} onChange={(event) => setCategory(event.target.value as MarketCategory)} className={fieldClass}>{marketCategories.filter((item) => !["all", "startupResale", "facilityDevelopment"].includes(item.value)).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label><span className="text-sm font-bold">{props.kind === "listing" ? "판매 가격" : "희망 예산"}</span><input inputMode="numeric" required pattern="[0-9]+" value={amount} onChange={(event) => setAmount(event.target.value)} className={fieldClass} /><span className="mt-1 block text-xs text-pul-muted">숫자만 입력</span></label>
            <label><span className="text-sm font-bold">지역</span><select value={region} onChange={(event) => setRegion(event.target.value)} className={fieldClass}>{marketRegions.filter((item) => item !== "전체").map((item) => <option key={item}>{item}</option>)}</select></label>
            {props.kind === "listing" ? <>
              <label><span className="text-sm font-bold">상품 상태</span><select value={condition} onChange={(event) => setCondition(event.target.value as MarketCondition)} className={fieldClass}>{marketConditions.filter((item) => item.value !== "all").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label><span className="text-sm font-bold">거래 방식</span><select value={tradeType} onChange={(event) => setTradeType(event.target.value as MarketTradeType)} className={fieldClass}>{marketTradeTypes.filter((item) => item.value !== "all").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="sm:col-span-2"><span className="text-sm font-bold">상품 사진 (선택, 최대 {Math.max(0, 5 - (listing?.images?.length ?? 0))}장 추가)</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={Math.max(0, 5 - (listing?.images?.length ?? 0)) === 0} onChange={(event) => setFiles([...event.target.files ?? []].slice(0, Math.max(0, 5 - (listing?.images?.length ?? 0))))} className="mt-1 block min-h-11 w-full rounded-lg border border-pul-border p-2 text-sm" /><span className="mt-1 block text-xs text-pul-muted">JPG·PNG·WebP, 파일당 8MB 이하</span></label>
            </> : null}
            <label className="sm:col-span-2"><span className="text-sm font-bold">{props.kind === "listing" ? "상품 설명" : "구매 희망 내용"}</span><textarea required minLength={10} maxLength={props.kind === "listing" ? 2000 : 1000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} className={`${fieldClass} py-3`} /></label>
          </div>
          {props.error ? <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{props.error}</p> : null}
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-pul-border pt-4">
            <button type="button" onClick={props.onClose} disabled={props.busy} className="min-h-11 rounded-lg border border-pul-border text-base font-bold text-pul-muted disabled:opacity-50">취소</button>
            <button type="submit" disabled={props.busy} className="min-h-11 rounded-lg bg-pul-point text-base font-bold text-white disabled:opacity-50">{props.busy ? "저장 중…" : "저장"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function MarketConfirmDialog({ title, message, confirmLabel, busy, destructive = false, onClose, onConfirm }: { title: string; message: string; confirmLabel: string; busy: boolean; destructive?: boolean; onClose: () => void; onConfirm: () => void }) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useBodyScrollLock(true);
  useEffect(() => { cancelRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, onClose]);
  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
      <h2 id={titleId} className="text-xl font-bold">{title}</h2><p className="mt-3 text-base leading-relaxed text-pul-muted">{message}</p>
      <div className="mt-5 grid grid-cols-2 gap-2"><button ref={cancelRef} type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-lg border border-pul-border font-bold">취소</button><button type="button" onClick={onConfirm} disabled={busy} className={`min-h-11 rounded-lg font-bold text-white ${destructive ? "bg-rose-700" : "bg-pul-point"}`}>{busy ? "처리 중…" : confirmLabel}</button></div>
    </div>
  </div>;
}
