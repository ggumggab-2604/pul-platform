import 'server-only';
import { getAuthenticatedSupabaseContext } from '@/lib/supabase/auth';
import type { MonthlyWorkspace } from './monthlyScores';
export async function loadMonthlyScores(clubKey: string, year: number, editor=false): Promise<MonthlyWorkspace & {viewerId:string}> {
 const context=await getAuthenticatedSupabaseContext();
 if(!context)throw Error('로그인 후 동호회 회원 자격을 확인해 주세요.');
 const {data,error}=await context.supabase.rpc('get_club_monthly_scores',{p_club_key:clubKey,p_year:year,p_editor:editor});
 if(error)throw Error(error.code==='42501'?'현재 동호회 회원만 조회할 수 있으며 회장·부회장만 수정할 수 있습니다.':'성적표를 불러오지 못했습니다. 다시 시도해 주세요.');
 if(!data || data.clubKey!==clubKey || !Array.isArray(data.sheets))throw Error('성적표 응답을 확인할 수 없습니다.');
 return {...data,viewerId:context.userId};
}
