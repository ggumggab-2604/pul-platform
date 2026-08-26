import { CommunityPageContent } from "@/components/community/CommunityPageContent";
import { Container } from "@/components/ui/Container";
import { listCommunityPosts } from "@/lib/community/community";
import { findPromotionForSlot } from "@/lib/promotions/promotionRuntime";
import { loadActivePromotionsForSlots } from "@/lib/promotions/promotionRuntime.server";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "커뮤니티",
  description:
    "파크골프 회원들이 자유롭게 이야기하고, 질문하고, 후기와 정보를 나누는 PUL 커뮤니티입니다.",
};

export default async function CommunityPage() {
  let initialLoadFailed = false;
  let initialPage;
  const client = await createClient();
  const promotionPromise = loadActivePromotionsForSlots(client, ["community.top.01"]);
  try {
    initialPage = await listCommunityPosts(client, "all", "", "latest", 24, 0);
  } catch {
    initialLoadFailed = true;
    initialPage = { items: [], total: 0, limit: 24, offset: 0, hasMore: false };
  }
  const promotion = findPromotionForSlot(await promotionPromise, "community.top.01");

  return (
    <div className="bg-pul-page">
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <CommunityPageContent initialPage={initialPage} initialLoadFailed={initialLoadFailed} promotion={promotion} />
      </Container>
    </div>
  );
}
