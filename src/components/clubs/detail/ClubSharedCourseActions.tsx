"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
export function ClubSharedCourseActions({shareId,version,canHide,onHidden}:{shareId:string;version:number;canHide:boolean;onHidden?:()=>void}){
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState('');const id=useRef<string|null>(null),lock=useRef(false);
 if(!canHide)return null;
 return <span className="inline-flex flex-wrap items-center gap-2"><button type="button" disabled={busy} className="min-h-11 rounded-lg border border-pul-border px-3 text-sm font-semibold" onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{id.current??=crypto.randomUUID();const r=await createClient().rpc('moderate_course_club_share',{p_share_id:shareId,p_expected_version:version,p_request_id:id.current,p_hidden:true});if(r.error)throw Error(r.error.message);onHidden?.();router.refresh();}catch(e){setError(e instanceof Error?e.message:'구장 표시를 숨기지 못했습니다.');}finally{lock.current=false;setBusy(false);}}}>{busy?'처리 중…':'구장에서만 숨기기'}</button>{error?<span role="alert" className="text-xs text-rose-700">{error}</span>:null}</span>;
}
