import 'server-only';
import {getAuthenticatedSupabaseContext} from '@/lib/supabase/auth';
import type {PracticeWorkspace} from './records';
export async function loadPracticeRecords(recordId?:string,expectedViewerId?:string):Promise<PracticeWorkspace>{
 const ctx=await getAuthenticatedSupabaseContext();if(!ctx||expectedViewerId&&ctx.userId!==expectedViewerId)throw Error('로그인 상태가 변경되었습니다. 다시 로그인해 주세요.');
 const {data,error}=await ctx.supabase.rpc('get_my_practice_records',{p_record_id:recordId??null});
 if(error)throw Error(error.code==='42501'?'활성 계정으로 본인의 연습기록만 이용할 수 있습니다.':'연습기록을 불러오지 못했습니다. 다시 시도해 주세요.');
 if(!data||data.viewerId!==ctx.userId||!Array.isArray(data.records))throw Error('연습기록 응답을 확인할 수 없습니다.');
 return data;
}
