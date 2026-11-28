"use server";

import { revalidatePath } from "next/cache";
import { contentRpc, uuid } from "@/lib/courses/courseContent";
import { lostItemsPath } from "@/lib/market/lostItems";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export async function publishLostItem(input: {
  courseKey: string | null;
  postKey: string | null;
  version: number | null;
  requestId: string;
  fields: Record<string, unknown>;
}) {
  try {
    const auth = await getAuthenticatedSupabaseContext();
    if (!auth || !uuid.test(input.requestId)) throw new Error("로그인과 작성 요청을 확인해 주세요.");
    const id = await contentRpc<string>(auth.supabase, "market_lost_publish", {
      p_course_key: input.courseKey, p_post_key: input.postKey, p_version: input.version,
      p_request_id: input.requestId, p_input: input.fields,
    });
    revalidatePath(lostItemsPath, "layout");
    if (input.courseKey) revalidatePath("/courses/" + input.courseKey, "layout");
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error && /[가-힣]/.test(error.message)
      ? error.message : "등록 결과를 확인하지 못했습니다. 입력과 사진을 유지했습니다." };
  }
}

export async function completeLostItem(id: string) {
  try {
    const auth = await getAuthenticatedSupabaseContext();
    if (!auth || !uuid.test(id)) throw new Error();
    await contentRpc(auth.supabase, "market_lost_complete", { p_id: id });
    revalidatePath(lostItemsPath, "layout");
    revalidatePath("/courses/[id]", "layout");
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "본인이 작성한 공개 분실 신고인지 확인한 뒤 다시 시도해 주세요." };
  }
}
