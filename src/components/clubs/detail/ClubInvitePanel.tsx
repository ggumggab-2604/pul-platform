"use client";
import { useState } from "react";
import qrcode from "@/lib/vendor/qrcode.mjs";
import { useClubJoinInquiry } from "./ClubJoinInquiryProvider";
export function ClubInvitePanel({clubKey,isMember=false}:{clubKey:string;isMember?:boolean}){
 const {openInquiry}=useClubJoinInquiry();
 const [href,setHref]=useState(""),[notice,setNotice]=useState("");
 const qr=href?(()=>{const q=qrcode(0,"M");q.addData(href);q.make();const n=q.getModuleCount();let path="";for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))path+=`M${x+4} ${y+4}h1v1h-1z`;return{path,n:n+8};})():null;
 return <div className="mt-2 text-sm" aria-label="기존 회원 확인과 초대">
 <div className="flex flex-wrap items-center gap-x-2">{!isMember?<><span className="text-pul-muted">이미 활동 중인 회원이신가요?</span><button type="button" className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-pul-point hover:bg-pul-light" onClick={e=>openInquiry(e.currentTarget,true)}>기존 회원 확인</button></>:null}<button type="button" className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-pul-point hover:bg-pul-light" aria-expanded={!!href} onClick={()=>setHref(current=>current?"":new URL("/clubs/"+encodeURIComponent(clubKey)+"?join=existing",window.location.origin).href)}>초대 링크·QR 보기</button></div>
 {href?<div className="mt-2 rounded-lg border border-pul-border p-3"><p className="break-all text-sm">{href}</p><button type="button" className="mt-2 min-h-11 rounded-lg border px-3" onClick={()=>void navigator.clipboard.writeText(href).then(()=>setNotice("초대 링크를 복사했습니다."),()=>setNotice("복사하지 못했습니다. 위 주소를 선택해 복사해 주세요."))}>링크 복사</button>{qr?<svg role="img" aria-label="기존 회원 확인 요청 초대 링크 QR" className="mt-3 h-44 w-44 max-w-full" viewBox={`0 0 ${qr.n} ${qr.n}`} shapeRendering="crispEdges"><rect width={qr.n} height={qr.n} fill="white"/><path d={qr.path} fill="black"/></svg>:null}<p className="mt-2 text-pul-muted">운영진의 회원 확인이 필요하며 링크만으로 승인되지 않습니다. 로컬 주소는 이 컴퓨터에서만 접속할 수 있습니다.</p></div>:null}
 {notice?<p role="status" className="mt-2">{notice}</p>:null}</div>;
}
