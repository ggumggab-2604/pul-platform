import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { contentRpc } from "@/lib/courses/courseContent";
import { roomHref, type Room } from "@/lib/clubs/clubParticipation";
import type { TournamentSignup } from "@/lib/events/tournamentSignup";
import type { CompanionConfirmation } from "@/lib/hall-of-fame/hallSpecialRecords";
import {
  getMessageMarketContext, getMessageClubContext, getMessageClubEventContext, getMessageCourseContext,
  type getMailboxDetail, type MessageDetail,
} from "@/lib/messaging/messaging";
import { messageDate, type MessageDestination } from "@/lib/messaging/messagingUi";
import { marketMessageDestination } from "./MarketMessageContext";

const unavailable = { unavailable: true };

export async function resolveMessageDestination(client: SupabaseClient, message: MessageDetail, meta: Awaited<ReturnType<typeof getMailboxDetail>>): Promise<MessageDestination> {
  const args = { p_message_id: message.id };
  switch (meta.type) {
    case "market": {
      const market = await getMessageMarketContext(client, message.id);
      if (!market?.available) return unavailable;
      const link = marketMessageDestination(market);
      return { context: market.title + " · " + link.status, inline: link };
    }
    case "course_inquiry": {
      const course = await contentRpc<{ course_key: string | null; course_name: string; recipient_changed?: boolean } | null>(client, "course_content_message_context", args);
      if (!course?.course_key) return { context: course?.course_name, ...unavailable };
      const href = "/courses/" + encodeURIComponent(course.course_key);
      return {
        context: course.course_name, inline: { href, label: "구장 상세 보기" },
        ...(course.recipient_changed ? {
          subline: "문의 담당자가 변경되었습니다. 이전 대화는 새 담당자에게 자동 공개되지 않습니다.",
          secondary: { href: href + "/inquiry", label: "새 담당자에게 다시 문의" },
        } : {}),
      };
    }
    case "participation": {
      if (!meta.roomId) return unavailable;
      const room = await contentRpc<Room | null>(client, "get_club_participation", { p_club_key: null, p_room: meta.roomId });
      if (room?.id !== meta.roomId) return unavailable;
      return { context: room.clubName + " · " + room.title, primary: { href: roomHref(room.id), label: room.open ? "참가 여부 답하기" : "동호회 참여방 보기" } };
    }
    case "club_event_broadcast": {
      const event = await getMessageClubEventContext(client, message.id);
      if (event === null) {
        const club = await getMessageClubContext(client, message.id);
        return club?.available ? { context: club.name, primary: { href: "/clubs/" + encodeURIComponent(club.publicKey) + "#club-official-events", label: "공식 행사 목록 보기" } } : club ? unavailable : {};
      }
      if (!event.available) return unavailable;
      return {
        context: event.clubName + " · " + event.title,
        subline: [messageDate(event.startsAt), meta.eventLocation].filter(Boolean).join(" · "),
        primary: { href: `/clubs/${encodeURIComponent(event.clubKey)}/official-events/${event.eventId}?message=${message.id}`, label: "해당 행사 보기" },
      };
    }
    case "club_broadcast": {
      const club = await getMessageClubContext(client, message.id);
      if (!club) return {};
      return club.available ? { context: club.name, primary: { href: "/clubs/" + encodeURIComponent(club.publicKey), label: "동호회 보기" } } : unavailable;
    }
    case "tournament_broadcast": {
      if (!message.eventKey) return meta.tournamentLinked ? unavailable : {};
      const href = "/events/" + encodeURIComponent(message.eventKey);
      const { data } = await client.rpc("get_tournament_signup", { p_event_key: message.eventKey });
      const signup = data as Pick<TournamentSignup, "open" | "roster"> | null;
      const recruitment = signup?.open && (meta.tournamentPurpose === "general" || meta.tournamentPurpose === "invite");
      const own = signup?.roster?.some(row => row.own && row.status !== "cancelled");
      return {
        context: meta.tournamentTitle,
        primary: recruitment ? { href: href + "#tournament-signup", label: "대회 참가 신청 보기" } : { href, label: "대회 안내 보기" },
        secondary: own ? { href: href + "#tournament-my-application", label: "내 참가 신청 보기" } : undefined,
      };
    }
    case "companion": {
      const record = await contentRpc<CompanionConfirmation | null>(client, "hall_special_companion_confirmation", args);
      if (!record) return unavailable;
      const name = { hole_in_one: "홀인원", albatross: "알바트로스", condor: "콘도르" }[record.type];
      return {
        context: `명예의 전당 · ${name} 기록`,
        subline: `${record.course} · ${record.segment} ${record.hole}번 홀`,
        primary: { href: "/hall-of-fame/special/confirm/" + message.id, label: "동반 확인하러 가기" },
      };
    }
    case "correction": {
      const correction = await contentRpc<{ id: string; clubKey: string; clubName?: string; tournamentTitle?: string } | null>(client, "get_tournament_correction_message", args);
      return correction ? {
        context: [correction.clubName, correction.tournamentTitle].filter(Boolean).join(" · "),
        primary: { href: `/clubs/${encodeURIComponent(correction.clubKey)}/tournaments#correction-${encodeURIComponent(correction.id)}`, label: "정정 요청 검토하기" },
      } : unavailable;
    }
    case "course_broadcast": {
      const course = await getMessageCourseContext(client, message.id);
      if (!course) return {};
      return course.available ? {
        context: course.name, primary: { href: "/courses/" + encodeURIComponent(course.courseKey), label: "구장 운영 정보 보기" },
      } : unavailable;
    }
    case "platform_broadcast": return { context: "PUL 운영자" };
    default: return {};
  }
}
