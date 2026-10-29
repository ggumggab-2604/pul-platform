"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { ClubProfileError,getClubProfile,validateClubProfileInput } from "@/lib/clubs/clubProfile";
type Result={ok:true;publicKey:string;version:number}|{ok:false;error:string};
export async function saveClubProfileAction(input:{requestId:string;clubKey?:string;expectedVersion?:number;payload:unknown}):Promise<Result>{
 try{
  if(!input||typeof input.requestId!=="string"||!/^[0-9a-f-]{36}$/i.test(input.requestId))throw new ClubProfileError("요청 번호를 확인해 주세요.");
  const auth=await getAuthenticatedSupabaseContext();
  if(!auth)return{ok:false,error:"로그인 후 이용해 주세요."};
  const payload=validateClubProfileInput(input.payload),client=await createClient();
  const old=input.clubKey?await getClubProfile(client,input.clubKey):null;
  if(input.clubKey&&(!old?.can_manage||!Number.isSafeInteger(input.expectedVersion)))return{ok:false,error:"현재 동호회 정보를 수정할 권한이 없습니다."};
  const {data,error}=input.clubKey?await client.rpc("update_club_profile",{p_club_key:input.clubKey,p_expected_version:input.expectedVersion,p_request_id:input.requestId,p_payload:payload}):await client.rpc("register_club_profile",{p_request_id:input.requestId,p_payload:payload});
  if(error){const safe=/[가-힣]/.test(error.message)?error.message:"저장하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.";return{ok:false,error:safe};}
  if(!data||typeof data.public_key!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(data.public_key)||!Number.isSafeInteger(data.version))throw new ClubProfileError("저장 결과를 확인할 수 없습니다. 같은 요청으로 다시 확인해 주세요.");
  revalidatePath("/clubs");revalidatePath("/clubs/"+data.public_key);revalidatePath("/clubs/"+data.public_key+"/edit");revalidatePath("/courses");
  for(const key of new Set([...(old?.courses.map(c=>c.course_key)||[]),payload.field_course_key,payload.screen_course_key].filter(Boolean)))revalidatePath("/courses/"+key);
  return{ok:true,publicKey:data.public_key,version:data.version};
 }catch(e){return{ok:false,error:e instanceof ClubProfileError?e.message:"저장 상태를 확인할 수 없습니다. 입력을 유지했으니 같은 요청으로 다시 확인해 주세요."};}
}

