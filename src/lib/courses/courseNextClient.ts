"use client";
import {courseNextAction} from "@/app/courses/nextActions";
/** Network/server-action transport can fail before the server handler runs. */
export async function safeCourseNextAction(input:Parameters<typeof courseNextAction>[0]){
 try{return await courseNextAction(input);}
 catch{return {ok:false as const,code:"unknown",message:"처리 결과를 확인하지 못했습니다. 입력을 보관했습니다. 같은 요청으로 다시 확인해 주세요."};}
}
