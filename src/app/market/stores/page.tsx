import Link from "next/link";
import {redirect} from "next/navigation";
import {Container} from "@/components/ui/Container";
import {MessagingSessionBoundary} from "@/components/messaging/MessagingSessionBoundary";
import {MarketStores} from "@/components/market/MarketStores";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const c=await getAuthenticatedSupabaseContext();if(!c)redirect("/login?next="+encodeURIComponent("/market/stores"));
 const p=await searchParams,query=new URLSearchParams();for(const k of ["store_q","store_region","store_status","store_offset"]){if(typeof p[k]==="string")query.set(k,p[k]);}
 return <Container className="max-w-6xl py-6 pb-28"><Link className="mb-4 inline-flex min-h-11 items-center font-bold" href="/market?view=business&business_tab=stores">← 매장 목록</Link><MessagingSessionBoundary viewerId={c.userId}><MarketStores key={query.toString()} search={query.toString()} userId={c.userId} manage/></MessagingSessionBoundary></Container>;
}
