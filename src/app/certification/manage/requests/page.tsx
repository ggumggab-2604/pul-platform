import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CertificationSubmissionRequestManagementPage } from "@/components/certification/manage/CertificationSubmissionRequestManagementPage";
import { Container } from "@/components/ui/Container";
import {
  CertificationSubmissionRequestError,
  listCertificationSubmissionRequestsForManagement,
} from "@/lib/certification/certificationSubmissionRequests";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "자격증·심판 등록 문의 운영",
  description: "회원이 접수한 교육과정과 구인 공고 등록 문의 확인 및 처리",
};

function AccessMessage({ loadFailed }: { loadFailed: boolean }) {
  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-3xl px-3 py-12">
        <div className="rounded-2xl border border-pul-border bg-white p-7 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            {loadFailed ? "운영 권한을 확인할 수 없습니다." : "자격증·심판 정보 운영 권한이 없습니다."}
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            {loadFailed
              ? "잠시 후 다시 시도해 주세요."
              : "이 화면은 active 자격증·심판 정보 운영자만 이용할 수 있습니다."}
          </p>
          <Link
            href="/certification"
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-pul-deep px-5 font-bold text-white"
          >
            자격증·심판으로 돌아가기
          </Link>
        </div>
      </Container>
    </div>
  );
}

export default async function CertificationSubmissionRequestManagementRoute() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    redirect(`/login?next=${encodeURIComponent("/certification/manage/requests")}`);
  }

  let page;
  try {
    page = await listCertificationSubmissionRequestsForManagement(
      context.supabase,
      "pending",
      30,
      0,
    );
  } catch (error) {
    return (
      <AccessMessage
        loadFailed={!(
          error instanceof CertificationSubmissionRequestError
          && error.code === "permission"
        )}
      />
    );
  }

  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-5xl px-3 py-5 pb-20 lg:py-9">
        <header className="mb-5 rounded-2xl border border-pul-border bg-white p-5 sm:p-6">
          <nav aria-label="경로" className="flex items-center gap-2 text-sm text-pul-muted">
            <Link href="/certification" className="font-bold hover:text-pul-point">자격증·심판</Link>
            <span aria-hidden="true">›</span>
            <span>등록 문의 운영</span>
          </nav>
          <h1 className="mt-3 text-2xl font-black text-foreground sm:text-3xl">
            자격증·심판 등록 문의 운영
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            접수 내용을 확인해 처리 완료하거나 별도 반영 없이 종료합니다. 이 처리만으로 교육과정이나 구인 공고가 자동 등록되지는 않습니다.
          </p>
        </header>
        <CertificationSubmissionRequestManagementPage initialPage={page} />
      </Container>
    </div>
  );
}
