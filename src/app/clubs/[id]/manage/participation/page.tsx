import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { MessagingSessionBoundary } from "@/components/messaging/MessagingSessionBoundary";
import { ParticipationList } from "@/components/clubs/manage/ClubParticipation";
import type { RoomList } from "@/lib/clubs/clubParticipation";

export const dynamic = "force-dynamic";

export default async function ParticipationManagement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const club = "/clubs/" + encodeURIComponent(id);
  const context = await getAuthenticatedSupabaseContext();
  const result = context && await context.supabase.rpc("get_club_participation", { p_club_key: id, p_room: null });
  if (result?.error?.code === "42501") notFound();
  return <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
    <Link className="font-bold text-pul-point" href={club}>동호회 운영으로 돌아가기</Link>
    <h1 className="text-2xl font-bold">동호회 참여방 관리</h1>
    {context && result?.data ? <MessagingSessionBoundary viewerId={context.userId}>
      <ParticipationList data={result.data as RoomList} clubKey={id} viewerId={context.userId} />
    </MessagingSessionBoundary> : <p role="alert">참여방을 불러오려면 로그인 및 회장 권한을 확인해 주세요.</p>}
  </main>;
}

