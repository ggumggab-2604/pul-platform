"use client";

import { useId, useState } from "react";
import { marketCategories, marketListingRegions, marketTradeTypes } from "@/data/marketData";
import { validateMarketContact, hasValidListingContactConsent, MARKET_POLICY_VERSION, MARKET_POLICY_ERROR } from "@/lib/market/market";
import { marketPolicyTitle } from "@/lib/market/marketPolicy";
import { MarketPolicyContent } from "./MarketPolicyContent";
import type { ContactInput } from "@/lib/market/marketPhaseOne";
import {validateBuyExchangeInput,type BuyExchangeInput,type BuyExchangeDetail} from "@/lib/market/marketBuyExchange";
import { MarketDialog } from "./MarketDialog";
import { MarketConfirmDialog } from "./MarketEntryDialog";
import { MarketContactFields } from "./MarketContact";
import { MarketPhotoGallery, MarketPhotoPicker } from "./MarketPhotos";

const field = "mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3";
const inputField = `${field} text-base`;
const placeholder = "placeholder:text-sm placeholder:font-normal placeholder:text-pul-muted placeholder:opacity-100";
const selectField = (value: string) =>
  `${field} text-sm leading-6 font-normal ${value ? "text-foreground" : "text-pul-muted"}`;
type Props = {
  item?: BuyExchangeDetail;
  busy: boolean;
  saved?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: BuyExchangeInput, files: File[]) => void;
};

