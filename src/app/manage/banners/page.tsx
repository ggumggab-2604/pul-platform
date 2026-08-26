import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PromotionBannerList } from "@/components/promotions/manage/PromotionBannerList";
import { Container } from "@/components/ui/Container";
import {
  listPromotionOverviewsForManagement,
  listPromotionSlotsForManagement,
  PromotionManagementError,
  type PromotionOverviewDisplayStatus,
} from "@/lib/promotions/promotionManagement";
import type { PromotionContentKind } from "@/lib/promotions/promotionDirectory";
import {
  promotionAreaLabels,
  type PromotionAreaKey,
} from "@/lib/promotions/promotionManagementUi";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "배너·홍보 관리",
  description: "통합 배너 등록, 이미지, 위치와 게시 일정 관리",
};

const statuses = new Set<PromotionOverviewDisplayStatus>([
  "draft", "hidden", "scheduled", "live", "ended", "archived",
]);
const kinds = new Set<PromotionContentKind>([
  "pul_notice", "pul_event", "partnership", "advertisement", "member_guide", "content_recommendation",
]);
const areas = new Set(Object.keys(promotionAreaLabels) as PromotionAreaKey[]);
const pageSize = 30;

function value(input: string | string[] | undefined) {
  return typeof input === "string" ? input.trim() : "";
}

function AccessMessage({ failed }: { failed: boolean }) {
  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-3xl px-3 py-12">
        <div className="rounded-2xl border border-pul-border bg-white p-7 text-center">
          <h1 className="text-2xl font-black text-foreground">
            {failed ? "배너 관리 정보를 불러오지 못했습니다." : "배너·홍보 관리 권한이 없습니다."}
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            {failed ? "잠시 후 다시 시도해 주세요." : "active 플랫폼 관리자만 이 화면을 이용할 수 있습니다."}
          </p>
          <Link href="/manage" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-pul-deep px-5 font-black text-white">
            관리센터로 돌아가기
          </Link>
        </div>
      </Container>
    </main>
  );
}

export default async function PromotionManagementListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/manage/banners");
  const raw = await searchParams;
  const query = value(raw.q).slice(0, 100);
  const areaValue = value(raw.area);
  const statusValue = value(raw.status);
  const kindValue = value(raw.kind);
  const pageValue = Number.parseInt(value(raw.page), 10);
  const currentPage = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const area = areas.has(areaValue as PromotionAreaKey) ? areaValue as PromotionAreaKey : "";
  const status = statuses.has(statusValue as PromotionOverviewDisplayStatus)
    ? statusValue as PromotionOverviewDisplayStatus
    : "";
  const contentKind = kinds.has(kindValue as PromotionContentKind)
    ? kindValue as PromotionContentKind
    : "";

  let slots;
  let page;
  let loadError: unknown;
  try {
    slots = await listPromotionSlotsForManagement(context.supabase);
    const slotCodes = area
      ? slots.filter((slot) => slot.slotCode.startsWith(`${area}.`)).map((slot) => slot.slotCode)
      : undefined;
    page = await listPromotionOverviewsForManagement(
      context.supabase,
      {
        query: query || undefined,
        slotCodes,
        displayStatus: status || undefined,
        contentKind: contentKind || undefined,
      },
      pageSize,
      (currentPage - 1) * pageSize,
    );
  } catch (error) {
    loadError = error;
  }
  if (loadError || !slots || !page) {
    return <AccessMessage failed={!(loadError instanceof PromotionManagementError && loadError.code === "permission")} />;
  }
  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-[1440px] px-3 py-6 pb-20 lg:py-10">
        <header className="mb-5 rounded-2xl border border-pul-border bg-white p-5 sm:p-7">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-2 text-sm text-pul-muted">
            <Link href="/manage" className="font-bold hover:text-pul-point">관리센터</Link>
            <span aria-hidden="true">›</span>
            <span>배너·홍보 관리</span>
          </nav>
          <h1 className="mt-3 text-3xl font-black text-foreground">배너·홍보 관리</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-pul-muted">
            배너를 초안으로 등록한 뒤 이미지, 위치, 게시 기간을 확인하고 예약 또는 게시하세요.
          </p>
        </header>
        <PromotionBannerList
          page={page}
          slots={slots}
          filters={{ query, area, status, contentKind }}
          currentPage={currentPage}
        />
      </Container>
    </main>
  );
}
