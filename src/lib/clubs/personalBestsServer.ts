import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {getAuthenticatedSupabaseContext} from '@/lib/supabase/auth';
import type {BestCard,PersonalBestWorkspace} from './personalBests';
export async function loadPersonalBests(key:string,personId?:string):Promise<PersonalBestWorkspace> {
 const ctx=await getAuthenticatedSupabaseContext();
 if(!ctx)throw Error('로그인 후 현재 동호회 회원 자격을 확인해 주세요.');
 if(personId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(personId))throw Error('회원 기록을 확인해 주세요.');
 const {data,error}=await ctx.supabase.rpc('get_club_personal_bests',{p_club_key:key,p_person_id:personId??null});
 if(error)throw Error(error.code==='42501'?'현재 해당 동호회 회원만 기록을 조회할 수 있습니다.':'개인 최저타를 불러오지 못했습니다. 다시 시도해 주세요.');
 if(!data||data.clubKey!==key||!Array.isArray(data.items)||!Array.isArray(data.history)||!Array.isArray(data.missing)||!Array.isArray(data.excluded))throw Error('개인 최저타 응답을 확인할 수 없습니다.');
 return data;
}
export async function loadPersonalBestCards(key:string):Promise<BestCard[]> {
 const client=await createClient();const {data,error}=await client.rpc('get_club_personal_best_cards',{p_club_key:key});
 if(error||!Array.isArray(data))throw Error('개인 최저타를 불러오지 못했습니다.');
 return data.map((r:BestCard)=>({name:r.name,score:r.score,date:r.date,course:r.course,kind:r.kind,rank:r.rank,tied:r.tied}));
}
