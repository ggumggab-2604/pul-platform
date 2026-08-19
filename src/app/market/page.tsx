import { MarketPageContent } from "@/components/market/MarketPageContent";
import { MarketPageHero } from "@/components/market/MarketPageHero";
import { Container } from "@/components/ui/Container";
import { listMarketBuyRequests, listMarketListings } from "@/lib/market/market";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "중고장터",
  description: "파크골프 용품을 안전하게 사고팔 수 있는 공간입니다.",
};

export default async function MarketPage() {
  const supabase = await createClient();
  const [listingResult, buyResult] = await Promise.allSettled([
    listMarketListings(supabase, { keyword: "", category: "all", region: "전체", saleStatus: "all" }, 24, 0),
    listMarketBuyRequests(supabase, 24, 0),
  ]);
  const initialListings = listingResult.status === "fulfilled" ? listingResult.value : { items: [], total: 0, limit: 24, offset: 0, hasMore: false };
  const initialBuyRequests = buyResult.status === "fulfilled" ? buyResult.value : { items: [], total: 0, limit: 24, offset: 0, hasMore: false };
  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <MarketPageHero />
      </Container>
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <MarketPageContent initialListings={initialListings} initialBuyRequests={initialBuyRequests} initialLoadFailed={listingResult.status === "rejected" || buyResult.status === "rejected"} />
      </Container>
    </div>
  );
}
