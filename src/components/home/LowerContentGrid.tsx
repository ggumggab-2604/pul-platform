import { Card } from "@/components/ui/Card";
import { SectionMoreLink } from "@/components/ui/SectionMoreLink";
import {
  homeTopMarketItemIds,
  popularPosts,
  pulNews,
  recommendedClubs,
} from "@/data/homeData";
import { marketListings } from "@/data/marketData";
import Link from "next/link";

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

const LOWER_CARD_CLASS = "min-h-[280px] lg:min-h-[300px]";

const TOP_MARKET_ID_SET = new Set<string>(homeTopMarketItemIds);

/** 최신 매물 — 상단 장터 인기 상품 ID 제외, 최대 3건 */
const recentListings = marketListings
  .filter((item) => !TOP_MARKET_ID_SET.has(item.id))
  .slice(0, 3);

const PC_POSTS = popularPosts.slice(0, 5);
const PC_NEWS = pulNews.slice(0, 5);
const MOBILE_POSTS = popularPosts.slice(0, 3);
const MOBILE_NEWS = pulNews.slice(0, 3);

type LowerContentGridProps = {
  /**
   * 모바일: 목록 축소 + 더보기 (상단과 역할 분리, 길이 유지)
   */
  mobileCompact?: boolean;
};

export function LowerContentGrid({ mobileCompact = false }: LowerContentGridProps) {
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
        <ul className="space-y-2">
          {recentListings.map((item) => (
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
        <ul className="space-y-2">
          {recommendedClubs.slice(0, 3).map((club) => (
            <li key={club.id}>
              <Link
                href={`/clubs/${club.id}`}
                className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-pul-light/60"
              >
                <div
                  className="h-10 w-10 shrink-0 rounded-lg bg-cover bg-center ring-1 ring-emerald-200/60"
                  style={{ backgroundImage: "url('/images/banner-course.jpg')" }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{club.name}</p>
                  <p className="truncate text-xs text-pul-muted">
                    {club.location} · {club.members}명
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
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
        <ul className="space-y-2 lg:hidden">
          {MOBILE_NEWS.map((news) => (
            <NewsRow key={news.id} news={news} />
          ))}
        </ul>
        <ul className="hidden space-y-2 lg:block">
          {PC_NEWS.map((news) => (
            <NewsRow key={news.id} news={news} />
          ))}
        </ul>
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

function NewsRow({ news }: { news: (typeof pulNews)[number] }) {
  return (
    <li>
      <Link
        href={`/news/${news.id}`}
        className="block rounded-lg px-1 py-1.5 transition-colors hover:bg-pul-light/60"
      >
        <span className="mr-1.5 inline-block rounded-md bg-pul-light px-2 py-0.5 text-xs font-bold text-pul-deep">
          {news.category}
        </span>
        <span className="text-sm leading-snug">{news.title}</span>
      </Link>
    </li>
  );
}
