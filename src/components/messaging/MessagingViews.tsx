import Link from "next/link";
import type { ReactNode } from "react";
import type { MessagePage, MessageSummary, MessageReportSummary } from "@/lib/messaging/messaging";
import { cursorHref, messageDate, messageButton, reportReasonLabels } from "@/lib/messaging/messagingUi";

export function MessagingShell({ children, box }: { children: ReactNode; box?: "inbox" | "sent" | "blocked" }) {
  return <main className="min-h-[60vh] bg-pul-page px-3 py-6 sm:py-10"><div className="mx-auto max-w-3xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-black text-pul-deep">쪽지</h1><Link href="/messages/new" prefetch={false} className={messageButton}>새 쪽지 작성</Link></header>
    <nav aria-label="쪽지함" className="flex flex-wrap gap-2">{([["inbox", "/messages", "받은 쪽지"], ["sent", "/messages/sent", "보낸 쪽지"], ["blocked", "/messages/blocked", "차단 관리"]] as const).map(([key, href, label]) => <Link key={key} href={href} prefetch={false} aria-current={box === key ? "page" : undefined} className={`${messageButton} ${box === key ? "!bg-pul-deep !text-white" : ""}`}>{label}</Link>)}</nav>
    {children}
  </div></main>;
}
export function MailboxView({ page, box }: { page: MessagePage<MessageSummary>; box: "inbox" | "sent" }) {
  const path = box === "inbox" ? "/messages" : "/messages/sent";
  return <section aria-label={box === "inbox" ? "받은 쪽지 목록" : "보낸 쪽지 목록"} className="space-y-4">
    {!page.items.length ? <p className="rounded-xl border border-pul-border bg-white p-6">{box === "inbox" ? "받은 쪽지가 없습니다." : "보낸 쪽지가 없습니다."}</p> : <ul className="divide-y divide-pul-border overflow-hidden rounded-xl border border-pul-border bg-white">{page.items.map(message => <li key={message.id}>
      <Link prefetch={false} href={`/messages/${message.id}`} className="block p-4 hover:bg-pul-light sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className={`break-words ${box === "inbox" && !message.readAt ? "font-black" : "font-medium"}`}>{message.counterpartDisplay}</span><time dateTime={message.at} className="text-sm text-pul-muted">{messageDate(message.at)}</time></div>
        {message.kind === "platform_broadcast" ? <span className="mt-2 inline-block rounded bg-pul-light px-2 py-1 text-xs font-bold text-pul-deep">PUL 공지</span> : null}
        <p className="mt-2 line-clamp-2 break-words [overflow-wrap:anywhere]">{message.preview}</p>
        {box === "inbox" ? <span className={`mt-2 inline-block text-sm ${message.readAt ? "text-pul-muted" : "font-bold text-pul-point"}`}>{message.readAt ? "읽음" : "안 읽음"}</span> : null}
      </Link>
    </li>)}</ul>}
    {page.nextCursor ? <Link href={cursorHref(path, page.nextCursor)} prefetch={false} className={messageButton}>다음 쪽지 20개 보기</Link> : null}
    <Link href={path} prefetch={false} className="ml-3 inline-flex min-h-11 items-center text-sm text-pul-point">최신 쪽지로</Link>
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
