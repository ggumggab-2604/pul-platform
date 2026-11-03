'use server';
import {getAuthenticatedSupabaseContext} from '@/lib/supabase/auth';
import {loadPracticeRecords} from '@/lib/practice/server';
import {practiceErrors,type PracticeDraft,type PracticeWorkspace} from '@/lib/practice/records';
export async function refreshPractice(viewerId:string):Promise<{data?:PracticeWorkspace;error?:string}>{try{return {data:await loadPracticeRecords(undefined,viewerId)};}catch(e){return {error:e instanceof Error?e.message:'기록을 불러오지 못했습니다.'};}}
export async function mutatePractice(viewerId:string,requestId:string,operation:'create'|'update'|'delete',payload:PracticeDraft|{id:string;version:number}):Promise<{data?:PracticeWorkspace;error?:string;conflict?:boolean;saved?:boolean;id?:string}>{
 const ctx=await getAuthenticatedSupabaseContext();if(!ctx||ctx.userId!==viewerId)return {error:'로그인 상태가 변경되었습니다. 다시 로그인해 주세요.'};
 if(!['create','update','delete'].includes(operation)||!payload||typeof payload!=='object'||!/^[0-9a-f-]{36}$/i.test(requestId))return {error:'저장 요청을 확인해 주세요.'};
 if(operation!=='delete'){
  const r=payload as PracticeDraft;
  if(typeof r.date!=='string'||typeof r.course!=='string'||typeof r.memo!=='string'||typeof r.condition!=='string'||typeof r.score!=='number')return {error:'입력 내용을 확인해 주세요.'};
  const errors=practiceErrors(r);if(errors.length)return {error:errors.join(' ')};
 }
 const result=await ctx.supabase.rpc('mutate_my_practice_record',{p_request_id:requestId,p_operation:operation,p_payload:payload});
 if(result.error)return {conflict:result.error.code==='PT409',error:result.error.code==='PT409'?'다른 수정이 먼저 저장되었습니다. 입력을 유지했으니 최신 기록을 확인해 주세요.':result.error.code==='42501'?'본인의 연습기록만 변경할 수 있습니다. 계정 상태를 확인해 주세요.':result.error.code==='22023'||result.error.code==='22008'||result.error.code==='22P02'?'경기일·구장·경기 조건·타수를 확인해 주세요. 입력은 유지됩니다.':'저장 응답을 확인하지 못했습니다. 입력을 유지했으니 같은 내용으로 다시 시도해 주세요.'};
 try{return {data:await loadPracticeRecords(undefined,viewerId),saved:true,id:result.data.id};}
 catch{return {saved:true,error:'저장은 완료됐지만 목록을 불러오지 못했습니다. 같은 요청으로 다시 확인해 주세요.'};}
}
