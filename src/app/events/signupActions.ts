"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import type { TournamentMutationState } from "@/lib/events/tournamentSignup";

export async function mutateTournamentSignup(form: FormData): Promise<TournamentMutationState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { error: "대회 접수는 PUL 로그인 회원만 이용할 수 있습니다." };
  if (String(form.get("viewerId") ?? "") !== context.userId) {
    return { error: "로그인 계정이 바뀌었습니다. 화면을 새로고침해 주세요." };
  }
  const eventKey = String(form.get("eventKey") ?? "");
  const operation = String(form.get("operation") ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(eventKey)) {
    return { error: "대회 정보와 로그인 상태를 확인해 주세요." };
  }
  const fields = ["club", "participant", "version", "division", "name", "phone", "state", "body",
    "benefit", "terms", "expires", "venueKey", "playedOn", "playedCourse", "scheduleNote", "score", "place", "reason", "reviewToken", "comparisonBasis"];
  const payload = Object.fromEntries(fields.map(key => [key, String(form.get(key) ?? "").trim()]));
  const { data, error } = await context.supabase.rpc("mutate_tournament_signup", {
    p_event_key: eventKey,
    p_operation: operation,
    p_request_id: String(form.get("requestId") ?? ""),
    p_input: { ...payload, version: payload.version || null, members: form.getAll("member"), tied: form.has("tied") },
  });
  if (error || !data) {
    return { error: error && ["42501", "22023", "PT409"].includes(error.code)
      ? error.message
      : "처리하지 못했습니다. 입력한 내용을 확인하고 다시 시도해 주세요." };
  }
  revalidatePath(`/events/${eventKey}`);
  if (["change", "finalize", "affiliation"].includes(operation)) {
    revalidatePath("/events");
    revalidatePath("/courses/[id]", "page");
    revalidatePath("/clubs/[id]", "page");
    revalidatePath("/clubs/[id]/tournaments", "page");
    revalidatePath("/hall-of-fame");
    revalidatePath("/");
  }
  if (["general", "invite", "poll", "roster", "actual", "change"].includes(operation)) revalidatePath("/messages");
  return { done: true, sent: typeof data.sent === "number" ? data.sent : undefined };
}
