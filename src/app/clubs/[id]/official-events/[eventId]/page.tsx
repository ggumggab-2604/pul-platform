import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { getMessageClubEventContext, getMailboxDetail } from "@/lib/messaging/messaging";
import { messageDate, recipientCodeValid } from "@/lib/messaging/messagingUi";

export const metadata = { title: "동호회 공식 행사", robots: { index: false, follow: false } };

export default async function ClubOfficialEventPage({ params, searchParams }: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ message?: string | string[] }>;
}) {
  const { id, eventId } = await params;
  const { message } = await searchParams;
  const viewer = await getAuthenticatedSupabaseContext();
  if (!viewer || typeof message !== "string" || !recipientCodeValid(message)) notFound();
  const event = await getMessageClubEventContext(viewer.supabase, message).catch(() => null);
  if (!event?.available || event.clubKey !== id || event.eventId !== eventId) notFound();
  const detail = await getMailboxDetail(viewer.supabase, message);
  return <main className="mx-auto max-w-3xl space-y-4 px-3 py-6">
    <Link prefetch={false} href={`/messages/${message}`} className="inline-flex min-h-11 items-center font-bold text-pul-deep">← 쪽지로</Link>
    <article className="space-y-4 rounded-xl border border-pul-border bg-white p-5 sm:p-7">
      <p className="font-semibold text-pul-deep">{event.clubName} · 공식 행사</p>
      <h1 className="text-2xl font-black [overflow-wrap:anywhere]">{event.title}</h1>
      <dl className="space-y-2">
        <div><dt className="font-bold">일시</dt><dd>{messageDate(event.startsAt)}</dd></div>
        {detail.eventLocation && <div><dt className="font-bold">장소</dt><dd>{detail.eventLocation}</dd></div>}
      </dl>
      <Link href={`/clubs/${encodeURIComponent(id)}#club-official-events`} className="inline-flex min-h-11 items-center font-bold text-pul-point underline">공식 행사 목록 보기</Link>
    </article>
  </main>;
}
