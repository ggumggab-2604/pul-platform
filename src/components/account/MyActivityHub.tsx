import type { PublicLessonVideoPage } from "@/lib/lessons/lessonDirectory";
import type { MyActivityOverview } from "@/lib/my/myActivity";
import {
  BookmarkCheck,
  CalendarDays,
  ChevronRight,
  MessageSquareText,
  ShoppingBag,
  UsersRound,
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
  closed: "구매종료",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
        <h3 className="truncate text-lg font-bold">{title}</h3>
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
  bookmarkPage,
  partialLoadFailed = false,
}: {
  activity: MyActivityOverview | null;
  bookmarkPage: PublicLessonVideoPage | null;
  partialLoadFailed?: boolean;
}) {
  const clubs = activity?.clubs ?? [];
  const events = activity?.upcomingEvents ?? [];
  const posts = activity?.posts ?? [];
  const marketItems = activity?.marketItems ?? [];
  const bookmarks = bookmarkPage?.items ?? [];

  return (
    <section className="mt-5" aria-labelledby="my-activity-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <p className="text-sm font-bold text-pul-point">다시 찾기</p>
          <h2 id="my-activity-title" className="mt-0.5 text-2xl font-bold text-foreground">
            내 활동
          </h2>
          <p className="mt-1 text-sm leading-6 text-pul-muted">
            가입한 동호회, 참가 일정, 작성한 글과 장터 활동, 관심 영상을 한곳에서 확인하세요.
          </p>
        </div>
      </div>

      {partialLoadFailed && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          일부 활동 정보를 불러오지 못했습니다. 표시된 항목은 정상적으로 확인할 수 있습니다.
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-pul-border bg-white p-4 shadow-[0_3px_16px_rgba(6,78,59,0.05)] sm:p-5">
          <SectionHeader icon={UsersRound} title="내 동호회" href="/clubs" linkLabel="동호회 찾기" />
          {clubs.length === 0 ? (
            <EmptyState>현재 확인할 수 있는 가입 동호회가 없습니다.</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-pul-border/70">
              {clubs.map((club) => (
                <li key={club.publicKey}>
                  <Link
                    href={`/clubs/${club.publicKey}`}
                    className="flex min-h-14 items-center justify-between gap-3 py-3 hover:text-pul-point"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold text-foreground">{club.name}</p>
                      <p className="mt-0.5 truncate text-sm text-pul-muted">
                        {club.regionLabel} · {club.membershipStatus === "active" ? "활동중" : "활동 정지"}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-pul-muted" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-2xl border border-pul-border bg-white p-4 shadow-[0_3px_16px_rgba(6,78,59,0.05)] sm:p-5">
          <SectionHeader icon={CalendarDays} title="참가 예정 일정" href="/clubs" linkLabel="동호회 보기" />
          {events.length === 0 ? (
            <EmptyState>참가 신청한 예정 일정이 없습니다.</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-pul-border/70">
              {events.map((event) => (
                <li
                  key={`${event.clubPublicKey}-${event.startsAt}-${event.title}-${event.location}-${event.joinedAt}`}
                >
                  <Link
                    href={`/clubs/${event.clubPublicKey}`}
                    className="block min-h-14 py-3 hover:text-pul-point"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-foreground">{event.title}</p>
                        <p className="mt-0.5 truncate text-sm text-pul-muted">
                          {event.clubName} · {event.location}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-pul-point">
                        {formatDateTime(event.startsAt)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

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

        <article className="rounded-2xl border border-pul-border bg-white p-4 shadow-[0_3px_16px_rgba(6,78,59,0.05)] sm:p-5">
          <SectionHeader icon={ShoppingBag} title="내 장터" href="/market" linkLabel="중고장터" />
          {marketItems.length === 0 ? (
            <EmptyState>등록한 판매글이나 구매요청이 없습니다.</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-pul-border/70">
              {marketItems.map((item) => (
                <li key={`${item.kind}-${item.title}-${item.createdAt}`}>
                  <Link href={item.href} className="block min-h-14 py-3 hover:text-pul-point">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-foreground">{item.title}</p>
                        <p className="mt-0.5 truncate text-sm text-pul-muted">
                          {item.kind === "listing" ? "판매글" : "구매요청"} · {item.region} · {marketStatusLabels[item.status]}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold text-pul-deep">{formatAmount(item.amount)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-2xl border border-pul-border bg-white p-4 shadow-[0_3px_16px_rgba(6,78,59,0.05)] sm:p-5 lg:col-span-2">
          <SectionHeader icon={BookmarkCheck} title="관심 레슨 영상" href="/lessons" linkLabel="레슨·교육" />
          {bookmarks.length === 0 ? (
            <EmptyState>저장한 관심 레슨 영상이 없습니다.</EmptyState>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {bookmarks.map((video) => (
                <li key={video.videoKey}>
                  <a
                    href={video.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block min-h-20 rounded-xl border border-pul-border px-4 py-3 hover:border-pul-point hover:bg-pul-light/20"
                  >
                    <p className="line-clamp-2 font-bold leading-6 text-foreground">{video.title}</p>
                    <p className="mt-1 truncate text-sm text-pul-muted">
                      {video.channelName} · {video.duration}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}
