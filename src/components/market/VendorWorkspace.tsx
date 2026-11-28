"use client";
import { PhotoUploadStatus, usePhotoUploadProgress } from "@/components/ui/PhotoUploadStatus";

import { photoUploadForm } from "@/lib/images/preparePhoto";
/* eslint-disable react-hooks/refs -- These refs are accessed only by async click/upload handlers, never during render. */
import {useEffect,useRef,useState} from "react";
import {loadVendorWorkspaceAction,saveVendorAction} from "@/app/market/vendorActions";
import {vendorFields,vendorFormErrors,vendorIntroduction,vendorLinkLabels,vendorServiceModes,vendorSummary,type VendorWorkspace as Row,type VendorProfile,type VendorField,type VendorServiceMode,type VendorCommand} from "@/lib/market/marketVendors";
import {vendorButton,vendorInput,vendorPrimaryButton,VendorProfileView} from "./MarketVendors";
const empty:VendorProfile={name:"",region:"",area:"",primary:"restore",fields:[],summary:"",services:"",before:"",photos:[]};
const states={draft:"작성 중",pending:"검토 대기",approved:"승인",rejected:"반려"};
const receiptText="접수 완료 · 검토 중";
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
 return <section className="space-y-4"><h1 className="text-2xl font-bold">{manage?"업체 입점 관리":"업체 등록·관리"}</h1><p className="text-sm leading-6 text-pul-muted">신청 내용은 검토 후 공개합니다. 수정 초안은 다시 승인되기 전까지 공개 소개에 반영되지 않습니다.</p><button className={vendorButton} disabled={blocked||refreshing} onClick={()=>void reload()}>최신 상태 불러오기</button>{refreshing?<p role="status" className="text-sm text-pul-muted">최신 저장 상태를 불러오는 중입니다.</p>:null}
 {error?<p role="alert">{error}</p>:manage&&!rows.length?<p>검토할 업체가 없습니다.</p>:null}
 {loaded&&(rows.length?rows:[null]).map(row=>manage&&!row?null:<VendorEditor key={manage?row!.id:"owner"} row={row} manage={manage} refreshing={refreshing} onLockChange={pending=>editorLock(manage?row!.id:"owner",pending)} onSaved={r=>setRows(previous=>previous.some(x=>x.id===r.id)?previous.map(x=>x.id===r.id?r:x):[r])}/>)}
 </section>;
}
type SelectedPhoto = {id:string;ready:boolean;file?:File;url?:string};
function editorSnapshot(profile:VendorProfile,introduction:string,photos:string[]){
 const publicLinks=Object.entries(profile.publicLinks??{})
  .map(([key,value])=>[key,value.trim()])
  .filter(([,value])=>value)
  .sort();
 return JSON.stringify({
  name:profile.name.trim(),region:profile.region.trim(),area:profile.area.trim(),
  fields:profile.fields,introduction:introduction.trim(),before:profile.before,photos,
  businessRegistered:profile.businessRegistered??null,hasWorkshop:profile.hasWorkshop??null,
  serviceModes:profile.serviceModes??[],website:profile.website??"",publicLinks,
 });
}
function VendorEditor({row,manage,refreshing,onLockChange,onSaved}:{row:Row|null;manage:boolean;refreshing:boolean;onLockChange:(pending:boolean)=>boolean;onSaved:(r:Row)=>void}){
 const progress=usePhotoUploadProgress();
 const [p,setP]=useState<VendorProfile>(()=>row?{...row.draft,services:vendorIntroduction(row.draft)}:empty);
 const [photos,setPhotos]=useState<SelectedPhoto[]>(()=>row?.draft.photos.map(id=>({id,ready:true}))??[]);
 const [reason,setReason]=useState(""),[preview,setPreview]=useState(false),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState(""),[uncertain,setUncertain]=useState(false),[showErrors,setShowErrors]=useState(false);
 const lock=useRef(false),attempt=useRef<VendorCommand|null>(null),resume=useRef<VendorCommand["operation"]>("submit");
 const draftId=useRef("");
 const prepared=useRef(new Map<string,FormData>()),previews=useRef(new Set<string>());
 const fileInput=useRef<HTMLInputElement>(null);
 const errors=vendorFormErrors(p);
 const disabled=refreshing||busy||uncertain;
 const pending=!manage&&row?.state==="pending";
 const editedAfterReceipt=pending&&editorSnapshot(p,p.services,photos.map(photo=>photo.id))
  !==editorSnapshot(row.draft,vendorIntroduction(row.draft),row.draft.photos);

 useEffect(()=>{
  const urls=previews.current;
  return ()=>{for(const url of urls)URL.revokeObjectURL(url);};
 },[]);

 function field<K extends keyof VendorProfile>(key:K,value:VendorProfile[K]){
  setP(old=>({...old,[key]:value}));
 }
 function choosePhotos(files:FileList|null){
  if(!files)return;
  const free=5-photos.length;
  if(files.length>free)setMessage("사진은 최대 5장까지 추가할 수 있습니다.");
  else setMessage("");
  const added=Array.from(files).slice(0,free).map(file=>{
   const url=URL.createObjectURL(file);
   previews.current.add(url);
   return {id:crypto.randomUUID(),file,url,ready:false};
  });
  setPhotos(old=>[...old,...added]);
 }
 function removePhoto(photo:SelectedPhoto){
  if(photo.url){URL.revokeObjectURL(photo.url);previews.current.delete(photo.url);}
  prepared.current.delete(photo.id);
  setPhotos(old=>old.filter(item=>item.id!==photo.id));
 }
 async function uploadPhoto(photo:SelectedPhoto,vendorId:string){
  const upload=progress.begin();
  try{
   let body=prepared.current.get(photo.id);
   if(!body){
    body=await photoUploadForm(photo.file!,{requestId:photo.id,vendorId},{allowedTypes:["image/jpeg","image/png"],onProcessing:()=>upload.processing()});
    prepared.current.set(photo.id,body);
   }
   upload.uploading();
   const response=await fetch("/market/providers/attachments",{method:"POST",body});
   const result=await response.json();
   if(!response.ok||result.id!==photo.id)throw new Error(result.message||"첨부를 확인하지 못했습니다.");
   prepared.current.delete(photo.id);
   setPhotos(old=>old.map(item=>item.id===photo.id?{...item,ready:true}:item));
  }finally{upload.clear();}
 }
 async function send(command:VendorCommand){
  attempt.current=command;
  const result=await saveVendorAction(command);
  if(!result.ok){
   if(result.code!=="uncertain")attempt.current=null;
   throw new Error(result.message);
  }
  attempt.current=null;
  onSaved(result.data);
  return result.data;
 }
 async function act(operation:VendorCommand["operation"]){
  if(lock.current||refreshing)return;
  const editing=operation==="submit"||operation==="save";
  if(editing&&!attempt.current&&Object.values(errors).some(Boolean)){
   setShowErrors(true);
   const first=Object.keys(errors).find(key=>errors[key as keyof typeof errors]);
   requestAnimationFrame(()=>{
    const input=document.getElementById("vendor-"+first);
    input?.focus({preventScroll:true});
    input?.scrollIntoView({block:"center"});
   });
   return;
  }
  if(!onLockChange(true))return;
  lock.current=true;resume.current=operation;setBusy(true);setMessage("");
  let stage=editing?"초안 저장":operation==="hide"?"공개 중단":"검토 처리";
  try{
   let saved=row;
   const selected=photos.map(photo=>photo.id);
   const profile:VendorProfile={
    ...p,name:p.name.trim(),region:p.region.trim(),area:p.area.trim(),
    primary:p.fields.includes(p.primary)?p.primary:p.fields[0],
    services:p.services.trim(),summary:vendorSummary(p.services),
    publicLinks:Object.fromEntries(Object.entries(p.publicLinks??{}).flatMap(([key,value])=>value.trim()?[[key,value.trim()]]:[])),
    photos:selected,
   };

   if(attempt.current){
    const retry=attempt.current;
    stage=retry.operation==="submit"?"검토 신청":stage;
    saved=await send(retry);
    if(retry.operation!=="save"||operation==="save"&&retry.profile?.photos.join()===selected.join()){
     setMessage(retry.operation==="submit"?receiptText:"저장된 상태를 확인했습니다.");
     return;
    }
   }
   if(editing){
    if(!saved){
     draftId.current ||= crypto.randomUUID();
     saved=await send({id:draftId.current,requestId:crypto.randomUUID(),version:0,operation:"save",profile:{...profile,photos:[]}});
     if(operation==="save"&&!photos.length){setMessage("초안을 저장했습니다.");return;}
    }
    for(const photo of photos){
     if(photo.ready)continue;
     stage="사진 업로드 ("+photo.file?.name+")";
     await uploadPhoto(photo,saved.id);
    }
   }
   stage=operation==="submit"?"검토 신청":editing?"초안 저장":stage;
   if(!saved)throw new Error("저장된 업체를 불러와 주세요.");
   await send({
    id:saved.id,requestId:crypto.randomUUID(),version:saved.version,operation,
    ...(editing?{profile}:{}),...(operation==="reject"?{reason}:{}),
   });
   setMessage(operation==="submit"?receiptText:editing?"초안을 저장했습니다.":"저장된 상태를 확인했습니다.");
  }catch(error){
   const detail=error instanceof Error?error.message:"다시 시도해 주세요.";
   setMessage(stage+(attempt.current?" 결과 확인 필요 — ":" 실패 — ")+detail);
  }finally{
   lock.current=false;setBusy(false);setUncertain(Boolean(attempt.current));onLockChange(Boolean(attempt.current));
  }
 }
 const previewProfile={...p,summary:vendorSummary(p.services),photos:photos.map(photo=>photo.id)};
 const localPhotos=Object.fromEntries(photos.flatMap(photo=>photo.url?[[photo.id,photo.url]]:[]));
 const errorText=(key:keyof typeof errors)=>showErrors&&errors[key]?<span id={"vendor-error-"+key} className="mt-1 block scroll-mb-36 text-sm font-normal text-rose-700 lg:scroll-mb-0">{errors[key]}</span>:null;
 const editorMessage=editedAfterReceipt&&message===receiptText?"":message;
 const status=progress.message?<PhotoUploadStatus message={progress.message}/>:editorMessage?
  <p role="status" className="mt-2 whitespace-pre-wrap rounded-lg bg-pul-light/30 p-2 text-sm leading-6 [overflow-wrap:anywhere]">{editorMessage}</p>:
  busy?<p role="status" className="mt-2 text-sm">처리 중…</p>:null;

 return <article className="min-w-0 space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6">
  <div className="flex flex-wrap items-baseline gap-2">
   {pending?<span className="text-sm text-pul-muted">저장된 신청</span>:null}
   <strong>{pending?receiptText:row?states[row.state]:"새 신청"}</strong>
   <span>{row?.restricted?"운영 제한":row?.visible?"공개 중":"비공개"}</span>
  </div>
  {editedAfterReceipt?<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">
   {uncertain?"현재 수정 내용의 접수 여부를 확인해 주세요.":busy?"수정 내용을 처리하고 있습니다.":"현재 수정 내용은 아직 저장·접수되지 않았습니다."}
  </p>:null}
  {row?.reason?<p className="rounded-lg bg-rose-50 p-3">반려 사유 · {row.reason}</p>:null}
  {manage?<><VendorProfileView profile={row!.draft} id={row!.id} preview/>
   <div className="space-y-2 rounded-lg bg-pul-light/30 p-3 text-sm">
    <p>신청 관리 정보</p>
    <p>사업자 등록 · {row!.draft.businessRegistered==null?"미입력":row!.draft.businessRegistered?"있음":"없음"} / 매장·작업장 · {row!.draft.hasWorkshop==null?"미입력":row!.draft.hasWorkshop?"있음":"없음"}</p>
    <p>서비스 방식 · {row!.draft.serviceModes?.map(mode=>vendorServiceModes[mode]).join(" · ")||"미입력"}</p>
    <p className="break-words">신청 관리용 링크 · {row!.draft.website||"미입력"}</p>
   </div>
   <label className="block font-bold">반려 사유<textarea className={vendorInput} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} disabled={disabled}/></label>
  </>:<fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2 max-lg:[&_:is(input,textarea)]:scroll-mb-36">
   <section className="min-w-0 sm:col-span-2" aria-label="작업 사진">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
     <button type="button" className={vendorButton+" scroll-mb-36"} disabled={disabled||photos.length>=5} onClick={()=>fileInput.current?.click()}>+ 사진 추가</button>
     <span className="text-sm text-pul-muted">선택 · JPG/PNG {photos.length}/5장</span>
    </div>
    <input ref={fileInput} aria-label="업체 소개 사진" type="file" accept="image/png,image/jpeg" multiple hidden onChange={e=>{choosePhotos(e.target.files);e.target.value="";}}/>
    {photos.length>0?<ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">{photos.map((photo,index)=><li key={photo.id} className="flex min-w-0 items-center overflow-hidden rounded-lg border border-pul-border sm:block">
     {/* eslint-disable-next-line @next/next/no-img-element -- Local previews use blob URLs. */}
     <img src={photo.url??"/market/vendor-media/"+photo.id} alt={index===0?"대표 사진":"작업 사진 "+index} className="ml-1 size-9 shrink-0 rounded object-cover sm:ml-0 sm:aspect-[4/3] sm:h-auto sm:w-full sm:rounded-none"/>
     <div className="flex flex-1 items-center justify-end whitespace-nowrap text-xs sm:justify-between sm:gap-x-2 sm:px-2 sm:text-sm">
      {index===0?<span className="min-w-11 py-2 text-center font-bold">대표<span className="hidden sm:inline"> 사진</span></span>:<button type="button" className="min-h-11 min-w-11 text-pul-point" aria-label={"사진 "+(index+1)+" 대표로 선택"} onClick={()=>setPhotos(old=>[photo,...old.filter(item=>item.id!==photo.id)])}>대표<span className="sm:hidden">로</span><span className="hidden sm:inline"> 선택</span></button>}
      <button type="button" className="min-h-11 min-w-11 text-rose-700" aria-label={"사진 "+(index+1)+" 삭제"} onClick={()=>removePhoto(photo)}>삭제</button>
     </div>
    </li>)}</ul>:null}
   </section>
   {([["name","업체명"],["region","소재 지역"]] as const).map(([key,label])=><label key={key} className="min-w-0 font-bold">{label} <span className="text-xs font-normal text-pul-muted">필수</span>
    <input id={"vendor-"+key} className={vendorInput} maxLength={80} placeholder={key==="region"?"예 · 경북 구미시":undefined} value={p[key]} aria-invalid={showErrors&&Boolean(errors[key])} aria-describedby={showErrors&&errors[key]?"vendor-error-"+key:undefined} onChange={e=>field(key,e.target.value)}/>{errorText(key)}
   </label>)}
   <fieldset className="min-w-0 sm:col-span-2" aria-describedby={showErrors&&errors.fields?"vendor-error-fields":undefined}>
    <legend className="font-bold">취급 작업 <span className="text-xs font-normal text-pul-muted">필수 · 복수 선택</span></legend>
    <div className="flex flex-wrap gap-x-4">{Object.entries(vendorFields).map(([key,label],index)=><label key={key} className="inline-flex min-h-11 items-center gap-2">
     <input id={index===0?"vendor-fields":undefined} type="checkbox" checked={p.fields.includes(key as VendorField)} onChange={e=>field("fields",e.target.checked?[...p.fields,key as VendorField]:p.fields.filter(value=>value!==key))}/>{label}
    </label>)}</div>{errorText("fields")}
   </fieldset>
   <label className="min-w-0 font-bold sm:col-span-2">업체 소개 <span className="text-xs font-normal text-pul-muted">필수</span>
    <textarea id="vendor-services" className={vendorInput} maxLength={2182} rows={4} value={p.services} aria-invalid={showErrors&&Boolean(errors.services)} aria-describedby={showErrors&&errors.services?"vendor-error-services":undefined} onChange={e=>field("services",e.target.value)}/>{errorText("services")}
   </label>
   <fieldset className="grid min-w-0 gap-3 sm:col-span-2 sm:grid-cols-3" aria-describedby={showErrors&&errors.publicLinks?"vendor-error-publicLinks":undefined}>
    <legend className="mb-1 font-bold">공개할 홈페이지·블로그·유튜브 링크 <span className="text-xs font-normal text-pul-muted">선택</span></legend>
    {Object.entries(vendorLinkLabels).map(([kind,label],index)=>{
     const key=kind as keyof typeof vendorLinkLabels;
     return <label key={kind} className="min-w-0 text-sm">{label}<input id={index===0?"vendor-publicLinks":undefined} type="url" className={vendorInput} maxLength={500} placeholder="https://" value={p.publicLinks?.[key]??""} onChange={e=>field("publicLinks",{...p.publicLinks,[key]:e.target.value})}/></label>;
    })}
    {errorText("publicLinks")}
   </fieldset>
   <details className="min-w-0 rounded-lg border border-pul-border px-3 sm:col-span-2">
    <summary className="min-h-11 cursor-pointer py-3 font-bold">추가 정보 <span className="text-xs font-normal text-pul-muted">선택</span></summary>
    <div className="grid gap-4 pb-3 sm:grid-cols-2">
     <fieldset className="min-w-0"><legend className="font-bold">서비스 방식</legend><div className="flex flex-wrap gap-x-4">{Object.entries(vendorServiceModes).map(([key,label])=><label key={key} className="inline-flex min-h-11 items-center gap-2">
      <input type="checkbox" checked={p.serviceModes?.includes(key as VendorServiceMode)??false} onChange={e=>field("serviceModes",e.target.checked?[...(p.serviceModes??[]),key as VendorServiceMode]:(p.serviceModes??[]).filter(x=>x!==key))}/>{label}
     </label>)}</div></fieldset>
     <label className="min-w-0 font-bold">추가 서비스 지역<input className={vendorInput} maxLength={80} value={p.area} onChange={e=>field("area",e.target.value)}/></label>
     <label className="min-w-0 font-bold sm:col-span-2">문의 전에 알려드릴 내용<textarea className={vendorInput} rows={3} maxLength={2000} value={p.before} onChange={e=>field("before",e.target.value)}/></label>
     {([["businessRegistered","사업자 등록 여부"],["hasWorkshop","매장·작업장 유무"]] as const).map(([key,label])=><label key={key} className="min-w-0 font-bold">{label} <span className="text-xs font-normal text-pul-muted">신청 관리용</span>
      <select className={vendorInput} value={p[key]==null?"":p[key]?"yes":"no"} onChange={e=>field(key,e.target.value===""?null:e.target.value==="yes")}><option value="">미입력</option><option value="yes">있음</option><option value="no">없음</option></select>
     </label>)}
     {p.website!==undefined?<label className="min-w-0 font-bold sm:col-span-2">기존 신청 관리용 링크
      <input type="url" className={vendorInput} maxLength={500} value={p.website} onChange={e=>field("website",e.target.value)}/>
      <span className="mt-1 block text-sm font-normal text-pul-muted">공개하려면 위 공개 링크 항목에 주소를 입력하세요.</span>
     </label>:null}
    </div>
   </details>
  </fieldset>}
  {!manage?<div className="sticky bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 -mx-4 border-y border-pul-border bg-white p-3 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:p-0">
   <div className="flex flex-wrap gap-2">
    {uncertain?<button disabled={refreshing||busy} className={vendorPrimaryButton} onClick={()=>void act(resume.current)}>같은 요청 결과 확인</button>:<>
     <button disabled={disabled} className={vendorPrimaryButton} onClick={()=>void act("submit")}>검토 신청</button>
     <button disabled={disabled} className={vendorButton} onClick={()=>void act("save")}>초안 저장</button>
    </>}
   </div>
   {status}
  </div>:null}
  <div className="flex flex-wrap gap-2">
   {manage?([["approve","승인"],["reject","사유와 함께 반려"],["publish","승인본 공개"],["restrict","공개 중단·제한"],["restore","운영 제한 해제"]] as const).map(([op,label])=><button key={op} disabled={disabled||(op==="reject"&&!reason.trim())} className={vendorButton} onClick={()=>void act(op)}>{label}</button>):<>
    <button className={vendorButton} onClick={()=>setPreview(x=>!x)}>{preview?"미리보기 닫기":"공개 예정 미리보기"}</button>
    {row?.visible?<button disabled={disabled} className={vendorButton} onClick={()=>void act("hide")}>내 업체 공개 중단</button>:null}
   </>}
   {manage&&uncertain?<button disabled={refreshing||busy} className={vendorButton} onClick={()=>void act(resume.current)}>같은 요청 결과 확인</button>:null}
  </div>
  {manage?status:null}
  {preview&&!manage?<VendorProfileView profile={previewProfile} id={row?.id??""} preview localPhotos={localPhotos}/>:null}
  {manage&&row?.approved?<details><summary className="min-h-11 cursor-pointer py-3 font-bold">현재 승인본 비교</summary><VendorProfileView profile={row.approved} id={row.id} preview/></details>:null}
 </article>;
}
