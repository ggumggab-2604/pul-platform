import Link from 'next/link';
import {loadTournaments,loadAwardNews} from '@/lib/clubs/tournamentsServer';
import {AwardForm} from '@/components/clubs/tournaments/AwardForm';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{entry?:string}>}){const {id}=await params,q=await searchParams;let data,news;try{data=await loadTournaments(id);news=await loadAwardNews(id);}catch(e){return <section className="p-6"><p role="alert">{e instanceof Error?e.message:'불러오지 못했습니다.'}</p><Link href={`/clubs/${encodeURIComponent(id)}/tournaments`}>대회 성적으로</Link></section>;}return <AwardForm data={data} news={news} selected={q.entry}/>;}
