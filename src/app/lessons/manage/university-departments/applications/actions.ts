"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { universityApplications, universityReview } from "@/lib/lessons/universityFollowup";
import { uuid, type UniversityResult } from "@/lib/lessons/universityWorkspace";

export async function reviewApplication(viewer: string, id: string, version: number, form: FormData): Promise<UniversityResult> {
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth || auth.userId !== viewer || !uuid(id)) return { ok: false, message: "심사 권한이 필요합니다." };
  const decision = form.get("decision"), note = form.get("note");
  if (typeof decision !== "string" || !["approved","revision","rejected"].includes(decision) ||
    typeof note !== "string" || [...note].length > 1000) return { ok: false, message: "심사 결과와 안내를 확인해 주세요." };
  const result = await auth.supabase.rpc("review_university_application", { p_id: id, p_version: version, p_decision: decision, p_note: note });
  if (result.error) return { ok: false, message: ["22023","PT409","42501","P0001"].includes(result.error.code)
    ? result.error.message : "심사 결과를 확인하지 못했습니다. 최신 신청을 확인해 주세요." };
  revalidatePath(universityReview);
  revalidatePath(universityApplications);
  revalidatePath("/lessons/manage/university-departments");
  revalidatePath("/my/clubs");
  return { ok: true, message: "심사 결과를 저장했습니다." };
}

