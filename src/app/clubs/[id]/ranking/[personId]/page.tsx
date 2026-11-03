import Link from 'next/link';
import {loadPersonalBests} from '@/lib/clubs/personalBestsServer';
import {PersonalBestsView,PersonalBestError} from '@/components/clubs/scores/PersonalBests';
import {loadAverageSources} from '@/lib/clubs/scoreAveragesServer';
import {MemberScoreAverages,type ScoreQuery} from '@/components/clubs/scores/MemberScoreAverages';
import {MessagingSessionBoundary} from '@/components/messaging/MessagingSessionBoundary';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string;personId:string}>;searchParams:Promise<ScoreQuery>}) {
 const {id,personId}=await params,query=await searchParams;let data,averages;
 try{[data,averages]=await Promise.all([loadPersonalBests(id,personId),loadAverageSources(id,personId)]);}catch(e){return <PersonalBestError clubKey={id} message={e instanceof Error?e.message:'기록을 불러오지 못했습니다.'}/>;}
 const kind=query.kind==='tournament'?'tournament':'monthly',year=query.year??new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).slice(0,4);
 const originals=data.history.filter(r=>r.kind===kind&&Number(r.date.slice(0,4))===Number(year)),pages=Math.max(1,Math.ceil(originals.length/50)),rawPage=Math.max(1,Math.min(pages,Number.isSafeInteger(Number(query.rawPage))?Number(query.rawPage):1));
 const rawHref=(n:number)=>{const q=new URLSearchParams({kind,year,rawPage:String(n)});for(const field of ['division','event','source','page'] as const)if(query[field])q.set(field,query[field]!);return `/clubs/${encodeURIComponent(id)}/ranking/${personId}?${q}#original-scores`;};
 const navigation=<nav className="mt-4 flex flex-wrap items-center gap-4" aria-label="원본 성적 페이지"><span>원본 {originals.length}건 · {rawPage}/{pages}페이지{kind==='tournament'?' · 모든 부문':''}</span>{rawPage>1&&<Link prefetch={false} href={rawHref(rawPage-1)}>이전 원본</Link>}{rawPage<pages&&<Link prefetch={false} href={rawHref(rawPage+1)}>다음 원본</Link>}</nav>;
 return <MessagingSessionBoundary viewerId={averages.viewerId}><PersonalBestsView data={{...data,history:originals.slice((rawPage-1)*50,rawPage*50)}} personId={personId} historyLabel={`${year}년 ${kind==='monthly'?'월례회':'대회 · 모든 부문'}`} historyNavigation={navigation}><MemberScoreAverages data={averages} query={query}/></PersonalBestsView></MessagingSessionBoundary>;
}
