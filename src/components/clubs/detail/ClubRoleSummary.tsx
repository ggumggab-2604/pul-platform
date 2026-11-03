'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {clubRoleLabels,getClubRoleSummary,type ClubRoleSummary as Summary} from '@/lib/clubs/clubRoleSummary';
import {bestRank,scoreKind} from '@/lib/clubs/personalBests';
import styles from './ClubDetail.module.css';

export function ClubRoleSummary({clubKey,initial}:{clubKey:string;initial:Summary|null}){
 const [data,setData]=useState(initial),[error,setError]=useState(initial?'':'내 활동과 처리 현황을 불러오지 못했습니다.'),[busy,setBusy]=useState(false);
 const revision=useRef({sequence:0});
 const refresh=useCallback(async()=>{
  const ticket=++revision.current.sequence;setBusy(true);
  try{const next=await getClubRoleSummary(createClient(),clubKey);if(ticket===revision.current.sequence){setData(next);setError('');}}
  catch{if(ticket===revision.current.sequence){setData(null);setError('내 활동과 처리 현황을 불러오지 못했습니다. 다시 확인해 주세요.');}}
  finally{if(ticket===revision.current.sequence)setBusy(false);}
 },[clubKey]);
 useEffect(()=>{
  const requests=revision.current;
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};
  window.addEventListener('focus',visible);window.addEventListener('pageshow',visible);document.addEventListener('visibilitychange',visible);
  const timer=window.setTimeout(()=>void refresh(),0);
  return()=>{window.clearTimeout(timer);requests.sequence++;window.removeEventListener('focus',visible);window.removeEventListener('pageshow',visible);document.removeEventListener('visibilitychange',visible);};
 },[refresh]);
 const base='/clubs/'+encodeURIComponent(clubKey),best=data?.best;
 return <section id="club-my-activity" className={styles.panel} aria-label="내 동호회 활동" aria-busy={busy}>
  <div className={styles.heading}><h2>{data?.member?`내 활동 · ${clubRoleLabels[data.role??'club_member']}`:'내 활동·처리 현황'}</h2><button type="button" disabled={busy} className={styles.summaryLink} onClick={()=>void refresh()}>다시 확인</button></div>
  {error?<p role="alert" className="mt-3 text-amber-800">{error}</p>:null}
  {data?.member?<><p className="mt-2 text-sm text-pul-muted">가입 회원 · 현재 동호회</p><div className={styles.memberSummary}>
   <div><h3 className="font-semibold">내 개인 최저타 · 동호회 순위</h3>{best?<><p className="mt-1 text-2xl font-bold text-pul-deep">{best.score}타 · {bestRank(best)}</p><p className="mt-1 text-sm">{best.date} · {best.course} · {scoreKind(best.kind)}</p><Link prefetch={false} className={styles.summaryLink} href={`${base}/ranking/${best.personId}`}>내 기록 상세</Link></>:<p className="mt-2 text-pul-muted">아직 유효한 개인 최저타 기록이 없습니다.</p>}</div>
   <nav aria-label="내 회원 성적·활동" className={styles.summaryLinks}><Link prefetch={false} href={`${base}/scores`}>월례회 성적</Link><Link prefetch={false} href={`${base}/tournaments`}>대회 성적</Link><Link prefetch={false} href={`${base}/ranking`}>동호회 전체 순위</Link><a href="#club-official-events">모임·참가 일정</a><a href="#club-activities">활동기록</a></nav>
  </div><p className="mt-3 text-sm text-pul-muted">순위 기준: 해당 동호회 개인 최저타 · 확인된 야외 18홀 단일 라운드 · 동타는 공동 순위</p></>:null}
  {data&&(data.applications!==null||data.inquiries!==null)?<div className="mt-4 border-t border-pul-border pt-4"><h3 className="font-bold text-pul-deep">운영자가 확인할 일</h3><div className={styles.operationSummary}>
   {data.applications!==null?<Link prefetch={false} href={`${base}/manage/membership-applications?pending=1`} className={data.applications>0?styles.pendingCount:styles.quietCount}><span>가입 신청 · 미처리</span><strong>{data.applications}건</strong></Link>:null}
   {data.inquiries!==null?<Link prefetch={false} href={`${base}/manage/inquiries?pending=1`} className={data.inquiries>0?styles.pendingCount:styles.quietCount}><span>공동 문의 · 미답변</span><strong>{data.inquiries}건</strong></Link>:null}
  </div></div>:null}
 </section>;
}
