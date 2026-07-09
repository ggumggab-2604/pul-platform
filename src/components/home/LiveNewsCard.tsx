import { Card } from "@/components/ui/Card";
import { liveNewsItems } from "@/data/homeData";
import Link from "next/link";

type LiveNewsCardProps = {
  compact?: boolean;
};

export function LiveNewsCard({ compact = false }: LiveNewsCardProps) {
  const items = compact ? liveNewsItems.slice(0, 4) : liveNewsItems.slice(0, 5);

  return (
    <Card
      dense={compact}
      title="PUL 실시간 소식"
      action={
        <Link
          href="/news"
          className="text-sm font-semibold text-pul-point hover:underline"
        >
          더보기
        </Link>
      }
    >
      <ul className={compact ? "space-y-2" : "space-y-3"}>
        {items.map((item) => (
          <li
            key={item.id}
            className={
              compact
                ? "border-b border-pul-border/60 pb-2 last:border-0 last:pb-0"
                : "border-b border-pul-border/60 pb-3 last:border-0 last:pb-0"
            }
          >
            <Link href={`/news/${item.id}`} className="group block">
              <div className="flex items-start gap-2">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${item.badgeColor}`}
                >
                  {item.badge}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      compact
                        ? "line-clamp-1 text-sm leading-snug group-hover:text-pul-point lg:text-base"
                        : "line-clamp-2 text-base leading-snug group-hover:text-pul-point"
                    }
                  >
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs text-pul-muted sm:text-sm">
                    {item.time}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
