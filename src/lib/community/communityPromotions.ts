import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyFilters, fields, type Field, type Filters, type Post } from "./communityPromotionsPreview";
import { courseProvinces } from "@/lib/courses/courseRegions";

export const promotionPageSize = 24;
export const communityPostKey = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export type PublishedPromotion = Post & { version: number };
export type CommunityPromotionPage = {
  items: (PublishedPromotion & { paid: boolean })[];
  hasMore: boolean;
  districts: string[];
};
export type BannerSlot = { code: string; label: string };
export type BannerPost = Pick<Post, "id" | "title" | "field" | "trade">;
export const bannerRequestPageSize = 30;
export const bannerRequestErrors: Record<string, string> = {
  PUL_BANNER_COOLDOWN: "배너 신청은 20초 간격으로 접수할 수 있습니다. 잠시 후 다시 시도해 주세요.",
  PUL_BANNER_MEMBER_QUOTA: "회원별 배너 신청은 10분에 최대 5건입니다. 잠시 후 다시 시도해 주세요.",
  PUL_BANNER_POST_QUOTA: "같은 글의 배너 신청은 10분에 최대 3건입니다. 잠시 후 다시 시도해 주세요.",
  PUL_BANNER_PERIOD_CONFLICT: "선택한 자리와 기간에 이미 게시·예약된 배너가 있습니다. 다른 자리나 기간을 선택해 주세요.",
};
export type BannerRequestPage = { items: BannerRequest[]; total: number };
export type BannerRequest = BannerPost & {
  post_id: string; slot_code: string; starts_at: string; ends_at: string;
  promotion_key: string | null; available: boolean; period_conflict: boolean;
};

export function readPromotionQuery(raw: Record<string, string | string[] | undefined>) {
  const read = (key: string) => typeof raw[key] === "string" ? raw[key].slice(0, 80) : "";
  const field = read("field");
  const province = read("province");
  const page = Number(read("page"));
  const filters: Filters = {
    field: Object.hasOwn(fields, field) ? field as Field : "",
    trade: read("trade"),
    province: courseProvinces.some((code) => code === province) ? province : "",
    district: province ? read("district") : "",
  };
  return { filters, page: Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1 };
}

export function promotionBoardHref(filters = emptyFilters, page = 1) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  if (page > 1) params.set("page", String(page));
  return params.size ? `/community?${params}` : "/community";
}

export async function readPromotionPage(client: SupabaseClient, filters: Filters, page = 1) {
  const { data, error } = await client.rpc("list_community_promotions", {
    p_field: filters.field, p_trade: filters.trade, p_province: filters.province, p_district: filters.district,
    p_offset: (page - 1) * promotionPageSize,
  });
  if (error || !data || !Array.isArray(data.items) || !Array.isArray(data.districts)) throw new Error("홍보 글을 불러오지 못했습니다.");
  return data as CommunityPromotionPage;
}

export async function readPromotionPost(client: SupabaseClient, id: string) {
  if (!communityPostKey.test(id)) return null;
  const { data, error } = await client.rpc("get_community_promotion", { p_post_id: id });
  if (error) throw new Error("홍보 글을 불러오지 못했습니다.");
  return data as PublishedPromotion | null;
}
