import 'server-only';
import {getAuthenticatedSupabaseContext} from '@/lib/supabase/auth';
import {tableComparisonMap,uniqueOriginals,type AverageSources,type ScoreKind} from './scoreAverages';
export class AverageAccessError extends Error {}
function accessFailure(value:unknown){
 if(!value||typeof value!=='object')return false;
 const {status,code}=value as {status?:number;code?:string};
 return status===401||status===403||code==='42501'||/^28|^PGRST30[123]$/.test(code??'');
}
export async function loadAverageSources(clubKey:string,personId?:string,allMembers=false):Promise<AverageSources>{
 const ctx=await getAuthenticatedSupabaseContext();if(!ctx)throw new AverageAccessError('로그인 후 현재 동호회 회원 자격을 확인해 주세요.');
 const {data,error,status}=await ctx.supabase.rpc('get_club_score_average_sources',{p_club_key:clubKey,p_person_id:personId??null,p_all_members:allMembers});
 if(error){if(accessFailure({...error,status}))throw new AverageAccessError('현재 해당 동호회 회원만 공인 성적을 볼 수 있습니다.');throw Error('공인 평균과 최근 성적을 불러오지 못했습니다. 다시 시도해 주세요.');}
 if(!data||data.clubKey!==clubKey||data.viewerId!==ctx.userId||!Array.isArray(data.records))throw new AverageAccessError('공인 성적 응답을 확인할 수 없습니다.');
 return {...data,records:uniqueOriginals(data.records)};
}
export async function loadTableComparisons(clubKey:string,kind:ScoreKind,viewerId:string){
 try{const sources=await loadAverageSources(clubKey,undefined,true);if(sources.viewerId!==viewerId)throw new AverageAccessError('로그인 상태가 변경되었습니다. 다시 확인해 주세요.');return {comparisons:tableComparisonMap(sources.records,kind),error:undefined};}
 catch(e){if(e instanceof AverageAccessError||accessFailure(e))throw e;return {comparisons:undefined,error:'비교 평균을 불러오지 못했습니다. 원본 성적은 아래에서 확인할 수 있습니다.'};}
}
