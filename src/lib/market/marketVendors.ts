import type { SupabaseClient } from "@supabase/supabase-js";
export const vendorFields = {restore:"채 복원",head:"헤드·타구면",grip:"그립",shaft:"샤프트",custom:"맞춤 제작",fit:"길이·무게 조정"} as const;
export type VendorField = keyof typeof vendorFields;
export const vendorServiceModes = {visit:"방문",delivery:"택배",onsite:"출장"} as const;
export type VendorServiceMode = keyof typeof vendorServiceModes;
export type VendorProfile = {name:string;region:string;area:string;primary:VendorField;fields:VendorField[];summary:string;services:string;before:string;photos:string[];businessRegistered?:boolean|null;hasWorkshop?:boolean|null;serviceModes?:VendorServiceMode[];website?:string};
export type Vendor = {id:string;profile:VendorProfile};
export type VendorWorkspace = {id:string;draft:VendorProfile;approved:VendorProfile|null;state:"draft"|"pending"|"approved"|"rejected";reason:string;visible:boolean;restricted:boolean;version:number};
export type VendorCommand = {id:string;requestId:string;version:number;operation:"save"|"submit"|"approve"|"reject"|"publish"|"hide"|"restrict"|"restore";profile?:VendorProfile;reason?:string};
export const vendorUuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const vendorHref=(id:string)=>`/market?view=care&provider=${encodeURIComponent(id)}`;
export class VendorError extends Error {constructor(public code:string,message:string){super(message);}}
export async function vendorRpc<T>(client:SupabaseClient,name:string,args:Record<string,unknown>):Promise<T>{
 let result; try {result=await client.rpc(name,args);} catch {throw new VendorError("uncertain","처리 결과가 불확실합니다. 같은 요청으로 다시 확인해 주세요.");}
 if(result.error){const e=result.error;const conflict=e.message.includes("conflict");const known=conflict||e.message.startsWith("vendor_")||e.code==="42501"||e.message.startsWith("messaging_");
 throw new VendorError(conflict?"conflict":known?"rejected":"uncertain",conflict?"다른 변경이 먼저 저장되었습니다. 입력을 보관한 뒤 최신 상태를 확인해 주세요.":known?"입력·소유권·검토 상태 또는 계정 권한을 확인해 주세요.":"결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");}
 return result.data as T;
}
export function validateVendorProfile(p:VendorProfile){
 if(!p||!Object.hasOwn(vendorFields,p.primary)||!Array.isArray(p.fields)||!p.fields.includes(p.primary)||p.fields.some(x=>!Object.hasOwn(vendorFields,x))||p.fields.length>6)throw new VendorError("invalid","주력 분야를 취급 분야에도 선택해 주세요.");
 for(const [key,max] of [["name",80],["region",80],["area",80],["summary",180],["services",2000],["before",2000]] as const) if(typeof p[key]!=="string"||!p[key].trim()||[...p[key]].length>max)throw new VendorError("invalid","업체 소개의 필수 항목과 글자 수를 확인해 주세요.");
 if(!Array.isArray(p.photos)||p.photos.length>5||p.photos.some(x=>!vendorUuid.test(x)))throw new VendorError("invalid","사진을 확인해 주세요.");
 for(const value of [p.businessRegistered,p.hasWorkshop])if(value!=null&&typeof value!=="boolean")throw new VendorError("invalid","업체 기본정보를 확인해 주세요.");
 if(p.serviceModes!==undefined&&(!Array.isArray(p.serviceModes)||p.serviceModes.length>3||new Set(p.serviceModes).size!==p.serviceModes.length||p.serviceModes.some(x=>!Object.hasOwn(vendorServiceModes,x))))throw new VendorError("invalid","서비스 방식을 확인해 주세요.");
 if(p.website!==undefined){
  if(typeof p.website!=="string"||p.website.length>500)throw new VendorError("invalid","홈페이지·공식 채널 주소를 확인해 주세요.");
  if(p.website){try{const url=new URL(p.website);if(!["http:","https:"].includes(url.protocol)||url.username||url.password||/\s/.test(p.website))throw Error();}catch{throw new VendorError("invalid","홈페이지·공식 채널은 http 또는 https 주소로 입력해 주세요.");}}
 }
}
