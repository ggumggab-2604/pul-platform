"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {loadStartupQaAction,saveStartupQaAction} from "@/app/market/startupQaActions";
import {qaCategories,qaFilters,qaHref,validateQaCommand,type QaAnswer,type QaCategory,type QaCommand,type QaData,type QaQuestion} from "@/lib/market/marketStartupQa";
import {MarketInterest} from "@/components/interests/MarketInterest";
const button="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-4 py-2 text-sm font-bold disabled:opacity-50";
const input="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-pul-border bg-white p-3 text-base";
const date=(v:string)=>new Date(v).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
type Edit={target:"question"|"answer";item?:QaQuestion|QaAnswer;questionId?:string;deleting?:boolean};
function QaEditor({edit,onDone,onCancel}:{edit:Edit;onDone:(result:{questionId:string;deleted:boolean})=>void;onCancel:()=>void}){
 const [title,setTitle]=useState(edit.item&&"title" in edit.item?edit.item.title:""),[category,setCategory]=useState<QaCategory>(edit.item&&"category" in edit.item?edit.item.category:"space"),[body,setBody]=useState(edit.item?.body??"");
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState("");
 const lock=useRef(false),attempt=useRef<QaCommand|null>(null);
 async function save(){
  if(lock.current)return;lock.current=true;setBusy(true);setError("");let called=false;
  try{
   if(!attempt.current){
    const c:QaCommand={target:edit.target,operation:edit.deleting?"delete":edit.item?"update":"create",id:edit.item?.id??crypto.randomUUID(),requestId:crypto.randomUUID(),version:edit.item?.version??0,
     ...(edit.target==="answer"?{questionId:edit.questionId}:{}),...(!edit.deleting?{body,...(edit.target==="question"?{title,category}:{})}:{})};
    validateQaCommand(c);attempt.current=c;
   }
   called=true;
   const r=await saveStartupQaAction(attempt.current);
   if(!r.ok){setError(r.message);setUncertain(r.code==="uncertain");if(r.code!=="uncertain")attempt.current=null;return;}
   attempt.current=null;setUncertain(false);onDone(r.data);
  }catch(e){
   if(called){setUncertain(true);setError("결과가 불확실합니다. 같은 요청 결과를 확인해 주세요.");}
   else setError(e instanceof Error?e.message:"입력을 확인해 주세요.");
  }finally{lock.current=false;setBusy(false);}
 }
 const label=edit.target==="question"?"질문":"답변";
 return <form aria-label={label+(edit.deleting?" 삭제":edit.item?" 수정":" 작성")} className="space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6" onSubmit={e=>{e.preventDefault();void save();}}>
 <h3 className="text-lg font-bold">{label} {edit.deleting?"삭제":edit.item?"수정":"작성"}</h3>
 {edit.deleting?<p className="text-sm leading-6">{label}을 삭제하시겠어요? 공개 화면에서 숨깁니다.{edit.target==="question"?" 다른 회원의 답변은 함께 공개되지 않으며, 원문은 물리 삭제하지 않습니다.":""}</p>:<fieldset disabled={busy||uncertain} className="space-y-4">
 {edit.target==="question"?<><label className="block text-sm font-bold">분류<select className={input} value={category} onChange={e=>setCategory(e.target.value as QaCategory)}>{Object.entries(qaCategories).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="block text-sm font-bold">제목<input required maxLength={120} className={input} value={title} onChange={e=>setTitle(e.target.value)} placeholder="궁금한 점을 구체적으로 적어 주세요"/></label></>:null}
 <label className="block text-sm font-bold">내용<textarea required maxLength={5000} rows={7} className={input} value={body} onChange={e=>setBody(e.target.value)} placeholder="경험한 조건과 확인한 내용을 함께 적어 주세요."/></label>
 <p className="text-sm leading-6 text-pul-muted">제목은 120자, 내용은 5,000자 이내입니다. 연락처·개인정보는 적지 마세요.</p></fieldset>}
 {error?<p role="alert" className="text-sm leading-6 text-rose-700">{error}</p>:null}
 <div className="flex flex-wrap gap-2"><button disabled={busy} className={button+" bg-pul-point text-white"}>{busy?"처리 중…":uncertain?"같은 요청 결과 확인":edit.deleting?"삭제 확인":edit.item?"수정 저장":label+" 등록"}</button><button type="button" disabled={busy||uncertain} className={button} onClick={onCancel}>취소</button></div>
 </form>;
}
export function StartupQa({search,userId}:{search:string;userId:string|null}){
 const router=useRouter(),p=new URLSearchParams(search),questionId=p.get("question"),writing=p.get("qa_write")==="1";
 const [data,setData]=useState<QaData|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true),[edit,setEdit]=useState<Edit|null>(null),[message,setMessage]=useState("");
 useEffect(()=>{let live=true;
 loadStartupQaAction(search).then(value=>{if(live){setData(value);setError(false);setLoading(false);}}).catch(()=>{if(live){setError(true);setLoading(false);}});
 return()=>{live=false;};},[search,retry]);
 const url=(change:Record<string,string>)=>qaHref(search,change);
 const listUrl=url({question:"",qa_write:"",qa_answer_offset:""});
 const login=(href:string)=>"/login?next="+encodeURIComponent(href);
 function refresh(){setLoading(true);setError(false);setRetry(x=>x+1);}
 function done(result:{questionId:string;deleted:boolean},target:"question"|"answer"){
  setEdit(null);setMessage("저장은 완료되었습니다.");
  if(target==="question"&&(result.deleted||result.questionId!==questionId))router.push(url({question:result.deleted?"":result.questionId,qa_write:"",qa_answer_offset:""}));
  else refresh();
 }
 const detail=data?.detail;
 const editForm=edit?<QaEditor edit={edit} onDone={r=>done(r,edit.target)} onCancel={()=>setEdit(null)}/>:null;
 let offset=0,answerOffset=0;try{({offset,answerOffset}=qaFilters(search));}catch{/* Load action presents invalid range as a query failure. */}
 return <section className="min-w-0 space-y-4" aria-label="창업 질문답변">
 <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">창업·운영 이야기</h2><p className="mt-1 text-sm leading-6 text-pul-muted">창업 준비와 매장 운영의 질문·경험을 나눠요.</p></div>
 {!writing&&!edit?<Link className={button+" bg-pul-point text-white"} href={userId?url({question:"",qa_write:"1",qa_answer_offset:""}):login(url({question:"",qa_write:"1",qa_answer_offset:""}))} prefetch={false}>질문하기</Link>:null}</div>
 {message?<p role="status" className="text-sm text-pul-point">{message}</p>:null}
 {writing?<><Link href={listUrl} className={button}>← 질문 목록</Link>{userId?<QaEditor edit={{target:"question"}} onDone={r=>done(r,"question")} onCancel={()=>router.push(listUrl)}/>:<Link href={login(url({qa_write:"1"}))} className={button}>로그인 후 질문 작성</Link>}</>:
 questionId?<><Link href={listUrl} className={button}>← 질문 목록</Link>
 {!loading&&!error&&detail?<><article className="min-w-0 space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6">
 <p className="text-sm font-bold text-pul-point">{qaCategories[detail.category]}</p><h3 className="text-2xl font-bold [overflow-wrap:anywhere]">{detail.title}</h3><p className="text-sm text-pul-muted">{detail.author} · {date(detail.createdAt)}{detail.updatedAt!==detail.createdAt?" · 수정됨":""}</p>
 <p className="whitespace-pre-wrap leading-7 [overflow-wrap:anywhere]">{detail.body}</p><div className="flex flex-wrap gap-2"><MarketInterest id={detail.id} kind="startup_question" authenticated={Boolean(userId)}/>{detail.mine&&!edit?<><button className={button} onClick={()=>setEdit({target:"question",item:detail})}>질문 수정</button><button className={button} onClick={()=>setEdit({target:"question",item:detail,deleting:true})}>질문 삭제</button></>:null}</div></article>
 {edit?.target==="question"?editForm:null}
 <h3 className="text-lg font-bold">공개 답변 {detail.answerCount}개</h3>{!detail.answerCount?<p className="rounded-xl border border-dashed p-5 text-sm text-pul-muted">아직 답변이 없습니다. 첫 경험을 나눠 주세요.</p>:null}
 <div className="space-y-3">{data.answers.map(a=><article key={a.id} className="min-w-0 space-y-3 rounded-xl border border-pul-border bg-white p-4">
 <div className="flex flex-wrap items-center gap-2"><strong className="[overflow-wrap:anywhere]">{a.author}</strong><span className="rounded-full bg-pul-light px-3 py-1 text-xs">{a.vendor?"업체 소속":"회원 답변"}</span></div><p className="whitespace-pre-wrap leading-7 [overflow-wrap:anywhere]">{a.body}</p><p className="text-xs text-pul-muted">{date(a.createdAt)}{a.updatedAt!==a.createdAt?" · 수정됨":""}</p>
 {a.vendor?<div className="flex flex-wrap items-center gap-2"><Link className={button} href={"/market?view=care&provider="+a.vendor.id}>{a.vendor.name}</Link><Link className={button} href={"/messages/new?provider="+a.vendor.id}>업체에 비공개 문의</Link><p className="w-full text-xs text-pul-muted">공개 업체 소속 표시이며 PUL의 공식 답변은 아닙니다.</p></div>:null}
 {a.mine&&!edit?<div className="flex flex-wrap gap-2"><button className={button} onClick={()=>setEdit({target:"answer",item:a,questionId:detail.id})}>답변 수정</button><button className={button} onClick={()=>setEdit({target:"answer",item:a,questionId:detail.id,deleting:true})}>답변 삭제</button></div>:null}</article>)}</div>
 {answerOffset>0||data.answerHasMore?<nav aria-label="답변 페이지" className="flex flex-wrap gap-2">{answerOffset>0?<Link className={button} href={url({qa_answer_offset:String(Math.max(0,answerOffset-20))})}>이전 답변</Link>:null}{data.answerHasMore?<Link className={button} href={url({qa_answer_offset:String(answerOffset+20)})}>다음 답변</Link>:null}</nav>:null}
 {edit?.target==="answer"?editForm:!edit?userId?<QaEditor key={"answer:"+detail.id+":"+retry} edit={{target:"answer",questionId:detail.id}} onDone={r=>done(r,"answer")} onCancel={()=>router.push(listUrl)}/>:<Link className={button} href={login(url({}))}>로그인 후 답변 작성</Link>:null}
 </>:!loading&&!error?<p role="status" className="rounded-xl border bg-white p-5">삭제되었거나 볼 수 없는 질문입니다.</p>:null}</>:
 <><nav aria-label="질문 분류" className="flex flex-wrap gap-2">{[["","전체"],...Object.entries(qaCategories)].map(([k,v])=><Link key={k} href={url({qa_category:k,qa_offset:""})} aria-current={(p.get("qa_category")??"")===k?"page":undefined} className={button+((p.get("qa_category")??"")===k?" bg-pul-point text-white":" bg-white")}>{v}</Link>)}</nav>
 <form role="search" aria-label="질문 검색" className="flex min-w-0 items-end gap-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);router.push(url({qa_q:String(f.get("q")??"").trim(),qa_offset:""}));}}><label className="min-w-0 flex-1 text-sm font-bold">질문 검색<input name="q" maxLength={100} defaultValue={p.get("qa_q")??""} className={input} placeholder="제목·본문 검색"/></label><button className={button+" shrink-0 bg-pul-point text-white"}>검색</button></form>
 {!loading&&!error?<><div className="divide-y divide-pul-border rounded-xl border border-pul-border bg-white">{data?.items.map(q=><article key={q.id} className="min-w-0 p-4"><Link prefetch={false} className="block min-h-11" href={url({question:q.id,qa_answer_offset:""})}><p className="text-xs font-bold text-pul-point">{qaCategories[q.category]}</p><h3 className="mt-2 text-base font-bold [overflow-wrap:anywhere]">{q.title}</h3><p className="mt-2 text-xs text-pul-muted">{q.author} · {date(q.createdAt)}</p><p className="mt-2 text-sm">{q.answerCount?"답변 "+q.answerCount+"개 · 최근 답변 "+date(q.lastAnswerAt!):"답변 없음 · 첫 경험을 나눠 주세요"}</p></Link><div className="mt-2"><MarketInterest id={q.id} kind="startup_question" authenticated={Boolean(userId)}/></div></article>)}</div>{data?.items.length===0?<p className="rounded-xl bg-white p-5 text-sm text-pul-muted">조건에 맞는 질문이 없습니다. 첫 질문을 남겨 보세요.</p>:null}
 <nav aria-label="질문 페이지" className="flex flex-wrap items-center justify-center gap-3">{offset>0?<Link className={button} href={url({qa_offset:String(Math.max(0,offset-12))})}>이전</Link>:null}<span className="text-sm">{Math.floor(offset/12)+1} 페이지</span>{data?.hasMore?<Link className={button} href={url({qa_offset:String(offset+12)})}>다음</Link>:null}</nav></>:null}</>}
 {!writing&&loading?<p role="status" className="p-4 text-sm">질문답변을 불러오는 중…</p>:null}
 {!writing&&error?<div role="alert" className="rounded-xl border p-4 text-sm">질문답변을 불러오지 못했습니다. <button className={button} onClick={refresh}>다시 시도</button></div>:null}
 <aside className="border-t border-pul-border pt-4 text-sm leading-6 text-pul-muted"><Link className="inline-flex min-h-11 items-center text-pul-point underline" href={"/market?"+new URLSearchParams({...Object.fromEntries(new URLSearchParams(search)),view:"business",business_tab:"stores",question:"",qa_write:"",qa_answer_offset:""})}>매장매매 보기 →</Link>{" · "}<Link className="inline-flex min-h-11 items-center text-pul-point underline" href={qaHref(search,{view:"startup",question:"",qa_write:"",qa_answer_offset:""})}>기존 창업·매매 게시판 →</Link></aside>
 </section>;
}

