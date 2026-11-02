import 'server-only';
import {createClient} from '@/lib/supabase/server';
import type {BestCard} from './personalBests';
function cards(data:unknown):BestCard[] {
  if(!Array.isArray(data))throw Error('최저타 응답을 확인할 수 없습니다.');
  return data.map(r=>{
    if(!r||typeof r.name!=='string'||typeof r.course!=='string'||typeof r.date!=='string'||!Number.isSafeInteger(r.score)||r.score<1||!Number.isSafeInteger(r.rank)||r.rank<1||typeof r.tied!=='boolean'||!['monthly','tournament'].includes(r.kind))throw Error('최저타 응답을 확인할 수 없습니다.');
    return {name:r.name,score:r.score,rank:r.rank,tied:r.tied,date:r.date,course:r.course,kind:r.kind};
  });
}
export async function loadCoursePersonalBestCards(courseKey:string) {
  const client=await createClient(),{data,error}=await client.rpc('get_course_personal_best_cards',{p_course_key:courseKey});
  if(error)throw Error('이 구장 최저타를 불러오지 못했습니다.');
  return cards(data);
}
export async function loadNationalPersonalBests(limit:number,offset:number):Promise<{total:number;items:BestCard[]}> {
  const client=await createClient(),{data,error}=await client.rpc('get_national_personal_bests',{p_limit:limit,p_offset:offset});
  if(error||!data||!Number.isSafeInteger(data.total)||data.total<0)throw Error('전국 최저타를 불러오지 못했습니다.');
  return {total:data.total,items:cards(data.items)};
}
