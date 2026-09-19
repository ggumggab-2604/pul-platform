import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { ContentModerationManagement } from "@/components/community/ContentModerationManagement";
import { ContentModerationError, isModerationType, listContentForModeration, type ModerationFilter } from "@/lib/community/contentModeration";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "공개 콘텐츠 관리", description: "운영자 콘텐츠 제한 및 복원" };
export default async function ContentModerationRoute({ searchParams }: { searchParams: Promise<{ type?: string; filter?: string; target?: string; report?: string; page?: string }> }) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent("/community/manage/content")}`);
  const params = await searchParams;
  const type = isModerationType(params.type) ? params.type : "post";
  const filter: ModerationFilter = params.filter === "published" || params.filter === "restricted" ? params.filter : "all";
  const requested = Number(params.page);
  const pageNumber = Number.isSafeInteger(requested) && requested > 0 && requested <= 100000 ? requested : 1;
  let page;
  try { page = await listContentForModeration(context.supabase, type, filter, params.target ?? null, 20, (pageNumber - 1) * 20); }
  catch (error) {
    const safe = error instanceof ContentModerationError ? error : new ContentModerationError("unknown");
    return <main><Container className="py-12"><h1 className="text-2xl font-bold">{safe.message}</h1><Link href="/manage" className="inline-flex min-h-11 items-center">운영 관리센터로 돌아가기</Link></Container></main>;
  }
  return <main className="min-h-screen bg-pul-page"><Container className="max-w-5xl px-3 py-6 pb-20">
    <header className="mb-5 space-y-3 rounded-xl border border-pul-border bg-white p-5">
      <Link href="/manage" className="inline-flex min-h-11 items-center font-bold text-pul-point">← 운영 관리센터</Link>
      <h1 className="text-2xl font-bold">공개 콘텐츠 관리</h1>
      <p>내용 확인 후 공개 노출을 제한하거나 운영자 제한을 해제합니다. 원문을 삭제하지 않으며 작성자 삭제와 기존 비공개 상태는 복원하지 않습니다.</p>
      <Link href="/community/manage/reports" className="inline-flex min-h-11 items-center text-pul-point">신고 확인·종료</Link>
    </header>
    <ContentModerationManagement page={page} type={type} filter={filter} pageNumber={pageNumber} targetId={params.target ?? null} reportId={params.report ?? null} />
  </Container></main>;
}
