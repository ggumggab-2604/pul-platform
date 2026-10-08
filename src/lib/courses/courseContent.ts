import type { SupabaseClient } from "@supabase/supabase-js";
export type ResourceImage = { id: string; position: number };
export type CourseResource = { id:string; course_id:string; kind:"video"|"yardage";title:string;scope:string;description:string;video_url:string|null;reference_date:string|null;source:string|null;representative:boolean;version:number;created_at:string;author:string;can_edit:boolean;images:ResourceImage[];course_key?:string;course_name?:string;course_type?:"field"|"screen";can_manage?:boolean };
export type ResourcePage={items:CourseResource[];total:number;limit:number;offset:number};
export type CourseNotice={id:string;title:string;body:string;version:number;published_at:string;status?:string;published_version?:number;pending_input?:{title:string;body:string}|null};
export type ContentCounts={video:number;yardage:number;event:number};
export type CourseEvent={key:string;title:string;start:string|null;end:string|null;note:string|null;registration:string;phase:"cancelled"|"unknown"|"past"|"upcoming"|"ongoing"};
export type CourseOverview={counts:ContentCounts;resources:ResourcePage;events:CourseEvent[];notices:{items:CourseNotice[];total:number};contact_connected:boolean;manager:boolean;steward:boolean;can_broadcast:boolean};
export type ContentWorkspace={manager:boolean;notices:CourseNotice[];candidates:{id:string;name:string}[];recipient:{user_id:string|null;version:number}|null};
export const resourceButton="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-4 py-2 text-sm font-bold text-pul-deep hover:bg-pul-light";
export const resourceInput="min-h-12 w-full rounded-lg border border-pul-border bg-white px-3 py-2 text-base";
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function videoUrl(raw:string,screen:boolean){
 const u=new URL(raw.trim());if(!["http:","https:"].includes(u.protocol)||u.username||u.password||raw.length>1000)throw new Error("영상 링크를 확인해 주세요.");
 let id:string|null=null;const host=u.hostname.toLowerCase();
 if(host==="youtu.be")id=u.pathname.replace(/^\//,"").replace(/\/$/,"");
 else if(["youtube.com","www.youtube.com","m.youtube.com"].includes(host)){if(u.pathname==="/watch")id=u.searchParams.get("v");else id=u.pathname.match(/^\/(shorts|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[2]??null;}
 if(id&&/^[A-Za-z0-9_-]{11}$/.test(id))return "https://www.youtube.com/watch?v="+id;
 if(screen)throw new Error("유튜브 동영상 링크를 입력해 주세요. 채널 주소는 등록할 수 없습니다.");return u.href;
}
export async function contentRpc<T>(client:SupabaseClient,name:string,args:Record<string,unknown>):Promise<T>{const {data,error}=await client.rpc(name,args);if(error)throw Object.assign(new Error(error.code==="42501"?"로그인 상태와 이용 권한을 확인해 주세요.":error.code==="40001"?"내용이 변경되었습니다. 새로고침 후 다시 확인해 주세요.":error.message),{code:error.code});if(data===undefined)throw new Error("응답을 확인하지 못했습니다.");return data as T;}
export const getCourseOverview=(client:SupabaseClient,key:string)=>contentRpc<CourseOverview>(client,"course_content_overview",{p_course_key:key});
export const listCourseResources=(client:SupabaseClient,key:string,kind:string|null=null,offset=0)=>contentRpc<ResourcePage>(client,"course_content_list",{p_course_key:key,p_kind:kind,p_limit:12,p_offset:offset,p_featured:false});
export const getCourseResource=(client:SupabaseClient,id:string)=>contentRpc<CourseResource>(client,"course_content_detail",{p_id:id});
