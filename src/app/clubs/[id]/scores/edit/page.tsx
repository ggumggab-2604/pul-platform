import Link from 'next/link';
import {loadMonthlyScores} from '@/lib/clubs/monthlyScoresServer';
import {scorePeriod,selectScoreSheet} from '@/lib/clubs/monthlyScores';
import {MonthlyScoresEditor} from '@/components/clubs/scores/MonthlyScoresEditor';
import {MessagingSessionBoundary} from '@/components/messaging/MessagingSessionBoundary';
export const dynamic='force-dynamic';
export default async function EditScoresPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{year?:string;month?:string;sheet?:string;mode?:string}>}) {
 const {id}=await params,query=await searchParams;
 let p,data,saved; try{
  p=scorePeriod(query.year,query.month);data=await loadMonthlyScores(id,p.year,true);
  saved=query.mode==='new'&&!query.sheet?undefined:selectScoreSheet(data.sheets,p.month,query.sheet);
  if(query.sheet&&!saved)throw Error('선택한 경기와 월이 일치하지 않습니다.');
 }
 catch(e){return <section className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">월례회 성적 입력</h1><p role="alert" className="my-4">{e instanceof Error?e.message:'입력 화면을 불러오지 못했습니다.'}</p><Link href={`/clubs/${encodeURIComponent(id)}/scores`}>성적표로 돌아가기</Link></section>;}
 return <MessagingSessionBoundary viewerId={data.viewerId}><MonthlyScoresEditor key={`${data.viewerId}-${id}-${p.year}-${p.month}-${saved?.id??'new'}`} data={data} month={p.month} saved={saved}/></MessagingSessionBoundary>;
}
