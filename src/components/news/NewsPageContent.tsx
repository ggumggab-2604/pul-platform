"use client";

import { useState } from "react";
import Link from "next/link";

import { NewsPageHero } from "@/components/news/NewsPageHero";
import { NewsInquiryDialog } from "@/components/news/NewsInquiryDialog";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { NEWS_PAGE_COPY, categoryLabels, newsCategoryTabs, newsSectionLabel, sourceTypeLabels } from "@/data/newsData";
import type { NewsPage, PublicNewsArticle } from "@/lib/news/newsDirectory";
import type { NewsInquiryType } from "@/lib/news/newsInquiries";
import { newsArticleHref, newsListHref, type NewsCategoryFilter } from "@/lib/news/newsNavigation";
import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";
import { cn } from "@/lib/utils";

type NewsPageContentProps = {
  page: NewsPage<PublicNewsArticle>;
  featured: PublicNewsArticle[];
  activeCategory: NewsCategoryFilter;
  keyword: string;
  pageNumber: number;
  error: string | null;
  promotion: ActiveSlotPromotion | null;
  secondPromotion: ActiveSlotPromotion | null;
};

const articleDate = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

function NewsCard({ article, returnTo }: { article: PublicNewsArticle; returnTo: string }) {
  return (
    <article className="min-w-0 rounded-xl border border-pul-border bg-white shadow-sm hover:border-pul-point/60">
      <Link href={newsArticleHref(article.newsKey, returnTo)} className="group block h-full rounded-xl p-3.5 sm:p-4">
        <div className="flex flex-wrap gap-1.5 text-xs font-bold">
          <span className="rounded-full bg-pul-light px-2.5 py-1 text-pul-deep">{newsSectionLabel(article)}</span>
          <span className={cn(
            "rounded-full px-2.5 py-1",
            article.sourceType === "brandPromotion" ? "bg-orange-50 text-orange-800" : "bg-slate-100 text-slate-700",
          )}>{sourceTypeLabels[article.sourceType]}</span>
        </div>
        <h3 className="mt-2 break-words text-base font-bold leading-snug text-foreground group-hover:text-pul-deep group-hover:underline sm:text-lg">
          {article.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 break-words text-sm leading-6 text-pul-muted">{article.summary}</p>
        <p className="mt-2.5 flex flex-wrap gap-x-2 gap-y-0.5 break-words text-xs leading-5 text-pul-muted">
          {article.sourceName ? <span className="min-w-0 font-semibold">{article.sourceName}</span> : null}
          <time dateTime={article.publishedAt}>{articleDate.format(new Date(article.publishedAt))}</time>
        </p>
      </Link>
    </article>
  );
}

export function NewsPageContent({
  page, featured, activeCategory, keyword, pageNumber, error, promotion, secondPromotion,
}: NewsPageContentProps) {
  const [inquiry, setInquiry] = useState<{ inquiryType: NewsInquiryType; trigger: HTMLButtonElement } | null>(null);
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit));
  const returnTo = newsListHref(activeCategory, keyword, pageNumber);
  const legacy = Object.hasOwn(categoryLabels, activeCategory)
    ? categoryLabels[activeCategory as keyof typeof categoryLabels]
    : null;
  // Keep the RPC's original page boundaries. Every removed card is already visible on this page.
  const featuredKeys = new Set(featured.map((article) => article.newsKey));
  const latest = page.items.filter((article) => !featuredKeys.has(article.newsKey));
  const openInquiry = (inquiryType: NewsInquiryType, trigger: HTMLButtonElement) => setInquiry({ inquiryType, trigger });

  return (
    <>
      <NewsPageHero
        onReport={(trigger) => openInquiry("news_report", trigger)}
        onPromotionInquiry={(trigger) => openInquiry("promotion_inquiry", trigger)}
      />

      <div className="mt-2.5 space-y-4 sm:mt-3 sm:space-y-6">
        <section aria-label="뉴스 찾기" className="rounded-xl border border-pul-border bg-white p-2.5 sm:p-3">
          <div className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav aria-label="뉴스 카테고리" className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap">
              {newsCategoryTabs.map((tab) => (
                <Link
                  key={tab.id}
                  href={newsListHref(tab.id, keyword)}
                  aria-current={activeCategory === tab.id ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border px-1.5 text-sm font-bold sm:px-3",
                    activeCategory === tab.id
                      ? "border-pul-deep bg-pul-deep text-white"
                      : "border-pul-border text-pul-deep hover:bg-pul-light",
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
            <form key={keyword} action="/news" method="get" role="search" className="flex gap-1.5 lg:w-full lg:max-w-sm">
              {activeCategory !== "all" ? <input type="hidden" name="category" value={activeCategory} /> : null}
              <label htmlFor="news-keyword" className="sr-only">뉴스 검색어</label>
              <input
                id="news-keyword"
                name="keyword"
                type="search"
                defaultValue={keyword}
                maxLength={100}
                placeholder="제목·내용·발행기관 검색"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-pul-border px-2.5 text-base"
              />
              <button type="submit" className="min-h-11 shrink-0 rounded-lg bg-pul-light px-3 text-sm font-bold text-pul-deep hover:bg-emerald-100 sm:px-4">
                검색
              </button>
            </form>
          </div>
          {legacy ? <p className="mt-2 text-sm font-semibold text-pul-muted">기존 분류 · {legacy}</p> : null}
        </section>

        {promotion ? <PromotionBanner promotion={promotion} variant="horizontal" /> : null}

        {featured.length ? (
          <section aria-labelledby="featured-news-heading">
            <h2 id="featured-news-heading" className="text-lg font-bold text-foreground">주요 소식</h2>
            <div className="mt-2 grid gap-2.5 md:grid-cols-2 lg:grid-cols-3">
              {featured.map((article) => <NewsCard key={article.newsKey} article={article} returnTo={returnTo} />)}
            </div>
          </section>
        ) : null}

        {latest.length || error || !page.items.length || totalPages > 1 ? (
          <section aria-labelledby="latest-news-heading">
            <h2 id="latest-news-heading" className="break-words text-lg font-bold text-foreground">
              {keyword ? `‘${keyword}’ 검색 결과` : "최신 뉴스·정보"}
            </h2>
            {error ? (
              <p role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>
            ) : latest.length ? (
              <div className="mt-2 grid gap-2.5 md:grid-cols-2 lg:grid-cols-3">
                {latest.map((article) => <NewsCard key={article.newsKey} article={article} returnTo={returnTo} />)}
              </div>
            ) : !page.items.length ? (
              <p className="mt-2 rounded-xl border border-dashed border-pul-border bg-white px-4 py-8 text-center font-semibold">
                {keyword ? "검색 결과가 없습니다." : page.total ? "이 페이지에 표시할 소식이 없습니다." : "현재 등록된 뉴스·정보가 없습니다."}
              </p>
            ) : null}
            {totalPages > 1 || pageNumber > 1 ? (
              <nav aria-label="뉴스 페이지" className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {pageNumber > 1 ? (
                  <Link href={newsListHref(activeCategory, keyword, Math.min(pageNumber - 1, totalPages))} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep">
                    이전
                  </Link>
                ) : null}
                <span className="px-2 text-sm font-bold text-foreground">{pageNumber} / {totalPages}</span>
                {page.hasMore ? (
                  <Link href={newsListHref(activeCategory, keyword, pageNumber + 1)} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep">
                    다음
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </section>
        ) : null}

        {secondPromotion ? <PromotionBanner promotion={secondPromotion} variant="horizontal" /> : null}
        <div className="border-t border-pul-border py-3 text-xs leading-6 text-pul-muted">
          <p className="whitespace-pre-line">{NEWS_PAGE_COPY.disclaimer}</p>
          <p>{NEWS_PAGE_COPY.inquiryNote}</p>
        </div>
      </div>

      {inquiry ? <NewsInquiryDialog inquiryType={inquiry.inquiryType} trigger={inquiry.trigger} onClose={() => setInquiry(null)} /> : null}
    </>
  );
}
