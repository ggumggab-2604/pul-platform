"use client";
import {useState} from "react";
import type {MarketListingDetail} from "@/types";
import {categoryLabels,conditionLabels,saleStatusLabels,tradeTypeLabels} from "@/data/marketData";
import {MarketDialog} from "./MarketDialog";
import {MarketPhotoGallery} from "./MarketPhotos";
import {MarketContactPanel} from "./MarketContact";
import {MarketMessageLink} from "./MarketMessageLink";
import {MarketInterest} from "@/components/interests/MarketInterest";
type Props={item:MarketListingDetail|null;authenticated:boolean;onClose:()=>void;onEdit:(item:MarketListingDetail)=>void;onStatus:(item:MarketListingDetail,operation:"reserve"|"sell")=>void;onDelete:(item:MarketListingDetail)=>void;onReport:(item:MarketListingDetail)=>void};
export function MarketDetailModal({item,authenticated,onClose,onEdit,onStatus,onDelete,onReport}:Props) {
 const [statusOpen,setStatusOpen]=useState(false);
 if(!item)return null;
 const owner=Boolean(item.canEdit);
 return <MarketDialog title={item.name} onClose={onClose} headerActions={
  <details className="relative shrink-0">
   <summary aria-label="판매글 더보기" className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-full text-2xl hover:bg-pul-light">⋯</summary>
   <div className="absolute right-0 top-full z-10 w-40 rounded-xl border border-pul-border bg-white p-1 shadow-lg">
    <button type="button" className="min-h-11 w-full rounded-lg px-3 text-sm hover:bg-pul-light" onClick={()=>owner?onDelete(item):onReport(item)}>{owner?"판매글 삭제":"판매글 신고"}</button>
   </div>
  </details>}>
  <MarketPhotoGallery key={item.id} images={item.images??[]} title={item.name} listing/>
  <div className="mt-4 flex flex-wrap items-center gap-3"><p className="text-2xl font-bold text-pul-deep">{item.price.toLocaleString("ko-KR")}원</p><span className="rounded-full bg-pul-light px-3 py-1 text-sm font-bold text-pul-deep">{saleStatusLabels[item.saleStatus]}</span></div>
  <p className="mt-2 text-sm leading-6 text-pul-muted">{categoryLabels[item.category]} · {conditionLabels[item.condition]} · {tradeTypeLabels[item.tradeType]} · {item.region}</p>
  <section className="mt-5" aria-label="상품 설명"><h3 className="text-base font-bold">상품 설명</h3><p className="mt-2 whitespace-pre-wrap break-words text-base leading-7">{item.description}</p></section>
  <p className="mt-4 border-t border-pul-border pt-3 text-sm text-pul-muted">{item.sellerNickname} · {item.createdAt}</p>
  {owner?<section className="mt-4" aria-label="내 판매글 관리"><div className="flex flex-wrap gap-2">
   {item.saleStatus!=="sold"?<><button type="button" onClick={()=>onEdit(item)} className="min-h-11 flex-1 rounded-lg bg-pul-point px-3 font-bold text-white">내용 수정</button>
   <button type="button" aria-expanded={statusOpen} onClick={()=>setStatusOpen(!statusOpen)} className="min-h-11 flex-1 rounded-lg border border-pul-border px-3 font-bold">판매 상태 변경</button></>:<p className="text-sm text-pul-muted">판매가 완료된 상품입니다.</p>}
  </div>{statusOpen&&item.saleStatus!=="sold"?<div className="mt-2 rounded-lg border border-pul-border p-2"><button type="button" className="min-h-11 w-full rounded-lg text-sm hover:bg-pul-light" onClick={()=>onStatus(item,item.saleStatus==="selling"?"reserve":"sell")}>{item.saleStatus==="selling"?"예약중으로 변경":"판매완료로 변경"}</button></div>:null}</section>:
   <><div className="mt-4 flex flex-wrap items-start gap-2"><MarketMessageLink listingId={item.id} owner={false} status={item.saleStatus} authenticated={authenticated} compact/><MarketInterest key={item.id} id={item.id} authenticated={authenticated}/></div>
    <MarketContactPanel contact={item} owner={false} ended={item.saleStatus==="sold"} authenticated={authenticated} compact/></>}
 </MarketDialog>;
}
