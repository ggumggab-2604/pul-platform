import Link from "next/link";
import { Bell, CalendarDays, ChevronRight, CircleHelp, Flag, MessageCircle, Pencil, Settings, SquarePen, Store, Trophy, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { MailboxType, MessageCursor, MessagePage, MessageSummary, MessageReportSummary } from "@/lib/messaging/messaging";
import { cursorHref, mailboxDate, mailboxHref, mailboxLabels, messageDate, messageFirstLine, messageButton, reportReasonLabels } from "@/lib/messaging/messagingUi";

const icons = {
  direct: MessageCircle, market: Store, course_inquiry: CircleHelp, club_event_broadcast: Users,
  participation: Users, club_broadcast: Users, tournament_broadcast: CalendarDays, companion: Trophy,
  correction: SquarePen, course_broadcast: Flag, platform_broadcast: Bell,
} satisfies Record<MailboxType, typeof Bell>;

export function MessagingShell({ children, box }: { children: ReactNode; box?: "inbox" | "sent" | "blocked" }) {
  return <main className="min-h-[60vh] bg-pul-page px-3 py-5 sm:py-9"><div className="mx-auto max-w-6xl">
    <header className="rounded-t-2xl bg-pul-deep px-3 pt-3 text-white sm:px-6 sm:pt-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-extrabold sm:gap-3 sm:text-2xl"><span aria-hidden="true" className="rounded-md bg-white px-2 py-0.5 font-black text-pul-deep">P</span><span aria-hidden="true">PUL</span><span className="border-l border-white/35 pl-2 sm:pl-3">쪽지</span></h1>
        <Link href="/messages/new" prefetch={false} className={`${messageButton} gap-1.5 !px-2.5 text-sm sm:!px-4 sm:text-base`}><Pencil aria-hidden="true" size={17} />새 쪽지 작성</Link>
      </div>
      <nav aria-label="쪽지함" className="mt-3 flex gap-1 sm:gap-3">
        {([["inbox", "/messages", "받은 쪽지"], ["sent", "/messages/sent", "보낸 쪽지"]] as const).map(([key, href, label]) =>
          <Link key={key} href={href} prefetch={false} aria-current={box === key ? "page" : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-t-lg px-4 font-bold sm:flex-none sm:px-7 ${box === key ? "bg-white text-pul-deep" : "hover:bg-white/15"}`}>{label}</Link>)}
      </nav>
    </header>
    <div className="rounded-b-2xl border border-t-0 border-pul-border bg-white p-3 sm:p-6">{children}</div>
  </div></main>;
}

export function MailboxView({ page, box, unread, cursor }: { page: MessagePage<MessageSummary>; box: "inbox" | "sent"; unread: boolean; cursor?: MessageCursor | null }) {
  const listHref = mailboxHref(box, unread, cursor);
  return <section aria-label={box === "inbox" ? "받은 쪽지 목록" : "보낸 쪽지 목록"} className="space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      {box === "inbox" ? <nav aria-label="읽음 상태" className="flex gap-1.5">
        {([false, true] as const).map(value => <Link key={String(value)} href={mailboxHref("inbox", value)} prefetch={false} aria-current={unread === value ? "page" : undefined}
          className={`${messageButton} !px-2.5 text-sm sm:!px-4 sm:text-base ${unread === value ? "!bg-pul-deep !text-white" : ""}`}>{value ? "안 읽은 쪽지" : "전체"}</Link>)}
      </nav> : <h2 className="self-center font-bold">보낸 쪽지</h2>}
      <details className="relative">
        <summary className={`${messageButton} cursor-pointer gap-1.5 !px-2.5 text-sm sm:!px-4 sm:text-base`}><Settings aria-hidden="true" size={17} />쪽지 관리</summary>
        <div className="absolute right-0 z-10 mt-1 grid w-40 rounded-lg border border-pul-border bg-white p-1 shadow-lg">
          {([["/messages/blocked", "차단 관리"], ["/messages/courses", "내 구장 문의"], ["/my/course-invitations", "운영권 요청"]] as const).map(([href, label]) =>
            <Link key={href} href={href} prefetch={false} className="flex min-h-11 items-center rounded px-3 text-sm font-semibold hover:bg-pul-light">{label}</Link>)}
        </div>
      </details>
    </div>
    {!page.items.length ? <p className="rounded-xl border border-pul-border p-5 text-pul-muted">{unread ? "안 읽은 쪽지가 없습니다." : box === "inbox" ? "받은 쪽지가 없습니다." : "보낸 쪽지가 없습니다."}</p> :
      <ul className="space-y-2">{page.items.map(message => {
        const type = message.mailboxType ?? message.kind;
        const Icon = icons[type];
        const isUnread = box === "inbox" && !message.readAt;
        const date = mailboxDate(message.at);
        return <li key={message.id}>
          <Link prefetch={false} href={`/messages/${message.id}${listHref.slice(mailboxHref(box).length)}`} className="grid min-h-16 grid-cols-[1.5rem_minmax(0,1fr)_auto_0.75rem] items-center gap-2 rounded-xl border border-pul-border px-2.5 py-2.5 hover:bg-pul-light focus-visible:outline-2 focus-visible:outline-pul-point sm:grid-cols-[2.5rem_9.5rem_minmax(0,1fr)_auto_1rem] sm:gap-4 sm:px-4">
            <span className="relative flex justify-center"><Icon aria-hidden="true" size={21} className="text-pul-deep" />{isUnread && <span aria-hidden="true" className="absolute -left-1 -top-1 size-2 rounded-full bg-pul-point sm:left-0" />}</span>
            <span className="hidden sm:block"><span className="rounded-md bg-emerald-50 px-2 py-1 text-sm font-bold text-pul-deep">{mailboxLabels[type]}</span></span>
            <span className="min-w-0 sm:border-l sm:border-pul-border sm:pl-4">
              <span className="inline-block rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-bold text-pul-deep sm:hidden">{mailboxLabels[type]}</span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="line-clamp-2 font-bold leading-snug [overflow-wrap:anywhere] sm:text-lg">{messageFirstLine(message.preview) || mailboxLabels[type]}</span>
                {isUnread && <span className="rounded bg-emerald-50 px-1 text-xs font-bold text-pul-deep">안 읽음</span>}
              </span>
              {message.kind === "direct" && <span className="block truncate text-xs text-pul-muted">{message.counterpartDisplay}</span>}
            </span>
            <time dateTime={message.at} className="whitespace-nowrap text-right text-pul-muted sm:text-sm">
              <span className="block text-xs sm:inline sm:text-sm">{date.day}</span>
              <span className="block text-xs sm:ml-2 sm:inline sm:text-sm">{date.time}</span>
            </time>
            <ChevronRight aria-hidden="true" size={17} className="text-pul-muted" />
          </Link>
        </li>;
      })}</ul>}
    {page.nextCursor ? <Link href={mailboxHref(box, unread, page.nextCursor)} prefetch={false} className={messageButton}>다음 쪽지 20개 보기</Link> : null}
    {cursor ? <Link href={mailboxHref(box, unread)} prefetch={false} className="ml-3 inline-flex min-h-11 items-center text-sm text-pul-point">최신 쪽지로</Link> : null}
  </section>;
}
export function MessageFailure({ message }: { message: string }) {
  return <div role="alert" className="rounded-xl border border-pul-border bg-white p-5"><p>{message}</p><a href="" className="mt-3 inline-flex min-h-11 items-center font-bold text-pul-point">다시 시도</a></div>;
}
export function ReportListView({ page, status }: { page: MessagePage<MessageReportSummary>; status: "open" | "resolved" }) {
  return <section className="space-y-4"><h1 className="text-2xl font-black text-pul-deep">쪽지 신고 관리</h1>
    <nav aria-label="신고 상태" className="flex gap-2">{(["open", "resolved"] as const).map(value => <Link key={value} prefetch={false} href={`/manage/messages/reports?status=${value}`} aria-current={status === value ? "page" : undefined} className={messageButton}>{value === "open" ? "미처리" : "처리 완료"}</Link>)}</nav>
    {!page.items.length ? <p className="rounded-xl bg-white p-5">표시할 신고가 없습니다.</p> : <ul className="space-y-3">{page.items.map(report => <li key={report.id} className="rounded-xl border border-pul-border bg-white p-4">
      <p className="font-bold">{reportReasonLabels[report.reason]} · {report.status === "open" ? "미처리" : "처리 완료"}</p><p className="mt-2 text-sm text-pul-muted">{messageDate(report.at)}</p><p className="mt-2 break-all text-xs text-pul-muted">신고 번호 {report.id}</p>
      <Link href={`/manage/messages/reports/${report.id}`} prefetch={false} className="mt-2 inline-flex min-h-11 items-center font-bold text-pul-point">신고 상세 열기</Link>
    </li>)}</ul>}
    {page.nextCursor ? <Link href={cursorHref("/manage/messages/reports", page.nextCursor, status)} prefetch={false} className={messageButton}>다음 신고 20개 보기</Link> : null}
  </section>;
}
