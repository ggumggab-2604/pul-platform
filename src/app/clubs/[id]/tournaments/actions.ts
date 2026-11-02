'use server';
import {getAuthenticatedSupabaseContext} from '@/lib/supabase/auth';
import {revalidatePath} from 'next/cache';
type Operation='save'|'intent'|'news'|'confirm'|'comment'|'pin';
const operations={save:'save_club_tournament',intent:'register_tournament_intent',news:'save_tournament_award_news',confirm:'confirm_tournament_award_news',comment:'comment_tournament_award',pin:'pin_tournament_award'} as const;
export async function tournamentAction(operation:Operation,key:string,requestId:string,payload:Record<string,unknown>):Promise<{id?:string;error?:string;conflict?:boolean}>{
 try{const ctx=await getAuthenticatedSupabaseContext();if(!ctx)return {error:'로그인 상태를 다시 확인해 주세요.'};if(!Object.hasOwn(operations,operation))return {error:'요청을 확인해 주세요.'};
 const args=operation==='comment'?{p_request_id:requestId,p_news_id:payload.id,p_body:payload.body}:operation==='pin'?{p_news_id:payload.id,p_scope:payload.scope,p_pin:payload.pin}:{p_request_id:requestId,p_payload:payload,...(['save','intent'].includes(operation)?{p_club_key:key}:{})};
 const {data,error}=await ctx.supabase.rpc(operations[operation],args);
 if(error)return {error:['PT409','40001'].includes(error.code)?'다른 수정이 먼저 저장되었습니다. 입력값은 유지됩니다. 최신 내용을 새 창에서 확인하고 다시 불러와 주세요.':error.code==='42501'?'현재 계정·동호회 회원·등록 권한을 다시 확인해 주세요.':error.code==='22023'?error.message:['23514','23502','22P02','22003','22007','22008','23505'].includes(error.code)?'필수 항목·날짜·순위·타수·중복 참가자를 확인해 주세요.':'저장하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.',conflict:['PT409','40001'].includes(error.code)};
 revalidatePath(`/clubs/${encodeURIComponent(key)}/tournaments`);revalidatePath('/hall-of-fame/awards','layout');return {id:data?.id};
 }catch{return {error:'연결을 확인한 뒤 다시 저장해 주세요. 입력값은 유지됩니다.'};}
}
