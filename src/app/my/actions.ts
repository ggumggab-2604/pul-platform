"use server";

import type { ProfileActionState } from "@/lib/auth/types";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { revalidatePath } from "next/cache";

const PROFILE_VISIBILITY_VALUES = new Set(["public", "members", "private"]);

function readTrimmedString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateProfile(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return {
      status: "error",
      message: "로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.",
    };
  }

  const displayName = readTrimmedString(formData, "display_name");
  const nickname = readTrimmedString(formData, "nickname");
  const profileVisibility = readTrimmedString(formData, "profile_visibility");

  if (displayName.length > 100) {
    return {
      status: "error",
      message: "표시 이름은 100자 이내로 입력해 주세요.",
    };
  }

  if (nickname.length > 50) {
    return {
      status: "error",
      message: "닉네임은 50자 이내로 입력해 주세요.",
    };
  }

  if (!PROFILE_VISIBILITY_VALUES.has(profileVisibility)) {
    return {
      status: "error",
      message: "프로필 공개 범위를 다시 선택해 주세요.",
    };
  }

  const { supabase, userId } = context;
  const { data: account, error: accountError } = await supabase
    .from("user_accounts")
    .select("account_status")
    .eq("id", userId)
    .maybeSingle();

  if (accountError || !account) {
    return {
      status: "error",
      message: "계정 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (account.account_status !== "active") {
    return {
      status: "error",
      message: "현재 계정에서는 프로필을 수정할 수 없습니다.",
    };
  }

  const updates = {
    display_name: displayName || null,
    nickname: nickname || null,
    profile_visibility: profileVisibility,
  };

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update(updates)
    .eq("user_id", userId);

  if (updateError) {
    return {
      status: "error",
      message: "프로필을 저장하지 못했습니다. 입력 내용을 확인해 주세요.",
    };
  }

  revalidatePath("/my");
  return {
    status: "success",
    message: "프로필을 저장했습니다.",
  };
}
