import { CommunityPageContent } from "@/components/community/CommunityPageContent";
import { CommunityPromotionsBoard } from "@/components/community/CommunityPromotionsBoard";
import { Container } from "@/components/ui/Container";
import { listCommunityPosts } from "@/lib/community/community";
import { readPromotionPage, readPromotionQuery } from "@/lib/community/communityPromotions";
import { findPromotionForSlot } from "@/lib/promotions/promotionRuntime";
import { loadActivePromotionsForSlots } from "@/lib/promotions/promotionRuntime.server";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "커뮤니티",
  description:
    "파크골프 회원들이 자유롭게 이야기하고, 질문하고, 후기와 정보를 나누는 PUL 커뮤니티입니다.",
};

function readPreviewTime() {
  return Date.now();
}

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (process.env.NODE_ENV === "development" && process.env.PUL_COMMUNITY_PREVIEW === "1") {
    if (query.board !== "members") {
      const { CommunityPromotionsPreview } = await import("@/components/community/CommunityPromotionsPreview");
      return (
        <main className="bg-pul-page">
          <Container className="max-w-6xl! px-3 py-4 sm:py-7">
            <CommunityPromotionsPreview initialTime={readPreviewTime()} />
          </Container>
        </main>
      );
    }
  }

  const client = await createClient();
  if (query.board !== "members") {
    const { filters, page } = readPromotionQuery(query);
    const [results, auth] = await Promise.all([
      readPromotionPage(client, filters, page).catch(() => null),
      client.auth.getClaims().catch(() => null),
    ]);
    return <main className="bg-pul-page">
      <Container className="max-w-6xl! px-3 py-4 sm:py-7">
        <CommunityPromotionsBoard initialFilters={filters} results={results} page={page} loggedIn={typeof auth?.data?.claims?.sub === "string"} now={readPreviewTime()} />
      </Container>
    </main>;
  }
  let initialLoadFailed = false;
  let initialPage;
  const promotionPromise = loadActivePromotionsForSlots(client, ["community.top.01", "community.after_posts.01"]);
  try {
    initialPage = await listCommunityPosts(client, "all", "", "latest", 24, 0);
  } catch {
    initialLoadFailed = true;
    initialPage = { items: [], total: 0, limit: 24, offset: 0, hasMore: false };
  }
  const promotions = await promotionPromise;
  const promotion = findPromotionForSlot(promotions, "community.top.01");
  const secondPromotion = findPromotionForSlot(promotions, "community.after_posts.01");

  return (
    <div className="bg-pul-page">
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <Link href="/community" className="mb-2 inline-flex min-h-11 items-center font-bold text-pul-point">← 홍보·광고</Link>
        <CommunityPageContent initialPage={initialPage} initialLoadFailed={initialLoadFailed} promotion={promotion} secondPromotion={secondPromotion} />
      </Container>
    </div>
  );
}
