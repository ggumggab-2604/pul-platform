import type {SupabaseClient} from '@supabase/supabase-js';

export type ClubRoleSummary={member:boolean;role:'club_admin'|'club_vice_admin'|'club_member'|null;best:{personId:string;score:number;rank:number;tied:boolean;date:string;course:string;kind:'monthly'|'tournament'}|null;applications:number|null;inquiries:number|null};
export const clubRoleLabels={club_admin:'회장',club_vice_admin:'부회장',club_member:'회원'};
const count=(n:unknown)=>n===null||(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0);
export async function getClubRoleSummary(client:SupabaseClient,clubKey:string):Promise<ClubRoleSummary>{
 const {data,error}=await client.rpc('get_club_detail_role_summary',{p_club_key:clubKey});
 if(error||!data||typeof data.member!=='boolean'||!count(data.applications)||!count(data.inquiries)||!(data.role===null||Object.hasOwn(clubRoleLabels,data.role)))throw Error('내 활동과 처리 현황을 불러오지 못했습니다. 다시 확인해 주세요.');
 const b=data.best;
 if(b!==null&&(!data.member||!b||typeof b.personId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.personId)||!Number.isSafeInteger(b.score)||b.score<=0||!Number.isInteger(b.rank)||b.rank<1||typeof b.tied!=='boolean'||typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||typeof b.course!=='string'||!['monthly','tournament'].includes(b.kind)))throw Error('내 성적을 확인하지 못했습니다. 다시 확인해 주세요.');
 return {member:data.member,role:data.role,best:b===null?null:{personId:b.personId,score:b.score,rank:b.rank,tied:b.tied,date:b.date,course:b.course,kind:b.kind},applications:data.applications,inquiries:data.inquiries};
}
