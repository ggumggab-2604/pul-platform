"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {prepareWithdrawalAction,executeWithdrawalAction,confirmWithdrawalAction} from "@/app/my/withdrawalActions";
import {createClient} from "@/lib/supabase/client";
import {WITHDRAWAL_NOTICE,WITHDRAWAL_MESSAGES,type WithdrawalResult} from "@/lib/auth/accountWithdrawalTypes";

const needsOperator=(value:WithdrawalResult|null)=>value?.status==="operator_required"||value?.status==="operator_check_required";

export function AccountWithdrawal({viewerId}:{viewerId:string}) {
  return <WithdrawalPanel key={viewerId} viewerId={viewerId}/>;
}
function WithdrawalPanel({viewerId}:{viewerId:string}) {
  const router=useRouter();
  const [result,setResult]=useState<WithdrawalResult|null>(null),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
  const [sessionError,setSessionError]=useState(false);
  const inFlight=useRef(false),generation=useRef(0);
  const [submittedTicket,setSubmittedTicket]=useState<string|null>(null);
  useEffect(()=>{
    const lifetime=generation,current=++generation.current;
    void prepareWithdrawalAction(viewerId).then(value=>{if(generation.current===current)setResult(value);}).catch(()=>{if(generation.current===current)setResult({status:"failed"});});
    return ()=>{lifetime.current++;};
  },[viewerId,refresh]);
  async function finishSession(){
    try {
      const client=createClient();
      // This local session read only selects which browser session to clear;
      // the server has already authenticated and completed the deletion.
      const {data}=await client.auth.getSession();
      if(data.session&&data.session.user.id!==viewerId)return;
      const {error}=await client.auth.signOut({scope:"local"});
      if(error)throw error;
      window.dispatchEvent(new Event("pul-auth-signed-out"));
      setSessionError(false);
    } catch {setSessionError(true);}
  }
  async function submit(){
    if(inFlight.current||result?.status!=="ready"||!result.ticket)return;
    inFlight.current=true;setBusy(true);const current=generation.current;
    setSubmittedTicket(result.ticket);
    try{const value=await executeWithdrawalAction({ticket:result.ticket});if(generation.current===current){
      setResult(value);
      if(value.status==="planned_complete")await finishSession();
    }}
    catch{if(generation.current===current)setResult({status:"failed"});}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function confirmResult(){
    if(inFlight.current||!submittedTicket)return;
    inFlight.current=true;setBusy(true);
    const current=generation.current;
    try {
      const value=await confirmWithdrawalAction({ticket:submittedTicket});
      if(generation.current===current){setResult(previous=>needsOperator(previous)&&value.status!=="planned_complete"?previous:value);if(value.status==="planned_complete")await finishSession();}
    } catch {if(generation.current===current)setResult(previous=>needsOperator(previous)?previous:{status:"unavailable"});}
    finally {inFlight.current=false;setBusy(false);}
  }
  const finished=result?.status==="planned_complete",partial=result?.status==="partial";
  const operatorRequired=needsOperator(result);
  const uncertain=result?.status==="uncertain",unavailable=result?.status==="unavailable";
  return <section aria-labelledby="withdrawal-title" aria-busy={busy} className="rounded-2xl border border-pul-border bg-white p-6 text-base leading-7">
    <h1 id="withdrawal-title" className="text-2xl font-bold">회원 탈퇴</h1>
    <p className="mt-4 font-semibold">{WITHDRAWAL_NOTICE}</p>
    <p className="mt-2">본문·사진·첨부에 개인정보가 있다면 확인 또는 삭제 요청 시 운영자가 삭제·가림 처리합니다. 탈퇴 후에도 <a className="underline" href="mailto:pulpark.help@gmail.com">pulpark.help@gmail.com</a>으로 요청할 수 있습니다.</p>
    <p role="status" className="mt-4">{busy?"탈퇴 처리 중입니다. 결과를 확인할 때까지 기다려 주세요.":result?WITHDRAWAL_MESSAGES[result.status]:"본인 계정과 처리 가능 여부를 확인하고 있습니다."}</p>
    {sessionError&&<p role="alert" className="mt-3">계정 삭제는 처리됐지만 이 브라우저의 로그아웃을 확인하지 못했습니다. 로그아웃을 다시 시도해 주세요.</p>}
    {result?.status==="ready"&&<p className="mt-2">유지되는 게시글 {result.posts}개 · 댓글 {result.comments}개</p>}
    {!finished&&!operatorRequired&&<p className="mt-3 text-sm"><Link className="underline" href="/my#inbox-marketing">마케팅 수신 설정 보기</Link></p>}
    {result?.status==="reauthenticate"&&<Link className="mt-4 inline-flex min-h-12 items-center underline" href="/login?next=%2Fmy%2Fwithdraw">이메일로 본인 확인</Link>}
    {result?.status==="auth_required"&&<Link className="mt-4 inline-flex min-h-12 items-center underline" href="/login?next=%2Fmy%2Fwithdraw">다시 로그인</Link>}
    <div className="mt-5 flex flex-wrap gap-3">
      {!busy&&!finished&&!partial&&!uncertain&&!operatorRequired&&<Link href="/my" className="inline-flex min-h-12 items-center rounded-xl border border-pul-border px-5 font-bold">계속 이용하기</Link>}
      {!finished&&!uncertain&&!unavailable&&!operatorRequired&&<button type="button" onClick={()=>void submit()} disabled={busy||result?.status!=="ready"} className="min-h-12 rounded-xl bg-pul-deep px-5 font-bold text-white disabled:opacity-50">탈퇴하기</button>}
      {!busy&&result&&["failed","changed","partial"].includes(result.status)&&<button type="button" onClick={()=>{setResult(null);setRefresh(n=>n+1);}} className="min-h-12 rounded-xl border border-pul-border px-5">현재 처리 상태 확인</button>}
      {!busy&&!finished&&submittedTicket&&<button type="button" onClick={()=>void confirmResult()} className="min-h-12 rounded-xl border border-pul-border px-5">삭제 완료 결과만 확인</button>}
      {finished&&sessionError&&<button type="button" onClick={()=>void finishSession()} className="min-h-12 rounded-xl border border-pul-border px-5">로그아웃 다시 시도</button>}
      {finished&&<Link href="/" onClick={event=>{event.preventDefault();router.push("/");router.refresh();}} className="inline-flex min-h-12 items-center underline">홈으로 이동</Link>}
    </div>
  </section>;
}
