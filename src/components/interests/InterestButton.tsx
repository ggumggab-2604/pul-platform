"use client";
import {useRef,useState} from "react";
import {Heart} from "lucide-react";
import {setInterestAction} from "@/app/my/interestActions";
import type {InterestKind} from "@/lib/interests/interests";
export function InterestButton({kind,id,initialSaved,label="관심상품",onSaved}:{kind:InterestKind;id:string;initialSaved:boolean;label?:string;onSaved?:(saved:boolean)=>void}) {
 const [saved,setSaved]=useState(initialSaved),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const lock=useRef(false),retry=useRef<boolean|null>(null);
 async function change() {
  if(lock.current)return;
  lock.current=true;setBusy(true);setError("");
  // On ambiguous failure, retry the same desired state instead of toggling it.
  const desired=retry.current??!saved;retry.current=desired;
  try {const value=await setInterestAction(kind,id,desired);setSaved(value);retry.current=null;onSaved?.(value);}
  catch {setError("저장 상태를 확인하지 못했습니다. 다시 시도해 주세요.");}
  finally {lock.current=false;setBusy(false);}
 }
 return <div className="min-w-0">
  <button type="button" aria-pressed={saved} disabled={busy} onClick={()=>void change()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-3 py-2 text-sm font-bold text-pul-deep disabled:opacity-50">
   <Heart aria-hidden="true" size={18} fill={saved?"currentColor":"none"}/>{busy?"처리 중…":error?"다시 시도":label}{saved&&!busy&&!error?" 해제":""}
  </button>{error?<p role="alert" className="mt-1 text-sm text-rose-700">{error}</p>:null}
 </div>;
}
