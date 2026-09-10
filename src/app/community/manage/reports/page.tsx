import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CommunityReportManagement } from "@/components/community/CommunityReportManagement";
import { Container } from "@/components/ui/Container";
import { CommunityReportError, listCommunityReports, type CommunityReportFilter, type CommunityReportPage } from "@/lib/community/communityReports";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "커뮤니티 신고", description: "게시글·댓글 신고 확인 및 검토 완료 처리" };

export default async function CommunityReportManagementRoute({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent("/community/manage/reports")}`);
  const params = await searchParams;
  const status: CommunityReportFilter = params.status === "resolved" || params.status === "all" ? params.status : "open";
  const requestedPage = Number(params.page);
  const pageNumber = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  let page: CommunityReportPage;
  try { page = await listCommunityReports(context.supabase, status, 20, (pageNumber - 1) * 20); }
  catch (error) {
    const denied = error instanceof CommunityReportError && ["permission", "login"].includes(error.code);
    return <main className="min-h-screen bg-pul-page"><Container className="max-w-3xl py-12">
      <h1 className="text-2xl font-bold">{denied ? "커뮤니티 신고 운영 권한이 없습니다." : "신고 목록을 불러오지 못했습니다."}</h1>
      <p className="mt-3">{denied ? "이 화면은 정상 활동 중인 플랫폼 관리자만 이용할 수 있습니다." : "잠시 후 다시 시도해 주세요."}</p>
      <Link href="/manage" className="mt-5 inline-flex min-h-11 items-center font-bold text-pul-point">운영 관리센터로 돌아가기</Link>
    </Container></main>;
  }
  return <main className="min-h-screen bg-pul-page"><Container className="max-w-5xl px-3 py-6 pb-20">
    <header className="mb-5 rounded-xl border border-pul-border bg-white p-5">
      <Link href="/manage" className="inline-flex min-h-11 items-center font-bold text-pul-point">← 운영 관리센터</Link>
      <h1 className="mt-2 text-2xl font-bold text-pul-deep">커뮤니티 신고</h1>
      <p className="mt-3 leading-7 text-pul-muted">신고 이유와 대상 내용을 확인하고 검토 완료로 표시하세요. 검토 완료 표시는 콘텐츠의 공개 상태를 변경하지 않습니다.</p>
    </header>
    <CommunityReportManagement key={`${status}-${pageNumber}`} page={page} status={status} pageNumber={pageNumber} />
  </Container></main>;
}