export function MarketBuyExchangeEntryDialog(props: Props) {
  const { item } = props;
  const id = useId();
  const [initial] = useState(() => ({
    requestType: item?.requestType ?? "buy", category: item?.category ?? "", title: item?.title ?? "",
    amount: item?.budgetAmount ? String(item.budgetAmount) : "",
    tradeType: item?.tradeType ?? "negotiable", region: item?.region ?? "",
    buyBody: item?.requestType !== "exchange" ? item?.summary ?? "" : "", owned: item?.requestType === "exchange" ? item.summary : "", wanted: item?.exchangeWanted ?? "",
  }));
  const [values, setValues] = useState(initial);
  const [negotiable,setNegotiable] = useState(item?.budgetNegotiable ?? false);
  const [additional, setAdditional] = useState(Boolean(item?.publicContactMethod));
  const [contact, setContact] = useState<ContactInput>({
    publicContactMethod: item?.publicContactMethod ?? "phone",
    publicContactValue: item?.publicContactValue ?? "", publicContactConsent: false,
  });
  const initialPolicyConsent = item?.tradeNoticeConfirmed === true && item?.tradeNoticeVersion === MARKET_POLICY_VERSION;
  const [tradeNoticeConfirmed, setTradeNoticeConfirmed] = useState(initialPolicyConsent);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [removed,setRemoved]=useState<string[]>([]);
  const stored=(item?.images??[]).filter(src=>!removed.includes(src.split("/").at(-1)!));
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmClose, setConfirmClose] = useState(false);
  const existingConsent = hasValidListingContactConsent(item, contact);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial) || files.length > 0 || removed.length > 0 || negotiable !== (item?.budgetNegotiable ?? false) ||
    additional !== Boolean(item?.publicContactMethod) ||
    contact.publicContactMethod !== (item?.publicContactMethod ?? "phone") ||
    contact.publicContactValue !== (item?.publicContactValue ?? "") || contact.publicContactConsent ||
    tradeNoticeConfirmed !== initialPolicyConsent;
  const close = () => {
    if (props.busy) return;
    if (dirty && !props.saved) setConfirmClose(true);
    else props.onClose();
  };
  const change = (key: keyof typeof values, value: string) => {
    setValues({ ...values, [key]: value });
    setErrors((previous) => ({ ...previous, [key]: "" }));
  };
  const error = (key: string) => errors[key] ? <p id={`${id}-${key}`} role="alert" className="mt-1 text-sm font-normal text-rose-700">{errors[key]}</p> : null;
  const attrs = (key: string) => ({ "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `${id}-${key}` : undefined });
  const payload = ():BuyExchangeInput => ({
    removeMediaIds:removed,
    requestType:values.requestType as "buy"|"exchange",title:values.title,category:values.category as BuyExchangeInput["category"],
    budget:values.requestType === "exchange" || negotiable ? null : /^\d+$/.test(values.amount) ? Number(values.amount) : NaN,
    budgetNegotiable:values.requestType === "buy" && negotiable,
    summary:values.requestType === "buy" ? values.buyBody : values.owned,
    exchangeWanted:values.requestType === "exchange" ? values.wanted : null,
    region:values.region,tradeType:values.tradeType as BuyExchangeInput["tradeType"],tradeNoticeConfirmed,
    publicContactMethod:additional?contact.publicContactMethod:null,publicContactValue:additional?contact.publicContactValue:"",publicContactConsent:additional&&contact.publicContactConsent,
  });
  return <>
    <MarketDialog title={item ? "삽니다·교환 수정" : "삽니다·교환 글쓰기"} busy={props.busy} onClose={close}>
      <form noValidate onSubmit={(event) => {
        event.preventDefault();
        if (props.busy) return;
        const input = payload(), next: Record<string, string> = {};
        if (!props.saved) {
          try {validateBuyExchangeInput(input,true);} catch(cause) {const message=cause instanceof Error?cause.message:"입력 내용을 확인해 주세요.";if(message!==MARKET_POLICY_ERROR)next.input=message;}
          if (additional) {
            try { validateMarketContact(contact, !existingConsent); }
            catch (cause) { next.contact = cause instanceof Error ? cause.message : "연락처를 확인해 주세요."; }
          }
          if (!tradeNoticeConfirmed) next.tradeNotice = MARKET_POLICY_ERROR;
          setErrors(next);
          if (Object.keys(next).length) return;
        }
        props.onSubmit(input, values.requestType === "exchange" ? files : []);
      }}>
        <fieldset disabled={props.busy || props.saved} className="space-y-4 disabled:opacity-70">
          <label className="block text-sm font-bold">글 유형
            <select disabled={Boolean(item)} className={selectField(values.requestType)} value={values.requestType} onChange={e=>change("requestType",e.target.value)}><option value="buy">삽니다</option><option value="exchange">교환합니다</option></select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-bold">카테고리 (필수)
              <select required className={selectField(values.category)} value={values.category} onChange={(e) => change("category", e.target.value)} {...attrs("category")}>
                <option value="" className="text-pul-muted">선택해 주세요</option>
                {marketCategories.filter((v) => !["all", "startupResale", "facilityDevelopment"].includes(v.value)).map((v) => <option key={v.value} value={v.value} className="text-foreground">{v.label}</option>)}
              </select>{error("category")}
            </label>
            <label className="sm:col-span-2 text-sm font-bold">제목 (필수)
              <input required minLength={2} maxLength={100} className={inputField} value={values.title} onChange={(e) => change("title", e.target.value)} {...attrs("title")} />{error("title")}
            </label>
            {values.requestType === "buy" ? <>
            <div className="sm:col-span-2"><label className="block text-sm font-bold">희망 예산 (원)
              <input inputMode="numeric" disabled={negotiable} className={`${inputField} ${placeholder}`} value={values.amount.replace(/\B(?=(\d{3})+(?!\d))/g,",")} placeholder="숫자만 입력" onChange={e=>change("amount",e.target.value.replaceAll(",",""))}/>
            </label><label className="mt-2 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={negotiable} onChange={e=>setNegotiable(e.target.checked)}/>예산 협의</label></div>
            <label className="sm:col-span-2 text-sm font-bold">구매 희망 내용 (필수)
              <textarea rows={5} maxLength={1000} className={`${inputField} ${placeholder} py-3 font-normal`} value={values.buyBody} placeholder="원하는 모델·규격·수량·상태를 알려주세요. 전화번호는 본문에 적지 마세요." onChange={e=>change("buyBody",e.target.value)}/>
            </label></> : <>
            <label className="sm:col-span-2 text-sm font-bold">보유 물품 설명 (필수)
              <textarea rows={5} maxLength={1000} className={`${inputField} ${placeholder} py-3 font-normal`} value={values.owned} placeholder="보유 물품의 모델·상태·구성품을 알려주세요." onChange={e=>change("owned",e.target.value)}/>
            </label><label className="sm:col-span-2 text-sm font-bold">원하는 교환 물품·조건 (필수)
              <textarea rows={5} maxLength={1000} className={`${inputField} ${placeholder} py-3 font-normal`} value={values.wanted} placeholder="원하는 물품과 추가금 등 협의할 조건을 알려주세요." onChange={e=>change("wanted",e.target.value)}/>
            </label>
            <section className="sm:col-span-2" aria-label="보유 물품 사진"><h3 className="text-sm font-bold">보유 물품 사진 (선택)</h3>
              {stored.length ? <MarketPhotoGallery images={stored} title={item!.title} listing/> : null}
              {item?.images?.map((src,index)=>{const mediaId=src.split("/").at(-1)!;return <label key={src} className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={removed.includes(mediaId)} onChange={e=>setRemoved(current=>e.target.checked?[...current,mediaId]:current.filter(x=>x!==mediaId))}/>{index+1}번 기존 사진 삭제 (수정 완료 시)</label>;})}
              <MarketPhotoPicker listing files={files} onChange={setFiles} storedCount={stored.length}/>
            </section></>}
            <label className="text-sm font-bold">거래 방식 (필수)
              <select required className={selectField(values.tradeType)} value={values.tradeType} onChange={(e) => change("tradeType", e.target.value)} {...attrs("tradeType")}>
                {marketTradeTypes.filter((v) => v.value !== "all").map((v) => <option key={v.value} value={v.value} className="text-foreground">{v.label}</option>)}
              </select>{error("tradeType")}
            </label>
            <label className="text-sm font-bold">거래 지역 (필수)
              <select required className={selectField(values.region)} value={values.region} onChange={(e) => change("region", e.target.value)} {...attrs("region")}>
                <option value="" className="text-pul-muted">선택해 주세요</option>
                {marketListingRegions.filter((v) => v !== "전체").map((v) => <option key={v} className="text-foreground">{v}</option>)}
              </select>{error("region")}
            </label>
          </div>
          <fieldset className="space-y-3 rounded-xl border border-pul-border p-3">
            <legend className="px-1 text-sm font-bold">거래 연락 방법</legend>
            <p className="text-sm font-bold">쪽지로 문의받기 (기본)</p>
            <p className="text-xs leading-5 text-pul-muted">전화번호 없이 쪽지로 거래를 상담할 수 있습니다.</p>
            <label className="flex gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={additional} onChange={(e) => { setAdditional(e.target.checked); setErrors((v) => ({ ...v, contact: "" })); }} />
              {item?.publicContactMethod === "external_url" ? "기존 외부 문의 링크 사용 (선택)" : "전화·문자 문의도 받기 (선택)"}
            </label>
            <p className="text-xs leading-5 text-pul-muted">{item?.publicContactMethod === "external_url" ? "기존 링크를 유지하거나 전화·문자로 변경할 수 있습니다." : "선택하면 전화번호 입력과 공개 동의가 필요합니다."}</p>
            {additional ? <MarketContactFields listing allowExternal={item?.publicContactMethod === "external_url"} value={contact} existingConsent={existingConsent} onChange={(value) => { setContact(value); setErrors((v) => ({ ...v, contact: "" })); }} /> : null}
            {error("contact")}
          </fieldset>

        </fieldset>
        <fieldset disabled={props.busy || props.saved} className="mt-4 space-y-3 rounded-xl border border-pul-border p-3">
          <legend className="px-1 text-sm font-bold">{marketPolicyTitle}</legend>
          <button type="button" className="min-h-11 text-sm text-pul-point underline underline-offset-4" onClick={() => setPolicyOpen(true)}>내용 보기</button>
          <label className="flex gap-3 text-sm leading-6">
            <input type="checkbox" className="mt-1 size-5 shrink-0" checked={tradeNoticeConfirmed} {...attrs("tradeNotice")} onChange={(event) => { setTradeNoticeConfirmed(event.target.checked); setErrors((previous) => ({ ...previous, tradeNotice: "" })); }} />
            장터 이용안내 및 운영정책을 읽고 동의합니다.
          </label>
          {error("tradeNotice")}
        </fieldset>
        {error("input")}
        {props.saved ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm">글은 저장되었습니다. 재시도하면 남은 사진만 올립니다. 내용을 수정하려면 닫은 뒤 저장된 글을 다시 열어 주세요.</p> : null}
        {props.error ? <p className="mt-3 text-sm text-rose-700" role="alert">{props.error}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" disabled={props.busy} onClick={close} className="min-h-11 rounded-lg border border-pul-border">{props.saved ? "닫기" : "취소"}</button>
          <button type="submit" disabled={props.busy} className="min-h-11 rounded-lg bg-pul-point font-bold text-white disabled:opacity-50">{props.busy ? "저장·사진 처리 중…" : props.saved ? "남은 사진 재시도" : item ? "수정 완료" : values.requestType === "exchange" ? "교환글 등록" : "삽니다 등록"}</button>
        </div>
      </form>
    </MarketDialog>
    {policyOpen ? <MarketDialog title={marketPolicyTitle} onClose={() => setPolicyOpen(false)}><MarketPolicyContent /></MarketDialog> : null}
    {confirmClose ? <MarketConfirmDialog title="작성을 취소할까요?" message="저장하지 않은 내용과 선택한 사진이 사라집니다." confirmLabel="작성 취소" busy={false} onClose={() => setConfirmClose(false)} onConfirm={props.onClose} /> : null}
  </>;
}
