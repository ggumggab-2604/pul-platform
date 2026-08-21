import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NewsManagementPage } from "@/components/news/manage/NewsManagementPage";
import { Container } from "@/components/ui/Container";
import {
  NewsDirectoryError,
  listNewsArticlesForManagement,
} from "@/lib/news/newsDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "뉴스·정보 운영",
  description: "공식 뉴스·정보 등록 및 공개 관리",
};

function AccessMessage({ loadFailed }: { loadFailed: boolean }) {
  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-3xl px-3 py-12">
        <div className="rounded-2xl border border-pul-border bg-white p-7 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            {loadFailed ? "운영 권한을 확인할 수 없습니다." : "뉴스·정보 운영 권한이 없습니다."}
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            {loadFailed ? "잠시 후 다시 시도해 주세요." : "이 화면은 active 플랫폼 운영자만 이용할 수 있습니다."}
          </p>
          <Link href="/news" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-pul-deep px-5 font-bold text-white">
            뉴스·정보로 돌아가기
          </Link>
        </div>
      </Container>
    </div>
  );
}

export default async function NewsManagementRoute() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/news/manage");
  let page;
  try {
    page = await listNewsArticlesForManagement(context.supabase, {}, 30, 0);
  } catch (error) {
    return <AccessMessage loadFailed={!(error instanceof NewsDirectoryError && error.code === "permission")} />;
  }
  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-[1440px] px-3 py-5 pb-20 lg:py-9">
        <header className="mb-5 rounded-2xl border border-pul-border bg-white p-5 sm:p-6">
          <nav aria-label="경로" className="flex items-center gap-2 text-sm text-pul-muted">
            <Link href="/news" className="font-bold hover:text-pul-point">뉴스·정보</Link>
            <span aria-hidden="true">›</span>
            <span>운영 관리</span>
          </nav>
          <h1 className="mt-3 text-2xl font-black text-foreground sm:text-3xl">뉴스·정보 운영 관리</h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">확인된 소식을 hidden 초안으로 등록한 뒤 내용을 검토해 공개하세요.</p>
          <Link
            href="/news/manage/inquiries"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-pul-light px-4 font-bold text-pul-deep"
          >
            제보·홍보 문의 확인
          </Link>
        </header>
        <NewsManagementPage initialPage={page} />
      </Container>
    </div>
  );
}
