import {MessagingSessionBoundary} from "@/components/messaging/MessagingSessionBoundary";
import Link from "next/link";
import {redirect} from "next/navigation";
import {Container} from "@/components/ui/Container";
import {VendorWorkspace} from "@/components/market/VendorWorkspace";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {vendorRpc,type VendorWorkspace as Row} from "@/lib/market/marketVendors";
export default async function Page(){const c=await getAuthenticatedSupabaseContext();if(!c)redirect("/login?next="+encodeURIComponent("/market/manage/vendors"));let rows:Row[]=[];let failed=false;try{rows=await vendorRpc<Row[]>(c.supabase,"read_market_vendor_workspace",{p_manage:true});}catch{failed=true;}return <Container className="max-w-5xl py-6 pb-28"><Link className="mb-4 inline-flex min-h-11 items-center font-bold" href="/manage">← 운영 관리센터</Link><MessagingSessionBoundary viewerId={c.userId}><VendorWorkspace initial={rows} manage={true} failed={failed}/></MessagingSessionBoundary></Container>;}
