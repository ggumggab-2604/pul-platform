import { NewsPageContent } from "@/components/news/NewsPageContent";
import { Container } from "@/components/ui/Container";
import { NewsDirectoryError, isNewsCategory, listPublicNewsArticles, type PublicNewsFilters } from "@/lib/news/newsDirectory";
import { NEWS_PAGE_SIZE, newsCategoryFilter, newsPageNumber } from "@/lib/news/newsNavigation";
import { findPromotionForSlot } from "@/lib/promotions/promotionRuntime";
import { loadActivePromotionsForSlots } from "@/lib/promotions/promotionRuntime.server";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "뉴스·정보",
  description: "파크골프 구장 운영, 대회·행사, 공지·제도, 스크린·장비 소식을 확인하세요.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const activeCategory = newsCategoryFilter(first(params.category));
  const keyword = (first(params.keyword) ?? "").trim().slice(0, 100);
  const currentPage = newsPageNumber(first(params.page));
  const offset = (currentPage - 1) * NEWS_PAGE_SIZE;
  const client = await createClient();
  const filters: PublicNewsFilters = isNewsCategory(activeCategory)
    ? { category: activeCategory }
    : activeCategory === "all" ? {} : { publicSection: activeCategory };

  const [pageResult, featuredResult, promotionResult] = await Promise.allSettled([
    listPublicNewsArticles(client, { ...filters, keyword }, NEWS_PAGE_SIZE, offset),
    !keyword && currentPage === 1
      ? listPublicNewsArticles(client, { ...filters, featuredOnly: true }, 3)
      : null,
    loadActivePromotionsForSlots(client, ["news.top.01", "news.after_list.01"]),
  ]);

  const page = pageResult.status === "fulfilled" ? pageResult.value : {
    items: [], total: 0, limit: NEWS_PAGE_SIZE, offset, hasMore: false,
  };
  const featured = featuredResult.status === "fulfilled" ? featuredResult.value?.items ?? [] : [];
  const promotions = promotionResult.status === "fulfilled" ? promotionResult.value : [];

  return (
    <main className="bg-pul-page">
      <Container className="max-w-6xl! px-3 py-3 sm:py-5">
        <NewsPageContent
          page={page}
          featured={featured}
          activeCategory={activeCategory}
          keyword={keyword}
          pageNumber={currentPage}
          error={pageResult.status === "rejected" ? (
            pageResult.reason instanceof NewsDirectoryError
              ? pageResult.reason.userMessage
              : "뉴스·정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
          ) : null}
          promotion={findPromotionForSlot(promotions, "news.top.01")}
          secondPromotion={findPromotionForSlot(promotions, "news.after_list.01")}
        />
      </Container>
    </main>
  );
}
