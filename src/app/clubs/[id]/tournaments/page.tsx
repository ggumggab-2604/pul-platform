import Link from 'next/link';
import {loadTournaments} from '@/lib/clubs/tournamentsServer';
import {TournamentView} from '@/components/clubs/tournaments/TournamentView';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tournament?:string}>}){const {id}=await params;const query=await searchParams;let data;try{data=await loadTournaments(id);}catch(e){return <section className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">대회 성적</h1><p role="alert" className="my-4">{e instanceof Error?e.message:'불러오지 못했습니다.'}</p><Link href={`/clubs/${encodeURIComponent(id)}`}>동호회로 돌아가기</Link></section>;}return <TournamentView data={data} selected={query.tournament}/>;}
