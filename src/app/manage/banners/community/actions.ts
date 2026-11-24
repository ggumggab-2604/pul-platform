"use server";

import { revalidatePath } from "next/cache";
import { bannerRequestErrors, communityPostKey } from "@/lib/community/communityPromotions";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export async function acceptBannerRequestAction(id: string) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context || !communityPostKey.test(id)) return { ok: false as const, error: "권한과 신청을 확인해 주세요." };
  const { data, error } = await context.supabase.rpc("accept_community_banner_request", { p_request_id: id });
  if (error || typeof data !== "string" || !/^[0-9a-f]{32}$/.test(data)) {
    return { ok: false as const, error: error?.code === "P0001" ? bannerRequestErrors[error.message] ?? "광고 초안을 만들지 못했습니다. 권한과 공개 글·기간을 확인해 주세요." : "광고 초안을 만들지 못했습니다. 권한과 공개 글·기간을 확인해 주세요." };
  }
  revalidatePath("/manage/banners/community");
  return { ok: true as const, key: data };
}

export async function setBannerPostAction(key: string, version: number, post: string) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context || !/^[0-9a-f]{32}$/.test(key) || !Number.isInteger(version) || (post && !communityPostKey.test(post))) {
    return { ok: false as const, error: "권한과 공개 홍보 글 키를 확인해 주세요." };
  }
  const { error } = await context.supabase.rpc("set_promotion_community_post", { p_key: key, p_version: version, p_post_id: post || null });
  if (error) return { ok: false as const, error: "연결을 저장하지 못했습니다. 최신 버전과 공개 홍보 글을 확인해 주세요." };
  revalidatePath(`/manage/banners/${key}`);
  return { ok: true as const };
}
