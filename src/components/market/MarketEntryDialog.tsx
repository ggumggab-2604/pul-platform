"use client";
import { useState } from "react";
import {
  marketCategories,
  marketConditions,
  marketRegions,
  marketTradeTypes,
} from "@/data/marketData";
import type { MarketListingInput } from "@/lib/market/market";
import type {
  BuyRequestDetail,
  BuyRequestInputV2,
  ContactInput,
} from "@/lib/market/marketPhaseOne";
import type {
  MarketCategory,
  MarketCondition,
  MarketListingDetail,
  MarketTradeType,
} from "@/types";
import { MarketDialog } from "./MarketDialog";
import { MarketContactFields } from "./MarketContact";
import { MarketPhotoPicker } from "./MarketPhotos";
type Common = {
  busy: boolean;
  saved?: boolean;
  error?: string;
  onClose: () => void;
};
type Props = Common &
  (
    | {
        kind: "listing";
        item?: MarketListingDetail;
        onSubmit: (input: MarketListingInput, files: File[]) => void;
      }
    | {
        kind: "buy";
        item?: BuyRequestDetail;
        onSubmit: (input: BuyRequestInputV2) => void;
      }
  );
const field =
  "mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base";
export function MarketEntryDialog(props: Props) {
  const listing = props.kind === "listing" ? props.item : undefined,
    buy = props.kind === "buy" ? props.item : undefined;
  const [title, setTitle] = useState(listing?.name ?? buy?.title ?? ""),
    [category, setCategory] = useState<MarketCategory>(
      listing?.category ?? buy?.category ?? "club",
    );
  const [amount, setAmount] = useState(
      listing
        ? String(listing.price)
        : (buy?.budget.replace(/[^0-9]/g, "") ?? ""),
    ),
    [region, setRegion] = useState(listing?.region ?? buy?.region ?? "서울");
  const [condition, setCondition] = useState<MarketCondition>(
      listing?.condition ?? "lightUse",
    ),
    [tradeType, setTradeType] = useState<MarketTradeType>(
      listing?.tradeType ?? "negotiable",
    );
  const [body, setBody] = useState(listing?.description ?? buy?.summary ?? "");
  const [contact, setContact] = useState<ContactInput>({
    publicContactMethod: props.item?.publicContactMethod ?? "phone",
    publicContactValue: props.item?.publicContactValue ?? "",
    publicContactConsent: false,
  });
  const [files, setFiles] = useState<File[]>([]);
  const locked = props.busy || props.saved;
  return (
    <MarketDialog
      title={
        props.kind === "listing"
          ? props.item
            ? "판매글 수정"
            : "판매글 쓰기"
          : props.item
            ? "구매요청 수정"
            : "삽니다 글쓰기"
      }
      busy={props.busy}
      onClose={props.onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (props.busy) return;
          const value = /^\d+$/.test(amount) ? Number(amount) : NaN;
          if (props.kind === "listing")
            props.onSubmit(
              {
                title,
                category,
                price: value,
                region,
                condition,
                tradeType,
                description: body,
                ...contact,
              },
              files,
            );
          else
            props.onSubmit({
              title,
              category,
              budget: value,
              region,
              summary: body,
              ...contact,
            });
        }}
      >
        <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-bold">
              제목
              <input
                required
                minLength={2}
                maxLength={100}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={field}
              />
            </label>
            <label className="text-sm font-bold">
              카테고리
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as MarketCategory)
                }
                className={field}
              >
                {marketCategories
                  .filter(
                    (item) =>
                      !["all", "startupResale", "facilityDevelopment"].includes(
                        item.value,
                      ),
                  )
                  .map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              {props.kind === "listing" ? "판매 가격 (원)" : "희망 예산 (원)"}
              <input
                required
                inputMode="numeric"
                pattern="[0-9]+"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={field}
              />
            </label>
            <label className="text-sm font-bold">
              지역
              <select
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className={field}
              >
                {marketRegions
                  .filter((v) => v !== "전체")
                  .map((v) => (
                    <option key={v}>{v}</option>
                  ))}
              </select>
            </label>
            {props.kind === "listing" ? (
              <>
                <label className="text-sm font-bold">
                  상품 상태
                  <select
                    value={condition}
                    onChange={(e) =>
                      setCondition(e.target.value as MarketCondition)
                    }
                    className={field}
                  >
                    {marketConditions
                      .filter((v) => v.value !== "all")
                      .map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-sm font-bold">
                  거래 방식
                  <select
                    value={tradeType}
                    onChange={(e) =>
                      setTradeType(e.target.value as MarketTradeType)
                    }
                    className={field}
                  >
                    {marketTradeTypes
                      .filter((v) => v.value !== "all")
                      .map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            ) : null}
            <label className="sm:col-span-2 text-sm font-bold">
              내용
              <textarea
                required
                minLength={10}
                maxLength={props.kind === "listing" ? 2000 : 1000}
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={`${field} py-3`}
              />
            </label>
          </div>
          <MarketContactFields value={contact} onChange={setContact} />
          {props.kind === "listing" ? (
            <MarketPhotoPicker
              files={files}
              onChange={setFiles}
              storedCount={listing?.images?.length ?? 0}
            />
          ) : null}
        </fieldset>
        {props.saved ? (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm">
            글은 저장되었습니다. 재시도하면 남은 사진만 올립니다. 내용을
            수정하려면 닫은 뒤 저장된 글을 다시 열어 주세요.
          </p>
        ) : null}
        {props.error ? (
          <p className="mt-3 text-sm text-rose-700" role="alert">
            {props.error}
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={props.busy}
            onClick={props.onClose}
            className="min-h-11 rounded-lg border border-pul-border"
          >
            {props.saved ? "닫기" : "취소"}
          </button>
          <button
            type="submit"
            disabled={props.busy}
            className="min-h-11 rounded-lg bg-pul-point font-bold text-white disabled:opacity-50"
          >
            {props.busy
              ? "저장·사진 처리 중…"
              : props.saved
                ? "남은 사진 재시도"
                : "저장"}
          </button>
        </div>
      </form>
    </MarketDialog>
  );
}
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
