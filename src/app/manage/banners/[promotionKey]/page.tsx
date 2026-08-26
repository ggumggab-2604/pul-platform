import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PromotionEditor } from "@/components/promotions/manage/PromotionEditor";
import { Container } from "@/components/ui/Container";
import {
  getPromotionForManagement,
  listPromotionSlotsForManagement,
  PromotionManagementError,
} from "@/lib/promotions/promotionManagement";
import { isoToKstLocalDateTime } from "@/lib/promotions/promotionManagementUi";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "배너 상세 관리",
  description: "통합 배너·홍보 콘텐츠, 이미지와 게시 일정 관리",
};

const keyPattern = /^[0-9a-f]{32}$/;

function AccessMessage({ failed }: { failed: boolean }) {
  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-3xl px-3 py-12">
        <div className="rounded-2xl border border-pul-border bg-white p-7 text-center">
          <h1 className="text-2xl font-black text-foreground">
            {failed ? "배너 상세를 불러오지 못했습니다." : "배너·홍보 관리 권한이 없습니다."}
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            {failed ? "최신 내용을 다시 불러오거나 목록에서 항목을 다시 선택해 주세요." : "active 플랫폼 관리자만 이 화면을 이용할 수 있습니다."}
          </p>
          <Link href="/manage/banners" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-pul-deep px-5 font-black text-white">목록으로 돌아가기</Link>
        </div>
      </Container>
    </main>
  );
}

export default async function PromotionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ promotionKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { promotionKey } = await params;
  if (!keyPattern.test(promotionKey)) notFound();
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=/manage/banners/${promotionKey}`);
  const raw = await searchParams;
  const setup = typeof raw.setup === "string" && ["created", "placement-error"].includes(raw.setup)
    ? raw.setup as "created" | "placement-error"
    : undefined;

  let detail;
  let slots;
  let loadError: unknown;
  try {
    [detail, slots] = await Promise.all([
      getPromotionForManagement(context.supabase, promotionKey),
      listPromotionSlotsForManagement(context.supabase),
    ]);
  } catch (error) {
    loadError = error;
  }
  if (loadError instanceof PromotionManagementError && loadError.code === "notFound") notFound();
  if (loadError || !detail || !slots) {
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
            <span>상세·수정</span>
          </nav>
          <h1 className="mt-3 break-words text-3xl font-black text-foreground">{detail.title}</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-pul-muted">콘텐츠, 이미지와 게시 일정을 확인하고 저장합니다. 다른 세션의 변경은 버전 충돌로 안전하게 차단됩니다.</p>
        </header>
        <PromotionEditor
          detail={detail}
          slots={slots}
          initialStartsAt={isoToKstLocalDateTime(now.toISOString())}
          initialEndsAt={isoToKstLocalDateTime(end.toISOString())}
          setupNotice={setup}
        />
      </Container>
    </main>
  );
}
