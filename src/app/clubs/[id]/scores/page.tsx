import Link from 'next/link';
import {loadMonthlyScores} from '@/lib/clubs/monthlyScoresServer';
import {scorePeriod} from '@/lib/clubs/monthlyScores';
import {MonthlyScoresView} from '@/components/clubs/scores/MonthlyScoresView';
export const dynamic='force-dynamic';
export default async function ScoresPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{year?:string;month?:string;view?:string}>}) {
 const {id}=await params, query=await searchParams;
 let p,data;
 try{p=scorePeriod(query.year,query.month);data=await loadMonthlyScores(id,p.year);}
 catch(e){return <section className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">월례회 성적</h1><p role="alert" className="my-4">{e instanceof Error?e.message:'성적표를 불러오지 못했습니다.'}</p><Link href={`/clubs/${encodeURIComponent(id)}`}>동호회로 돌아가기</Link></section>;}
 return <MonthlyScoresView key={`${data.year}-${p.month}-${query.view}`} data={data} month={p.month} annual={query.view==='annual'}/>;
}
