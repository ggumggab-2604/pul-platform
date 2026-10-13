"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { contentRpc,uuid } from "@/lib/courses/courseContent";
import { getInquiryRecipient,validateOperatingState,type OperatingState } from "@/lib/courses/courseSteward";
type Input={courseKey:string;viewerId:string;requestId:string;target:"information"|"story"|"media"|"report"|"inquiry";postKey?:string;action?:string;version?:number;updatedAt?:string;input:Record<string,unknown>};
export async function courseStewardAction(v:Input){
 try{
  if(!v||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v.courseKey)||!uuid.test(v.requestId))throw new Error("요청을 확인해 주세요.");
  const ctx=await getAuthenticatedSupabaseContext();if(!ctx||ctx.userId!==v.viewerId)return {ok:false as const,message:"로그인 상태를 확인해 주세요.",code:"42501"};
  let name:string,args:Record<string,unknown>;
  if(v.target==="information"){
   const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul"}).format(new Date());validateOperatingState(v.input.state as Omit<OperatingState,"can_manage">,today);
   name="course_management_save";args={p_course_key:v.courseKey,p_updated_at:v.updatedAt,p_request_id:v.requestId,p_input:v.input};
  }else if(v.target==="story"){name="course_story_mutate";args={p_course_key:v.courseKey,p_post_key:v.postKey??null,p_action:v.action,p_version:v.version??0,p_request_id:v.requestId,p_input:v.input};
  }else if(v.target==="media"){name="course_media_hide";args={p_course_key:v.courseKey,p_media_key:v.input.media_key,p_version:v.version,p_request_id:v.requestId};
  }else if(v.target==="report"){name="course_report_process";args={p_course_key:v.courseKey,p_report_id:v.input.id,p_updated_at:v.updatedAt,p_resolution:v.input.status,p_request_id:v.requestId};
  }else{name="course_inquiry_send";args={p_course_key:v.courseKey,p_body:v.input.body,p_request_id:v.requestId,p_recipient:v.input.user_id,p_version:v.version};}
  const result=await contentRpc<Record<string,unknown>>(ctx.supabase,name,args);
  revalidatePath("/courses");revalidatePath("/courses/"+v.courseKey,"layout");if(v.target==="inquiry")revalidatePath("/messages","layout");
  return {ok:true as const,message:v.target==="story"&&v.action==="pin"?"공지를 변경했습니다. 쪽지는 발송하지 않았습니다.":"저장했습니다.",data:result};
 }catch(e){const code=typeof e==="object"&&e&&"code" in e?String(e.code):"unknown";return {ok:false as const,message:e instanceof Error&&/[가-힣]/.test(e.message)?e.message:"처리 결과를 확인하지 못했습니다. 입력과 요청을 유지하고 다시 확인해 주세요.",code};}
}
export async function refreshInquiryRecipient(courseKey:string,viewerId:string){const ctx=await getAuthenticatedSupabaseContext();if(!ctx||ctx.userId!==viewerId)throw new Error("로그인을 확인해 주세요.");return getInquiryRecipient(ctx.supabase,courseKey);}
