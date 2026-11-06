import { redirect } from "next/navigation";
import Link from "next/link";
import { SpecialRecords, SpecialWorkspacePanel } from "@/components/hall-of-fame/SpecialRecords";
import { createClient } from "@/lib/supabase/server";
import { specialRpc, type SpecialWorkspace } from "@/lib/hall-of-fame/hallSpecialRecords";

export const metadata = {title: "특별 기록 · 명예의 전당"};
export default async function SpecialRecordsPage({searchParams}: {searchParams: Promise<{member?: string; mine?: string}>}) {
 const params = await searchParams, member = /^[0-9a-f-]{36}$/i.test(params.member ?? "") ? params.member : undefined;
 if (!member && params.mine !== "1") redirect("/hall-of-fame?tab=special");
 const client = await createClient(), {data} = await client.auth.getUser();
 let workspace: SpecialWorkspace | null = null, failed = false;
 if (params.mine === "1" && data.user) { try {workspace = await specialRpc<SpecialWorkspace>(client, "get_hall_special_workspace");} catch {failed = true;} }
 return <main className="mx-auto w-full max-w-[1520px] min-w-0 px-3 py-6 sm:px-6"><Link className="inline-flex min-h-11 items-center text-pul-point" href="/hall-of-fame">명예의 전당</Link><h1 className="my-3 text-2xl font-bold text-pul-deep">특별 기록</h1><p className="mb-4 text-sm text-pul-muted">파3·1타 홀인원 / 파4·1타 알바트로스 / 파5·1타 콘도르. 승인된 기록은 개인 누적 횟수에 자동 반영됩니다.</p>
 {workspace ? <SpecialWorkspacePanel workspace={workspace} /> : failed ? <p role="alert" className="my-4 text-rose-700">내 등록·승인 목록을 불러오지 못했습니다. 로그인 상태를 확인하고 새로고침해 주세요.</p> : params.mine === "1" ? <Link className="my-3 inline-flex min-h-11 items-center font-semibold text-pul-point" href="/login?next=%2Fhall-of-fame%2Fspecial%3Fmine%3D1">로그인 후 기록 등록·승인</Link> : null}
 {member ? <p className="my-3 text-sm">선택한 회원의 공개 기록 · <Link href="/hall-of-fame/special" className="text-pul-point">전체 기록</Link></p> : null}{member && <SpecialRecords memberKey={member} />}</main>;
}

