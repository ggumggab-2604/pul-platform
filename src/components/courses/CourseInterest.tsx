"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {safeCourseNextAction as courseNextAction} from "@/lib/courses/courseNextClient";
import {useAuthSessionStatus} from "@/hooks/useAuthSessionStatus";
import {resourceButton as button} from "@/lib/courses/courseContent";
import type {CourseChoice} from "@/lib/courses/courseNext";
export function CourseInterest({courseKey,returnTo,onSaved}:{courseKey:string;returnTo:string;onSaved?:(saved:boolean)=>void}){
 const auth=useAuthSessionStatus();
 if(auth==="signedOut")return <Link className={button} prefetch={false} href={"/login?next="+encodeURIComponent(returnTo)}>♡ 관심·운영알림</Link>;
 if(auth!=="signedIn")return <span className="text-sm">관심 확인 중…</span>;
 return <CourseChoiceControl key={courseKey} courseKey={courseKey} onSaved={onSaved}/>;
}
function CourseChoiceControl({courseKey,onSaved}:{courseKey:string;onSaved?:(saved:boolean)=>void}){
 const [state,setState]=useState<CourseChoice|null>(null),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[choosing,setChoosing]=useState(false),[uncertain,setUncertain]=useState(false);
 const lock=useRef(false),attempt=useRef<{id:string;enabled:boolean}|null>(null);
 const load=useCallback(async()=>{const r=await courseNextAction({op:"choiceRead",course:courseKey});if(r.ok)setState(r.data);else setNotice(r.message);},[courseKey]);
 useEffect(()=>{void Promise.resolve().then(load);},[load]);
 async function choose(enabled:boolean){
  if(lock.current)return;lock.current=true;setBusy(true);
  if(!attempt.current||!uncertain)attempt.current={id:crypto.randomUUID(),enabled};
  const a=attempt.current,r=await courseNextAction({op:"choice",course:courseKey,enabled:a.enabled,requestId:a.id});
  if(r.ok){setState(r.data);setChoosing(false);setNotice("설정했습니다. 기존에 받은 쪽지는 그대로 유지됩니다.");setUncertain(false);attempt.current=null;onSaved?.(r.data.saved);}
  else {setNotice(r.message);setUncertain(!["PT409","42501","22023","P0002"].includes(r.code));}
  setBusy(false);lock.current=false;
 }
 return <div className="max-w-md space-y-2 text-sm">
 {state?<><p>관심 {state.saved?"저장":"없음"} · 운영알림 {state.subscribed?"받는 중":"안 받음"}</p>
 <button className={button} disabled={busy||uncertain} onClick={()=>setChoosing(v=>!v)} aria-expanded={choosing}>{state.saved||state.subscribed?"관심·알림 설정":"♡ 관심"}</button>
 {choosing?<div className="space-y-3 rounded-lg border border-pul-border bg-white p-3"><p>관심을 선택하면 이 구장을 저장하고 휴장·운영시간 등 운영 소식을 PUL 쪽지로 받습니다. 마케팅 동의와 별개입니다.</p>
 {state.saved!==state.subscribed?<p>기존 설정을 그대로 보관 중입니다. 직접 선택할 때만 함께 바뀝니다.</p>:null}
 <div className="flex flex-wrap gap-2"><button className={button} disabled={busy||uncertain||!state.available} onClick={()=>void choose(true)}>관심 저장·운영알림 받기</button><button className={button} disabled={busy||uncertain||!state.saved&&!state.subscribed} onClick={()=>void choose(false)}>둘 다 해제</button><button className={button} disabled={busy||uncertain} onClick={()=>setChoosing(false)}>현재 설정 유지</button></div></div>:null}</>:<button className={button} onClick={()=>void load()}>관심 상태 다시 확인</button>}
 {notice?<p role="status" className="break-words">{notice}</p>:null}{uncertain?<button className={button} disabled={busy} onClick={()=>void choose(attempt.current!.enabled)}>같은 요청으로 결과 확인</button>:null}</div>;
}
export function MyCourseChoices(){
 const [items,setItems]=useState<(CourseChoice&{name:string})[]>([]),[offset,setOffset]=useState(0),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{const r=await courseNextAction({op:"choiceList",offset});if(r.ok){setItems(r.data);setNotice("");}else setNotice(r.message);},[offset]);useEffect(()=>{void Promise.resolve().then(load);},[load]);
 return <section className="space-y-4"><h2 className="text-xl font-bold">골프장 관심·운영알림</h2><p className="text-sm">기존 관심 또는 운영알림 설정이 있는 구장입니다. 직접 선택하기 전에는 각 설정을 그대로 유지합니다.</p>
 {items.map(c=><article key={c.course_key} className="space-y-3 rounded-xl border border-pul-border bg-white p-4">{c.available?<Link className="font-bold" href={"/courses/"+c.course_key}>{c.name}</Link>:<p>현재 공개되지 않은 구장</p>}<CourseInterest courseKey={c.course_key} returnTo="/my/operational-notices"/></article>)}
 {!items.length&&!notice?<p>설정한 골프장이 없습니다.</p>:null}<p role="status">{notice}</p><div className="flex gap-3"><button className={button} disabled={!offset} onClick={()=>setOffset(v=>Math.max(0,v-20))}>이전</button><button className={button} disabled={items.length<20} onClick={()=>setOffset(v=>v+20)}>다음</button></div></section>;
}
