"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import {
  certificationUuidPattern, courseDetailFields, directoryKeyPattern, jobDetailFields, talentFields,
} from "@/lib/certification/certificationPhaseOne";

export type CertificationFormState = { error?: string; success?: string };

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveTalentProfileAction(_: CertificationFormState, form: FormData): Promise<CertificationFormState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { error: "로그인 후 다시 시도해 주세요." };
  const values = Object.fromEntries(talentFields.map(([key]) => [`p_${key}`, field(form, key)]));
  const { data, error } = await context.supabase.rpc("save_certification_profile", {
    ...values, p_public: form.get("is_public") === "on",
  });
  if (error) return { error: "저장할 수 없습니다. 입력 길이와 연락처·개인 자격증 번호 포함 여부를 확인해 주세요." };
  revalidatePath("/certification");
  revalidatePath(`/certification/talent/${data}`);
  revalidatePath("/certification/talent/edit");
  return { success: form.get("is_public") === "on" ? "공개 프로필을 저장했습니다." : "비공개로 저장했습니다." };
}

export async function submitOralAction(_: CertificationFormState, form: FormData): Promise<CertificationFormState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { error: "로그인 후 다시 시도해 주세요." };
  const keys = ["kind", "question", "answer", "source_note", "source_url"];
  const { error } = await context.supabase.rpc("submit_certification_oral",
    Object.fromEntries(keys.map((key) => [`p_${key}`, field(form, key)])));
  if (error) return { error: error.message === "certification_quota"
    ? "하루에 최대 5건을 등록할 수 있습니다." : "등록하지 못했습니다. 출처와 입력 내용을 확인해 주세요." };
  revalidatePath("/certification/manage/oral");
  return { success: "출처 확인을 요청했습니다. 운영자가 확인한 뒤 공개할 수 있습니다." };
}

export async function reviewOralAction(id: string, publish: boolean): Promise<CertificationFormState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context || !certificationUuidPattern.test(id) || typeof publish !== "boolean") {
    return { error: "권한과 자료를 확인해 주세요." };
  }
  const { error } = await context.supabase.rpc("review_certification_oral", { p_id: id, p_publish: publish });
  if (error) return { error: "처리하지 못했습니다. 권한과 자료 상태를 확인해 주세요." };
  revalidatePath("/certification");
  revalidatePath("/certification/study");
  revalidatePath("/certification/manage/oral");
  return { success: publish ? "공개했습니다." : "숨겼습니다." };
}

export async function saveCertificationDetailsAction(
  entity: "course" | "job", key: string, version: number, _: CertificationFormState, form: FormData,
): Promise<CertificationFormState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context || !directoryKeyPattern.test(key) || !Number.isInteger(version) || !["course", "job"].includes(entity)) {
    return { error: "권한과 항목을 확인해 주세요." };
  }
  const fields = entity === "course" ? courseDetailFields : jobDetailFields;
  const details = Object.fromEntries(fields.map(([name]) => [name, field(form, name)]).filter(([, value]) => value));
  const { error } = await context.supabase.rpc("save_certification_details", {
    p_entity: entity, p_key: key, p_version: version, p_details: details,
    p_promotion_slug: field(form, "promotion_slug") || null,
    p_event_key: field(form, "event_key") || null,
    p_contact_user_id: field(form, "contact_user_id") || null,
  });
  if (error) return { error: error.code === "40001"
    ? "다른 변경이 저장되었습니다. 새로고침한 뒤 다시 입력해 주세요."
    : "저장하지 못했습니다. 입력값, 공고와 쪽지 담당자 정보를 확인해 주세요." };
  revalidatePath("/certification", "layout");
  revalidatePath("/events", "layout");
  return { success: "상세 정보를 저장했습니다." };
}
