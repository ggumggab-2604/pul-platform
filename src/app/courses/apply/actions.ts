"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { listPublicCourses } from "@/lib/courses/courseDirectory";
import { findCourseDuplicateCandidates, parseManagedCourse } from "@/lib/courses/courseManagement";
import type { ApplicationCommand, ApplicationWorkspace, CourseApplication } from "@/lib/courses/courseApplications";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function message(e: unknown) { return e instanceof Error ? e.message : "요청을 처리하지 못했습니다. 다시 확인해 주세요."; }
async function context(){const c=await getAuthenticatedSupabaseContext();if(!c)throw new Error("로그인이 필요합니다.");return c;}
function rpcError(e: {code?:string;message?:string}) {
  if(e.code==="40001") return new Error(e.message||"내용이 변경되었습니다. 최신 내용을 다시 확인해 주세요.");
  if(["42501","22023","23505","23514","P0002"].includes(e.code||""))return new Error(e.message||"권한과 입력 내용을 확인해 주세요.");
  return new Error("연결 결과를 확인하지 못했습니다. 새로고침하여 상태를 확인하거나 같은 요청으로 다시 시도해 주세요.");
}
export async function loadCourseApplications(manage=false,offset=0){
  try {
    if(typeof manage!=="boolean"||!Number.isInteger(offset)||offset<0||offset>10000)throw new Error("목록 범위를 확인해 주세요.");
    const c=await context();const {data,error}=await c.supabase.rpc("read_course_application_workspace",{p_manage:manage,p_offset:offset});if(error)throw rpcError(error);
    if(!data||!Array.isArray(data.items)||!Array.isArray(data.managed))throw new Error("신청 응답을 확인하지 못했습니다.");
    const result:ApplicationWorkspace={items:data.items.slice(0,20).map((r:CourseApplication & {currentCourse:unknown})=>({...r,currentCourse:r.currentCourse?parseManagedCourse(r.currentCourse):null})),managed:data.managed.map(parseManagedCourse),canManage:data.canManage===true,hasMore:data.items.length>20};
    return {ok:true as const,data:result};
  }catch(e){return {ok:false as const,message:message(e)};}
}
export async function courseApplicationAccess(){const c=await getAuthenticatedSupabaseContext();if(!c)return false;const {data,error}=await c.supabase.rpc("read_course_application_workspace",{p_manage:false,p_offset:0});return !error&&data?.canManage===true;}
export async function searchApplicationCourses(keyword:string,offset=0){
  try{const c=await context();if(typeof keyword!=="string"||keyword.trim().length<2||keyword.length>100||!Number.isInteger(offset)||offset<0||offset>10000)throw new Error("구장명 또는 주소를 2자 이상 입력해 주세요.");
    return {ok:true as const,page:await listPublicCourses(c.supabase,{keyword:keyword.trim()},20,offset)};
  }catch(e){return {ok:false as const,message:message(e)};}
}
export async function applicationDuplicates(id:string){
  try{if(!uuid.test(id))throw new Error("신청을 확인해 주세요.");const c=await context();const {data,error}=await c.supabase.rpc("read_course_application_workspace",{p_manage:true,p_offset:0,p_id:id});if(error)throw rpcError(error);const r=data.items[0];
    return {ok:true as const,items:await findCourseDuplicateCandidates(c.supabase,{name:r.draft.name,city:r.draft.city,region:r.draft.region})};
  }catch(e){return {ok:false as const,message:message(e)};}
}
export async function mutateCourseApplication(command:ApplicationCommand){
  try{
    if(!command||!uuid.test(command.id)||!uuid.test(command.requestId)||!Number.isInteger(command.version)||command.version<0||!command.input||JSON.stringify(command.input).length>16000)throw new Error("입력 내용을 확인해 주세요.");
    const c=await context();const managed=["approve","supplement","reject","revoke"].includes(command.action);
    // Read authorization repeats at the server boundary; transactional RPC repeats all checks.
    const access=await c.supabase.rpc("read_course_application_workspace",{p_manage:managed,p_offset:0,p_id:command.action==="submit"?null:command.id});if(access.error)throw rpcError(access.error);
    if(command.action==="submit"&&command.input.kind==="edit"&&!access.data.managed.some((r:{course_key:string})=>r.course_key===command.input.courseKey))throw new Error("승인된 자기 구장만 수정 신청할 수 있습니다.");
    const {data,error}=await c.supabase.rpc("mutate_course_application",{p_id:command.id,p_action:command.action,p_version:command.version,p_request_id:command.requestId,p_input:command.input});if(error)throw rpcError(error);
    revalidatePath("/courses");revalidatePath("/courses/applications");revalidatePath("/courses/manage/applications");revalidatePath("/courses/[id]","page");return {ok:true as const,data};
  }catch(e){return {ok:false as const,message:message(e)};}
}
