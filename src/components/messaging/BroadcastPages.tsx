import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { MessagingError, getPlatformBroadcast, listPlatformBroadcasts, previewPlatformBroadcast, type MessagePageInput } from "@/lib/messaging/messaging";
import { cursorHref, messageButton, messageDate } from "@/lib/messaging/messagingUi";
import { MessagingSessionBoundary } from "./MessagingSessionBoundary";
import { MessageFailure } from "./MessagingViews";
import { BroadcastComposer } from "./BroadcastComposer";

const route = "/manage/messages/broadcasts";
async function context(path: string) {
  const c = await getAuthenticatedSupabaseContext();
  if (!c) redirect(`/login?next=${encodeURIComponent(path)}`);
  return c;
}
function Shell({ children }: { children: ReactNode }) {
  return <main className="min-h-[60vh] bg-pul-page px-3 py-6 sm:py-10"><div className="mx-auto max-w-3xl space-y-5">
    <nav aria-label="전체공지 관리" className="flex flex-wrap gap-2"><Link href="/manage" prefetch={false} className={messageButton}>운영 관리센터</Link><Link href={route} prefetch={false} className={messageButton}>내 발송 목록</Link><Link href={`${route}/new`} prefetch={false} className={messageButton}>전체공지 작성</Link></nav>{children}
  </div></main>;
}
function Failure({ error }: { error: unknown }) { return <MessageFailure message={(error instanceof MessagingError ? error : new MessagingError("unknown")).message} />; }
async function load<T>(work: () => Promise<T>) {
  try { return { ok: true as const, data: await work() }; }
  catch (error) { return { ok: false as const, error }; }
}
export async function BroadcastNewPage() {
  const c = await context(`${route}/new`);
  const result = await load(() => previewPlatformBroadcast(c.supabase));
  const content = result.ok ? <MessagingSessionBoundary viewerId={c.userId}><BroadcastComposer initialPreview={result.data} /></MessagingSessionBoundary> : <Failure error={result.error} />;
  return <Shell>{content}</Shell>;
}
export async function BroadcastListPage({ searchParams }: { searchParams: Promise<{ at?: string | string[]; id?: string | string[] }> }) {
  const c = await context(route);
  const result = await load(async () => {
    const query = await searchParams; const input: MessagePageInput = { limit: 20 };
    if (query.at !== undefined || query.id !== undefined) { if (typeof query.at !== "string" || typeof query.id !== "string") throw new MessagingError("invalid"); input.cursor = { at: query.at, id: query.id }; }
    return listPlatformBroadcasts(c.supabase, input);
  });
  if (!result.ok) return <Shell><Failure error={result.error} /></Shell>;
  const page = result.data;
  const content = <MessagingSessionBoundary viewerId={c.userId}><section className="space-y-4"><h1 className="text-2xl font-black">내 전체공지 발송 목록</h1><p className="text-sm text-pul-muted">내가 발송한 공지와 발송 당시 수신자 수입니다. 개별 회원의 읽음 상태는 표시하지 않습니다.</p>
      {!page.items.length ? <p className="rounded-xl bg-white p-5">발송한 전체공지가 없습니다.</p> : <ul className="space-y-3">{page.items.map(item => <li key={item.id} className="rounded-xl border border-pul-border bg-white p-4"><span className="text-sm font-bold text-pul-point">PUL 공지 · {item.recipientCount.toLocaleString("ko-KR")}명에게 발송</span><p className="my-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{item.preview}</p><time dateTime={item.at} className="block text-sm text-pul-muted">{messageDate(item.at)}</time><Link href={`${route}/${item.id}`} prefetch={false} className="mt-2 inline-flex min-h-11 items-center font-bold text-pul-point">공지 상세</Link></li>)}</ul>}
      {page.nextCursor ? <Link href={cursorHref(route, page.nextCursor)} prefetch={false} className={messageButton}>다음 공지 20개 보기</Link> : null}
    </section></MessagingSessionBoundary>;
  return <Shell>{content}</Shell>;
}
export async function BroadcastDetailPage({ params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params; const c = await context(`${route}/${encodeURIComponent(messageId)}`);
  const result = await load(() => getPlatformBroadcast(c.supabase, messageId));
  if (!result.ok) return <Shell><Failure error={result.error} /></Shell>;
  const message = result.data;
  const content = <MessagingSessionBoundary viewerId={c.userId}><article className="space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6"><h1 className="text-2xl font-black">PUL 공지 · 발송 완료</h1><p>{message.recipientCount.toLocaleString("ko-KR")}명에게 발송했습니다.</p><p className="text-sm text-pul-muted">발송자: {message.senderDisplay}</p><time dateTime={message.createdAt} className="block text-sm text-pul-muted">{messageDate(message.createdAt)}</time><p className="whitespace-pre-wrap leading-8 [overflow-wrap:anywhere]">{message.body}</p></article></MessagingSessionBoundary>;
  return <Shell>{content}</Shell>;
}
