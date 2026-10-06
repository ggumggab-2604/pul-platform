import { MarketPageContent } from "@/components/market/MarketPageContent";
import { MarketPageHero } from "@/components/market/MarketPageHero";
import { Container } from "@/components/ui/Container";
import {
  listMarketListings,
  listMarketStartupPosts,
  type MarketListingFilters,
  type MarketPage,
  type MarketStartupPostFilters,
} from "@/lib/market/market";
import { listBuyRequestsV2 } from "@/lib/market/marketPhaseOne";
import { parseMarketQuery } from "@/lib/market/marketNavigation";
import { marketPromotionSlots } from "@/lib/market/marketPromotions";
import { findPromotionForSlot } from "@/lib/promotions/promotionRuntime";
import { loadActivePromotionsForSlots } from "@/lib/promotions/promotionRuntime.server";
import { createClient } from "@/lib/supabase/server";
import type {
  MarketListing,
  MarketBuyRequest,
  StartupBoardPost,
} from "@/types";
import type { Metadata } from "next";
import Link from "next/link";
import { marketPolicyTitle } from "@/lib/market/marketPolicy";
export const metadata: Metadata = {
  title: "PUL 장터",
  description: "회원의 판매·구매·교환 글과 창업·매매 정보를 확인하세요.",
};
const empty = <T,>(): MarketPage<T> => ({
  items: [],
  total: 0,
  limit: 24,
  offset: 0,
  hasMore: false,
});
export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    if (typeof value === "string") params.set(key, value);
  const query = parseMarketQuery(params),
    supabase = await createClient();
  const home = query.view === "home",
    sale = query.view === "sale",
    buy = query.view === "buy",
    startup = query.view === "startup";
  const promotionSlots = marketPromotionSlots(query.view, params.toString());
  const [sales, wanted, posts, promotions, auth] = await Promise.allSettled([
    home || sale
      ? listMarketListings(
          supabase,
          {
            keyword: sale ? query.keyword : "",
            category: (sale
              ? query.category
              : "all") as MarketListingFilters["category"],
            region: sale ? query.region : "전체",
            saleStatus: (sale
              ? query.status
              : "all") as MarketListingFilters["saleStatus"],
          },
          home ? 4 : 24,
        )
      : Promise.resolve(empty<MarketListing>()),
    home || buy
      ? listBuyRequestsV2(
          supabase,
          home
            ? { keyword: "", category: "all", region: "전체", status: "all" }
            : query,
          home ? 3 : 24,
        )
      : Promise.resolve(empty<MarketBuyRequest>()),
    startup
      ? listMarketStartupPosts(supabase, {
          keyword: query.keyword,
          category: query.category as MarketStartupPostFilters["category"],
          region: query.region,
        })
      : Promise.resolve(empty<StartupBoardPost>()),
    promotionSlots.length
      ? loadActivePromotionsForSlots(supabase, promotionSlots)
      : Promise.resolve([]),
    supabase.auth.getUser(),
  ]);
  const activePromotions =
    promotions.status === "fulfilled" ? promotions.value : [];
  return (
    <div className="bg-pul-page">
      <Container className="pt-3">
        <MarketPageHero search={params.toString()} />
      </Container>
      <Container className="pb-4 pt-2 lg:pb-6 lg:pt-3">
        <MarketPageContent
          key={`${params}:${auth.status === "fulfilled" ? (auth.value.data.user?.id ?? "anon") : "anon"}`}
          query={query}
          search={params.toString()}
          initialListings={
            sales.status === "fulfilled" ? sales.value : empty<MarketListing>()
          }
          initialBuyRequests={
            wanted.status === "fulfilled"
              ? wanted.value
              : empty<MarketBuyRequest>()
          }
          initialStartupPosts={
            posts.status === "fulfilled"
              ? posts.value
              : empty<StartupBoardPost>()
          }
          initialErrors={{
            sale: sales.status === "rejected",
            buy: wanted.status === "rejected",
            startup: posts.status === "rejected",
          }}
          initialUserId={
            auth.status === "fulfilled"
              ? (auth.value.data.user?.id ?? null)
              : null
          }
          promotion={findPromotionForSlot(
            activePromotions,
            promotionSlots[0] ?? "",
          )}
          secondPromotion={findPromotionForSlot(
            activePromotions,
            promotionSlots[1] ?? "",
          )}
        />
        <div className="mt-6 border-t border-pul-border pt-4 text-sm">
          <Link href="/market/policy" className="inline-flex min-h-11 items-center text-pul-point underline underline-offset-4">{marketPolicyTitle}</Link>
        </div>
      </Container>
    </div>
  );
}
