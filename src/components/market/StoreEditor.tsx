"use client";
import { PhotoUploadStatus, usePhotoUploadProgress } from "@/components/ui/PhotoUploadStatus";

import { validatePhotoInput } from "@/lib/images/photoPolicy";
import { photoUploadForm, PhotoPreparationError } from "@/lib/images/preparePhoto";
import {startTransition,useRef,useState} from "react";
import Link from "next/link";
import {saveStoreAction} from "@/app/market/storeActions";
import {storeDraft,profileFromDraft,storeTextFields,storeNumberFields,storeRegions,storeStatuses,depositModes,parkingModes,validateStoreCommand,storeUuid,type StoreRow,type StoreCommand,type StoreStatus} from "@/lib/market/marketStores";
export const storeButton="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-4 py-2 text-sm font-bold disabled:opacity-50";
export const storeInput="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-pul-border bg-white p-3 text-base";
type Photo={id:string;file?:File;state:"selected"|"ready"|"uncertain"|"failed"};
export function StoreEditor({row,mode="edit",onDone,onCancel}:{row?:StoreRow;mode?:"edit"|"status"|"delete";onDone:(r:{id:string;deleted:boolean})=>void;onCancel:()=>void}){
 const progress=usePhotoUploadProgress();
 const [id]=useState(()=>row?.id??crypto.randomUUID()),[draft,setDraft]=useState(()=>storeDraft(row?.profile)),[negotiable,setNegotiable]=useState(row?.profile.negotiable??false),[status,setStatus]=useState<StoreStatus>(row?.status??"selling");
 const [photos,setPhotos]=useState<Photo[]>(()=>row?.profile.photos.map(id=>({id,state:"ready"}))??[]);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState("");
 const lock=useRef(false),attempt=useRef<StoreCommand|null>(null);
 const photoUncertain=photos.some(p=>p.state==="uncertain"),blocked=busy||uncertain||photoUncertain;
 function select(files:FileList|null){if(lock.current||blocked||!files)return;try{const picked=Array.from(files);if(photos.length+picked.length>5)throw Error("사진은 최대 5장입니다.");picked.forEach(file=>validatePhotoInput(file,["image/jpeg","image/png"]));setPhotos(old=>[...old,...picked.map(file=>({id:crypto.randomUUID(),file,state:"selected" as const}))]);setError("");}catch(e){setError(e instanceof Error?e.message:"사진을 확인해 주세요.");}}
 async function upload(){
  if(lock.current||uncertain)return;lock.current=true;setBusy(true);setError("");
  const photoProgress=progress.begin();const selected=photos.filter(p=>p.state!=="ready");
  try{for(const [index,photo] of selected.entries()){
   if(!photo.file)throw Error("선택한 사진을 확인해 주세요.");
   let definitive=false;
   try{
    const f=await photoUploadForm(photo.file,{storeId:id,requestId:photo.id},{allowedTypes:["image/jpeg","image/png"],onProcessing:()=>photoProgress.processing(index+1,selected.length)});if(!photoProgress.isCurrent())return;photoProgress.uploading();
    const response=await fetch("/market/stores/attachments",{method:"POST",body:f});
    definitive=[400,401,403,413].includes(response.status);
    const data=await response.json();if(!photoProgress.isCurrent())return;
    if(!response.ok&&data.stage==="prepare"&&["preparation_unavailable","preparation_rejected"].includes(data.code))definitive=photo.state!=="uncertain";
    if(!response.ok)throw Error(data.message??"사진 업로드를 확인하지 못했습니다.");
    if(data.id!==photo.id||!storeUuid.test(data.id))throw Error("사진 업로드 결과를 확인하지 못했습니다.");
    setPhotos(old=>old.map(p=>p.id===photo.id?{...p,state:"ready"}:p));
   }catch(e){setPhotos(old=>old.map(p=>p.id===photo.id?{...p,state:definitive||e instanceof PhotoPreparationError?"failed":"uncertain"}:p));throw e;}
  }}catch(e){setError(e instanceof Error?e.message:"같은 사진으로 업로드 결과를 확인해 주세요.");}
  finally{photoProgress.clear();lock.current=false;setBusy(false);}
 }
 async function save(){
  if(lock.current||photoUncertain)return;lock.current=true;setBusy(true);setError("");let called=false;
  try{
   if(!attempt.current){
    if(mode==="edit"&&photos.some(p=>p.state!=="ready"))throw Error("선택한 사진을 먼저 업로드해 주세요.");
    const command:StoreCommand={id,requestId:crypto.randomUUID(),version:row?.version??0,operation:mode==="delete"?"delete":mode==="status"?"status":row?"update":"create",...(mode!=="delete"?{status}:{}),...(mode==="edit"?{profile:profileFromDraft(draft,negotiable,photos.map(p=>p.id))}:{})};
    validateStoreCommand(command);attempt.current=command;
   }
   called=true;const result=await saveStoreAction(attempt.current);
   if(!result.ok){setUncertain(result.code==="uncertain");if(result.code!=="uncertain")attempt.current=null;setError(result.message);return;}
   attempt.current=null;setUncertain(false);onDone(result.data);
  }catch(e){if(called){setUncertain(true);setError("저장 결과가 불확실합니다. 같은 요청 결과를 확인해 주세요.");}else setError(e instanceof Error?e.message:"입력 내용을 확인해 주세요.");}
  finally{lock.current=false;setBusy(false);}
 }
 const set=(key:string,value:string)=>setDraft(old=>({...old,[key]:value}));
 const textField=(key:keyof typeof storeTextFields)=>{const [label,max,required]=storeTextFields[key];return <label key={key} className={"block min-w-0 text-sm font-bold "+(max>300?"sm:col-span-2":"")}>{label} <span className="font-normal text-pul-muted">{required?"필수":"선택"}</span>{max>300?<textarea required={required} rows={4} maxLength={max} className={storeInput} value={draft[key]} onChange={e=>set(key,e.target.value)}/>:<input required={required} maxLength={max} className={storeInput} value={draft[key]} onChange={e=>set(key,e.target.value)}/>}</label>;};
 const numberField=(key:keyof typeof storeNumberFields)=>{const [label,min,max,integer]=storeNumberFields[key],financial=["revenue","cost","profit"].includes(key);return <label key={key} className="block min-w-0 text-sm font-bold">{label}{key==="area"?"":key==="bays"?" (개)":" (원)"} <span className="font-normal text-pul-muted">{financial?"선택":"필수"}</span><input type="number" required={!financial} min={min} max={max} step={integer?1:"any"} className={storeInput} value={draft[key]} onChange={e=>set(key,e.target.value)} placeholder={financial?"미기재·비공개":""}/></label>;};
 const selectField=(key:string,label:string,values:Record<string,string>)=><label className="block min-w-0 text-sm font-bold">{label}<select className={storeInput} value={draft[key]} onChange={e=>set(key,e.target.value)}>{Object.entries(values).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>;
 const heading=mode==="delete"?"매장 글 삭제":mode==="status"?"거래 상태 변경":row?"매장 정보 수정":"매장 등록";
 return <form aria-label={heading} className="min-w-0 space-y-5 rounded-xl border border-pul-border bg-white p-4 sm:p-6" onSubmit={e=>{e.preventDefault();startTransition(async()=>{await save();});}}>
  <h2 className="text-xl font-bold">{heading}</h2>
  {mode==="delete"?<p className="text-sm leading-6">공개 목록과 상세에서 이 글을 숨깁니다. 기존 쪽지와 다른 회원의 관심 기록은 함께 삭제하지 않습니다.</p>:null}
  <fieldset disabled={blocked} className="min-w-0 space-y-5">
  {mode==="edit"?<>
   <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="mb-3 font-bold">매장 기본 정보</legend>{textField("title")}{selectField("region","지역",Object.fromEntries(storeRegions.map(x=>[x,x])))}{textField("floor")}{numberField("area")}{selectField("areaUnit","면적 단위",{sqm:"㎡",pyeong:"평"})}{numberField("bays")}{textField("equipment")}</fieldset>
   <fieldset className="grid min-w-0 gap-4 border-t border-pul-border pt-4 sm:grid-cols-2"><legend className="font-bold">금액·임대 조건</legend>{numberField("askingPrice")}{selectField("depositMode","양도 희망금액의 보증금",depositModes)}<label className="inline-flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={negotiable} onChange={e=>setNegotiable(e.target.checked)}/>금액 협의 가능</label>{numberField("deposit")}{numberField("rent")}{numberField("maintenance")}<p className="text-sm leading-6 text-pul-muted sm:col-span-2">금액은 모두 원 단위입니다. 임대 보증금과 양도 희망금액은 자동 합산하지 않습니다.</p></fieldset>
   <fieldset className="grid min-w-0 gap-4 border-t border-pul-border pt-4 sm:grid-cols-2"><legend className="font-bold">운영·양도 정보</legend>{selectField("parking","주차",parkingModes)}{textField("parkingNote")}{textField("hours")}{textField("facilities")}{textField("description")}</fieldset>
   <details className="min-w-0 rounded-lg border border-pul-border p-3"><summary className="min-h-11 cursor-pointer py-2 font-bold">선택 재무 정보</summary><p className="text-sm leading-6 text-pul-muted">작성자 제공 · 증빙 확인 안 됨. 빈 칸은 미기재·비공개이며 0원과 다릅니다. 금액을 하나라도 공개하면 기준 기간을 적어 주세요.</p><div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">{numberField("revenue")}{numberField("cost")}{numberField("profit")}{textField("financePeriod")}</div></details>
   <div className="min-w-0 space-y-3"><h3 className="font-bold">매장 사진 · 필수 1~5장</h3><p className="text-sm text-pul-muted">JPG/PNG, 각 원본 32MB 이내 · 자동 조정. 첫 사진을 대표로 사용합니다.</p><input aria-label="매장 사진 선택" type="file" multiple accept="image/jpeg,image/png" disabled={photos.length>=5} className="block w-full min-w-0 max-w-full text-sm" onChange={e=>select(e.target.files)}/><ul className="space-y-2">{photos.map((p,i)=><li key={p.id} className="flex min-w-0 flex-wrap items-center gap-2 text-sm"><span className="min-w-0 flex-1 break-all">{i===0?"대표 사진":"사진 "+(i+1)} · {p.file?.name??"기존 사진"} · {{ready:"업로드 확인",selected:"선택됨",uncertain:"결과 미확정",failed:"업로드 실패"}[p.state]}</span><button type="button" className={storeButton} onClick={()=>setPhotos(old=>old.filter(x=>x.id!==p.id))}>사진 {i+1} 제외</button></li>)}</ul></div>
  </>:null}
  {mode!=="delete"?<label className="block text-sm font-bold">거래 상태<select className={storeInput} value={status} onChange={e=>setStatus(e.target.value as StoreStatus)}>{Object.entries(storeStatuses).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>:null}
  </fieldset>
  {mode==="edit"&&photos.some(p=>p.state!=="ready")?<button type="button" className={storeButton} disabled={busy||uncertain} onClick={()=>void upload()}>{photoUncertain?"같은 사진 업로드 확인":"선택 사진 업로드"}</button>:null}
  {mode==="edit"?<p className="text-sm leading-6 text-pul-muted">운영 중인 스크린파크골프 매장의 실제 정보와 사용 권한이 있는 사진을 등록해 주세요. <Link href="/market/policy" target="_blank" rel="noopener noreferrer" className="underline">기존 물품 장터 정책 참고 (새 창)</Link></p>:null}
  <PhotoUploadStatus message={progress.message}/>{error?<p role="alert" className="text-sm leading-6 text-rose-700">{error}</p>:null}
  <div className="flex flex-wrap gap-2"><button disabled={busy||photoUncertain} className={storeButton+" bg-pul-point text-white"}>{busy?"처리 중…":uncertain?"같은 요청 결과 확인":mode==="delete"?"삭제 확인":mode==="status"?"상태 저장":row?"수정 저장":"매장 등록"}</button><button type="button" className={storeButton} disabled={blocked} onClick={onCancel}>취소</button></div>
 </form>;
}
