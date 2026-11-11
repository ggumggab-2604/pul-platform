"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { roomHref, roomListHref, validRoomId, type RoomOperation, type RoomResult } from "@/lib/clubs/clubParticipation";

export async function changeClubParticipation(
  viewerId: string, room: string | null, clubKey: string | null, operation: RoomOperation,
  request: string, input: Record<string, unknown>,
): Promise<RoomResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context || context.userId !== viewerId) return { error: "로그인 상태를 다시 확인해 주세요." };
  if (!validRoomId(request) || (room && !validRoomId(room))) return { error: "참여방과 요청 정보를 확인해 주세요." };
  const { data, error } = await context.supabase.rpc("mutate_club_participation", {
    p_club_key: clubKey, p_room: room, p_op: operation, p_request: request, p_input: input,
  });
  if (error || !data) return { error: error && ["42501", "22023", "PT409"].includes(error.code)
    ? error.message : "요청을 처리하지 못했습니다. 입력을 확인한 뒤 다시 시도해 주세요." };
  if (operation !== "preview_notice" && operation !== "preview_submit") {
    if (room) revalidatePath(roomHref(room));
    if (clubKey) revalidatePath(roomListHref(clubKey));
    if (operation === "notice") revalidatePath("/messages");
    if (operation === "submit") revalidatePath("/events/[id]", "page");
  }
  return data;
}

