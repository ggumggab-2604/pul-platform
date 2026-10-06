"use client";
/* eslint-disable react-hooks/refs -- These refs are accessed only by async click/upload handlers, never during render. */
import {useRef,useState} from "react";
import {loadVendorWorkspaceAction,saveVendorAction} from "@/app/market/vendorActions";
import {vendorFields,vendorServiceModes,validateVendorProfile,type VendorWorkspace as Row,type VendorProfile,type VendorField,type VendorServiceMode,type VendorCommand} from "@/lib/market/marketVendors";
import {vendorButton,vendorInput,VendorProfileView} from "./MarketVendors";
const empty:VendorProfile={name:"",region:"",area:"",primary:"restore",fields:["restore"],summary:"",services:"",before:"",photos:[]};
const states={draft:"작성 중",pending:"검토 대기",approved:"승인",rejected:"반려"};
export function VendorWorkspace({initial,manage=false,failed=false}:{initial:Row[];manage?:boolean;failed?:boolean}){
 const [rows,setRows]=useState(initial),[error,setError]=useState(failed?"업체 상태를 불러오지 못했습니다.":""),[loaded,setLoaded]=useState(!failed),[refreshing,setRefreshing]=useState(false),[blocked,setBlocked]=useState(false);
 const refreshingRef=useRef(false),pendingEditors=useRef(new Set<string>());
 // Ref guards cover clicks in the same render; state also disables the controls.
 function editorLock(key:string,pending:boolean){
  if(pending&&refreshingRef.current)return false;
  if(pending)pendingEditors.current.add(key);else pendingEditors.current.delete(key);
  setBlocked(pendingEditors.current.size>0);return true;
 }
 async function reload(){
  if(refreshingRef.current||pendingEditors.current.size)return;
  refreshingRef.current=true;setRefreshing(true);
  try{setRows(await loadVendorWorkspaceAction(manage));setError("");setLoaded(true);}
  catch{setError("업체 상태를 불러오지 못했습니다.");}
  finally{refreshingRef.current=false;setRefreshing(false);}
 }
 return <section className="space-y-4"><h1 className="text-2xl font-bold">{manage?"업체 입점 관리":"업체 등록·관리"}</h1><p className="text-sm leading-6 text-pul-muted">신청 내용은 검토 후 공개합니다. 수정 초안은 다시 승인되기 전까지 공개 소개에 반영되지 않습니다.</p><button className={vendorButton} disabled={blocked||refreshing} onClick={()=>void reload()}>최신 상태 불러오기</button><p className="text-sm text-pul-muted">{refreshing?"최신 저장 상태를 불러오는 중입니다.":blocked?"처리 중이거나 결과가 미확정인 요청을 먼저 확인해 주세요.":"최신 저장 상태를 불러와도 작성 중인 입력은 유지됩니다."}</p>
 {error?<p role="alert">{error}</p>:manage&&!rows.length?<p>검토할 업체가 없습니다.</p>:null}
 {loaded&&(rows.length?rows:[null]).map(row=>manage&&!row?null:<VendorEditor key={manage?row!.id:"owner"} row={row} manage={manage} refreshing={refreshing} onLockChange={pending=>editorLock(manage?row!.id:"owner",pending)} onSaved={r=>setRows(previous=>previous.some(x=>x.id===r.id)?previous.map(x=>x.id===r.id?r:x):[r])}/>)}
 </section>;
}
function VendorEditor({row,manage,refreshing,onLockChange,onSaved}:{row:Row|null;manage:boolean;refreshing:boolean;onLockChange:(pending:boolean)=>boolean;onSaved:(r:Row)=>void}){
 // The parent owns saved metadata; the stable editor owns unsaved inputs and retries.
 const [p,setP]=useState<VendorProfile>(row?.draft??empty),[reason,setReason]=useState(""),[preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[uncertain,setUncertain]=useState(false);
 const id=useRef(row?.id??""),attempt=useRef<VendorCommand|null>(null),lock=useRef(false),upload=useRef<{file:File;id:string}|null>(null);
 const [photoPending,setPhotoPending]=useState(false);
 function field(k:keyof VendorProfile,v:string){setP(old=>({...old,[k]:v}));}
 async function act(operation:VendorCommand["operation"]){
  if(lock.current||!onLockChange(true))return;
  lock.current=true;setBusy(true);setMessage("");
  let called=false;
  try{
   if(!attempt.current){
    if(operation==="save"||operation==="submit")validateVendorProfile(p);
    id.current=row?.id??(id.current||crypto.randomUUID());
    attempt.current={id:id.current,requestId:crypto.randomUUID(),version:row?.version??0,operation,...(["save","submit"].includes(operation)?{profile:p}:{}),...(operation==="reject"?{reason}: {})};
   }
   called=true;
   const r=await saveVendorAction(attempt.current);
   if(!r.ok){
    setUncertain(r.code==="uncertain");
    if(r.code!=="uncertain")attempt.current=null;
    setMessage(r.message);return;
   }
   onSaved(r.data);setUncertain(false);attempt.current=null;setMessage("저장된 상태를 확인했습니다.");
  }catch(e){
   if(called){
    setUncertain(true);
    setMessage("처리 결과가 불확실합니다. ‘같은 요청 결과 확인’으로 다시 확인해 주세요.");
   }else{
    attempt.current=null;
    setMessage(e instanceof Error?e.message:"입력을 확인해 주세요.");
   }
  }finally{lock.current=false;setBusy(false);onLockChange(Boolean(attempt.current||upload.current));}
 }
 async function attach(file?:File){if(lock.current||!row)return;const a=upload.current??(file?{file,id:crypto.randomUUID()}:null);if(!a||!onLockChange(true))return;upload.current=a;lock.current=true;setBusy(true);setPhotoPending(true);try{const f=new FormData();f.set("file",a.file);f.set("requestId",a.id);f.set("vendorId",row.id);const response=await fetch("/market/providers/attachments",{method:"POST",body:f});const result=await response.json();if(!response.ok){if([400,401,403,413].includes(response.status)){upload.current=null;setPhotoPending(false);}throw new Error(result.message);}setP(old=>({...old,photos:[...new Set([...old.photos,result.id])]}));upload.current=null;setPhotoPending(false);setMessage("사진을 첨부했습니다. 초안 저장 또는 검토 신청으로 사진 선택을 저장하세요.");}catch(e){setMessage(e instanceof Error?e.message:"같은 사진으로 결과를 다시 확인해 주세요.");}finally{lock.current=false;setBusy(false);onLockChange(Boolean(attempt.current||upload.current));}}
 return <article className="min-w-0 space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6"><div className="flex flex-wrap gap-2"><strong>{row?states[row.state]:"새 신청"}</strong><span>{row?.restricted?"운영 제한":row?.visible?"공개 중":"비공개"}</span></div>{row?.reason?<p className="rounded-lg bg-rose-50 p-3">반려 사유: {row.reason}</p>:null}
 {manage?<><VendorProfileView profile={row!.draft} id={row!.id} preview/><div className="space-y-2 rounded-lg bg-pul-light/30 p-3 text-sm"><p>신청 관리 정보 · 공개 소개에 표시되지 않습니다.</p><p>사업자 등록: {row!.draft.businessRegistered==null?"미입력":row!.draft.businessRegistered?"있음":"없음"} · 매장·작업장: {row!.draft.hasWorkshop==null?"미입력":row!.draft.hasWorkshop?"있음":"없음"}</p><p>서비스 방식: {row!.draft.serviceModes?.map(x=>vendorServiceModes[x]).join(" · ")||"미입력"}</p><p className="break-words">홈페이지·공식 채널: {row!.draft.website||"미입력"}</p></div><label className="block font-bold">반려 사유<textarea className={vendorInput} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} disabled={refreshing||busy||uncertain}/></label></>:<fieldset disabled={refreshing||busy||uncertain||photoPending} className="grid min-w-0 gap-4 sm:grid-cols-2">
 {([["name","업체명",80],["region","소재 지역",80],["area","서비스 가능 지역",80],["summary","짧은 소개",180],["services","가능한 작업·서비스 내용",2000],["before","문의 전에 필요한 설명",2000]] as const).map(([k,label,max])=><label key={k} className={`min-w-0 font-bold ${max>80?"sm:col-span-2":""}`}>{label} <span className="text-xs font-normal">필수 · {max}자 이내</span>{max>180?<textarea className={vendorInput} maxLength={max} rows={4} value={p[k]} onChange={e=>field(k,e.target.value)}/>:<input className={vendorInput} maxLength={max} value={p[k]} onChange={e=>field(k,e.target.value)}/>}</label>)}
 {([["businessRegistered","사업자 등록 여부"],["hasWorkshop","매장·작업장 유무"]] as const).map(([key,label])=><label key={key} className="min-w-0 font-bold">{label} <span className="text-xs font-normal">선택 · 신청 관리용</span><select className={vendorInput} value={p[key]==null?"":p[key]?"yes":"no"} onChange={e=>setP(old=>({...old,[key]:e.target.value===""?null:e.target.value==="yes"}))}><option value="">미입력</option><option value="yes">있음</option><option value="no">없음</option></select></label>)}
 <p className="text-sm leading-6 text-pul-muted sm:col-span-2">사업자나 매장·작업장이 없어도 신청할 수 있습니다. 매장이 없으면 활동 거점 지역을 소재 지역에 입력하세요.</p>
 <fieldset className="min-w-0 sm:col-span-2"><legend className="font-bold">서비스 방식 <span className="text-xs font-normal">선택 · 복수 선택 · 신청 관리용</span></legend><div className="flex flex-wrap gap-x-4">{Object.entries(vendorServiceModes).map(([value,label])=><label key={value} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={p.serviceModes?.includes(value as VendorServiceMode)??false} onChange={e=>setP(old=>({...old,serviceModes:e.target.checked?[...(old.serviceModes??[]),value as VendorServiceMode]:(old.serviceModes??[]).filter(x=>x!==value)}))}/>{label}</label>)}</div></fieldset>
 <label className="min-w-0 font-bold sm:col-span-2">홈페이지·공식 채널 URL <span className="text-xs font-normal">선택 · 신청 관리용 · 500자 이내</span><input type="url" className={vendorInput} maxLength={500} placeholder="https://" value={p.website??""} onChange={e=>field("website",e.target.value)}/></label>
 <label className="min-w-0 font-bold">주력 분야<select className={vendorInput} value={p.primary} onChange={e=>field("primary",e.target.value)}>{Object.entries(vendorFields).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><fieldset className="min-w-0"><legend className="font-bold">취급 분야 · 복수 선택</legend><div className="flex flex-wrap gap-x-4">{Object.entries(vendorFields).map(([v,t])=><label key={v} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={p.fields.includes(v as VendorField)} onChange={e=>setP(old=>({...old,fields:e.target.checked?[...old.fields,v as VendorField]:old.fields.filter(x=>x!==v)}))}/>{t}</label>)}</div></fieldset>
 <div className="min-w-0 sm:col-span-2"><p className="font-bold">대표 사진·작업 사례 (선택)</p><p className="text-sm leading-6">초안을 먼저 저장한 뒤 PNG·JPG 사진을 최대 5장, 각 5MB 이하로 첨부하세요. 첫 사진이 대표 사진입니다. 검토 전에는 공개되지 않습니다.</p><input aria-label="업체 소개 사진" type="file" accept="image/png,image/jpeg" disabled={!row||p.photos.length>=5} className="mt-2 w-full min-w-0 text-sm" onChange={e=>void attach(e.target.files?.[0])}/><div className="mt-2 flex flex-wrap gap-2">{p.photos.map((x,i)=><button key={x} type="button" className={vendorButton} onClick={()=>setP(old=>({...old,photos:old.photos.filter(y=>y!==x)}))}>{i===0?"대표 사진":`사진 ${i+1}`} 제외</button>)}</div></div></fieldset>}
 <div className="flex flex-wrap gap-2">{manage?([['approve','승인'],['reject','사유와 함께 반려'],['publish','승인본 공개'],['restrict','공개 중단·제한'],['restore','운영 제한 해제']] as const).map(([op,label])=><button key={op} disabled={refreshing||busy||uncertain||(op==='reject'&&!reason.trim())} className={vendorButton} onClick={()=>void act(op)}>{label}</button>):<><button disabled={refreshing||busy||uncertain||photoPending} className={vendorButton} onClick={()=>void act("save")}>초안 저장</button><button disabled={refreshing||busy||uncertain||photoPending||!row} className={`${vendorButton} bg-pul-point text-white`} onClick={()=>void act("submit")}>검토 신청</button>{row?.visible?<button disabled={refreshing||busy||uncertain} className={vendorButton} onClick={()=>void act("hide")}>내 업체 공개 중단</button>:null}<button className={vendorButton} onClick={()=>setPreview(x=>!x)}>{preview?"미리보기 닫기":"공개 예정 미리보기"}</button></>}
 {uncertain?<button disabled={refreshing||busy} className={vendorButton} onClick={()=>void act(attempt.current!.operation)}>같은 요청 결과 확인</button>:null}{photoPending?<button disabled={refreshing||busy} className={vendorButton} onClick={()=>void attach()}>같은 사진 업로드 확인</button>:null}</div>
 {message?<p role="status" className="whitespace-pre-wrap rounded-lg bg-pul-light/30 p-3 text-sm leading-6">{message}</p>:null}{busy?<p role="status">처리 중…</p>:null}{preview&&!manage?<VendorProfileView profile={p} id={row?.id??""} preview/>:null}{manage&&row?.approved?<details><summary className="min-h-11 cursor-pointer py-3 font-bold">현재 승인본 비교</summary><VendorProfileView profile={row.approved} id={row.id} preview/></details>:null}
 </article>;
}
