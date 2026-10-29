import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { ClubInquiryInbox, type ClubInboxInquiry } from "@/components/clubs/manage/ClubInquiryInbox";
export default async function ClubInquiriesPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;const r=await(await createClient()).rpc("list_club_inquiries_v2",{p_club_key:id});
 return <Container className="py-8"><Link href={"/clubs/"+encodeURIComponent(id)} className="inline-flex min-h-11 items-center underline">동호회로 돌아가기</Link><h1 className="my-5 text-2xl font-bold">동호회 가입 문의 관리</h1>{r.error?<p role="alert">문의를 조회할 권한이 없거나 목록을 불러오지 못했습니다. 로그인과 동호회 권한을 확인해 주세요.</p>:<ClubInquiryInbox clubKey={id} initial={r.data as ClubInboxInquiry[]}/>}</Container>;
}
