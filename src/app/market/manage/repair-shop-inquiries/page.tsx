import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MarketRepairShopInquiryManagementPage } from "@/components/market/manage/MarketRepairShopInquiryManagementPage";
import { Container } from "@/components/ui/Container";
import {
  listMarketRepairShopInquiriesForManagement,
  MarketRepairShopInquiryError,
} from "@/lib/market/marketRepairShopInquiries";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "수리업체 등록 문의 운영",
  description: "회원이 접수한 장터 수리업체 등록 문의 확인 및 처리",
};

function AccessMessage({ loadFailed }: { loadFailed: boolean }) {
  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-3xl px-3 py-12">
        <div className="rounded-2xl border border-pul-border bg-white p-7 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            {loadFailed ? "운영 권한을 확인할 수 없습니다." : "장터 문의 운영 권한이 없습니다."}
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            {loadFailed
              ? "잠시 후 다시 시도해 주세요."
              : "이 화면은 active 장터 문의 운영자만 이용할 수 있습니다."}
          </p>
          <Link
            href="/market"
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-pul-deep px-5 font-bold text-white"
          >
            장터로 돌아가기
          </Link>
        </div>
      </Container>
    </div>
  );
}

export default async function MarketRepairShopInquiryManagementRoute() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    redirect(`/login?next=${encodeURIComponent("/market/manage/repair-shop-inquiries")}`);
  }

  let page;
  try {
    page = await listMarketRepairShopInquiriesForManagement(
      context.supabase,
      "pending",
      30,
      0,
    );
  } catch (error) {
    return (
      <AccessMessage
        loadFailed={
          !(error instanceof MarketRepairShopInquiryError && error.code === "permission")
        }
      />
    );
  }

  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-5xl px-3 py-5 pb-20 lg:py-9">
        <header className="mb-5 rounded-2xl border border-pul-border bg-white p-5 sm:p-6">
          <nav aria-label="경로" className="flex items-center gap-2 text-sm text-pul-muted">
            <Link href="/market" className="font-bold hover:text-pul-point">장터</Link>
            <span aria-hidden="true">›</span>
            <span>수리업체 등록 문의 운영</span>
          </nav>
          <h1 className="mt-3 text-2xl font-black text-foreground sm:text-3xl">
            수리업체 등록 문의 운영
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            접수 정보를 확인해 처리 완료하거나 별도 조치 없이 종료합니다. 문의 처리만으로 업체나 판매글이 자동 등록되지는 않습니다.
          </p>
        </header>
        <MarketRepairShopInquiryManagementPage initialPage={page} />
      </Container>
    </div>
  );
}
