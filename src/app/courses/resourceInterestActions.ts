"use server";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {setInterest} from "@/lib/interests/interests";
import {uuid,contentRpc} from "@/lib/courses/courseContent";
import {revalidatePath} from "next/cache";

async function context(viewer:string){
 const ctx=await getAuthenticatedSupabaseContext();
 if(!ctx||ctx.userId!==viewer)throw new Error("로그인 계정이 변경되었습니다. 다시 확인해 주세요.");
 return ctx.supabase;
}
export async function resourceInterestReads(viewer:string,ids:string[]):Promise<Record<string,boolean>>{
 if(!Array.isArray(ids)||ids.length<1||ids.length>24||new Set(ids).size!==ids.length||ids.some(id=>!uuid.test(id)))throw new Error("자료 조회 범위를 확인해 주세요.");
 const data=await contentRpc<Record<string,boolean>>(await context(viewer),"course_resource_interest_states",{p_ids:ids});
 if(!data||typeof data!=="object"||Array.isArray(data)||Object.entries(data).some(([id,v])=>!ids.includes(id)||typeof v!=="boolean"))throw new Error("자료 관심을 확인하지 못했습니다.");
 return data;
}
export async function resourceInterestSave(viewer:string,id:string,saved:boolean){
 const result=await setInterest(await context(viewer),"course_resource",id,saved);
 revalidatePath("/my");return result;
}
