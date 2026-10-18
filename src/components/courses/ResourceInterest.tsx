"use client";
import {useEffect,useSyncExternalStore} from "react";
import Link from "next/link";
import {usePathname,useSearchParams} from "next/navigation";
import {Heart} from "lucide-react";
import {resourceInterests as store} from "@/lib/courses/resourceInterestClient";
export function ResourceInterest({id,onSaved}:{id:string;onSaved?:(saved:boolean)=>void}){
 const state=useSyncExternalStore(store.subscribe,store.snapshot,store.serverSnapshot),entry=state.entries.get(id),path=usePathname(),query=useSearchParams();
 useEffect(()=>store.watch(id),[id]);
 const style="inline-flex min-h-11 shrink-0 whitespace-nowrap items-center justify-center gap-1 rounded-lg border border-pul-border bg-white px-3 py-2 text-sm font-bold text-pul-point";
 if(state.viewer===null&&!state.authError)return <Link prefetch={false} className={style} href={"/login?next="+encodeURIComponent(path+(query.size?"?"+query.toString():""))} aria-label="로그인 후 자료 관심 저장"><Heart size={18}/>관심</Link>;
 const unknown=entry?.saved===undefined,failed=state.authError||!!entry?.error;
 return <div data-resource-interest={id} className="min-w-0 shrink-0"><button type="button" className={style} aria-label={failed?"자료 관심 다시 확인":unknown?"자료 관심 확인 중":entry.saved?"자료 관심 해제":"자료 관심 저장"} aria-pressed={unknown?undefined:entry.saved} disabled={entry?.busy||(!failed&&unknown)} onClick={()=>{if(failed&&entry?.retry===undefined){store.retry(id);return;}void store.choose(id).then(ok=>{if(ok)onSaved?.(store.snapshot().entries.get(id)!.saved!);});}}><Heart size={18} fill={entry?.saved?"currentColor":"none"}/>{entry?.busy?"저장 중…":failed?"다시 확인":unknown?"확인 중…":"관심"}</button>{failed?<p role="alert" className="mt-1 max-w-60 text-xs leading-5 text-rose-700">{state.authError?"로그인 상태를 확인하지 못했습니다.":entry?.error}{entry?.saved!==undefined&&entry.retry===undefined?" 마지막 확인값입니다.":""}</p>:null}</div>;
}
