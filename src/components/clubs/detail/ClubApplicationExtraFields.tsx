"use client";

import {useEffect,useState} from "react";
import {MessagingSessionBoundary as ClubViewerBoundary} from "@/components/messaging/MessagingSessionBoundary";
import {createClient} from "@/lib/supabase/client";
import type {ClubApplicationDetails,ClubApplicationSnapshot} from "@/lib/clubs/clubApplicationDetails";
import {clubJoinInquiryAvailableDayOptions,clubJoinInquiryExperienceOptions,clubJoinInquiryInterestOptions} from "@/data/clubData";
import type {ClubJoinInquiryExperience,ClubJoinInquiryInterest} from "@/types";

type Props={value:ClubApplicationDetails;onChange:(v:ClubApplicationDetails)=>void;experience?:ClubJoinInquiryExperience;onExperience:(v:ClubJoinInquiryExperience|undefined)=>void;interests:ClubJoinInquiryInterest[];onInterest:(v:ClubJoinInquiryInterest)=>void;message:string;onMessage:(v:string)=>void};
const input="mt-1 min-h-12 w-full min-w-0 rounded-lg border border-pul-border p-3 text-base";

export function ClubApplicationExtraFields({value,onChange,experience,onExperience,interests,onInterest,message,onMessage}:Props){
 const set=(key:keyof ClubApplicationDetails,next:string|number|null|string[])=>onChange({...value,[key]:next});
 const otherJoined=value.otherClubs==="가입 중"||value.otherClubs.startsWith("가입 중 · ");
 return <section className="space-y-4">
  <p className="text-sm text-pul-muted">이름과 전화번호는 본인과 이 동호회의 가입 심사 권한자만 확인합니다. 공개 회원 목록에 표시하지 않습니다.</p>
  <div className="grid gap-4 sm:grid-cols-2">
   <label className="min-w-0">이름 <span className="text-pul-point">(필수)</span><input id="club-application-fullName" className={input} value={value.fullName} onChange={e=>set("fullName",e.target.value)} required maxLength={60} autoComplete="name"/></label>
   <label className="min-w-0">전화번호 <span className="text-pul-point">(필수)</span><input id="club-application-phone" className={input} type="tel" value={value.phone} onChange={e=>set("phone",e.target.value)} required maxLength={30} autoComplete="tel"/></label>
  </div>
  <details className="rounded-xl border border-pul-border p-4"><summary className="min-h-11 cursor-pointer font-bold">추가 소개 (선택)</summary><div className="mt-3 space-y-5">
   <p className="text-sm text-pul-muted">모르는 항목은 비워 두어도 신청할 수 있습니다.</p>
   <label className="block">파크골프 경력 (선택)<select id="club-application-experience" className={input} value={experience??""} onChange={e=>onExperience(e.target.value?e.target.value as ClubJoinInquiryExperience:undefined)}><option value="">미선택</option>{clubJoinInquiryExperienceOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
   <div className="grid gap-4 sm:grid-cols-2">
    <label className="min-w-0">실력 (선택)<select className={input} value={value.level} onChange={e=>set("level",e.target.value)}><option value="">미선택</option>{["입문","초급","중급","상급"].map(v=><option key={v}>{v}</option>)}</select></label>
    <label className="min-w-0">강습 필요 여부 (선택)<select className={input} value={value.lessonNeeded} onChange={e=>set("lessonNeeded",e.target.value)}><option value="">미선택</option>{["필요함","필요하지 않음","상담 후 결정"].map(v=><option key={v}>{v}</option>)}</select></label>
   </div>
   <label className="block">다른 동호회 가입 여부 (선택)<select className={input} value={otherJoined?"가입 중":value.otherClubs} onChange={e=>set("otherClubs",e.target.value)}><option value="">미선택</option><option>가입 중</option><option>가입하지 않음</option></select></label>
   {otherJoined?<label className="block">다른 동호회 추가 설명 (선택)<input className={input} maxLength={480} value={value.otherClubs.startsWith("가입 중 · ")?value.otherClubs.slice("가입 중 · ".length):""} onChange={e=>set("otherClubs","가입 중"+(e.target.value?" · "+e.target.value:""))}/></label>:null}
   <div className="grid min-w-0 grid-cols-2 gap-3">
    <label className="min-w-0">평균 타수 (선택)<input id="club-application-averageScore" className={input} type="number" min={1} max={9999} value={value.averageScore??""} onChange={e=>set("averageScore",e.target.value?Number(e.target.value):null)}/></label>
    <label className="min-w-0">타수 기준<select id="club-application-holes" className={input} value={value.holes??""} onChange={e=>set("holes",e.target.value?Number(e.target.value):null)}><option value="">미입력</option><option value="18">18홀</option><option value="36">36홀</option></select></label>
   </div>
   <fieldset><legend>활동 가능한 요일 (선택·복수 가능)</legend><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{["월","화","수","목","금","토","일"].map(day=><label key={day} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-pul-point" checked={value.days.includes(day)} onChange={()=>set("days",value.days.includes(day)?value.days.filter(x=>x!==day):[...value.days,day])}/>{day}</label>)}</div></fieldset>
   <fieldset><legend>희망 활동 (선택·복수 가능)</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{clubJoinInquiryInterestOptions.map(o=><label key={o.value} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5 shrink-0 accent-pul-point" checked={interests.includes(o.value)} onChange={()=>onInterest(o.value)}/>{o.label}</label>)}</div></fieldset>
   <label className="block">추가 전달사항 (선택)<textarea id="club-application-message" className={input} rows={3} maxLength={500} value={message} onChange={e=>onMessage(e.target.value)} placeholder="가입을 희망하는 이유나 운영진에게 알릴 내용을 적어 주세요."/><span className="mt-1 block text-right text-sm text-pul-muted">{message.length}/500자</span></label>
  </div></details>
 </section>;
}

export function ClubApplicationPrivateDetails({applicationId,viewerId}:{applicationId:string;viewerId:string}){
 return <ClubViewerBoundary viewerId={viewerId}><PrivateDetailsContent key={viewerId+":"+applicationId} applicationId={applicationId}/></ClubViewerBoundary>;
}
function PrivateDetailsContent({applicationId}:{applicationId:string}){
 const [state,setState]=useState<{details?:ClubApplicationSnapshot;error?:string}>({});
 useEffect(()=>{let live=true;createClient().rpc("get_club_application_details",{p_application_id:applicationId}).then(({data,error})=>{if(live)setState(error?{error:"신청 정보를 불러오지 못했습니다."}:{details:data as ClubApplicationSnapshot});});return()=>{live=false;};},[applicationId]);
 if(state.error)return <p role="status">{state.error}</p>;
 if(!state.details)return null;
 const d=state.details,a=d.answers,label=(options:readonly {value:string;label:string}[],code?:string)=>options.find(o=>o.value===code)?.label??(code==="notProvided"?"":code);
 const answers={이름:d.fullName,전화번호:d.phone,실력:d.level,강습:d.lessonNeeded,"타 동호회":d.otherClubs,"기존 활동 경험":d.previousActivity,"평균 타수":d.averageScore?`${d.averageScore}타 / ${d.holes}홀`:"","활동 가능한 요일":d.days?.join(" · "),"파크골프 경력":label(clubJoinInquiryExperienceOptions,a?.experienceCode),"활동 요일 (기존 선택)":!d.confirmations?label(clubJoinInquiryAvailableDayOptions,a?.availableDayCode):"","희망 활동":a?.interestCodes?.map(code=>label(clubJoinInquiryInterestOptions,code)).join(" · "),"가입 희망 이유 (기존 답변)":a?.applicationReason,[d.confirmations?"추가 전달사항":"운영진 전달 내용 (기존 답변)"]:a?.message};
 return <details className="my-4 rounded-xl border border-pul-border bg-white p-4"><summary className="min-h-11 cursor-pointer font-bold">가입 신청 정보 (비공개)</summary><dl className="mt-3 space-y-2 break-words">{Object.entries(answers).map(([k,v])=>v?<div key={k}><dt className="font-semibold">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div>:null)}</dl>{d.confirmations?<p className="mt-3 text-sm text-pul-muted">{d.confirmations.rules?"신청 당시 회칙을 확인했습니다.":"신청 당시 등록된 회칙이 없었습니다."}</p>:null}</details>;
}
