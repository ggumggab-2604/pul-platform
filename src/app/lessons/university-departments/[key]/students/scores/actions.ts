"use server";

import { revalidatePath } from "next/cache";
import { universityHref, universityKey, uuid, type UniversityResult } from "@/lib/lessons/universityWorkspace";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export async function saveUniversityScores(
  key: string, viewer: string, entry: string, eventVersion: number, version: number, record: boolean, form: FormData,
): Promise<UniversityResult> {
  if (!universityKey(key) || !uuid(entry)) return { ok: false, message: "학과 모임을 확인해 주세요." };
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth || auth.userId !== viewer) return { ok: false, message: "로그인 계정을 확인해 주세요." };

  const rows = [];
  if (record) for (const id of form.getAll("attendee")) {
    const score = typeof id === "string" ? form.get("score-" + id) : null;
    if (typeof id !== "string" || !uuid(id) || typeof score !== "string"
      || (score !== "" && (!/^[1-9][0-9]{0,9}$/.test(score) || Number(score) > 2147483647))) {
      return { ok: false, message: "참가자의 18홀 타수는 양의 정수 또는 빈칸으로 입력해 주세요." };
    }
    rows.push({ user_id: id, strokes: score === "" ? null : Number(score) });
  }
  const { error } = await auth.supabase.rpc("save_university_monthly_scores", {
    p_key: key, p_entry: entry, p_event_version: eventVersion, p_version: version,
    p_game: form.get("game") || null, p_course_key: form.get("course") || null,
    p_basis: form.get("basis"), p_public: form.get("public_ranking") === "on", p_rows: record ? rows : null,
  });
  if (error) return {
    ok: false,
    message: ["42501", "22023", "PT409"].includes(error.code) ? error.message : "저장 결과를 확인하지 못했습니다. 최신 성적표를 확인해 주세요.",
  };
  revalidatePath(universityHref(key) + "/students/scores", "layout");
  return { ok: true, message: "저장했습니다." };
}

export async function linkUniversityTournament(
  key: string, viewer: string, event: string, user: string, division: string, enabled: boolean,
): Promise<UniversityResult> {
  if (!universityKey(key) || !uuid(user)) return { ok: false, message: "대회와 참가 계정을 확인해 주세요." };
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth || auth.userId !== viewer) return { ok: false, message: "로그인 계정을 확인해 주세요." };
  const { error } = await auth.supabase.rpc("set_university_tournament_link", {
    p_key: key, p_event_key: event, p_user: user, p_division: division, p_enabled: enabled,
  });
  if (error) return {
    ok: false,
    message: ["42501", "22023"].includes(error.code) ? error.message : "처리 결과를 확인하지 못했습니다. 다시 시도해 주세요.",
  };
  revalidatePath(universityHref(key) + "/students/scores");
  return { ok: true, message: enabled ? "공식 결과를 연결했습니다." : "학과 성적표에서 연결을 해제했습니다." };
}

