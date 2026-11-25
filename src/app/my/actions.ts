"use server";

import type { ProfileActionState } from "@/lib/auth/types";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { revalidatePath } from "next/cache";

type HidePublishedNamesState = ProfileActionState | { status: "already_applied"; message: string };

export async function updateProfile(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return { status: "error", message: "로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요." };
  }

  const name = formData.get("real_name");
  const mode = formData.get("name_mode");
  const visibility = formData.get("profile_visibility");
  if (typeof name !== "string" || name.trim().length > 100 ||
      (mode !== "nickname" && mode !== "real") ||
      (visibility !== "private" && visibility !== "members" && visibility !== "public") ||
      (mode === "real" && !name.trim())) {
    return { status: "error", message: "이름과 공개 범위를 확인해 주세요." };
  }

  const { error } = await context.supabase.rpc("save_my_posting_name", {
    p_real_name: name.trim() || null,
    p_use_real_name: mode === "real",
    p_visibility: visibility,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "42501" ? error.message : "프로필을 저장하지 못했습니다. 입력 내용을 확인해 주세요.",
    };
  }

  revalidatePath("/my");
  return { status: "success", message: "프로필을 저장했습니다." };
}

export async function hidePublishedNames(
  _previousState: HidePublishedNamesState,
  formData: FormData,
): Promise<HidePublishedNamesState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return { status: "error", message: "로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요." };
  }

  const generation = formData.get("name_generation");
  if (formData.get("confirm_hide") !== "yes" ||
      typeof generation !== "string" || !/^\d{1,19}$/.test(generation)) {
    return { status: "error", message: "이름 설정을 다시 불러와 주세요." };
  }

  const { data, error } = await context.supabase.rpc("hide_my_published_real_names_with_result", {
    p_expected_generation: generation,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "22023" ? "이름 설정을 다시 불러와 주세요."
        : "기존 글의 이름을 숨기지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (data === "already_applied") {
    revalidatePath("/my");
    return {
      status: "already_applied",
      message: "이미 처리된 요청입니다. 그 이후 작성한 글과 댓글의 이름은 이번 요청으로 바뀌지 않았습니다.",
    };
  }
  if (data !== "applied") {
    return { status: "error", message: "이름 숨기기 결과를 확인하지 못했습니다. 이름 설정을 다시 불러와 주세요." };
  }

  for (const path of ["/my", "/community", "/market", "/courses", "/clubs", "/certification", "/events", "/hall-of-fame"]) {
    revalidatePath(path, "layout");
  }
  return { status: "success", message: "기존 공개 글과 댓글의 본명을 숨겼습니다." };
}
