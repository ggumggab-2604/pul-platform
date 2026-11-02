'use server';
import { getAuthenticatedSupabaseContext } from '@/lib/supabase/auth';
import { revalidatePath } from 'next/cache';
import type { ScoreSheet } from '@/lib/clubs/monthlyScores';
export async function saveMonthlyScores(clubKey:string,requestId:string,sheet:ScoreSheet) {
 try {
  const context=await getAuthenticatedSupabaseContext();
  if(!context)return {error:'로그인 상태를 다시 확인해 주세요.'};
  const {data,error}=await context.supabase.rpc('save_club_monthly_scores',{p_club_key:clubKey,p_request_id:requestId,p_payload:sheet});
  if(error)return {error:error.code==='42501'?'현재 동호회 회장·부회장만 수정할 수 있습니다.':error.code==='PT409'?error.message:error.code==='40001'?'다른 수정이 먼저 저장되었습니다. 최신 성적표를 확인한 뒤 다시 수정해 주세요.':error.code==='23505'?'이미 저장된 월이거나 중복 참가자입니다. 기존 성적표와 참가자를 확인해 주세요.':error.code==='22023'?error.message:['22007','22008','23514','22P02','22003'].includes(error.code)?'날짜·참가자·총타수의 입력 형식을 확인해 주세요.':'저장하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.'};
  revalidatePath(`/clubs/${encodeURIComponent(clubKey)}/scores`);
  revalidatePath(`/clubs/${encodeURIComponent(clubKey)}/ranking`,'layout');
  revalidatePath(`/clubs/${encodeURIComponent(clubKey)}`);
   revalidatePath("/courses/[id]","page");
   revalidatePath("/hall-of-fame/lowest");
  return {id:data.id as string};
 }catch{return {error:'연결을 확인한 뒤 다시 저장해 주세요. 입력은 유지됩니다.'};}
}
