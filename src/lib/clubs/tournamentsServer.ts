import 'server-only';
import {getAuthenticatedSupabaseContext} from '@/lib/supabase/auth';
import {createClient} from '@/lib/supabase/server';
import type {AwardNews,TournamentWorkspace} from './tournaments';
export async function loadTournaments(key:string):Promise<TournamentWorkspace>{const ctx=await getAuthenticatedSupabaseContext();if(!ctx)throw Error('로그인 후 동호회 회원 자격을 확인해 주세요.');const r=await ctx.supabase.rpc('get_club_tournaments',{p_club_key:key});if(r.error)throw Error(r.error.code==='42501'?'현재 해당 동호회 회원만 성적표를 조회할 수 있습니다.':'대회 성적을 불러오지 못했습니다. 다시 시도해 주세요.');return r.data;}
export async function loadAwardNews(club?:string,course?:string,id?:string):Promise<AwardNews[]>{const supabase=await createClient();const r=await supabase.rpc('get_tournament_award_news',{p_club_key:club??null,p_course_key:course??null,p_news_id:id??null});if(r.error)throw Error('수상 소식을 불러오지 못했습니다.');return r.data;}
