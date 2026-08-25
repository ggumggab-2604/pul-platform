import type { SupabaseClient } from "@supabase/supabase-js";

export type PromotionContentKind =
  | "pul_notice"
  | "pul_event"
  | "partnership"
  | "advertisement"
  | "member_guide"
  | "content_recommendation";

export type PromotionLinkType = "external" | "internal_detail" | "none";

export type PublicPromotionMedia = {
  bucket: "promotion-media";
  path: string;
  width: number;
  height: number;
  alt: string;
};

export type ActiveSlotPromotion = {
  slotCode: string;
  promotionKey: string;
  title: string;
  summary: string;
  contentKind: PromotionContentKind;
  linkType: PromotionLinkType;
  externalUrl: string | null;
  detailSlug: string | null;
  desktopMedia: PublicPromotionMedia;
  mobileMedia: PublicPromotionMedia | null;
  startsAt: string;
  endsAt: string;
};

export type PublicPromotionDetailMedia = {
  bucket: "promotion-media";
  path: string;
  alt: string;
  sortOrder: number;
};

export type PublicPromotionDetail = {
  promotionKey: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  contentKind: PromotionContentKind;
  detailCtaLabel: string | null;
  detailCtaUrl: string | null;
  detailMedia: PublicPromotionDetailMedia[];
};

type JsonObject = Record<string, unknown>;

const slotPattern = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2}$/;
const keyPattern = /^[0-9a-f]{32}$/;
const slugPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;
const pathPattern = /^[0-9a-f]{32}\/(desktop|mobile|detail)\/[0-9a-f]{32}\/original$/;
const contentKinds = new Set<PromotionContentKind>([
  "pul_notice",
  "pul_event",
  "partnership",
  "advertisement",
  "member_guide",
  "content_recommendation",
]);
const linkTypes = new Set<PromotionLinkType>(["external", "internal_detail", "none"]);

