import type {
  ActiveSlotPromotion,
  PromotionContentKind,
  PublicPromotionDetailMedia,
  PublicPromotionMedia,
} from "@/lib/promotions/promotionDirectory";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

type PromotionMedia = PublicPromotionMedia | PublicPromotionDetailMedia;

const contentKindLabels: Record<PromotionContentKind, string> = {
  pul_notice: "PUL 안내",
  pul_event: "PUL 행사",
  partnership: "제휴",
  advertisement: "광고",
  member_guide: "회원 안내",
  content_recommendation: "추천 콘텐츠",
};

export function getPromotionContentKindLabel(contentKind: PromotionContentKind) {
  return contentKindLabels[contentKind];
}

export function isSponsoredPromotion(contentKind: PromotionContentKind) {
  return contentKind === "advertisement" || contentKind === "partnership";
}

export function getPromotionMediaPublicUrl(media: PromotionMedia) {
  const { url } = getSupabasePublicEnv();
  const encodedPath = media.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return new URL(
    `/storage/v1/object/public/${media.bucket}/${encodedPath}`,
    url,
  ).toString();
}

export function shouldBypassPromotionImageOptimization(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function findPromotionForSlot(
  promotions: readonly ActiveSlotPromotion[],
  slotCode: string,
) {
  return promotions.find((promotion) => promotion.slotCode === slotCode) ?? null;
}

export function isSafePromotionDestination(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return true;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
