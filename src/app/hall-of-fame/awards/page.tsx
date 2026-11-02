import {loadAwardNews} from '@/lib/clubs/tournamentsServer';
import {getAuthenticatedSupabaseContext} from '@/lib/supabase/auth';
import {AwardNewsView} from '@/components/clubs/tournaments/AwardNewsView';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{club?:string;course?:string}>}){const q=await searchParams;let items,ctx;try{[items,ctx]=await Promise.all([loadAwardNews(q.club,q.course),getAuthenticatedSupabaseContext()]);}catch{return <p role="alert" className="p-6">수상 소식을 불러오지 못했습니다. 다시 시도해 주세요.</p>;}return <AwardNewsView items={items} signedIn={!!ctx} scope={q.club?'club':q.course?'course':'national'}/>;}
