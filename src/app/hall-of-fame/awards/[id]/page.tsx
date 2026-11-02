import {loadAwardNews} from '@/lib/clubs/tournamentsServer';
import {getAuthenticatedSupabaseContext} from '@/lib/supabase/auth';
import {AwardNewsView} from '@/components/clubs/tournaments/AwardNewsView';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{scope?:string}>}){const {id}=await params,q=await searchParams;const [items,ctx]=await Promise.all([loadAwardNews(undefined,undefined,id),getAuthenticatedSupabaseContext()]);if(!items.length)notFound();return <AwardNewsView items={items} signedIn={!!ctx} detail scope={q.scope==='club'?'club':q.scope==='course'?'course':'national'}/>;}
