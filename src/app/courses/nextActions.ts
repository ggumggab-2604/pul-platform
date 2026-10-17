"use server";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {revalidatePath} from "next/cache";
import {interestPolicy,sharedPolicy} from "@/lib/courses/courseNext";
type Command = {op:"choiceList"|"choiceRead"|"choice"|"operators"|"lookup"|"invite"|"invitations"|"resolve"|"threads"|"thread"|"send";course?:string;id?:string;code?:string;kind?:string;requestId?:string;body?:string;version?:number;enabled?:boolean;mark?:boolean;offset?:number};
export async function courseNextAction(v:Command) {
 try {
  if(!v||JSON.stringify(v).length>18000)throw new Error("요청을 확인해 주세요.");
  const c=await getAuthenticatedSupabaseContext();if(!c)return {ok:false as const,code:"42501",message:"로그인이 필요합니다."};
  let name:string,args:Record<string,unknown>;
  switch(v.op){
   case "choiceList":name="course_interest_list";args={p_offset:v.offset??0};break;
   case "choiceRead":name="course_interest_read";args={p_course_key:v.course};break;
   case "choice":name="course_interest_choose";args={p_course_key:v.course,p_enabled:v.enabled,p_policy:interestPolicy,p_request_id:v.requestId};break;
   case "operators":name="course_operator_read";args={p_course_key:v.course};break;
   case "lookup":name="course_operator_lookup";args={p_course_key:v.course,p_code:v.code};break;
   case "invite":name="course_operator_invite";args={p_course_key:v.course,p_code:v.code,p_kind:v.kind,p_request_id:v.requestId};break;
   case "invitations":name="course_my_invitations";args={};break;
   case "resolve":name="course_invitation_resolve";args={p_id:v.id,p_action:v.kind,p_request_id:v.requestId};break;
   case "threads":name="course_shared_list";args={p_course_key:v.course??null,p_offset:v.offset??0};break;
   case "thread":name="course_shared_read";args={p_thread:v.id,p_mark:!!v.mark};break;
   case "send":name="course_shared_send";args={p_course_key:v.course,p_thread:v.id??null,p_body:v.body,p_version:v.version??0,p_policy:sharedPolicy,p_request_id:v.requestId};break;
   default:throw new Error("요청을 확인해 주세요.");
  }
  const {data,error}=await c.supabase.rpc(name,args);
  if(error)return {ok:false as const,code:error.code,message:["PT409","42501","22023","P0001","P0002","23505"].includes(error.code)?error.message:"처리 결과를 확인하지 못했습니다. 입력과 요청을 보관하고 같은 요청으로 확인해 주세요."};
  if(["choice","invite","resolve","send"].includes(v.op)){revalidatePath("/courses","layout");revalidatePath("/messages","layout");revalidatePath("/my","layout");}
  return {ok:true as const,data};
 }catch{return {ok:false as const,code:"unknown",message:"처리 결과를 확인하지 못했습니다. 입력과 요청을 보관하고 같은 요청으로 확인해 주세요."};}
}
