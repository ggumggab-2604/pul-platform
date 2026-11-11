import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { MessagingSessionBoundary } from "@/components/messaging/MessagingSessionBoundary";
import { ParticipationRoom } from "@/components/clubs/manage/ClubParticipation";
import { roomHref, roomListHref, validRoomId, type Room } from "@/lib/clubs/clubParticipation";

export const dynamic = "force-dynamic";

export default async function ClubParticipationPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  if (!validRoomId(room)) notFound();
  const context = await getAuthenticatedSupabaseContext();
  const result = context && await context.supabase.rpc("get_club_participation", { p_club_key: null, p_room: room });
  if (result?.error?.code === "42501") notFound();
  if (!context || !result?.data) return <main className="mx-auto max-w-3xl space-y-4 p-6">
    <h1 className="text-2xl font-bold">동호회 참여방</h1>
    <p role="alert">참여방을 열려면 로그인 및 동호회 소속을 확인해 주세요.</p>
    {!context && <Link href={"/login?next=" + encodeURIComponent(roomHref(room))} className="font-bold text-pul-point">로그인</Link>}
  </main>;
  const data = result.data as Room;
  return <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
    <Link className="font-bold text-pul-point" href={data.chair ? roomListHref(data.clubKey) : "/messages"}>{data.chair ? "참여방 관리" : "쪽지함"}</Link>
    <MessagingSessionBoundary viewerId={context.userId}>
      <ParticipationRoom key={room + context.userId} data={data} viewerId={context.userId} />
    </MessagingSessionBoundary>
  </main>;
}

