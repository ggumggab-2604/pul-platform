import { NewsPageContent } from "@/components/news/NewsPageContent";
import { Container } from "@/components/ui/Container";
import type { NewsCategoryFilter } from "@/data/newsData";
import {
  NewsDirectoryError,
  listPublicNewsArticles,
  type NewsCategory,
  type NewsPage,
  type PublicNewsArticle,
} from "@/lib/news/newsDirectory";
import { findPromotionForSlot } from "@/lib/promotions/promotionRuntime";
import { loadActivePromotionsForSlots } from "@/lib/promotions/promotionRuntime.server";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "뉴스·정보",
  description:
    "전국 파크골프 소식, 구장·예약 변경, 대회·행사, 자격증·심판, 대학·학과, 장비·브랜드, 초보 가이드를 한곳에서 확인하세요.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const categories = new Set<NewsCategory>([
  "parkGolfNews",
  "screenParkGolf",
  "equipmentBrand",
  "noticeOperation",
]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function category(value: string | undefined): NewsCategoryFilter {
  return value && categories.has(value as NewsCategory)
    ? (value as NewsCategory)
    : "all";
}

function emptyPage(offset: number): NewsPage<PublicNewsArticle> {
  return { items: [], total: 0, limit: 20, offset, hasMore: false };
}

function errorMessage(reason: unknown) {
  return reason instanceof NewsDirectoryError
    ? reason.userMessage
    : "뉴스·정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const activeCategory = category(first(params.category));
  const keyword = (first(params.keyword) ?? "").trim().slice(0, 100);
  const currentPage = pageNumber(first(params.page));
  const offset = (currentPage - 1) * 20;
  const client = await createClient();
  const showDerived = activeCategory === "all" && !keyword && currentPage === 1;

  const [pageResult, featuredResult, screenResult, equipmentResult, noticeResult, promotionResult] =
    await Promise.allSettled([
      listPublicNewsArticles(
        client,
        {
          category: activeCategory === "all" ? undefined : activeCategory,
          keyword: keyword || undefined,
        },
        20,
        offset,
      ),
      !keyword && currentPage === 1
        ? listPublicNewsArticles(
            client,
            {
              category: activeCategory === "all" ? undefined : activeCategory,
              featuredOnly: true,
            },
            3,
            0,
          )
        : Promise.resolve(emptyPage(0)),
      showDerived
        ? listPublicNewsArticles(client, { category: "screenParkGolf" }, 4, 0)
        : Promise.resolve(emptyPage(0)),
      showDerived
        ? listPublicNewsArticles(client, { category: "equipmentBrand" }, 3, 0)
        : Promise.resolve(emptyPage(0)),
      showDerived
        ? listPublicNewsArticles(client, { category: "noticeOperation" }, 3, 0)
        : Promise.resolve(emptyPage(0)),
      loadActivePromotionsForSlots(client, ["news.top.01", "news.after_list.01"]),
    ]);

  const page = pageResult.status === "fulfilled" ? pageResult.value : emptyPage(offset);
  const featuredPage = featuredResult.status === "fulfilled" ? featuredResult.value : emptyPage(0);
  const featured = featuredPage.items.length > 0
    ? featuredPage.items
    : currentPage === 1 && !keyword
      ? page.items.slice(0, 3)
      : [];

  return (
    <div className="bg-pul-page">
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <NewsPageContent
          page={page}
          featured={featured}
          screenNews={screenResult.status === "fulfilled" ? screenResult.value.items : []}
          equipmentNews={equipmentResult.status === "fulfilled" ? equipmentResult.value.items : []}
          noticeNews={noticeResult.status === "fulfilled" ? noticeResult.value.items : []}
          activeCategory={activeCategory}
          keyword={keyword}
          pageNumber={currentPage}
          error={pageResult.status === "rejected" ? errorMessage(pageResult.reason) : null}
          promotion={findPromotionForSlot(
            promotionResult.status === "fulfilled" ? promotionResult.value : [],
            "news.top.01",
          )}
          secondPromotion={findPromotionForSlot(
            promotionResult.status === "fulfilled" ? promotionResult.value : [],
            "news.after_list.01",
          )}
        />
      </Container>
    </div>
  );
}
