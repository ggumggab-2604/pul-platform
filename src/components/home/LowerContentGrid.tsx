import { Card } from "@/components/ui/Card";
import { SectionMoreLink } from "@/components/ui/SectionMoreLink";
import { popularPosts } from "@/data/homeData";
import { categoryLabels } from "@/data/newsData";
import type { HomeClub } from "@/lib/home/homeAggregation";
import type { PublicNewsArticle } from "@/lib/news/newsDirectory";
import type { MarketListing } from "@/types";
import Link from "next/link";

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

const LOWER_CARD_CLASS = "min-h-[280px] lg:min-h-[300px]";

const PC_POSTS = popularPosts.slice(0, 5);
const MOBILE_POSTS = popularPosts.slice(0, 3);

type LowerContentGridProps = {
  listings: MarketListing[];
  clubs: HomeClub[];
  news: PublicNewsArticle[];
  marketLoadFailed?: boolean;
  clubsLoadFailed?: boolean;
  newsLoadFailed?: boolean;
  /**
   * 모바일: 목록 축소 + 더보기 (상단과 역할 분리, 길이 유지)
   */
  mobileCompact?: boolean;
};

export function LowerContentGrid({
  listings,
  clubs,
  news,
  marketLoadFailed = false,
  clubsLoadFailed = false,
  newsLoadFailed = false,
  mobileCompact = false,
}: LowerContentGridProps) {
  const mobileNews = news.slice(0, 3);

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
      <Card
        dense
        fullHeight
        className={LOWER_CARD_CLASS}
        title="최근 등록 매물"
        action={
          <Link
            href="/market"
            className="text-sm font-semibold text-pul-point hover:underline"
          >
            더보기
          </Link>
        }
      >
        {marketLoadFailed ? (
          <p role="status" className="text-sm leading-6 text-pul-muted">
            최근 매물을 불러오지 못했습니다.
          </p>
        ) : listings.length === 0 ? (
          <p className="text-sm leading-6 text-pul-muted">추가로 표시할 매물이 없습니다.</p>
        ) : (
        <ul className="space-y-2">
          {listings.map((item) => (
            <li key={item.id}>
              <Link
                href="/market"
                className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-pul-light/60"
              >
                <div
                  className="h-10 w-10 shrink-0 rounded-lg bg-cover bg-center ring-1 ring-amber-200/60"
                  style={{
                    backgroundImage: `url('${item.image ?? "/images/banner-equipment.jpg"}')`,
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  <p className="text-sm font-bold text-pul-point">
                    {formatPrice(item.price)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        )}
        {mobileCompact ? (
          <SectionMoreLink href="/market" label="장터 더보기" mobileOnly />
        ) : null}
      </Card>

      <Card
        dense
        fullHeight
        className={LOWER_CARD_CLASS}
        title="추천 동호회"
        action={
          <Link
            href="/clubs"
            className="text-sm font-semibold text-pul-point hover:underline"
          >
            더보기
          </Link>
        }
      >
        {clubsLoadFailed ? (
          <p role="status" className="text-sm leading-6 text-pul-muted">
            추천 동호회를 불러오지 못했습니다.
          </p>
        ) : clubs.length === 0 ? (
          <p className="text-sm leading-6 text-pul-muted">추가로 표시할 동호회가 없습니다.</p>
        ) : (
        <ul className="space-y-2">
          {clubs.map((club) => (
            <li key={club.legacyKey}>
              <Link
                href={`/clubs/${club.legacyKey}`}
                className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-pul-light/60"
              >
                <div
                  className="h-10 w-10 shrink-0 rounded-lg bg-cover bg-center ring-1 ring-emerald-200/60"
                  style={{ backgroundImage: "url('/images/banner-course.jpg')" }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{club.name}</p>
                  <p className="truncate text-xs text-pul-muted">
                    {club.regionLabel}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        )}
        {mobileCompact ? (
          <SectionMoreLink href="/clubs" label="동호회 더보기" mobileOnly />
        ) : null}
      </Card>

      <Card dense fullHeight className={LOWER_CARD_CLASS} title="커뮤니티 인기글">
        <ul className="space-y-2 lg:hidden">
          {MOBILE_POSTS.map((post) => (
            <PostRow key={post.id} post={post} />
          ))}
        </ul>
        <ul className="hidden space-y-2 lg:block">
          {PC_POSTS.map((post) => (
            <PostRow key={post.id} post={post} />
          ))}
        </ul>
        {mobileCompact ? (
          <SectionMoreLink href="/community" label="커뮤니티 전체보기" mobileOnly />
        ) : null}
      </Card>

      <Card dense fullHeight className={LOWER_CARD_CLASS} title="PUL 뉴스">
        {newsLoadFailed ? (
          <p role="status" className="text-sm leading-6 text-pul-muted">
            뉴스를 불러오지 못했습니다.
          </p>
        ) : news.length === 0 ? (
          <p className="text-sm leading-6 text-pul-muted">추가로 표시할 뉴스가 없습니다.</p>
        ) : (
        <>
        <ul className="space-y-2 lg:hidden">
          {mobileNews.map((article) => (
            <NewsRow key={article.newsKey} news={article} />
          ))}
        </ul>
        <ul className="hidden space-y-2 lg:block">
          {news.map((article) => (
            <NewsRow key={article.newsKey} news={article} />
          ))}
        </ul>
        </>
        )}
        {mobileCompact ? (
          <SectionMoreLink href="/news" label="뉴스 전체보기" mobileOnly />
        ) : null}
      </Card>
    </section>
  );
}

function PostRow({ post }: { post: (typeof popularPosts)[number] }) {
  return (
    <li>
      <Link
        href={`/community/${post.id}`}
        className="flex gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-pul-light/60"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-pul-light text-sm font-bold text-pul-point">
          {post.rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{post.title}</p>
          <p className="text-xs text-pul-muted">조회 {post.views}</p>
        </div>
      </Link>
    </li>
  );
}

function NewsRow({ news }: { news: PublicNewsArticle }) {
  return (
    <li>
      <Link
        href={`/news/${news.newsKey}`}
        className="block rounded-lg px-1 py-1.5 transition-colors hover:bg-pul-light/60"
      >
        <span className="mr-1.5 inline-block rounded-md bg-pul-light px-2 py-0.5 text-xs font-bold text-pul-deep">
          {categoryLabels[news.category]}
        </span>
        <span className="text-sm leading-snug">{news.title}</span>
      </Link>
    </li>
  );
}
