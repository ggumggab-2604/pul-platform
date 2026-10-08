"use server";
import {revalidatePath} from "next/cache";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {getPublicCourse} from "@/lib/courses/courseDirectory";
import {contentRpc,videoUrl,uuid} from "@/lib/courses/courseContent";
export type ContentActionInput={courseKey:string;target:"resource"|"notice"|"recipient"|"inquiry"|"broadcast";action?:string;id?:string|null;version?:number;requestId:string;input?:Record<string,unknown>};
export async function courseContentAction(value:ContentActionInput):Promise<{ok:boolean;message:string;id?:string}>{
 try{
  if(!value||!uuid.test(value.requestId)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value.courseKey))throw new Error("요청 내용을 확인해 주세요.");
  const ctx=await getAuthenticatedSupabaseContext();if(!ctx)return {ok:false,message:"로그인 후 다시 시도해 주세요."};
  const course=await getPublicCourse(ctx.supabase,value.courseKey);const input={...(value.input??{})};let name:string;let args:Record<string,unknown>;
  if(value.target==="resource"||value.target==="notice"){
   if(value.target==="resource"&&value.action==="save"&&input.kind==="video")input.video_url=videoUrl(String(input.video_url??""),course.courseType==="screen");
   name=value.target==="resource"?"course_content_mutate":"course_content_notice_mutate";
   args={p_course_key:course.courseKey,p_action:value.action,p_id:value.id??null,p_version:value.version??0,p_request_id:value.requestId,p_input:input};
  }else if(value.target==="recipient"){name="course_content_set_recipient";args={p_course_key:course.courseKey,p_user_id:input.user_id||null,p_version:value.version??0,p_request_id:value.requestId};
  }else if(value.target==="inquiry"){name="course_content_send_inquiry";args={p_course_key:course.courseKey,p_body:input.body,p_request_id:value.requestId};
  }else if(value.target==="broadcast"){name="course_content_notice_send";args={p_id:value.id,p_version:value.version,p_request_id:value.requestId};
  }else throw new Error("작업을 확인해 주세요.");
  const result=await contentRpc<{id?:string}>(ctx.supabase,name,args);
  revalidatePath("/courses");revalidatePath("/courses/"+course.courseKey);revalidatePath("/courses/"+course.courseKey+"/resources");revalidatePath("/courses/"+course.courseKey+"/notices");revalidatePath("/courses/"+course.courseKey+"/content/manage");if(value.id)revalidatePath("/courses/"+course.courseKey+"/resources/"+value.id);
  return {ok:true,message:value.target==="broadcast"?"운영알림 발송 결과를 확인했습니다.":value.target==="inquiry"?"쪽지를 보냈습니다. 내 쪽지함에서 답장을 확인하세요.":"저장했습니다.",id:result?.id};
 }catch(e){return {ok:false,message:e instanceof Error?e.message:"처리하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요."};}
}
