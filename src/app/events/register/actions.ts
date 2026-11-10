"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

type RegistrationState = { error?: string; key?: string; published?: boolean };

export async function registerTournament(_previous: RegistrationState, form: FormData): Promise<RegistrationState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { error: "로그인 후 다시 시도해 주세요." };
  if (form.get("viewerId") !== context.userId) return { error: "로그인 계정이 바뀌었습니다. 화면을 새로고침해 주세요." };
  if (form.has("guests")) return { error: "대회 접수는 PUL 로그인 회원만 이용할 수 있습니다." };
  const keys = ["scope", "hostKey", "title", "matchType", "playedOn", "region", "venueName", "venueKey", "playedCourseName", "scheduleNote", "organizer", "summary",
    "deadline", "capacity", "individualFee", "groupFee", "clubLimit", "clubLimitScope", "residentArea", "residentChannel", "residentFee"];
  const fields = Object.fromEntries(keys.map(key => [key, String(form.get(key) ?? "").trim()]));
  const { data, error } = await context.supabase.rpc("register_pul_tournament", {
    p_request_id: String(form.get("requestId") ?? ""),
    p_payload: {
      ...fields,
      divisions: form.getAll("division"),
      clubLimitScope: fields.clubLimit ? fields.clubLimitScope : "",
      residentChannel: fields.residentArea || fields.residentFee ? fields.residentChannel : "",
    },
  });
  if (error || !data) {
    return { error: error?.code === "42501" || error?.code === "22023" ? error.message : "대회를 저장하지 못했습니다. 개최 정보와 입력 길이를 확인해 주세요." };
  }
  if (data.published) {
    revalidatePath("/events");
    revalidatePath("/courses/[id]", "page");
    revalidatePath("/clubs/[id]", "page");
    revalidatePath("/");
  }
  return { key: data.key, published: data.published };
}

export async function finalizeTournament(_previous: { error?: string; done?: boolean }, form: FormData): Promise<{ error?: string; done?: boolean }> {
  const context = await getAuthenticatedSupabaseContext();
  const key = String(form.get("eventKey") ?? "");
  if (!context || form.get("viewerId") !== context.userId) return { error: "로그인 상태를 확인해 주세요." };
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(key)) return { error: "대회 정보를 확인해 주세요." };
  const { error } = await context.supabase.rpc("finalize_pul_tournament_results", { p_event_key: key, p_review_token: String(form.get("reviewToken") ?? "") });
  if (error) return { error: ["42501", "22023", "PT409"].includes(error.code) ? error.message : "대회 결과를 확정하지 못했습니다." };
  revalidatePath(`/events/${key}`);
  revalidatePath("/hall-of-fame");
  revalidatePath("/");
  return { done: true };
}

export async function requestTournamentCorrection(_previous: { error?: string; done?: boolean }, form: FormData): Promise<{ error?: string; done?: boolean }> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context || form.get("viewerId") !== context.userId) return { error: "로그인 상태를 확인해 주세요." };
  const { error } = await context.supabase.rpc("request_pul_tournament_correction", {
    p_club_key: String(form.get("clubKey") ?? ""),
    p_entry: String(form.get("entry") ?? ""),
    p_request_id: String(form.get("requestId") ?? ""),
    p_place: Number(form.get("place")),
    p_score: Number(form.get("score")),
    p_tied: form.has("tied"),
    p_reason: String(form.get("reason") ?? ""),
    p_source_revision: Number(form.get("sourceRevision")),
  });
  if (error) return { error: ["42501", "22023", "PT409"].includes(error.code) ? error.message : "정정 요청을 저장하지 못했습니다." };
  return { done: true };
}

export async function reviewTournamentCorrection(_previous: { error?: string; done?: boolean }, form: FormData): Promise<{ error?: string; done?: boolean }> {
  const context = await getAuthenticatedSupabaseContext();
  const key = String(form.get("eventKey") ?? "");
  if (!context || form.get("viewerId") !== context.userId) return { error: "로그인 상태를 확인해 주세요." };
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(key) || !["approve", "reject"].includes(String(form.get("decision")))) {
    return { error: "정정 처리 내용을 확인해 주세요." };
  }
  // Author and current reviewer permissions are checked by the RPC using this authenticated session.
  const { error } = await context.supabase.rpc("review_pul_tournament_correction", {
    p_event_key: key,
    p_correction: String(form.get("correction") ?? ""),
    p_approve: form.get("decision") === "approve",
    p_rejection_reason: String(form.get("rejectionReason") ?? ""),
  });
  if (error) return { error: ["42501", "22023", "PT409"].includes(error.code) ? error.message : "정정 요청을 처리하지 못했습니다." };
  revalidatePath("/clubs/[id]/tournaments", "page");
  revalidatePath("/clubs/[id]/tournaments/edit", "page");
  revalidatePath("/hall-of-fame/awards", "layout");
  revalidatePath("/hall-of-fame/lowest");
  revalidatePath("/courses/[id]", "page");
  revalidatePath(`/events/${key}`);
  revalidatePath("/hall-of-fame");
  revalidatePath("/");
  return { done: true };
}
