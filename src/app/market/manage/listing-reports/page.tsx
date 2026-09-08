import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MarketListingReportManagementPage } from "@/components/market/manage/MarketListingReportManagementPage";
import { Container } from "@/components/ui/Container";
import {
  listMarketListingReportsForManagement,
  MarketListingReportError,
  type MarketListingReportPage,
  type MarketListingReportFilter,
} from "@/lib/market/marketListingReports";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "장터 판매글 신고 운영",
  description: "장터 판매글 신고 확인·처리 및 별도 비공개 조치",
};

const filters = new Set<MarketListingReportFilter>(["received", "handled", "dismissed", "all"]);

function AccessMessage({ loadFailed }: { loadFailed: boolean }) {
  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-3xl px-3 py-12">
        <div className="rounded-2xl border border-pul-border bg-white p-7 text-center">
          <h1 className="text-2xl font-bold text-foreground">{loadFailed ? "운영 권한을 확인할 수 없습니다." : "장터 판매글 신고 운영 권한이 없습니다."}</h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">{loadFailed ? "잠시 후 다시 시도해 주세요." : "이 화면은 active 플랫폼 관리자만 이용할 수 있습니다."}</p>
          <Link href="/market" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-pul-deep px-5 font-bold text-white">장터로 돌아가기</Link>
        </div>
      </Container>
    </main>
  );
}

export default async function MarketListingReportManagementRoute({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent("/market/manage/listing-reports")}`);
  const requested = (await searchParams).status;
  const status: MarketListingReportFilter = requested && filters.has(requested as MarketListingReportFilter)
    ? requested as MarketListingReportFilter
    : "received";
  let page: MarketListingReportPage;
  try {
    page = await listMarketListingReportsForManagement(context.supabase, status, 30, 0);
  } catch (error) {
    return <AccessMessage loadFailed={!(error instanceof MarketListingReportError && error.code === "permission")} />;
  }

  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-5xl px-3 py-5 pb-20 lg:py-9">
        <header className="mb-5 rounded-2xl border border-pul-border bg-white p-5 sm:p-6">
          <nav aria-label="경로" className="flex items-center gap-2 text-sm text-pul-muted"><Link href="/manage" className="font-bold hover:text-pul-point">운영 관리센터</Link><span aria-hidden="true">›</span><span>장터 판매글 신고</span></nav>
          <h1 className="mt-3 text-2xl font-black text-foreground sm:text-3xl">장터 판매글 신고</h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">신고 처리와 판매글 비공개 조치는 서로 독립적입니다. 내용을 확인한 뒤 필요한 작업만 선택하세요.</p>
        </header>
        <MarketListingReportManagementPage initialPage={page} status={status} />
      </Container>
    </main>
  );
}
