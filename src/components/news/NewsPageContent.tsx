"use client";

import { NewsPageHero } from "@/components/news/NewsPageHero";
import { NewsInquiryDialog } from "@/components/news/NewsInquiryDialog";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { Card } from "@/components/ui/Card";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import {
  NEWS_PAGE_COPY,
  categoryLabels,
  newsCategoryTabs,
  relatedMenuLinks,
  reportInquiryTypes,
  sourceTypeLabels,
  type NewsCategoryFilter,
} from "@/data/newsData";
import type {
  NewsPage,
  PublicNewsArticle,
} from "@/lib/news/newsDirectory";
import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";
import type { NewsInquiryType } from "@/lib/news/newsInquiries";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";

type NewsPageContentProps = {
  page: NewsPage<PublicNewsArticle>;
  featured: PublicNewsArticle[];
  screenNews: PublicNewsArticle[];
  equipmentNews: PublicNewsArticle[];
  noticeNews: PublicNewsArticle[];
  activeCategory: NewsCategoryFilter;
  keyword: string;
  pageNumber: number;
  error: string | null;
  promotion: ActiveSlotPromotion | null;
  secondPromotion: ActiveSlotPromotion | null;
};

const CARD_BASE =
  "flex h-full min-w-0 flex-col rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)]";
const SECTION_TITLE = "text-lg font-bold text-foreground lg:text-xl";
const SECTION_DESC = "mt-1.5 text-sm leading-6 text-pul-muted";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function categoryHref(category: NewsCategoryFilter, keyword: string) {
  const params = new URLSearchParams();
  if (category !== "all") params.set("category", category);
  if (keyword) params.set("keyword", keyword);
  const query = params.toString();
  return query ? `/news?${query}` : "/news";
}

