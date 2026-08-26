import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PromotionEditor } from "@/components/promotions/manage/PromotionEditor";
import { Container } from "@/components/ui/Container";
import {
  listPromotionSlotsForManagement,
  PromotionManagementError,
} from "@/lib/promotions/promotionManagement";
import { isoToKstLocalDateTime } from "@/lib/promotions/promotionManagementUi";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "새 배너 등록",
  description: "통합 배너·홍보 초안 등록",
};

function AccessMessage({ failed }: { failed: boolean }) {
  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-3xl px-3 py-12">
        <div className="rounded-2xl border border-pul-border bg-white p-7 text-center">
          <h1 className="text-2xl font-black text-foreground">
            {failed ? "등록 화면을 불러오지 못했습니다." : "배너·홍보 관리 권한이 없습니다."}
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            {failed ? "잠시 후 다시 시도해 주세요." : "active 플랫폼 관리자만 이 화면을 이용할 수 있습니다."}
          </p>
          <Link href="/manage/banners" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-pul-deep px-5 font-black text-white">목록으로 돌아가기</Link>
        </div>
      </Container>
    </main>
  );
}

export default async function NewPromotionPage() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/manage/banners/new");

  let slots;
  let loadError: unknown;
  try {
    slots = await listPromotionSlotsForManagement(context.supabase);
  } catch (error) {
    loadError = error;
  }
  if (loadError || !slots) {
    return <AccessMessage failed={!(loadError instanceof PromotionManagementError && loadError.code === "permission")} />;
  }
  const now = new Date();
  now.setSeconds(0, 0);
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-[1440px] px-3 py-6 pb-20 lg:py-10">
        <header className="mb-5 rounded-2xl border border-pul-border bg-white p-5 sm:p-7">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-2 text-sm text-pul-muted">
            <Link href="/manage" className="font-bold hover:text-pul-point">관리센터</Link>
            <span aria-hidden="true">›</span>
            <Link href="/manage/banners" className="font-bold hover:text-pul-point">배너·홍보 관리</Link>
            <span aria-hidden="true">›</span>
            <span>새 배너 등록</span>
          </nav>
          <h1 className="mt-3 text-3xl font-black text-foreground">새 배너·홍보 등록</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-pul-muted">콘텐츠와 게시 위치를 초안으로 먼저 저장합니다. 저장 후 이미지 등록과 실제 게시를 이어서 진행할 수 있습니다.</p>
        </header>
        <PromotionEditor
          detail={null}
          slots={slots}
          initialStartsAt={isoToKstLocalDateTime(now.toISOString())}
          initialEndsAt={isoToKstLocalDateTime(end.toISOString())}
        />
      </Container>
    </main>
  );
}
