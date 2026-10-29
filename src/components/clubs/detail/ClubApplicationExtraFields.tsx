"use client";
import { useEffect, useState } from "react";
import { MessagingSessionBoundary as ClubViewerBoundary } from "@/components/messaging/MessagingSessionBoundary";
import { createClient } from "@/lib/supabase/client";
import type { ClubApplicationDetails } from "@/lib/clubs/clubApplicationDetails";

export function ClubApplicationExtraFields({value,onChange}:{value:ClubApplicationDetails;onChange:(v:ClubApplicationDetails)=>void}) {
 const input="mt-1 min-h-12 w-full rounded-lg border border-pul-border p-3 text-base";
 const text=(key:"fullName"|"phone"|"level"|"lessonNeeded"|"otherClubs"|"previousActivity",label:string,required=false)=><label className="block" key={key}>{label}{required?" (필수)":" (선택)"}<input className={input} id={"club-application-"+key} value={value[key]} required={required} maxLength={key==="phone"?30:key==="fullName"?60:500} type={key==="phone"?"tel":"text"} autoComplete={key==="phone"?"tel":key==="fullName"?"name":"off"} onChange={e=>onChange({...value,[key]:e.target.value})}/></label>;
 return <section className="space-y-4">
  <p className="text-sm text-pul-muted">이름과 전화번호는 본인과 이 동호회의 가입 심사 권한자만 확인합니다. 공개 회원 목록에 표시하지 않습니다.</p>
  {text("fullName","이름",true)}{text("phone","전화번호",true)}
  <details className="rounded-xl border border-pul-border p-4"><summary className="cursor-pointer font-bold">추가 소개 (선택·모르면 비워 두세요)</summary><div className="mt-4 space-y-4">
  {text("level","실력")}{text("lessonNeeded","강습 필요 여부")}{text("otherClubs","타 동호회 가입 여부")}{text("previousActivity","기존 활동 경험")}
  <div className="grid grid-cols-2 gap-3"><label>평균 타수<input className={input} type="number" min="1" max="9999" value={value.averageScore??""} onChange={e=>onChange({...value,averageScore:e.target.value?Number(e.target.value):null})}/></label><label>타수 기준<select className={input} value={value.holes??""} onChange={e=>onChange({...value,holes:e.target.value?Number(e.target.value):null})}><option value="">미입력</option><option value="18">18홀</option><option value="36">36홀</option></select></label></div>
  <fieldset><legend>참여 가능한 요일</legend><div className="flex flex-wrap gap-3">{["월","화","수","목","금","토","일"].map(day=><label key={day} className="inline-flex min-h-11 items-center gap-1"><input type="checkbox" checked={value.days.includes(day)} onChange={()=>onChange({...value,days:value.days.includes(day)?value.days.filter(x=>x!==day):[...value.days,day]})}/>{day}</label>)}</div></fieldset>
  </div></details>
 </section>;
}

export function ClubApplicationPrivateDetails({applicationId,viewerId}:{applicationId:string;viewerId:string}) {
 return <ClubViewerBoundary viewerId={viewerId}><PrivateDetailsContent key={viewerId+":"+applicationId} applicationId={applicationId}/></ClubViewerBoundary>;
}
function PrivateDetailsContent({applicationId}:{applicationId:string}) {
 const [state,setState]=useState<{details?:ClubApplicationDetails;error?:string}>({});
 useEffect(()=>{let live=true;createClient().rpc("get_club_application_details",{p_application_id:applicationId}).then(({data,error})=>{if(live)setState(error?{error:"신청 연락처를 불러오지 못했습니다."}:{details:data as ClubApplicationDetails});});return()=>{live=false;};},[applicationId]);
 if(state.error)return <p role="status">{state.error}</p>;
 if(!state.details)return null;
 const d=state.details;
 return <details className="my-4 rounded-xl border border-pul-border bg-white p-4"><summary className="cursor-pointer font-bold">가입 신청 정보 (비공개)</summary><dl className="mt-3 space-y-2 break-words">{Object.entries({이름:d.fullName,전화번호:d.phone,실력:d.level,강습:d.lessonNeeded,"타 동호회":d.otherClubs,"기존 활동":d.previousActivity,"평균 타수":d.averageScore?`${d.averageScore}타 / ${d.holes}홀`:"","참여 요일":d.days?.join(" · ")}).map(([k,v])=>v?<div key={k}><dt className="font-semibold">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div>:null)}</dl></details>;
}
