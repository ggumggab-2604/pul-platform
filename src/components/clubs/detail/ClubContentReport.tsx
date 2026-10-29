"use client";
import {useRef,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {ClubEditorDialog,clubInput,clubButton} from "./ClubEditorDialog";
export function ClubContentReport({postId,mediaId,onClose}:{postId?:string;mediaId?:string;onClose:()=>void}){
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[done,setDone]=useState(false);const lock=useRef(false),request=useRef<{reason:string;id:string}|null>(null);
 return <ClubEditorDialog title="콘텐츠 신고" busy={busy} onClose={onClose}><form className="space-y-4" onSubmit={async e=>{e.preventDefault();if(lock.current||done)return;lock.current=true;setBusy(true);try{const text=reason.trim();const id=request.current?.reason===text?request.current.id:crypto.randomUUID();request.current={reason:text,id};const r=await createClient().rpc('report_club_content',{p_kind:postId?'post':'photo',p_id:postId??mediaId,p_reason:text,p_request_id:id});if(r.error)throw Error(r.error.message);setDone(true);setMessage('신고가 접수되었습니다.');}catch(e){setMessage(e instanceof Error?e.message:'신고를 접수하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}}><label className="block">신고 사유<textarea className={clubInput} required minLength={5} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy||done}/></label><p role="status" className="text-sm">{message}</p><button type="submit" className={clubButton} disabled={busy||done}>{busy?'접수 중…':'신고 접수'}</button></form></ClubEditorDialog>;
}
