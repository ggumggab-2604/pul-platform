"use client";
import {storeHref} from "@/lib/market/marketStores";
import {qaHref} from "@/lib/market/marketStartupQa";
import {buyExchangeHref} from "@/lib/market/marketBuyExchange";

import {useEffect,useState} from "react";
import Link from "next/link";
import {Heart} from "lucide-react";
import {marketInterestStateAction} from "@/app/my/interestActions";
import {marketInterestHref} from "@/lib/interests/interests";
import {InterestButton} from "./InterestButton";
export function MarketInterest({id,authenticated,kind="market"}:{id:string;authenticated:boolean;kind?:"market"|"buy_request"|"vendor"|"startup_question"|"store"}) {
 const [saved,setSaved]=useState<boolean|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!authenticated)return;let live=true;
 marketInterestStateAction(id,kind).then(value=>{if(live){setSaved(value);setError(false);}}).catch(()=>{if(live)setError(true);});
 return()=>{live=false;};},[id,kind,authenticated,retry]);
 if(!authenticated)return <Link prefetch={false} href={`/login?next=${encodeURIComponent(kind==="store"?storeHref("",{store:id}):kind==="startup_question"?qaHref("",{question:id}):kind==="vendor"?`/market?view=care&provider=${encodeURIComponent(id)}`:kind==="buy_request"?buyExchangeHref(id):marketInterestHref(id))}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-pul-border px-3 text-sm font-bold"><Heart size={18} aria-hidden="true"/>{kind==="store"?"관심 매장":kind==="startup_question"?"관심 질문":kind==="vendor"?"관심 업체":kind==="buy_request"?"관심글":"관심상품"}</Link>;
 if(error)return <div><p role="alert" className="text-sm text-rose-700">관심 저장 상태를 불러오지 못했습니다.</p><button type="button" className="min-h-11 underline" onClick={()=>setRetry(retry+1)}>다시 확인</button></div>;
 if(saved===null)return <button type="button" disabled className="min-h-11 rounded-lg border px-3 text-sm">{kind==="store"?"관심 매장":kind==="startup_question"?"관심 질문":kind==="vendor"?"관심 업체":kind==="buy_request"?"관심글":"관심상품"} 확인 중…</button>;
 return <InterestButton label={kind==="store"?"관심 매장":kind==="startup_question"?"관심 질문":kind==="vendor"?"관심 업체":kind==="buy_request"?"관심글":"관심상품"} kind={kind} id={id} initialSaved={saved}/>;
}
