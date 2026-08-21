import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LessonSubmissionManagementPage } from "@/components/lessons/manage/LessonSubmissionManagementPage";
import { Container } from "@/components/ui/Container";
import {
  LessonSubmissionError,
  listLessonSubmissionRequestsForManagement,
} from "@/lib/lessons/lessonSubmission";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "레슨 등록 요청 운영",
  description: "레슨·무료영상 등록 요청 확인 및 처리",
};

function AccessMessage({ loadFailed }: { loadFailed: boolean }) {
  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-3xl px-3 py-12">
        <div className="rounded-2xl border border-pul-border bg-white p-7 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            {loadFailed ? "운영 권한을 확인할 수 없습니다." : "레슨 운영 권한이 없습니다."}
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            {loadFailed ? "잠시 후 다시 시도해 주세요." : "이 화면은 active 플랫폼 운영자만 이용할 수 있습니다."}
          </p>
          <Link href="/lessons" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-pul-deep px-5 font-bold text-white">
            레슨·교육으로 돌아가기
          </Link>
        </div>
      </Container>
    </div>
  );
}

export default async function LessonSubmissionManagementRoute() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent("/lessons/manage/requests")}`);
  let page;
  try {
    page = await listLessonSubmissionRequestsForManagement(context.supabase, null, 30, 0);
  } catch (error) {
    return <AccessMessage loadFailed={!(error instanceof LessonSubmissionError && error.code === "permission")} />;
  }

  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-[1440px] px-3 py-5 pb-20 lg:py-9">
        <header className="mb-5 rounded-2xl border border-pul-border bg-white p-5 sm:p-6">
          <nav aria-label="경로" className="flex items-center gap-2 text-sm text-pul-muted">
            <Link href="/lessons" className="font-bold hover:text-pul-point">레슨·교육</Link>
            <span aria-hidden="true">›</span>
            <span>등록 요청 운영</span>
          </nav>
          <h1 className="mt-3 text-2xl font-black text-foreground sm:text-3xl">레슨·무료영상 등록 요청 운영</h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            회원 요청을 확인해 기존 디렉터리의 hidden 초안을 만들거나 짧은 사유와 함께 반려합니다. 초안은 별도 공개 작업 전까지 노출되지 않습니다.
          </p>
        </header>
        <LessonSubmissionManagementPage initialPage={page} />
      </Container>
    </div>
  );
}
