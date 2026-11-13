"use server";

import { revalidatePath } from "next/cache";
import { contactLabels, universityHref, universityKey, uuid, type UniversityResult } from "@/lib/lessons/universityWorkspace";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export async function changeUniversity(
  key: string,
  expectedViewer: string,
  operation: "consult" | "request" | "contact" | "approve" | "grant" | "revoke",
  form: FormData,
): Promise<UniversityResult> {
  const failed = (message: string) => ({ ok: false, message });
  if (!universityKey(key)) return failed("학과를 확인해 주세요.");
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth || auth.userId !== expectedViewer) return failed("로그인 계정을 확인해 주세요.");
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  let name: string;
  let args: Record<string, string | boolean | null> = { p_key: key };
  let message: string;
  switch (operation) {
    case "consult": {
      const body = text("body"), request = text("requestKey");
      if (!uuid(request) || [...body].length < 2 || [...body].length > 1000) return failed("상담 내용을 2~1000자로 입력해 주세요.");
      name = "submit_university_consultation";
      args = { ...args, p_body: body, p_request: request };
      message = "입학 상담을 접수했습니다.";
      break;
    }
    case "request":
      name = "request_university_student";
      message = "재학생 소속 확인을 요청했습니다.";
      break;
    case "contact": {
      const id = text("id"), status = text("status"), note = text("note");
      if (!uuid(id) || !Object.hasOwn(contactLabels, status) || [...note].length > 1000) return failed("연락 상태와 메모를 확인해 주세요.");
      name = "update_university_contact";
      args = { ...args, p_id: id, p_status: status, p_note: note || null };
      message = "연락 상태를 저장했습니다.";
      break;
    }
    case "approve": {
      const user = text("user");
      if (text("confirmed") !== "on" || !uuid(user)) return failed("재학 확인과 신청 계정을 확인해 주세요.");
      name = "approve_university_student";
      args = { ...args, p_user: user };
      message = "재학생 소속을 승인했습니다.";
      break;
    }
    case "grant":
    case "revoke": {
      const user = text("user");
      if (!uuid(user)) return failed("PUL 계정 UUID를 확인해 주세요.");
      name = "set_university_department_manager";
      args = { ...args, p_user: user, p_enabled: operation === "grant" };
      message = operation === "grant" ? "학과 담당자를 지정했습니다." : "학과 담당 권한을 해제했습니다.";
      break;
    }
    default: return failed("요청을 확인해 주세요.");
  }
  const { error } = await auth.supabase.rpc(name, args);
  if (error?.code === "42501") return failed("이 요청을 처리할 권한이 없습니다.");
  if (error?.code === "22023") return failed(error.message);
  if (error) return failed("처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요.");
  revalidatePath(universityHref(key), "layout");
  revalidatePath("/my/clubs");
  if (operation === "grant" || operation === "revoke") {
    revalidatePath("/lessons/manage/university-departments/" + key + "/managers");
  }
  return { ok: true, message };
}
