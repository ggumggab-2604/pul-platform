"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { applicationDuplicates, courseApplicationAccess, loadCourseApplications, mutateCourseApplication, searchApplicationCourses } from "@/app/courses/apply/actions";
import { applicationStatusLabels, courseApplicationDraft, emptyApplicationDraft, type ApplicationCommand, type ApplicationDraft, type ApplicationWorkspace, type CourseApplication } from "@/lib/courses/courseApplications";
import { courseRegionOptions, type PublicCourse, type PublicCoursePage } from "@/lib/courses/courseDirectory";
import type { ManagedCourse } from "@/lib/courses/courseManagement";
import { CourseInformationReportDialog } from "./CourseInformationReportDialog";
import { useAuthSessionStatus } from "@/hooks/useAuthSessionStatus";
const button="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-4 py-2 text-sm font-bold text-pul-deep disabled:opacity-50";
const primary=button+" bg-pul-point! text-white!";
const panel="rounded-xl border border-pul-border bg-white p-4 sm:p-6";
const input="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-pul-border bg-white px-3 py-2 text-base font-normal";
const labels={new:"새 구장 등록 신청",claim:"구장 관리 권한 신청",edit:"내 구장 정보 수정 신청"};
export function CourseApplicationAdminEntry(){const status=useAuthSessionStatus();const [allowed,setAllowed]=useState(false);useEffect(()=>{let alive=true;if(status==="signedIn")void courseApplicationAccess().then(x=>{if(alive)setAllowed(x);});return()=>{alive=false;};},[status]);return status==="signedIn"&&allowed?<Link className={button} href="/courses/manage">운영 관리</Link>:null;}
type Editing={kind:CourseApplication["kind"];course?:ManagedCourse|PublicCourse;request?:CourseApplication};
export function CourseApplicationWorkspace({mode}:{mode:"entry"|"mine"|"review"}){
  const [workspace,setWorkspace]=useState<ApplicationWorkspace|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(true),[offset,setOffset]=useState(0);
  const [query,setQuery]=useState(""),[search,setSearch]=useState<PublicCoursePage|null>(null),[searchError,setSearchError]=useState(""),[searchBusy,setSearchBusy]=useState(false),[searchedQuery,setSearchedQuery]=useState("");
  const [editing,setEditing]=useState<Editing|null>(null),[selected,setSelected]=useState<CourseApplication|null>(null),[report,setReport]=useState(false);
  const [reportTrigger,setReportTrigger]=useState<HTMLElement|null>(null);
  const load=useCallback(async()=>{const result=await loadCourseApplications(mode==="review",offset);if(result.ok){setWorkspace(result.data);setError("");}else{setWorkspace(null);setError(result.message);}setLoading(false);},[mode,offset]);
  useEffect(()=>{let alive=true;void loadCourseApplications(mode==="review",offset).then(result=>{if(!alive)return;if(result.ok){setWorkspace(result.data);setError("");}else{setWorkspace(null);setError(result.message);}setLoading(false);});return()=>{alive=false;};},[mode,offset]);
  async function find(e?:FormEvent,at=0){e?.preventDefault();setSearchBusy(true);setSearch(null);setSearchError("");const q=at?searchedQuery:query;const r=await searchApplicationCourses(q,at);if(r.ok){setSearch(r.page);setSearchedQuery(q);}else setSearchError(r.message);setSearchBusy(false);}
  async function done(){setEditing(null);setSelected(null);setNotice("처리되었습니다. 아래 신청 상태를 확인해 주세요.");await load();}
  const heading=mode==="entry"?"구장 등록·관리":mode==="review"?"구장 신청 검토":"내 구장 신청";
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <Link href="/courses" className="text-sm font-bold text-pul-point">← 구장찾기</Link>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-pul-deep">{heading}</h1><p className="mt-2 text-sm text-pul-muted">신청 내용은 검토 후 반영됩니다. 담당 권한은 관계 확인 후 별도로 승인합니다.</p></div><nav className="flex flex-wrap gap-2"><Link className={button} href="/courses/apply">신청 시작</Link><Link className={button} href="/courses/applications">내 신청</Link>{workspace?.canManage?<><Link className={button} href="/courses/manage/applications">신청 검토함</Link><Link className={button} href="/courses/manage">운영 관리</Link></>:null}</nav></div>
    {notice?<p role="status" className="rounded-lg bg-pul-light p-3">{notice}</p>:null}
    {loading?<p role="status">신청 정보를 불러오고 있습니다.</p>:null}
    {error?<div role="alert" className={panel}><p>{error}</p><button className={button+" mt-3"} onClick={()=>void load()}>다시 불러오기</button></div>:null}
    {workspace&&!editing&&!selected?<>
      {mode==="entry"?<>
        <div className="grid gap-4 md:grid-cols-2"><section className={panel}><h2 className="text-xl font-bold">담당자·운영자 신청</h2><p className="mt-2 text-sm leading-6">먼저 기존 구장을 검색해 주세요. 이미 등록된 구장은 새로 만들지 않고 관리 권한을 신청합니다.</p></section><section className={panel}><h2 className="text-xl font-bold">일반 회원 정보 제보</h2><p className="my-2 text-sm leading-6">빠진 구장이나 잘못된 정보를 알려주세요. 기존 구장의 수정 제보는 상세에서도 할 수 있습니다.</p><button className={button} onClick={e=>{setReportTrigger(e.currentTarget);setReport(true);}}>정보 제보하기</button></section></div>
        <section className={panel}><h2 className="text-lg font-bold">1. 기존 구장 찾기</h2><form onSubmit={e=>void find(e)} className="mt-3 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm font-bold">구장명 또는 주소<input className={input} value={query} onChange={e=>{setQuery(e.target.value);setSearch(null);}} required minLength={2} maxLength={100} placeholder="예: 구미 또는 옥계2공단로"/></label><button className={primary} disabled={searchBusy}>검색</button></form>
          {searchBusy?<p className="mt-3" role="status">구장을 검색하고 있습니다.</p>:null}
          {searchError?<p className="mt-3 text-red-700" role="alert">{searchError} 검색 실패는 구장 없음으로 처리하지 않습니다.</p>:null}
          {search?<div className="mt-4 space-y-3"><p className="text-sm">검색 결과 {search.total}곳</p>{search.items.map(c=><div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pul-border p-3" key={c.courseKey}><div className="min-w-0"><strong>{c.name}</strong><p className="break-words text-sm text-pul-muted">{c.address}</p></div><button className={button} onClick={()=>setEditing({kind:"claim",course:c})}>이 구장 운영자입니다</button></div>)}
          {search.total===0?<div><p>일치하는 구장이 없습니다. 다른 이름·주소로도 확인한 뒤 신청해 주세요.</p><button className={primary+" mt-3"} onClick={()=>setEditing({kind:"new"})}>새 구장 등록 신청</button></div>:<p className="text-sm text-pul-muted">찾는 구장이 다르면 구체적인 주소로 다시 검색해 주세요.</p>}
          <div className="flex gap-2">{search.offset>0?<button className={button} onClick={()=>void find(undefined,Math.max(0,search.offset-20))}>이전 결과</button>:null}{search.hasMore?<button className={button} onClick={()=>void find(undefined,search.offset+20)}>다음 결과</button>:null}</div></div>:null}
        </section>
        {workspace.managed.length?<section className={panel}><h2 className="text-xl font-bold">내가 관리하는 구장</h2><p className="mt-2 text-sm text-pul-muted">승인된 자기 구장의 정보 수정만 신청할 수 있습니다.</p>{workspace.managed.map(c=><div className="mt-4 flex flex-wrap items-center justify-between gap-3" key={c.courseKey}><span>{c.name}</span><button className={button} onClick={()=>setEditing({kind:"edit",course:c})}>정보 수정 신청</button></div>)}</section>:null}
      </>:null}
      <section className={panel}><h2 className="text-xl font-bold">{mode==="review"?"검토할 신청":"내 신청 내역"}</h2>{workspace.items.length===0?<p className="mt-3 text-pul-muted">신청 내역이 없습니다.</p>:<ul className="mt-3 divide-y divide-pul-border">{workspace.items.map(r=><li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><span className="rounded bg-pul-light px-2 py-1 text-sm font-bold text-pul-deep">{applicationStatusLabels[r.status]}</span><h3 className="mt-2 break-words font-bold">{r.draft.name}</h3><p className="text-sm text-pul-muted">{labels[r.kind]} · {new Date(r.createdAt).toLocaleDateString("ko-KR")}</p>{r.reviewNote?<p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.reviewNote}</p>:null}</div><button className={button} onClick={()=>setSelected(r)}>{mode==="review"?"중복 확인·검토":r.status==="supplement"?"보완 내용 확인":"신청 내용 보기"}</button></li>)}</ul>}
      <div className="mt-3 flex gap-2">{offset>0?<button className={button} onClick={()=>{setLoading(true);setOffset(offset-20);}}>이전 신청</button>:null}{workspace.hasMore?<button className={button} onClick={()=>{setLoading(true);setOffset(offset+20);}}>다음 신청</button>:null}</div></section>
    </>:null}
    {workspace&&editing?<ApplicationForm key={editing.request?.id||editing.course?.courseKey||"new"} editing={editing} onCancel={()=>setEditing(null)} onDone={done}/>:null}
    {workspace&&selected&&!editing?<ApplicationReview request={selected} manage={mode==="review"} canEditCourse={workspace.managed.some(c=>c.courseKey===selected.courseKey)} onClose={()=>{setSelected(null);void load();}} onDone={done} onSupplement={()=>{setEditing({kind:selected.kind,course:selected.currentCourse??undefined,request:selected});setSelected(null);}}/>:null}
    {report?<CourseInformationReportDialog trigger={reportTrigger} onClose={()=>setReport(false)}/>:null}
  </main>;
}

function ApplicationForm({editing,onDone,onCancel}:{editing:Editing;onDone:()=>Promise<void>;onCancel:()=>void}){
  const [draft,setDraft]=useState<ApplicationDraft>(()=>editing.request?.draft|| (editing.course?courseApplicationDraft(editing.course as ManagedCourse):emptyApplicationDraft()));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");const pending=useRef<{fingerprint:string;command:ApplicationCommand}|null>(null);const id=useRef(editing.request?.id||crypto.randomUUID());
  function change(key:keyof ApplicationDraft,value:unknown){setDraft(d=>({...d,[key]:value}));}
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);setBusy(true);setError("");
    const payload={kind:editing.kind,courseKey:editing.course?.courseKey??editing.request?.courseKey??null,draft,baseUpdatedAt:editing.course&&"updatedAt" in editing.course?editing.course.updatedAt:null,relation:String(f.get("relation")||"").trim(),verificationContact:String(f.get("contact")||"").trim(),publicContactConfirmed:f.get("publicContact")==="on"};
    const fingerprint=JSON.stringify(payload);if(!pending.current||pending.current.fingerprint!==fingerprint)pending.current={fingerprint,command:{id:id.current,action:editing.request?"resubmit":"submit",version:editing.request?.version??0,requestId:crypto.randomUUID(),input:payload}};
    const r=await mutateCourseApplication(pending.current.command);setBusy(false);if(r.ok)await onDone();else setError(r.message);
  }
  const field=(label:string,key:keyof ApplicationDraft,required=false,max=200)=><label className="min-w-0 text-sm font-bold">{label}{required?" *":""}<input className={input} value={String(draft[key]??"")} onChange={e=>change(key,e.target.value||null)} required={required} maxLength={max}/></label>;
  const area=(label:string,key:keyof ApplicationDraft,max:number)=><label className="block text-sm font-bold sm:col-span-2">{label}<textarea className={input} rows={3} value={String(draft[key]??"")} onChange={e=>change(key,e.target.value)} maxLength={max}/></label>;
  return <form onSubmit={e=>void submit(e)} className="space-y-4"><h2 className="text-xl font-bold text-pul-deep">{labels[editing.kind]}</h2><p className="text-sm text-pul-muted">승인 전에는 공개되지 않습니다. * 필수 입력</p>
    <section className={panel}>{editing.kind==="claim"?<><h3 className="font-bold">{draft.name}</h3><p className="mt-2">{draft.address}</p><p className="mt-3 text-sm text-pul-muted">이 기존 구장의 관리 권한만 신청합니다. 새 구장을 만들지 않습니다.</p></>:<div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-bold">유형 *<select className={input} value={draft.course_type} disabled={editing.kind==="edit"} onChange={e=>setDraft(d=>({...d,course_type:e.target.value as ApplicationDraft["course_type"],holes:null,bay_count:null}))}><option value="field">야외 파크골프장</option><option value="screen">스크린 파크골프장</option></select></label>
      <label className="text-sm font-bold">{draft.course_type==="screen"?"실제 이용 가능한 타석 수":"홀 수"} *<input className={input} type="number" min={1} max={draft.course_type==="screen"?2147483647:32767} step={1} required value={(draft.course_type==="screen"?draft.bay_count:draft.holes)??""} onChange={e=>change(draft.course_type==="screen"?"bay_count":"holes",e.target.value===""?null:Number(e.target.value))}/></label>
      {field("구장명","name",true,120)}{field("주소","address",true,300)}
      <label className="text-sm font-bold">권역 *<select required className={input} value={draft.region} onChange={e=>change("region",e.target.value)}><option value="">선택</option>{courseRegionOptions.map(x=><option key={x}>{x}</option>)}</select></label>{field("시·군·구","city",true,100)}
      {field("운영시간 (선택)","operating_hours")}{field("요금 (선택)","fee_guide",false,500)}
      <label className="text-sm font-bold">이용 방식<select className={input} value={draft.operation_code||""} onChange={e=>change("operation_code",e.target.value||null)}><option value="">미확인</option><option value="reservation">예약</option><option value="phone">전화 문의</option><option value="walkIn">현장 접수</option></select></label>
      <label className="text-sm font-bold">주차<select className={input} value={draft.parking_available===null?"":String(draft.parking_available)} onChange={e=>change("parking_available",e.target.value===""?null:e.target.value==="true")}><option value="">미확인</option><option value="true">가능</option><option value="false">불가</option></select></label>
      {field("공개할 구장 연락처 (선택)","phone",false,30)}{field("공식 예약 URL (선택, https)","reservation_url",false,500)}
      {area("예약·이용 안내 (선택)","reservation_guide",1000)}{area("시설·특이사항 (선택)","description",2000)}
      {draft.phone?<label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="publicContact" required defaultChecked={editing.request?.publicContactConfirmed} className="mt-1"/>이 번호는 공개할 구장 연락처입니다. 검색·상세에 표시되는 것을 확인했습니다.</label>:null}
    </div>}</section>
    {editing.kind==="edit"&&editing.course?<section className={panel}><h3 className="font-bold">승인 전 유지되는 현재 구장 정보</h3><p className="mt-2 whitespace-pre-wrap text-sm">{editing.course.operatingHours||"운영시간 미확인"}{"\n"}{editing.course.description}</p><label className="mt-3 flex gap-2 text-sm"><input type="checkbox" required/>현재 구장 정보를 확인하고 이 수정 초안으로 신청합니다.</label></section>:null}
    <section className={panel+" bg-pul-light/40"}><h3 className="font-bold">담당자 확인용 · 비공개</h3><p className="my-2 text-sm text-pul-muted">신청자와 PUL 관리자만 확인합니다. 공개 구장 연락처에 자동으로 사용하지 않습니다.</p><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">구장과의 관계 *<input name="relation" className={input} required minLength={2} maxLength={200} defaultValue={editing.request?.relation} placeholder="예: 시설 담당자, 매장 운영자"/></label><label className="text-sm font-bold">확인 연락 수단 *<input name="contact" className={input} required minLength={5} maxLength={200} defaultValue={editing.request?.verificationContact} placeholder="확인 가능한 이메일 또는 전화번호"/></label></div></section>
    {editing.request?.reviewNote?<p className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3">보완 요청: {editing.request.reviewNote}</p>:null}
    {error?<p role="alert" className="whitespace-pre-wrap text-red-700">{error}</p>:null}<div className="flex flex-wrap gap-3"><button className={primary} disabled={busy}>{busy?"처리 중…":editing.request?"보완 후 다시 제출":"신청 제출"}</button><button className={button} type="button" disabled={busy} onClick={onCancel}>취소</button></div>
  </form>;
}

