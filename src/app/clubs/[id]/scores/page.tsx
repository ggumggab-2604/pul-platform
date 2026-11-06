import Link from 'next/link';
import {loadTableComparisons} from '@/lib/clubs/scoreAveragesServer';
import {MessagingSessionBoundary} from '@/components/messaging/MessagingSessionBoundary';
import {loadMonthlyScores} from '@/lib/clubs/monthlyScoresServer';
import {scorePeriod,selectScoreSheet} from '@/lib/clubs/monthlyScores';
import {MonthlyScoresView} from '@/components/clubs/scores/MonthlyScoresView';
import {MonthlyMedalsView} from '@/components/clubs/scores/MonthlyMedalsView';
export const dynamic='force-dynamic';
export default async function ScoresPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{year?:string;month?:string;view?:string;sheet?:string;game?:string;from?:string}>}) {
 const {id}=await params, query=await searchParams;
 const game=query.game==='field'||query.game==='screen'?query.game:undefined;
 let p:ReturnType<typeof scorePeriod>,data,averages,sheet;
 try{
  p=scorePeriod(query.year,query.month);
  data=await loadMonthlyScores(id,p.year);
  if(query.view!=='medals'){
   sheet=selectScoreSheet(data.sheets,p.month,query.sheet,game);
   if(query.sheet&&!sheet)throw Error('선택한 경기와 월이 일치하지 않습니다. 원본 링크를 다시 확인해 주세요.');
   averages=await loadTableComparisons(id,'monthly',data.viewerId);
  }
 }
 catch(e){return <section className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">월례회 성적</h1><p role="alert" className="my-4">{e instanceof Error?e.message:'성적표를 불러오지 못했습니다.'}</p><Link href={`/clubs/${encodeURIComponent(id)}`}>동호회로 돌아가기</Link></section>;}
 if(query.view==='medals')return <MonthlyMedalsView data={data} month={p.month} game={game??'field'}/>;
 return <MessagingSessionBoundary viewerId={data.viewerId}><MonthlyScoresView key={`${data.year}-${p.month}-${query.view}-${game}-${sheet?.id}`} data={data} month={p.month} sheet={sheet} game={game} annual={query.view==='annual'} fromMedals={query.from==='medals'} comparisons={averages?.comparisons} averageError={averages?.error}/></MessagingSessionBoundary>;
}
