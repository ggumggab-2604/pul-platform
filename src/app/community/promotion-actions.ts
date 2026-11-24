"use server";

import { revalidatePath } from "next/cache";
import { bannerRequestErrors, communityPostKey, type PublishedPromotion } from "@/lib/community/communityPromotions";
import type { Post } from "@/lib/community/communityPromotionsPreview";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

const loginRequired = { ok: false as const, error: "로그인한 회원만 이용할 수 있습니다." };
const postWriteErrors: Record<string, string> = {
  PUL_CREATE_DUPLICATE: "최근 같은 내용을 등록했습니다. 작성한 글을 확인해 주세요.",
  PUL_CREATE_COOLDOWN: "너무 빠르게 작성하고 있습니다. 잠시 후 다시 등록해 주세요.",
  PUL_CREATE_QUOTA: "짧은 시간에 여러 글을 등록했습니다. 잠시 후 다시 시도해 주세요.",
};

export async function saveCommunityPromotionAction(input: Post, editing: boolean) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return loginRequired;
  if (!input || (editing && (typeof input.id !== "string" || !communityPostKey.test(input.id) || !Number.isInteger(input.version)))) {
    return { ok: false as const, error: "홍보 글과 최신 버전을 확인해 주세요." };
  }
  const { data, error } = await context.supabase.rpc("save_community_promotion", {
    p_post_id: editing ? input.id : null, p_version: editing ? input.version : null,
    p_payload: {
      title: input.title, body: input.body, field: input.field, trade: input.trade, scope: input.scope,
      province: input.province, districts: input.districts, address: input.address, contact: input.contact,
      deadline: input.deadline, sourceKind: input.source?.kind, sourceKey: input.source?.key,
      nearbyCourseKey: input.nearbyCourse?.key, relatedSaleId: input.relatedSale?.key,
    },
  });
  if (error || !data) return { ok: false as const, error: error?.code === "42501" ? "정상 활동 회원만 홍보 글을 작성할 수 있습니다."
    : error?.code === "P0001" ? postWriteErrors[error.message] ?? error.message : "홍보 글의 입력값을 확인해 주세요." };
  revalidatePath("/community");
  if (editing) revalidatePath(`/community/${input.id}`);
  return { ok: true as const, post: data as PublishedPromotion };
}

export async function requestCommunityBannerAction(input: { postId: string; slot: string; start: string; end: string }) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return loginRequired;
  if (!input || !communityPostKey.test(input.postId) || !/^[a-z0-9_.]{5,80}$/.test(input.slot) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.end)) {
    return { ok: false as const, error: "배너 자리와 게시 기간을 확인해 주세요." };
  }
  const { error } = await context.supabase.rpc("request_community_banner", {
    p_post_id: input.postId, p_slot: input.slot, p_start: `${input.start}+09:00`, p_end: `${input.end}+09:00`,
  });
  if (error) return { ok: false as const, error: error.code === "P0001" ? bannerRequestErrors[error.message] ?? error.message : "배너 신청을 접수하지 못했습니다." };
  revalidatePath("/manage/banners/community");
  return { ok: true as const };
}
