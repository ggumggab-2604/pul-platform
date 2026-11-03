import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { ClubInquiryInbox, type ClubInboxInquiry } from "@/components/clubs/manage/ClubInquiryInbox";
export default async function ClubInquiriesPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{pending?:string}>}) {
 const {id}=await params;const pendingOnly=(await searchParams).pending==='1';const r=await(await createClient()).rpc(pendingOnly?"list_club_pending_inquiries":"list_club_inquiries_v2",{p_club_key:id});
 return <Container className="py-8"><Link href={"/clubs/"+encodeURIComponent(id)} className="inline-flex min-h-11 items-center underline">동호회로 돌아가기</Link><h1 className="my-5 text-2xl font-bold">동호회 가입 문의 관리</h1><nav className="mb-4 flex gap-3"><Link className="inline-flex min-h-11 items-center underline" href={"/clubs/"+encodeURIComponent(id)+"/manage/inquiries?pending=1"}>미답변</Link><Link className="inline-flex min-h-11 items-center underline" href={"/clubs/"+encodeURIComponent(id)+"/manage/inquiries"}>전체</Link></nav>{r.error?<p role="alert">문의를 조회할 권한이 없거나 목록을 불러오지 못했습니다. 로그인과 동호회 권한을 확인해 주세요.</p>:<ClubInquiryInbox key={pendingOnly?'pending':'all'} pendingOnly={pendingOnly} clubKey={id} initial={r.data as ClubInboxInquiry[]}/>}</Container>;
}
