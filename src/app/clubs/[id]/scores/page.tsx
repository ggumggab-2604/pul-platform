import Link from 'next/link';
import {loadTableComparisons} from '@/lib/clubs/scoreAveragesServer';
import {getAuthenticatedSupabaseContext} from '@/lib/supabase/auth';
import {MessagingSessionBoundary} from '@/components/messaging/MessagingSessionBoundary';
import {loadMonthlyScores} from '@/lib/clubs/monthlyScoresServer';
import {scorePeriod} from '@/lib/clubs/monthlyScores';
import {MonthlyScoresView} from '@/components/clubs/scores/MonthlyScoresView';
export const dynamic='force-dynamic';
export default async function ScoresPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{year?:string;month?:string;view?:string;sheet?:string}>}) {
 const {id}=await params, query=await searchParams;
 let p:ReturnType<typeof scorePeriod>,data,averages,viewerId;
 try{p=scorePeriod(query.year,query.month);const ctx=await getAuthenticatedSupabaseContext();if(!ctx)throw Error('로그인 후 동호회 회원 자격을 확인해 주세요.');viewerId=ctx.userId;data=await loadMonthlyScores(id,p.year);if(query.sheet&&data.sheets.find(s=>Number(s.date.slice(5,7))===p.month)?.id!==query.sheet)throw Error('선택한 경기와 월이 일치하지 않습니다. 원본 링크를 다시 확인해 주세요.');averages=await loadTableComparisons(id,'monthly',viewerId);}
 catch(e){return <section className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">월례회 성적</h1><p role="alert" className="my-4">{e instanceof Error?e.message:'성적표를 불러오지 못했습니다.'}</p><Link href={`/clubs/${encodeURIComponent(id)}`}>동호회로 돌아가기</Link></section>;}
 return <MessagingSessionBoundary viewerId={viewerId}><MonthlyScoresView key={`${data.year}-${p.month}-${query.view}`} data={data} month={p.month} annual={query.view==='annual'} comparisons={averages.comparisons} averageError={averages.error}/></MessagingSessionBoundary>;
}
