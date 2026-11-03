import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getAuthenticatedSupabaseContext} from '@/lib/supabase/auth';
import {loadPracticeRecords} from '@/lib/practice/server';
import {PracticeRecords} from '@/components/account/PracticeRecords';
import {MessagingSessionBoundary} from '@/components/messaging/MessagingSessionBoundary';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{record?:string}>}){
 const ctx=await getAuthenticatedSupabaseContext();if(!ctx)redirect('/login?next=/my/practice');
 const query=await searchParams;let data;
 try{data=await loadPracticeRecords(query.record);}catch(e){return <main className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">내 연습기록 · 나만 보기</h1><p className="my-4" role="alert">{e instanceof Error?e.message:'연습기록을 불러오지 못했습니다.'}</p><Link prefetch={false} href="/my">내 정보로</Link></main>;}
 return <MessagingSessionBoundary viewerId={data.viewerId}><PracticeRecords initial={data} selectedId={query.record}/></MessagingSessionBoundary>;
}
