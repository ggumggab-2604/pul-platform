import { Card } from "@/components/ui/Card";
import { categoryLabels } from "@/data/newsData";
import type { PublicNewsArticle } from "@/lib/news/newsDirectory";
import { cn } from "@/lib/utils";
import Link from "next/link";

type LiveNewsCardProps = {
  articles: PublicNewsArticle[];
  loadFailed?: boolean;
  compact?: boolean;
  fullHeight?: boolean;
  className?: string;
  /** 표시 개수 (미지정 시 compact 4 / 기본 5) */
  maxItems?: number;
};

export function LiveNewsCard({
  articles,
  loadFailed = false,
  compact = false,
  fullHeight = false,
  className,
  maxItems,
}: LiveNewsCardProps) {
  const limit = maxItems ?? (compact ? 4 : 5);
  const items = articles.slice(0, limit);

  return (
    <Card
      dense={compact}
      fullHeight={fullHeight}
      className={className}
      title="PUL 실시간 소식"
      action={
        <Link
          href="/news"
          className="text-sm font-semibold text-pul-point hover:underline"
        >
          더보기
        </Link>
      }
      bodyClassName={cn(fullHeight && "flex flex-1 flex-col")}
    >
      {loadFailed ? (
        <p role="status" className="text-sm leading-6 text-pul-muted">
          최신 소식을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm leading-6 text-pul-muted">
          등록된 최신 소식이 없습니다.
        </p>
      ) : (
      <ul
        className={cn(
          compact ? "space-y-2" : "space-y-3",
          fullHeight && "flex-1",
        )}
      >
        {items.map((item) => (
          <li
            key={item.newsKey}
            className={
              compact
                ? "border-b border-pul-border/60 pb-2 last:border-0 last:pb-0"
                : "border-b border-pul-border/60 pb-3 last:border-0 last:pb-0"
            }
          >
            <Link href={`/news/${item.newsKey}`} className="group block">
              <div className="flex items-start gap-2">
                <span
                  className="shrink-0 rounded bg-pul-light px-1.5 py-0.5 text-xs font-bold text-pul-deep"
                >
                  {categoryLabels[item.category]}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      compact
                        ? "line-clamp-1 text-base leading-snug group-hover:text-pul-point"
                        : "line-clamp-2 text-base leading-snug group-hover:text-pul-point"
                    }
                  >
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-sm text-pul-muted">
                    {new Intl.DateTimeFormat("ko-KR", {
                      month: "short",
                      day: "numeric",
                      timeZone: "Asia/Seoul",
                    }).format(new Date(item.publishedAt))}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      )}
    </Card>
  );
}