function pageHref(page: number, category: NewsCategoryFilter, keyword: string) {
  const params = new URLSearchParams();
  if (category !== "all") params.set("category", category);
  if (keyword) params.set("keyword", keyword);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/news?${query}` : "/news";
}

function CategoryBadge({ article }: { article: PublicNewsArticle }) {
  return (
    <span className="inline-flex w-fit rounded-full border border-pul-point/30 bg-pul-light px-2.5 py-1 text-xs font-bold text-pul-deep">
      {categoryLabels[article.category]}
    </span>
  );
}

function SourceBadge({ article }: { article: PublicNewsArticle }) {
  const promotion = article.sourceType === "brandPromotion";
  return (
    <span
      className={cn(
        "inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-bold",
        promotion
          ? "border-orange-200 bg-orange-50 text-orange-800"
          : "border-pul-border bg-white text-pul-muted",
      )}
    >
      {sourceTypeLabels[article.sourceType]}
    </span>
  );
}

function NewsCard({ article, featured = false }: { article: PublicNewsArticle; featured?: boolean }) {
  return (
    <article className={CARD_BASE}>
      <div className="flex flex-wrap gap-1.5">
        <CategoryBadge article={article} />
        <SourceBadge article={article} />
      </div>
      <h3 className={cn("mt-3 font-bold text-foreground", featured ? "text-lg" : "text-base")}>
        <Link href={`/news/${encodeURIComponent(article.newsKey)}`} className="hover:text-pul-point">
          {article.title}
        </Link>
      </h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-pul-muted">{article.summary}</p>
      <p className="mt-3 text-xs text-pul-muted">
        {article.region} · {dateLabel(article.publishedAt)}
      </p>
      <Link
        href={`/news/${encodeURIComponent(article.newsKey)}`}
        aria-label={`${article.title} 자세히 보기`}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-4 text-sm font-bold text-white hover:bg-pul-deep"
      >
        자세히 보기
      </Link>
    </article>
  );
}

function DerivedSection({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: PublicNewsArticle[];
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className={SECTION_TITLE}>{title}</h2>
      <p className={SECTION_DESC}>{description}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((article) => <NewsCard key={article.newsKey} article={article} />)}
      </div>
    </section>
  );
}

export function NewsPageContent({
  page,
  featured,
  screenNews,
  equipmentNews,
  noticeNews,
  activeCategory,
  keyword,
  pageNumber,
  error,
  promotion,
  secondPromotion,
}: NewsPageContentProps) {
  const [inquiry, setInquiry] = useState<{
    inquiryType: NewsInquiryType;
    trigger: HTMLButtonElement;
  } | null>(null);
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit));

  const openInquiry = (
    inquiryType: NewsInquiryType,
    trigger: HTMLButtonElement,
  ) => {
    setInquiry({ inquiryType, trigger });
  };

  return (
    <>
      <NewsPageHero
        onReport={(trigger) => openInquiry("news_report", trigger)}
        onPromotionInquiry={(trigger) => openInquiry("promotion_inquiry", trigger)}
      />

      {promotion ? (
        <div className="mt-4 lg:mt-6">
          <PromotionBanner promotion={promotion} variant="horizontal" />
        </div>
      ) : null}

      <div className="mt-4 space-y-6 lg:mt-6 lg:space-y-8">
        <section className="rounded-xl border border-pul-border bg-white p-3 lg:p-5">
          <nav aria-label="뉴스 카테고리" className="overflow-x-auto">
            <div className="flex min-w-max gap-2 lg:flex-wrap">
              {newsCategoryTabs.map((tab) => (
                <Link
                  key={tab.id}
                  href={categoryHref(tab.id, keyword)}
                  aria-current={activeCategory === tab.id ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold",
                    activeCategory === tab.id
                      ? "border-pul-point bg-pul-point text-white"
                      : "border-pul-border bg-white text-pul-muted hover:text-pul-deep",
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </nav>
          <form action="/news" method="get" className="mt-4 flex flex-col gap-2 sm:flex-row">
            {activeCategory !== "all" ? (
              <input type="hidden" name="category" value={activeCategory} />
            ) : null}
            <label htmlFor="news-keyword" className="sr-only">뉴스 검색어</label>
            <input
              id="news-keyword"
              name="keyword"
              type="search"
              defaultValue={keyword}
              maxLength={100}
              placeholder="제목, 내용, 지역으로 검색"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-pul-border px-3 text-base"
            />
            <button type="submit" className="min-h-11 rounded-lg bg-pul-deep px-6 font-bold text-white hover:bg-pul-point">
              검색
            </button>
          </form>
        </section>

        {featured.length > 0 && pageNumber === 1 && !keyword ? (
          <section>
            <h2 className={SECTION_TITLE}>주요 소식</h2>
            <p className={SECTION_DESC}>지금 확인하면 좋은 파크골프 주요 소식입니다.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {featured.map((article) => (
                <NewsCard key={article.newsKey} article={article} featured />
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="latest-news-heading" aria-busy={false}>
          <h2 id="latest-news-heading" className={SECTION_TITLE}>최신 뉴스·정보</h2>
          <p className={SECTION_DESC}>PUL 운영자가 확인한 소식을 게시일 최신순으로 제공합니다.</p>
          {error ? (
            <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </p>
          ) : page.items.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-pul-border bg-white px-4 py-10 text-center">
              <p className="font-bold text-foreground">현재 등록된 뉴스·정보가 없습니다.</p>
              <p className="mt-2 text-sm text-pul-muted">새로운 파크골프 소식이 확인되면 업데이트됩니다.</p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {page.items.map((article) => <NewsCard key={article.newsKey} article={article} />)}
            </div>
          )}

          {page.total > page.limit ? (
            <nav aria-label="뉴스 페이지" className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {pageNumber > 1 ? (
                <Link href={pageHref(pageNumber - 1, activeCategory, keyword)} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep">
                  이전
                </Link>
              ) : null}
              <span className="px-2 text-sm font-bold text-foreground">{pageNumber} / {totalPages}</span>
              {page.hasMore ? (
                <Link href={pageHref(pageNumber + 1, activeCategory, keyword)} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep">
                  다음
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>

        {secondPromotion ? <PromotionBanner promotion={secondPromotion} variant="horizontal" /> : null}

        {activeCategory === "all" && !keyword && pageNumber === 1 ? (
          <>
            <DerivedSection title="스크린 파크골프 소식" description="스크린 신규 오픈, 이벤트와 업체 소식을 확인하세요." items={screenNews} />
            <DerivedSection title="장비·브랜드 소식" description="신제품, 시타 행사와 업체 홍보 소식을 확인하세요." items={equipmentNews} />
            <DerivedSection title="공지·운영 안내" description="PUL의 뉴스 운영 안내와 확인된 공지를 제공합니다." items={noticeNews} />
          </>
        ) : null}

        <section>
          <h2 className={SECTION_TITLE}>관련 메뉴 바로가기</h2>
          <p className={SECTION_DESC}>일정과 실제 디렉터리 정보는 각 전용 메뉴에서 확인하세요.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {relatedMenuLinks.map((shortcut) => (
              <article key={shortcut.id} className={CARD_BASE}>
                <h3 className="text-base font-bold text-foreground">{shortcut.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-pul-muted">{shortcut.description}</p>
                <Link href={shortcut.href} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-pul-light px-4 text-sm font-bold text-pul-deep">
                  {shortcut.buttonLabel}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <div className="lg:hidden">
          <CollapsibleSection title="소식 제보·홍보 문의" summary="제보·홍보 문의 안내를 확인하세요.">
            <InquiryContent
              onReport={(trigger) => openInquiry("news_report", trigger)}
              onPromotion={(trigger) => openInquiry("promotion_inquiry", trigger)}
            />
          </CollapsibleSection>
        </div>
        <div className="hidden lg:block">
          <Card title="소식 제보·홍보 문의" dense>
            <InquiryContent
              onReport={(trigger) => openInquiry("news_report", trigger)}
              onPromotion={(trigger) => openInquiry("promotion_inquiry", trigger)}
            />
          </Card>
        </div>

        <p className="whitespace-pre-line rounded-xl border border-pul-border bg-white px-4 py-4 text-xs leading-6 text-pul-muted">
          {NEWS_PAGE_COPY.disclaimer}
        </p>
      </div>

      {inquiry ? (
        <NewsInquiryDialog
          inquiryType={inquiry.inquiryType}
          trigger={inquiry.trigger}
          onClose={() => setInquiry(null)}
        />
      ) : null}
    </>
  );
}

function InquiryContent({
  onReport,
  onPromotion,
}: {
  onReport: (trigger: HTMLButtonElement) => void;
  onPromotion: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <div>
      <p className="text-sm leading-6 text-pul-muted">{NEWS_PAGE_COPY.inquiryNote}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {reportInquiryTypes.map((item) => (
          <div key={item.id} className="rounded-lg border border-pul-border bg-[#fafbfa] p-3">
            <p className="font-bold text-foreground">{item.title}</p>
            <p className="mt-1 text-sm text-pul-muted">{item.description}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={(event) => onReport(event.currentTarget)} className="min-h-11 flex-1 rounded-lg bg-pul-point px-4 font-bold text-white">소식 제보하기</button>
        <button type="button" onClick={(event) => onPromotion(event.currentTarget)} className="min-h-11 flex-1 rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep">홍보 문의하기</button>
      </div>
    </div>
  );
}
