import type { SupabaseClient } from "@supabase/supabase-js";
export const vendorFields = {restore:"채 복원",head:"헤드·타구면",grip:"그립",shaft:"샤프트",custom:"맞춤 제작",fit:"길이·무게 조정"} as const;
export type VendorField = keyof typeof vendorFields;
export const vendorServiceModes = {visit:"방문",delivery:"택배",onsite:"출장"} as const;
export type VendorServiceMode = keyof typeof vendorServiceModes;
export const vendorLinkLabels = {website:"홈페이지", blog:"블로그", youtube:"유튜브"} as const;
type VendorLink = keyof typeof vendorLinkLabels;
export type VendorProfile = {name:string;region:string;area:string;primary:VendorField;fields:VendorField[];summary:string;services:string;before:string;photos:string[];businessRegistered?:boolean|null;hasWorkshop?:boolean|null;serviceModes?:VendorServiceMode[];website?:string;publicLinks?:Partial<Record<VendorLink,string>>};
export type Vendor = {id:string;profile:VendorProfile};
export type VendorWorkspace = {id:string;draft:VendorProfile;approved:VendorProfile|null;state:"draft"|"pending"|"approved"|"rejected";reason:string;visible:boolean;restricted:boolean;version:number};
export type VendorCommand = {id:string;requestId:string;version:number;operation:"save"|"submit"|"approve"|"reject"|"publish"|"hide"|"restrict"|"restore";profile?:VendorProfile;reason?:string};
export const vendorUuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const vendorHref=(id:string)=>`/market?view=care&provider=${encodeURIComponent(id)}`;
export class VendorError extends Error {constructor(public code:string,message:string){super(message);}}
export async function vendorRpc<T>(client:SupabaseClient,name:string,args:Record<string,unknown>):Promise<T>{
 let result; try {result=await client.rpc(name,args);} catch {throw new VendorError("uncertain","처리 결과가 불확실합니다. 같은 요청으로 다시 확인해 주세요.");}
 if(result.error){const e=result.error;const conflict=e.message.includes("conflict")||e.code==="23505";const known=conflict||e.message.startsWith("vendor_")||e.code==="42501"||e.message.startsWith("messaging_");
 throw new VendorError(conflict?"conflict":known?"rejected":"uncertain",conflict?"다른 변경이 먼저 저장되었습니다. 입력을 보관한 뒤 최신 상태를 확인해 주세요.":known?"입력·소유권·검토 상태 또는 계정 권한을 확인해 주세요.":"결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");}
 return result.data as T;
}
export function vendorSummary(introduction:string){
 const chars=[...introduction.trim().replace(/\s+/g," ")];
 return chars.length>180?chars.slice(0,179).join("")+"…":chars.join("");
}
export function vendorIntroduction(p:VendorProfile){
 if(p.summary===vendorSummary(p.services)||p.summary===p.services)return p.services;
 return [p.summary,p.services].filter(Boolean).join("\n\n");
}
export function isVendorPublicLink(value:string){
 if(value.length>500||!/^https:\/\/[^/@\s\\:?#]+(?::[0-9]{1,5})?(?:[/?#][^\s\\]*)?$/iu.test(value))return false;
 try{return Boolean(new URL(value).hostname);}catch{return false;}
}
export function vendorFormErrors(p:VendorProfile){
 return {
  name:!p.name.trim()?"업체명을 입력해 주세요.":"",
  region:!p.region.trim()?"소재 지역을 입력해 주세요.":"",
  fields:!p.fields.length?"취급 작업을 하나 이상 선택해 주세요.":"",
  services:!p.services.trim()?"업체 소개를 입력해 주세요.":"",
  publicLinks:Object.values(p.publicLinks??{}).some(url=>url&&!isVendorPublicLink(url.trim()))?"https://로 시작하는 주소를 입력해 주세요.":"",
 };
}
export function validateVendorProfile(p:VendorProfile){
 if(!p||!Object.hasOwn(vendorFields,p.primary)||!Array.isArray(p.fields)||!p.fields.includes(p.primary)||p.fields.some(x=>!Object.hasOwn(vendorFields,x))||p.fields.length>6||new Set(p.fields).size!==p.fields.length)throw new VendorError("invalid","취급 작업을 확인해 주세요.");
 for(const [key,max,required] of [["name",80,true],["region",80,true],["area",80,false],["summary",180,true],["services",2182,true],["before",2000,false]] as const) if(typeof p[key]!=="string"||(required&&!p[key].trim())||[...p[key]].length>max)throw new VendorError("invalid","업체 소개의 필수 항목과 글자 수를 확인해 주세요.");
 if(!Array.isArray(p.photos)||p.photos.length>5||p.photos.some(x=>!vendorUuid.test(x)))throw new VendorError("invalid","사진을 확인해 주세요.");
 if(p.publicLinks!==undefined&&(!p.publicLinks||typeof p.publicLinks!=="object"||Array.isArray(p.publicLinks)||Object.entries(p.publicLinks).some(([key,url])=>!Object.hasOwn(vendorLinkLabels,key)||typeof url!=="string"||!isVendorPublicLink(url))))throw new VendorError("invalid","공개 링크는 https:// 주소로 입력해 주세요.");
 for(const value of [p.businessRegistered,p.hasWorkshop])if(value!=null&&typeof value!=="boolean")throw new VendorError("invalid","업체 기본정보를 확인해 주세요.");
 if(p.serviceModes!==undefined&&(!Array.isArray(p.serviceModes)||p.serviceModes.length>3||new Set(p.serviceModes).size!==p.serviceModes.length||p.serviceModes.some(x=>!Object.hasOwn(vendorServiceModes,x))))throw new VendorError("invalid","서비스 방식을 확인해 주세요.");
 if(p.website!==undefined){
  if(typeof p.website!=="string"||p.website.length>500)throw new VendorError("invalid","홈페이지·공식 채널 주소를 확인해 주세요.");
  if(p.website){try{const url=new URL(p.website);if(!["http:","https:"].includes(url.protocol)||url.username||url.password||/\s/.test(p.website))throw Error();}catch{throw new VendorError("invalid","홈페이지·공식 채널은 http 또는 https 주소로 입력해 주세요.");}}
 }
}
