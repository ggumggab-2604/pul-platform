import Link from 'next/link';
import {loadMonthlyScores} from '@/lib/clubs/monthlyScoresServer';
import {scorePeriod} from '@/lib/clubs/monthlyScores';
import {MonthlyScoresEditor} from '@/components/clubs/scores/MonthlyScoresEditor';
export const dynamic='force-dynamic';
export default async function EditScoresPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{year?:string;month?:string}>}) {
 const {id}=await params,query=await searchParams;
 let p,data; try{p=scorePeriod(query.year,query.month);data=await loadMonthlyScores(id,p.year,true);}
 catch(e){return <section className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">월례회 성적 입력</h1><p role="alert" className="my-4">{e instanceof Error?e.message:'입력 화면을 불러오지 못했습니다.'}</p><Link href={`/clubs/${encodeURIComponent(id)}/scores`}>성적표로 돌아가기</Link></section>;}
 return <MonthlyScoresEditor key={`${id}-${p.year}-${p.month}`} data={data} month={p.month}/>;
}
