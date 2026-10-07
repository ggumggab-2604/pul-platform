"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Heart} from "lucide-react";
import {listInterestsAction} from "@/app/my/interestActions";
import type {InterestFilter,InterestPage} from "@/lib/interests/interests";
import {InterestButton} from "./InterestButton";
const statuses:Record<string,string>={selling:"판매중",reserved:"예약중",sold:"판매완료"};
export function InterestList({initialPage,initialFailed=false}:{initialPage:InterestPage|null;initialFailed?:boolean}) {
 const [page,setPage]=useState(initialPage),[filter,setFilter]=useState<InterestFilter>("all"),[offset,setOffset]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState(initialFailed),[revision,setRevision]=useState(0);
 const epoch=useRef(0),lock=useRef(false);
 useEffect(()=>()=>{epoch.current++;},[]);
 async function load(next:InterestFilter,start:number) {
  if(lock.current)return;lock.current=true;
  const ticket=++epoch.current;setBusy(true);setError(false);
  try {const result=await listInterestsAction(next,start);if(epoch.current===ticket){setPage(result);setFilter(next);setOffset(start);setRevision(v=>v+1);}}
  catch {if(epoch.current===ticket)setError(true);}
  finally {if(epoch.current===ticket)setBusy(false);lock.current=false;}
 }
 return <section aria-labelledby="my-interests-title" className="mt-5 rounded-2xl border border-pul-border bg-white p-4 shadow-sm sm:p-6">
  <h2 id="my-interests-title" className="flex items-center gap-2 text-2xl font-bold"><Heart className="shrink-0 text-pul-point" aria-hidden="true"/>관심목록</h2>
  <p className="mt-2 text-sm leading-6 text-pul-muted">다시 보고 싶은 골프장·장터 글·업체와 레슨 영상을 모아보세요.</p>
  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="관심목록 종류">
   {([["all","전체"],["course","골프장"],["market","장터"],["vendor","업체"],["startup_question","창업 질문"],["store","매장매매"],["lesson_video","레슨·영상"]] as const).map(([value,label])=><button key={value} type="button" disabled={busy} aria-pressed={filter===value} onClick={()=>void load(value,0)} className={`min-h-11 rounded-lg border px-4 text-sm font-bold ${filter===value?"border-pul-point bg-pul-point text-white":"border-pul-border"}`}>{label}</button>)}
  </div>
  {error?<div role="alert" className="mt-3 text-sm text-rose-700">관심목록을 불러오지 못했습니다. <button disabled={busy} className="min-h-11 underline" onClick={()=>void load(filter,offset)}>다시 시도</button></div>:null}
  {busy?<p role="status" className="mt-3 text-sm">관심목록을 불러오는 중…</p>:null}
  {!error&&page?.items.length===0?<p className="mt-4 rounded-xl bg-pul-light/20 p-5 text-sm leading-6">아직 관심목록에 저장한 항목이 없습니다.<br/>구장·상품 상세나 레슨 영상에서 관심 항목을 저장해 보세요.</p>:null}
  <ul className="mt-4 grid gap-3 sm:grid-cols-2" aria-busy={busy}>
   {page?.items.map(item=><li key={item.kind+item.id} className="min-w-0 rounded-xl border border-pul-border p-3">
    <div className="flex items-start gap-3">
     {item.available&&item.image?
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.image} alt="" className="size-16 shrink-0 rounded-lg bg-pul-page object-contain"/>:null}
     <div className="min-w-0 flex-1"><p className="text-xs text-pul-muted">{item.kind==="course"?"골프장":item.kind==="store"?"매장매매":item.kind==="startup_question"?"창업 질문":item.kind==="vendor"?"장비 수리·제작 업체":item.kind==="market"?"팝니다":item.kind==="buy_request"?item.requestType==="exchange"?"교환합니다":"삽니다":"레슨·영상"}</p>
      {item.available&&item.href?<Link prefetch={false} href={item.href} target={item.kind==="lesson_video"?"_blank":undefined} rel={item.kind==="lesson_video"?"noopener noreferrer":undefined} className="mt-1 block break-words font-bold hover:text-pul-point">{item.title}{item.kind==="lesson_video"?" (새 창)":""}</Link>:<p className="font-bold">현재 볼 수 없는 항목</p>}
      {item.available?<p className="mt-1 text-sm leading-6 text-pul-muted">{item.kind==="store"?`${item.price?.toLocaleString("ko-KR")}원 · ${item.region} · ${item.summary??""}`:item.kind==="market"?`${item.price?.toLocaleString("ko-KR")}원 · ${item.region} · ${statuses[item.status??""]??""}`:item.kind==="buy_request"?`${item.requestType==="exchange"?"교환":item.price===null?"예산 협의":item.price.toLocaleString("ko-KR")+"원"} · ${item.region} · ${item.status==="closed"?"완료":"진행 중"}`:item.summary}</p>:<p className="mt-1 text-sm text-pul-muted">삭제되었거나 공개되지 않은 항목입니다.</p>}
     </div>
    </div>
    <div className="mt-3"><InterestButton key={revision+item.kind+item.id} kind={item.kind} id={item.id} initialSaved={true} label="관심" onSaved={saved=>{if(!saved)void load(filter,offset);}}/></div>
   </li>)}
  </ul>
  {page&&(offset>0||page.hasMore)?<div className="mt-4 flex flex-wrap justify-center gap-3"><button disabled={busy||offset===0} onClick={()=>void load(filter,Math.max(0,offset-12))} className="min-h-11 rounded-lg border px-4 disabled:opacity-40">이전</button><span className="self-center text-sm">{offset/12+1} 페이지</span><button disabled={busy||!page.hasMore} onClick={()=>void load(filter,offset+12)} className="min-h-11 rounded-lg border px-4 disabled:opacity-40">다음</button></div>:null}
 </section>;
}
