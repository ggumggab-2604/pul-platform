import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { MessagingError, getClubEventBroadcast, listClubEventBroadcasts, previewClubEventBroadcast, getClubEventBroadcastSource, type MessagePageInput } from "@/lib/messaging/messaging";
import { cursorHref, messageButton, messageDate } from "@/lib/messaging/messagingUi";
import { MessagingSessionBoundary } from "./MessagingSessionBoundary";
import { MessageFailure } from "./MessagingViews";
import { ClubEventBroadcastComposer } from "./ClubEventBroadcastComposer";

const routeFor = (id: string, eventId: string) => `/clubs/${encodeURIComponent(id)}/manage/events/${encodeURIComponent(eventId)}/messages`;
async function context(id: string, eventId: string) {
  const c = await getAuthenticatedSupabaseContext();
  if (!c) redirect(`/login?next=${encodeURIComponent(routeFor(id, eventId))}`);
  return c;
}
async function eventContext(c: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSupabaseContext>>>, id: string, eventId: string) {
  const source = await getClubEventBroadcastSource(c.supabase, eventId);
  if (source.clubKey !== id) throw new MessagingError("permission");
  return source;
}
function Shell({ id, eventId, children }: { id: string; eventId: string; children: ReactNode }) {
  const route = routeFor(id, eventId);
  return <main className="min-h-[60vh] bg-pul-page px-3 py-6 sm:py-10"><div className="mx-auto max-w-3xl space-y-5">
    <nav aria-label="행사 참가자 공지 관리" className="flex flex-wrap gap-2"><Link href={`/clubs/${encodeURIComponent(id)}/manage/members`} prefetch={false} className={messageButton}>회원 관리</Link><Link href={route} prefetch={false} className={messageButton}>행사 발송 목록</Link><Link href={`${route}/new`} prefetch={false} className={messageButton}>참가자 공지 작성</Link></nav>{children}
  </div></main>;
}
function Failure({ error }: { error: unknown }) { return <MessageFailure message={(error instanceof MessagingError ? error : new MessagingError("unknown")).message} />; }
async function load<T>(work: () => Promise<T>) {
  try { return { ok: true as const, data: await work() }; }
  catch (error) { return { ok: false as const, error }; }
}
export async function ClubEventBroadcastNewPage({ params }: { params: Promise<{ eventId: string; id: string }> }) {
  const { id, eventId } = await params; const c = await context(id, eventId);
  const result = await load(async () => { const club = await eventContext(c, id, eventId); return { club, preview: await previewClubEventBroadcast(c.supabase, club.eventId) }; });
  const content = result.ok ? <MessagingSessionBoundary key={`${c.userId}:${result.data.club.eventId}`} viewerId={c.userId}><ClubEventBroadcastComposer key={result.data.club.eventId} eventId={result.data.club.eventId} eventTitle={result.data.club.title} clubName={result.data.club.clubName} route={routeFor(id, eventId)} initialPreview={result.data.preview} /></MessagingSessionBoundary> : <Failure error={result.error} />;
  return <Shell id={id} eventId={eventId}>{content}</Shell>;
}
export async function ClubEventBroadcastListPage({ params, searchParams }: { params: Promise<{ eventId: string; id: string }>; searchParams: Promise<{ at?: string | string[]; id?: string | string[] }> }) {
  const { id, eventId } = await params; const c = await context(id, eventId); const route = routeFor(id, eventId);
  const result = await load(async () => {
    const club = await eventContext(c, id, eventId), query = await searchParams; const input: MessagePageInput = { limit: 20 };
    if (query.at !== undefined || query.id !== undefined) { if (typeof query.at !== "string" || typeof query.id !== "string") throw new MessagingError("invalid"); input.cursor = { at: query.at, id: query.id }; }
    return { club, page: await listClubEventBroadcasts(c.supabase, club.eventId, input) };
  });
  if (!result.ok) return <Shell id={id} eventId={eventId}><Failure error={result.error} /></Shell>;
  const { page, club } = result.data;
  return <Shell id={id} eventId={eventId}><MessagingSessionBoundary key={`${c.userId}:${club.eventId}`} viewerId={c.userId}><section className="space-y-4"><h1 className="text-2xl font-black">행사 참가자 공지 발송 목록</h1><p className="font-bold [overflow-wrap:anywhere]">{club.clubName} · {club.title}</p><p className="text-sm text-pul-muted">이 행사 참가자에게 보낸 운영 안내와 발송 당시 수신자 수입니다.</p>
    {!page.items.length ? <p className="rounded-xl bg-white p-5">발송한 행사공지가 없습니다.</p> : <ul className="space-y-3">{page.items.map(item => <li key={item.id} className="rounded-xl border border-pul-border bg-white p-4"><span className="text-sm font-bold text-pul-point">행사 안내 · {item.recipientCount.toLocaleString("ko-KR")}명에게 발송</span><p className="my-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{item.preview}</p><p className="text-sm text-pul-muted [overflow-wrap:anywhere]">발송자: {item.senderDisplay}</p><time dateTime={item.at} className="block text-sm text-pul-muted">{messageDate(item.at)}</time><Link href={`${route}/${item.id}`} prefetch={false} className="mt-2 inline-flex min-h-11 items-center font-bold text-pul-point">공지 상세</Link></li>)}</ul>}
    {page.nextCursor ? <Link href={cursorHref(route, page.nextCursor)} prefetch={false} className={messageButton}>다음 공지 20개 보기</Link> : null}
  </section></MessagingSessionBoundary></Shell>;
}
export async function ClubEventBroadcastDetailPage({ params }: { params: Promise<{ eventId: string; id: string; messageId: string }> }) {
  const { id, eventId, messageId } = await params; const c = await context(id, eventId);
  const result = await load(async () => { const club = await eventContext(c, id, eventId); return { club, message: await getClubEventBroadcast(c.supabase, club.eventId, messageId) }; });
  if (!result.ok) return <Shell id={id} eventId={eventId}><Failure error={result.error} /></Shell>;
  const { message, club } = result.data;
  return <Shell id={id} eventId={eventId}><MessagingSessionBoundary key={`${c.userId}:${club.eventId}`} viewerId={c.userId}><article className="space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6"><h1 className="text-2xl font-black">행사 안내 · 발송 완료</h1><p className="font-bold [overflow-wrap:anywhere]">{club.clubName} · {club.title}</p><p>{message.recipientCount.toLocaleString("ko-KR")}명에게 발송했습니다.</p><p className="text-sm text-pul-muted [overflow-wrap:anywhere]">발송자: {message.senderDisplay}</p><time dateTime={message.createdAt} className="block text-sm text-pul-muted">{messageDate(message.createdAt)}</time><p className="whitespace-pre-wrap leading-8 [overflow-wrap:anywhere]">{message.body}</p></article></MessagingSessionBoundary></Shell>;
}
