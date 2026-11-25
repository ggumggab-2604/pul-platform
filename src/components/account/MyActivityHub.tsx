import type { MyActivityOverview } from "@/lib/my/myActivity";
import {
  ChevronRight,
  MessageSquareText,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const postKindLabels: Record<MyActivityOverview["posts"][number]["kind"], string> = {
  community: "커뮤니티",
  club: "동호회",
  course: "골프장 이야기",
  certification: "자격증 준비",
};

const marketStatusLabels: Record<MyActivityOverview["marketItems"][number]["status"], string> = {
  selling: "판매중",
  reserved: "예약중",
  sold: "판매완료",
  open: "구매중",
  closed: "구매 완료",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function SectionHeader({
  icon: Icon,
  title,
  href,
  linkLabel,
}: {
  icon: LucideIcon;
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2 text-pul-deep">
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <h2 className="truncate text-lg font-bold">{title}</h2>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-lg px-2 text-sm font-bold text-pul-point hover:bg-pul-light/60"
      >
        {linkLabel}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-dashed border-pul-border bg-pul-light/20 px-4 py-5 text-center text-sm leading-6 text-pul-muted">
      {children}
    </p>
  );
}

export function MyActivityHub({
  activity,
  partialLoadFailed = false,
  section,
}: {
  activity: MyActivityOverview | null;
  partialLoadFailed?: boolean;
  section: "posts" | "market";
}) {
  const posts = activity?.posts ?? [];
  const marketItems = activity?.marketItems ?? [];

  return (
    <section>
      {partialLoadFailed && (
        <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          활동 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      {!partialLoadFailed && (section === "posts" ? (
        <article className="rounded-2xl border border-pul-border bg-white p-4 shadow-[0_3px_16px_rgba(6,78,59,0.05)] sm:p-5">
          <SectionHeader icon={MessageSquareText} title="내가 쓴 글" href="/community" linkLabel="커뮤니티" />
          {posts.length === 0 ? (
            <EmptyState>현재 다시 볼 수 있는 작성 글이 없습니다.</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-pul-border/70">
              {posts.map((post) => (
                <li key={`${post.kind}-${post.href}-${post.createdAt}`}>
                  <Link href={post.href} className="block min-h-14 py-3 hover:text-pul-point">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-foreground">{post.title}</p>
                        <p className="mt-0.5 truncate text-sm text-pul-muted">
                          {postKindLabels[post.kind]}
                          {post.contextLabel ? ` · ${post.contextLabel}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm text-pul-muted">{formatDate(post.createdAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      ) : (
        <article className="rounded-2xl border border-pul-border bg-white p-4 shadow-[0_3px_16px_rgba(6,78,59,0.05)] sm:p-5">
          <SectionHeader icon={ShoppingBag} title="내 장터" href="/market" linkLabel="중고장터" />
          {marketItems.length === 0 ? (
            <EmptyState>등록한 판매·삽니다·교환 글이 없습니다.</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-pul-border/70">
              {marketItems.map((item) => (
                <li key={`${item.kind}-${item.title}-${item.createdAt}`}>
                  <Link href={item.href} className="block min-h-14 py-3 hover:text-pul-point">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-foreground">{item.title}</p>
                        <p className="mt-0.5 truncate text-sm text-pul-muted">
                          {item.kind === "listing" ? "판매글" : item.kind === "exchange" ? "교환합니다" : "삽니다"} · {item.region} · {item.kind === "exchange" ? item.status === "open" ? "교환 중" : "교환 완료" : marketStatusLabels[item.status]}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold text-pul-deep">{item.kind === "exchange" ? "교환" : item.amount === null ? "예산 협의" : formatAmount(item.amount)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </section>
  );
}