export class PromotionDirectoryError extends Error {
  constructor(
    readonly code: "validation" | "notFound" | "network" | "unknown",
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = "PromotionDirectoryError";
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonObject, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function invalidResponse(): never {
  throw new PromotionDirectoryError("unknown", "홍보 콘텐츠 응답 형식이 올바르지 않습니다.");
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseMedia(value: unknown): PublicPromotionMedia {
  if (
    !isObject(value) ||
    !exactKeys(value, ["bucket", "path", "width", "height", "alt"]) ||
    value.bucket !== "promotion-media" ||
    typeof value.path !== "string" || !pathPattern.test(value.path) ||
    typeof value.width !== "number" || !Number.isSafeInteger(value.width) || value.width < 1 ||
    typeof value.height !== "number" || !Number.isSafeInteger(value.height) || value.height < 1 ||
    typeof value.alt !== "string" || value.alt.length < 2
  ) invalidResponse();
  return {
    bucket: "promotion-media",
    path: value.path,
    width: value.width,
    height: value.height,
    alt: value.alt,
  };
}

export function parseActiveSlotPromotion(value: unknown): ActiveSlotPromotion {
  if (
    !isObject(value) ||
    !exactKeys(value, [
      "slot_code", "promotion_key", "title", "summary", "content_kind", "link_type",
      "external_url", "detail_slug", "desktop_media", "mobile_media", "starts_at", "ends_at",
    ]) ||
    typeof value.slot_code !== "string" || !slotPattern.test(value.slot_code) ||
    typeof value.promotion_key !== "string" || !keyPattern.test(value.promotion_key) ||
    typeof value.title !== "string" || typeof value.summary !== "string" ||
    typeof value.content_kind !== "string" || !contentKinds.has(value.content_kind as PromotionContentKind) ||
    typeof value.link_type !== "string" || !linkTypes.has(value.link_type as PromotionLinkType) ||
    !isNullableString(value.external_url) || !isNullableString(value.detail_slug) ||
    (value.external_url !== null && !/^https:\/\/\S+$/.test(value.external_url)) ||
    (value.detail_slug !== null && !slugPattern.test(value.detail_slug)) ||
    !isDate(value.starts_at) || !isDate(value.ends_at)
  ) invalidResponse();

  return {
    slotCode: value.slot_code,
    promotionKey: value.promotion_key,
    title: value.title,
    summary: value.summary,
    contentKind: value.content_kind as PromotionContentKind,
    linkType: value.link_type as PromotionLinkType,
    externalUrl: value.external_url,
    detailSlug: value.detail_slug,
    desktopMedia: parseMedia(value.desktop_media),
    mobileMedia: value.mobile_media === null ? null : parseMedia(value.mobile_media),
    startsAt: value.starts_at,
    endsAt: value.ends_at,
  };
}

function parseDetailMedia(value: unknown): PublicPromotionDetailMedia {
  if (
    !isObject(value) ||
    !exactKeys(value, ["bucket", "path", "alt", "sort_order"]) ||
    value.bucket !== "promotion-media" ||
    typeof value.path !== "string" || !pathPattern.test(value.path) ||
    typeof value.alt !== "string" || value.alt.length < 2 ||
    typeof value.sort_order !== "number" || !Number.isSafeInteger(value.sort_order) ||
    value.sort_order < 0 || value.sort_order > 9
  ) invalidResponse();
  return {
    bucket: "promotion-media",
    path: value.path,
    alt: value.alt,
    sortOrder: value.sort_order,
  };
}

export function parsePublicPromotionDetail(value: unknown): PublicPromotionDetail {
  if (
    !isObject(value) ||
    !exactKeys(value, [
      "promotion_key", "slug", "title", "summary", "body", "content_kind",
      "detail_cta_label", "detail_cta_url", "detail_media",
    ]) ||
    typeof value.promotion_key !== "string" || !keyPattern.test(value.promotion_key) ||
    typeof value.slug !== "string" || !slugPattern.test(value.slug) ||
    typeof value.title !== "string" || typeof value.summary !== "string" ||
    typeof value.body !== "string" ||
    typeof value.content_kind !== "string" || !contentKinds.has(value.content_kind as PromotionContentKind) ||
    !isNullableString(value.detail_cta_label) || !isNullableString(value.detail_cta_url) ||
    !Array.isArray(value.detail_media)
  ) invalidResponse();
  return {
    promotionKey: value.promotion_key,
    slug: value.slug,
    title: value.title,
    summary: value.summary,
    body: value.body,
    contentKind: value.content_kind as PromotionContentKind,
    detailCtaLabel: value.detail_cta_label,
    detailCtaUrl: value.detail_cta_url,
    detailMedia: value.detail_media.map(parseDetailMedia),
  };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/찾을 수 없습니다/.test(message)) {
    throw new PromotionDirectoryError("notFound", "홍보 콘텐츠를 찾을 수 없습니다.");
  }
  if (/슬롯|확인해 주세요|중복/.test(message)) {
    throw new PromotionDirectoryError("validation", "홍보 콘텐츠 요청을 확인해 주세요.");
  }
  if (/fetch|network/i.test(message)) {
    throw new PromotionDirectoryError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new PromotionDirectoryError("unknown", "홍보 콘텐츠를 불러오지 못했습니다.");
}

export async function getActivePromotionsForSlots(
  client: SupabaseClient,
  slotCodes: readonly string[],
): Promise<ActiveSlotPromotion[]> {
  if (
    slotCodes.length < 1 || slotCodes.length > 20 ||
    new Set(slotCodes).size !== slotCodes.length ||
    slotCodes.some((slot) => !slotPattern.test(slot) || slot.length > 80)
  ) {
    throw new PromotionDirectoryError("validation", "배너 슬롯 요청을 확인해 주세요.");
  }
  const { data, error } = await client.rpc("get_active_promotions_for_slots", {
    p_slot_codes: [...slotCodes],
  });
  if (error) mapError(error);
  if (!Array.isArray(data)) invalidResponse();
  return data.map(parseActiveSlotPromotion);
}

export async function getPublicPromotionDetail(
  client: SupabaseClient,
  slug: string,
): Promise<PublicPromotionDetail> {
  const normalized = slug.trim();
  if (!slugPattern.test(normalized)) {
    throw new PromotionDirectoryError("validation", "홍보 콘텐츠 주소를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("get_public_promotion_detail", { p_slug: normalized });
  if (error) mapError(error);
  return parsePublicPromotionDetail(data);
}
