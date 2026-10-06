import type {SupabaseClient} from "@supabase/supabase-js";
export const storeUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const storeRegions=["서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주"] as const;
export const storeStatuses={selling:"매매 중",negotiating:"협의 중",completed:"거래 완료"} as const;
export type StoreStatus=keyof typeof storeStatuses;
export const depositModes={included:"보증금 포함",excluded:"보증금 미포함",discuss:"보증금 별도 협의"} as const;
export const parkingModes={yes:"주차 가능",shared:"공용 주차",no:"주차 불가"} as const;
export const storeTextFields={title:["제목",120,true],floor:["층수",40,true],equipment:["설치 프로그램·장비",300,true],parkingNote:["주차 설명",200,false],hours:["운영시간",100,false],facilities:["포함 시설·장비와 양도 범위",1000,true],description:["운영 설명",3000,true],financePeriod:["재무 정보 기준 기간",100,false]} as const;
export const storeNumberFields={area:["면적",0.01,100000,false],bays:["타석 수",1,999,true],askingPrice:["양도 희망금액",0,9999999999999,true],deposit:["임대 보증금",0,9999999999999,true],rent:["월세",0,9999999999999,true],maintenance:["관리비",0,9999999999999,true],revenue:["매출",0,9999999999999,true],cost:["비용",0,9999999999999,true],profit:["순이익",-9999999999999,9999999999999,true]} as const;
type TextFields={ [K in keyof typeof storeTextFields]:string };
type Numbers={ [K in Exclude<keyof typeof storeNumberFields,"revenue"|"cost"|"profit">]:number };
export type StoreProfile=TextFields&Numbers&{region:string;areaUnit:"sqm"|"pyeong";negotiable:boolean;depositMode:keyof typeof depositModes;parking:keyof typeof parkingModes;revenue:number|null;cost:number|null;profit:number|null;photos:string[]};
export type StoreRow={id:string;profile:StoreProfile;status:StoreStatus;version:number;mine:boolean;author:string;contactable:boolean;createdAt:string};
export type StorePage={items:StoreRow[];detail:StoreRow|null;hasMore:boolean};
export type StoreCommand={id:string;requestId:string;version:number;operation:"create"|"update"|"status"|"delete";profile?:StoreProfile;status?:StoreStatus};
export class StoreError extends Error{constructor(public code:string,message:string){super(message);}}
const invalid=(message="입력 내용을 확인해 주세요."):never=>{throw new StoreError("invalid",message);};
export function validateStoreProfile(p:StoreProfile){
 if(!p||typeof p!=="object"||Object.keys(p).some(k=>![...Object.keys(storeTextFields),...Object.keys(storeNumberFields),"region","areaUnit","negotiable","depositMode","parking","photos"].includes(k)))invalid();
 for(const [k,[label,max,required]] of Object.entries(storeTextFields)){
  const value=p[k as keyof TextFields];if(typeof value!=="string"||[...value].length>max||(required&&!value.trim())||value.includes("\0"))invalid(`${label}: ${required?"필수 · ":""}${max}자 이내로 입력해 주세요.`);
 }
 for(const [k,[label,min,max,integer]] of Object.entries(storeNumberFields)){
  const value=p[k as keyof typeof storeNumberFields];if(["revenue","cost","profit"].includes(k)&&value===null)continue;
  if(typeof value!=="number"||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))invalid(`${label}의 숫자와 범위를 확인해 주세요.`);
 }
 if(!storeRegions.includes(p.region as typeof storeRegions[number])||!["sqm","pyeong"].includes(p.areaUnit)||typeof p.negotiable!=="boolean"||!Object.hasOwn(depositModes,p.depositMode)||!Object.hasOwn(parkingModes,p.parking))invalid();
 if([p.revenue,p.cost,p.profit].some(x=>x!==null)&&!p.financePeriod.trim())invalid("재무 금액을 공개하려면 기준 기간을 입력해 주세요.");
 if(!Array.isArray(p.photos)||p.photos.length<1||p.photos.length>5||new Set(p.photos).size!==p.photos.length||p.photos.some(x=>typeof x!=="string"||!storeUuid.test(x)))invalid("매장 사진을 1~5장 업로드해 주세요.");
}
export function validateStoreCommand(c:StoreCommand){
 if(!c||!storeUuid.test(c.id)||!storeUuid.test(c.requestId)||!Number.isInteger(c.version)||c.version<0||!["create","update","status","delete"].includes(c.operation)||Object.keys(c).some(k=>!["id","requestId","version","operation","profile","status"].includes(k))||(c.operation==="create"?c.version!==0:c.version<1))invalid();
 if(c.operation==="create"||c.operation==="update")validateStoreProfile(c.profile!);
 else if(c.profile!==undefined)invalid();
 if(c.operation!=="delete"&&(!c.status||!Object.hasOwn(storeStatuses,c.status)))invalid();
}
export function storeDraft(p?:StoreProfile):Record<string,string>{
 const result:Record<string,string>={region:p?.region??"경기",areaUnit:p?.areaUnit??"sqm",depositMode:p?.depositMode??"excluded",parking:p?.parking??"no"};
 for(const k of Object.keys(storeTextFields))result[k]=p?.[k as keyof TextFields]??"";
 for(const k of Object.keys(storeNumberFields)){const value=p?.[k as keyof typeof storeNumberFields];result[k]=value===null||value===undefined?"":String(value);}
 return result;
}
export function profileFromDraft(d:Record<string,string>,negotiable:boolean,photos:string[]):StoreProfile{
 const p:Record<string,unknown>={...d,negotiable,photos};
 for(const k of Object.keys(storeNumberFields))p[k]=d[k]?.trim()===""?(["revenue","cost","profit"].includes(k)?null:NaN):Number(d[k]);
 validateStoreProfile(p as StoreProfile);return p as StoreProfile;
}
export function validateStorePhoto(file:{type:string;size:number;name:string}){if(!["image/jpeg","image/png"].includes(file.type)||file.size<1||file.size>5*1024*1024||file.name.length>200)invalid("사진은 JPG/PNG, 각 5MB 이내로 선택해 주세요.");}
export function businessHref(search:string,tab:"questions"|"stores"){
 const p=new URLSearchParams(search);for(const k of ["question","qa_write","qa_answer_offset","store","store_write"])p.delete(k);
 p.set("view","business");if(tab==="stores")p.set("business_tab","stores");else p.delete("business_tab");return "/market?"+p;
}
export function storeHref(search="",change:Record<string,string>={}){
 const p=new URLSearchParams(search);for(const k of ["question","qa_write","qa_answer_offset"])p.delete(k);
 p.set("view","business");p.set("business_tab","stores");for(const [k,v] of Object.entries(change)){if(v)p.set(k,v);else p.delete(k);}return "/market?"+p;
}
export function storeFilters(search:string){const p=new URLSearchParams(search),offset=Number(p.get("store_offset")??0),region=p.get("store_region")??"",status=p.get("store_status")??"",query=(p.get("store_q")??"").trim();if(!Number.isInteger(offset)||offset<0||offset>10000||query.length>100||(region&&!storeRegions.includes(region as typeof storeRegions[number]))||(status&&!Object.hasOwn(storeStatuses,status)))invalid("검색 조건을 확인해 주세요.");return {offset,region,status,query};}
export const storeMoney=(value:number|null)=>value===null?"미기재·비공개":value.toLocaleString("ko-KR")+"원";
export async function storeRpc<T>(client:SupabaseClient,name:string,args:Record<string,unknown>):Promise<T>{
 let r;try{r=await client.rpc(name,args);}catch{throw new StoreError("uncertain","결과를 확인하지 못했습니다. 같은 요청으로 확인해 주세요.");}
 if(r.error){const e=r.error;if(e.code==="PGRST202")throw new StoreError("unavailable","매장 저장 기능이 아직 연결되지 않았습니다. 입력을 보관해 주세요.");if(e.message?.includes("store_conflict"))throw new StoreError("conflict","다른 변경이 먼저 저장되었습니다. 입력을 보관하고 최신 글을 확인해 주세요.");if(e.code==="42501"||e.message?.startsWith("store_")||e.message?.startsWith("messaging_"))throw new StoreError("rejected","본인 글과 입력 내용·계정 상태를 확인해 주세요.");throw new StoreError("uncertain","결과가 불확실합니다. 같은 요청 결과를 확인해 주세요.");}
 if(r.data===undefined)throw new StoreError("uncertain","저장 결과를 확인하지 못했습니다.");return r.data as T;
}
