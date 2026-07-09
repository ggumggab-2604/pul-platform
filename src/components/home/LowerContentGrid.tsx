import { Card } from "@/components/ui/Card";
import {
  marketItems,
  popularPosts,
  pulNews,
  recommendedClubs,
} from "@/data/homeData";
import Link from "next/link";

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

const LOWER_CARD_CLASS = "min-h-[280px] lg:min-h-[300px]";

export function LowerContentGrid() {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
      <Card dense fullHeight className={LOWER_CARD_CLASS} title="커뮤니티 인기글">
        <ul className="space-y-2">
          {popularPosts.map((post) => (
            <li key={post.id}>
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
          ))}
        </ul>
      </Card>

      <Card dense fullHeight className={LOWER_CARD_CLASS} title="PUL 뉴스">
        <ul className="space-y-2">
          {pulNews.map((news) => (
            <li key={news.id}>
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
          ))}
        </ul>
      </Card>

      <Card dense fullHeight className={LOWER_CARD_CLASS} title="추천 동호회">
        <ul className="space-y-2">
          {recommendedClubs.map((club) => (
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
      </Card>

      <Card dense fullHeight className={LOWER_CARD_CLASS} title="장터 인기 상품">
        <ul className="space-y-2">
          {marketItems.map((item) => (
            <li key={item.id}>
              <Link
                href={`/market/${item.id}`}
                className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-pul-light/60"
              >
                <div
                  className="h-10 w-10 shrink-0 rounded-lg bg-cover bg-center ring-1 ring-amber-200/60"
                  style={{
                    backgroundImage: "url('/images/banner-equipment.jpg')",
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
      </Card>
    </section>
  );
}
