"use server";
import {revalidatePath} from "next/cache";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {contentRpc} from "@/lib/courses/courseContent";
export async function setEventOccurrence(eventKey:string,status:string,version:number){try{const ctx=await getAuthenticatedSupabaseContext();if(!ctx)throw Error("로그인 후 다시 시도해 주세요.");await contentRpc(ctx.supabase,"course_content_event_occurrence",{p_event_key:eventKey,p_status:status,p_version:version});revalidatePath("/events/manage/"+eventKey);revalidatePath("/courses","layout");return {ok:true,message:"개최 상태를 저장했습니다."};}catch(e){return {ok:false,message:e instanceof Error?e.message:"저장하지 못했습니다."};}}
