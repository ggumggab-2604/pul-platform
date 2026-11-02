import Link from 'next/link';
import {loadTournaments} from '@/lib/clubs/tournamentsServer';
import {TournamentEditor} from '@/components/clubs/tournaments/TournamentEditor';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tournament?:string}>}){const {id}=await params,q=await searchParams;let data,t;try{data=await loadTournaments(id);if(!data.can_edit)throw Error('현재 회장·부회장만 입력·수정할 수 있습니다.');t=data.tournaments.find(t=>t.id===q.tournament);if(q.tournament&&!t)throw Error('대회를 확인해 주세요.');}catch(e){return <section className="p-6"><p role="alert">{e instanceof Error?e.message:'불러오지 못했습니다.'}</p><Link href={`/clubs/${encodeURIComponent(id)}/tournaments`}>대회 성적으로</Link></section>;}return <TournamentEditor key={`${t?.id}-${t?.version}`} data={data} initial={t}/>;}
