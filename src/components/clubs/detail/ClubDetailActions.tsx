"use client";
import {useClubJoinApplication} from "./ClubJoinApplicationProvider";
import {useClubJoinInquiry} from "./ClubJoinInquiryProvider";
import {useClubParticipationRequest} from "./ClubParticipationRequestProvider";
import type {ParkGolfClub} from "@/types";
import {ClipboardList,Flag,HelpCircle,Users} from "lucide-react";
import Link from "next/link";

type Props={club:ParkGolfClub;variant:"top"|"sidebar"|"participation";managementLinks?:{href:string;label:string}[];managementNotice?:string};
const buttonBase="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[15px] font-semibold";
const buttonClass=buttonBase+" border-pul-border bg-white text-pul-deep hover:bg-pul-light";
const primaryButtonClass=buttonBase+" border-pul-point bg-pul-point text-white hover:bg-pul-deep";
const disabledButtonClass=buttonBase+" cursor-not-allowed border-pul-border bg-pul-page text-pul-muted";
export function ClubDetailActions({club,variant,managementLinks=[],managementNotice}:Props){
 const {openApplication}=useClubJoinApplication(),{openInquiry}=useClubJoinInquiry(),{openRequest}=useClubParticipationRequest();
 const member=club.viewerMembership==="active",pending=!!club.viewerApplicationStatus&&["submitted","reviewing","additional_info_required","interview_requested","waitlisted"].includes(club.viewerApplicationStatus);
 const canApply=!member&&(pending||club.recruitStatus!=="closed"),applyLabel=pending?"내 가입 신청 확인":club.recruitStatus==="waiting"?"대기 신청":"가입 신청";
 const hasHomeCourse=club.directoryDataAvailability?.homeCourse!==false;
 if(variant==="participation")return <div className="grid gap-2 sm:grid-cols-3">{([["informationCorrection","정보 수정 제보"],["representativePhoto","대표사진 등록 안내"],["operatorVerification","동호회 운영자 인증 안내"]] as const).map(([type,label])=><button key={type} type="button" onClick={e=>openRequest(type,e.currentTarget)} className={buttonClass}>{label}</button>)}</div>;
 const apply=club.viewerAuthenticated===false&&canApply?<Link href={"/login?next="+encodeURIComponent("/clubs/"+club.id)} className={primaryButtonClass}>로그인 후 가입 신청</Link>:<button type="button" onClick={canApply?event=>openApplication(event.currentTarget):undefined} disabled={!canApply} className={canApply?primaryButtonClass:disabledButtonClass} aria-label={member?"동호회 가입 회원":pending?"내 가입 신청 확인":canApply?"동호회 가입 신청":"현재 회원 모집 마감"}><Users className="h-4 w-4 shrink-0" aria-hidden="true"/>{member?"가입 회원":canApply?applyLabel:"모집 마감"}</button>;
 return <div className="space-y-3">
  <div className={hasHomeCourse?"grid grid-cols-2 gap-2 sm:grid-cols-3":"grid grid-cols-2 gap-2"}>
   {member?null:apply}<button type="button" onClick={e=>openInquiry(e.currentTarget)} className={buttonClass}><HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true"/>{member?'운영진 문의·내역':'가입 문의'}</button>
   {hasHomeCourse?<Link href="#club-courses" className={buttonClass}><Flag className="h-4 w-4 shrink-0" aria-hidden="true"/>활동 구장</Link>:null}
  </div>
  {managementLinks.length?<details className="rounded-xl border border-pul-border bg-pul-page/50 px-3 py-2"><summary className="min-h-11 cursor-pointer font-semibold text-pul-deep"><ClipboardList className="mr-2 inline h-4 w-4" aria-hidden="true"/>동호회 관리</summary><nav aria-label="동호회 관리" className="mt-2 grid gap-2 pb-2 sm:grid-cols-2">{managementLinks.map(link=><Link key={link.href+link.label} href={link.href} className={buttonClass}>{link.label}</Link>)}</nav>{managementNotice?<p className="pb-2 text-sm text-pul-muted">{managementNotice}</p>:null}</details>:null}
 </div>;
}
