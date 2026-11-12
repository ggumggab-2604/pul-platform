import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LessonSubmissionPage } from "@/components/lessons/submit/LessonSubmissionPage";
import { ShareLessonVideoForm } from "@/components/lessons/submit/ShareLessonVideoForm";
import { Container } from "@/components/ui/Container";
import {
  LessonSubmissionError,
  listMyLessonSubmissionRequests,
  type LessonSubmissionPage as SubmissionPage,
  type LessonSubmissionRequest,
  type LessonSubmissionRequestType,
} from "@/lib/lessons/lessonSubmission";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "레슨·무료영상 등록 요청",
  description: "PUL 레슨·교육 및 무료 YouTube 영상 등록 요청",
};

type SubmitRouteProps = {
  searchParams: Promise<{ type?: string | string[] }>;
};

const emptyPage: SubmissionPage<LessonSubmissionRequest> = {
  items: [], total: 0, limit: 20, offset: 0, hasMore: false,
};

export default async function LessonSubmissionRoute({ searchParams }: SubmitRouteProps) {
  const params = await searchParams;
  const requestType: LessonSubmissionRequestType = params.type === "video" ? "video" : "lesson";
  const nextPath = `/lessons/submit?type=${requestType}`;
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  if (requestType === "video") {
    return (
      <Container className="max-w-3xl px-3 py-5 pb-20 sm:py-8">
        <Link href="/lessons?tab=free-videos" className="font-bold text-pul-deep underline">무료 영상 목록</Link>
        <h1 className="mt-3 text-2xl font-black text-foreground">YouTube 영상 링크 등록</h1>
        <p className="mt-2 text-pul-muted">파크골프 레슨 영상의 주소와 카테고리를 선택하면 바로 공개됩니다.</p>
        <ShareLessonVideoForm />
      </Container>
    );
  }

  let requests = emptyPage;
  let loadError: string | null = null;
  try {
    requests = await listMyLessonSubmissionRequests(context.supabase, 20, 0);
  } catch (error) {
    loadError = error instanceof LessonSubmissionError
      ? error.userMessage
      : "내 등록 요청을 불러오지 못했습니다.";
  }

  const { data: profile } = await context.supabase
    .from("user_profiles")
    .select("nickname")
    .eq("user_id", context.userId)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-5xl px-3 py-5 pb-20 sm:py-8">
        <header className="rounded-2xl border border-pul-border bg-white p-5 sm:p-7">
          <nav aria-label="경로" className="flex items-center gap-2 text-sm text-pul-muted">
            <Link href="/lessons" className="font-bold hover:text-pul-point">레슨·교육</Link>
            <span aria-hidden="true">›</span>
            <span>등록 요청</span>
          </nav>
          <h1 className="mt-3 text-2xl font-black text-foreground sm:text-3xl">레슨·교육 등록 요청</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-pul-muted">
            등록 요청을 보내면 운영자가 교육 정보를 확인합니다.
          </p>
        </header>
        <LessonSubmissionPage
          key={requestType}
          requestType={requestType}
          requesterDisplayName={profile?.nickname ?? "PUL 회원"}
          initialRequests={requests}
          loadError={loadError}
        />
      </Container>
    </div>
  );
}
