"use client";
import {useState} from "react";
import Link from "next/link";
import type {BuyRequestDetail} from "@/lib/market/marketPhaseOne";
import {buyExchangeStatus} from "@/lib/market/marketBuyExchange";
import {categoryLabels,tradeTypeLabels} from "@/data/marketData";
import {MarketDialog} from "./MarketDialog";
import {MarketPhotoGallery} from "./MarketPhotos";
import {MarketContactPanel} from "./MarketContact";
import {MarketInterest} from "@/components/interests/MarketInterest";
import {BuyRequestReportDialog} from "./BuyRequestReportDialog";
export function BuyRequestDetailModal({item,authenticated,onClose,onEdit,onEnd,onDelete}:{item:BuyRequestDetail;authenticated:boolean;onClose:()=>void;onEdit:()=>void;onEnd:()=>void;onDelete:()=>void}){
 const [report,setReport]=useState(false);const owner=Boolean(item.canEdit),exchange=item.requestType==="exchange",ended=item.requestStatus==="closed";
 const compose="/messages/new?request="+encodeURIComponent(item.id);
 return <><MarketDialog title={item.title} onClose={onClose} headerActions={<details className="relative shrink-0"><summary aria-label="장터 글 더보기" className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-full text-2xl hover:bg-pul-light">⋯</summary><div className="absolute right-0 top-full z-10 w-40 rounded-xl border border-pul-border bg-white p-1 shadow-lg"><button type="button" className="min-h-11 w-full rounded-lg px-3 text-sm hover:bg-pul-light" onClick={()=>owner?onDelete():setReport(true)}>{owner?"글 삭제":"글 신고"}</button></div></details>}>
  {exchange&&item.images?.length?<MarketPhotoGallery listing images={item.images} title={item.title}/>:null}
  <div className="mt-4 flex flex-wrap items-center gap-3">{!exchange?<p className="text-2xl font-bold text-pul-deep">{item.budget}</p>:<p className="text-xl font-bold text-pul-deep">교환합니다</p>}<span className="rounded-full bg-pul-light px-3 py-1 text-sm font-bold text-pul-deep">{buyExchangeStatus(item)}</span></div>
  <p className="mt-2 text-sm leading-6 text-pul-muted">{categoryLabels[item.category]} · {item.region} · {tradeTypeLabels[item.tradeType??"negotiable"]}</p>
  <section className="mt-5"><h3 className="text-base font-bold">{exchange?"보유 물품":"구매 희망 내용"}</h3><p className="mt-2 whitespace-pre-wrap break-words text-base leading-7">{item.summary}</p></section>
  {exchange?<section className="mt-5"><h3 className="text-base font-bold">원하는 교환 물품·조건</h3><p className="mt-2 whitespace-pre-wrap break-words text-base leading-7">{item.exchangeWanted}</p></section>:null}
  <p className="mt-4 border-t border-pul-border pt-3 text-sm text-pul-muted">{item.authorNickname} · {item.createdAt}</p>
  {owner?<div className="mt-4 flex flex-wrap gap-2">{!ended?<><button type="button" onClick={onEdit} className="min-h-11 flex-1 rounded-lg bg-pul-point px-3 font-bold text-white">내용 수정</button><button type="button" onClick={onEnd} className="min-h-11 flex-1 rounded-lg border border-pul-border px-3 font-bold">{exchange?"교환 완료로 변경":"구매 완료로 변경"}</button></>:<p className="text-sm text-pul-muted">{buyExchangeStatus(item)}한 글입니다.</p>}</div>:<>
   <div className="mt-4 flex flex-wrap items-start gap-2">{ended?<p className="min-h-11 py-2 text-sm text-pul-muted">완료된 글입니다.</p>:<Link prefetch={false} href={authenticated?compose:"/login?next="+encodeURIComponent(compose)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-pul-point px-4 font-bold text-white">쪽지 보내기</Link>}<MarketInterest key={item.id} kind="buy_request" id={item.id} authenticated={authenticated}/></div>
   <MarketContactPanel contact={item} owner={false} ended={ended} authenticated={authenticated} compact/>
  </>}
 </MarketDialog>{report?<BuyRequestReportDialog item={item} onClose={()=>setReport(false)}/>:null}</>;
}