function ApplicationReview({request:r,manage,canEditCourse,onClose,onDone,onSupplement}:{request:CourseApplication;manage:boolean;canEditCourse:boolean;onClose:()=>void;onDone:()=>Promise<void>;onSupplement:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");const [duplicates,setDuplicates]=useState<Awaited<ReturnType<typeof applicationDuplicates>>|null>(null);const retry=useRef<{key:string;command:ApplicationCommand}|null>(null);
  async function process(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const action=(e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") as ApplicationCommand["action"];
    if(busy)return;if(action==="approve"&&(!duplicates?.ok||f.get("duplicates")!=="on")){setError("중복 조회 결과를 확인해 주세요.");return;}
    const payload={note:f.get("note"),duplicatesChecked:f.get("duplicates")==="on",relationVerified:f.get("verified")==="on",grantPermission:f.get("grant")==="on"};const key=JSON.stringify({action,payload});if(retry.current?.key!==key)retry.current={key,command:{id:r.id,action,version:r.version,requestId:crypto.randomUUID(),input:payload}};
    setBusy(true);setError("");const result=await mutateCourseApplication(retry.current!.command);setBusy(false);if(result.ok)await onDone();else setError(result.message);
  }
  const d=r.draft;
  const canSupplement=r.kind!=="edit"||(canEditCourse&&r.currentCourse!==null);
  return <section className={panel+" space-y-4"}><div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-bold">{labels[r.kind]} · {applicationStatusLabels[r.status]}</h2><button className={button} onClick={onClose}>목록으로</button></div>
    <p className="text-sm text-pul-muted">신청 당시 제출 내용</p><h3 className="font-bold">{d.name}</h3><p className="break-words">{d.address}</p>{r.kind!=="claim"?<dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt>규모</dt><dd>{d.course_type==="screen"?`${d.bay_count}타석`:`${d.holes}홀`}</dd></div>{[["운영시간",d.operating_hours],["요금",d.fee_guide],["이용 방식",d.operation_code],["주차",d.parking_available===null?null:d.parking_available?"가능":"불가"],["공개 구장 연락처",d.phone],["예약 링크",d.reservation_url],["예약·이용 안내",d.reservation_guide],["시설·특이사항",d.description]].map(([label,v])=><div key={label}><dt className="text-pul-muted">{label}</dt><dd className="whitespace-pre-wrap break-words">{v||"미입력"}</dd></div>)}</dl>:null}
    {r.currentCourse&&r.kind==="edit"?<div className="rounded-lg border border-pul-border p-3 text-sm"><strong>현재 구장 정보 · 승인 전 유지</strong><p className="mt-2 whitespace-pre-wrap">{r.currentCourse.operatingHours}{"\n"}{r.currentCourse.description}</p>{r.baseUpdatedAt!==r.currentCourse.updatedAt?<p className="mt-2 text-amber-800">공개 정보가 변경되었습니다. 보완 요청 후 최신 공개본을 확인하여 다시 제출해야 합니다.</p>:null}</div>:null}
    <div className="rounded-lg bg-pul-light p-3 text-sm"><strong>담당자 확인용 · 비공개</strong><p className="mt-2 whitespace-pre-wrap break-words">관계: {r.relation}{"\n"}연락: {r.verificationContact}</p></div>
    {r.reviewNote?<p className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3">{r.reviewNote}</p>:null}
    {!manage&&r.status==="supplement"&&canSupplement?<button className={primary} onClick={onSupplement}>보완 내용 수정</button>:null}
    {!manage&&r.status==="supplement"&&!canSupplement?<p className="text-sm text-pul-muted">현재 이 구장의 정보 수정 권한을 사용할 수 없어 보완할 수 없습니다. 신청 기록은 계속 확인할 수 있습니다.</p>:null}
    {!manage&&r.status==="pending"?<p className="text-sm text-pul-muted">검토 중입니다. 승인 전에는 새 구장이나 수정 내용이 공개되지 않습니다.</p>:null}
    {r.status==="approved"?<p className="text-sm">처리 결과: {r.kind==="claim"?"구장 관리 권한 승인":"구장 정보 승인"}. {!manage?(canEditCourse?"현재 이 구장의 정보 수정 신청 권한이 있습니다.":"현재 이 구장의 정보 수정 신청 권한은 없습니다."):null} {r.courseKey?<Link className="font-bold text-pul-point underline" href={`/courses/${r.courseKey}`}>구장 상세 보기</Link>:null}</p>:null}
    {manage&&r.status==="pending"?<form onSubmit={e=>void process(e)} className="space-y-3 border-t border-pul-border pt-4"><button className={button} type="button" disabled={busy} onClick={()=>void applicationDuplicates(r.id).then(setDuplicates)}>비슷한 기존 구장 조회</button>
      {duplicates?.ok?<div className="text-sm">{duplicates.items.length?duplicates.items.map(c=><p className="mt-2" key={c.courseKey}>{c.name} · {c.address} · {c.courseStatus}</p>):<p>일치·유사 후보가 없습니다.</p>}<p className="mt-2 text-pul-muted">이름만으로 합치지 않습니다. 주소와 대상 구장을 함께 확인하세요.</p></div>:duplicates?<p role="alert">{duplicates.message}</p>:null}
      <label className="flex gap-2 text-sm"><input name="duplicates" type="checkbox"/>중복 조회 결과와 대상 구장을 확인했습니다.</label>
      <label className="flex gap-2 text-sm"><input name="verified" type="checkbox"/>신청자의 담당 관계를 확인했습니다.</label>
      <label className="flex gap-2 text-sm"><input name="grant" type="checkbox" defaultChecked={r.kind==="claim"}/>해당 구장의 정보 수정 신청 권한도 부여합니다.</label><p className="text-sm text-pul-muted">정보 승인만으로 담당 권한이 생기지 않습니다. 운영알림 등 다른 권한은 부여하지 않습니다.</p>
      <label className="block text-sm font-bold">보완·반려 사유<textarea name="note" className={input} maxLength={500} rows={2}/></label><div className="flex flex-wrap gap-2"><button className={primary} disabled={busy||!duplicates?.ok} value="approve">{r.kind==="claim"?"관리 권한 승인":"승인·반영"}</button><button className={button} disabled={busy} value="supplement">보완 요청</button><button className={button} disabled={busy} value="reject">반려</button></div>
    </form>:null}
    {manage&&r.status==="approved"&&r.permissionGranted?<form onSubmit={e=>void process(e)}><p className="mb-2 text-sm">철회하면 이 담당자는 해당 구장의 수정 신청을 할 수 없습니다.</p><button className={button} disabled={busy} value="revoke">담당 권한 철회</button></form>:null}
    {error?<p role="alert" className="whitespace-pre-wrap text-red-700">{error}</p>:null}
  </section>;
}
