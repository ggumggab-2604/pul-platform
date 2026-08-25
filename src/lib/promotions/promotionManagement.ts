import type { SupabaseClient } from "@supabase/supabase-js";

import type { PromotionContentKind, PromotionLinkType } from "./promotionDirectory";

export type PromotionContentStatus = "draft" | "ready" | "archived";
export type PromotionPublicationStatus = "draft" | "published" | "hidden";
export type PromotionDisplayStatus = "draft" | "hidden" | "scheduled" | "live" | "ended";

export type PromotionManagementItem = {
  promotionKey: string;
  slug: string | null;
  contentKind: PromotionContentKind;
  title: string;
  summary: string;
  linkType: PromotionLinkType;
  contentStatus: PromotionContentStatus;
  version: number;
  availableMediaCount: number;
  publishedPlacementCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PromotionManagementPage = {
  items: PromotionManagementItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type PromotionPlacementItem = {
  placementKey: string;
  slotCode: string;
  promotionKey: string;
  publicationStatus: PromotionPublicationStatus;
  displayStatus: PromotionDisplayStatus;
  startsAt: string;
  endsAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PromotionManagementMedia = {
  mediaKey: string;
  variant: "desktop_banner" | "mobile_banner" | "detail";
  sortOrder: number;
  storageBucket: "promotion-media";
  storagePath: string;
  altText: string;
  mediaStatus: "pending_upload" | "available" | "failed" | "removed";
  declaredMimeType: "image/jpeg" | "image/png" | "image/webp";
  declaredSizeBytes: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PromotionManagementDetail = PromotionManagementItem & {
  body: string | null;
  externalUrl: string | null;
  detailCtaLabel: string | null;
  detailCtaUrl: string | null;
  media: PromotionManagementMedia[];
  placements: PromotionPlacementItem[];
};

type JsonObject = Record<string, unknown>;

const keyPattern = /^[0-9a-f]{32}$/;
const requestPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const slotPattern = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2}$/;
const storagePathPattern = /^[0-9a-f]{32}\/(desktop|mobile|detail)\/[0-9a-f]{32}\/original$/;
const statuses = new Set<PromotionContentStatus>(["draft", "ready", "archived"]);
const kinds = new Set<PromotionContentKind>([
  "pul_notice", "pul_event", "partnership", "advertisement", "member_guide", "content_recommendation",
]);
const links = new Set<PromotionLinkType>(["external", "internal_detail", "none"]);
const publicationStatuses = new Set<PromotionPublicationStatus>(["draft", "published", "hidden"]);
const displayStatuses = new Set<PromotionDisplayStatus>(["draft", "hidden", "scheduled", "live", "ended"]);

export class PromotionManagementError extends Error {
  constructor(
    readonly code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown",
    readonly userMessage: string,
    readonly shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "PromotionManagementError";
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
  throw new PromotionManagementError("unknown", "홍보 관리 응답 형식이 올바르지 않습니다.");
}

function isInteger(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function parsePromotionManagementItem(value: unknown): PromotionManagementItem {
  if (
    !isObject(value) ||
    !exactKeys(value, [
      "promotion_key", "slug", "content_kind", "title", "summary", "link_type",
      "content_status", "version", "available_media_count", "published_placement_count",
      "created_at", "updated_at",
    ]) ||
    typeof value.promotion_key !== "string" || !keyPattern.test(value.promotion_key) ||
    !isNullableString(value.slug) ||
    typeof value.content_kind !== "string" || !kinds.has(value.content_kind as PromotionContentKind) ||
    typeof value.title !== "string" || typeof value.summary !== "string" ||
    typeof value.link_type !== "string" || !links.has(value.link_type as PromotionLinkType) ||
    typeof value.content_status !== "string" || !statuses.has(value.content_status as PromotionContentStatus) ||
    !isInteger(value.version, 1) || !isInteger(value.available_media_count) ||
    !isInteger(value.published_placement_count) || !isDate(value.created_at) || !isDate(value.updated_at)
  ) invalidResponse();
  return {
    promotionKey: value.promotion_key,
    slug: value.slug,
    contentKind: value.content_kind as PromotionContentKind,
    title: value.title,
    summary: value.summary,
    linkType: value.link_type as PromotionLinkType,
    contentStatus: value.content_status as PromotionContentStatus,
    version: value.version,
    availableMediaCount: value.available_media_count,
    publishedPlacementCount: value.published_placement_count,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

export function parsePromotionManagementPage(value: unknown): PromotionManagementPage {
  if (
    !isObject(value) || !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) ||
    !Array.isArray(value.items) || !isInteger(value.total) || !isInteger(value.limit, 1) ||
    value.limit > 100 || !isInteger(value.offset) || typeof value.has_more !== "boolean"
  ) invalidResponse();
  return {
    items: value.items.map(parsePromotionManagementItem),
    total: value.total,
    limit: value.limit,
    offset: value.offset,
    hasMore: value.has_more,
  };
}

export function parsePromotionPlacementItem(value: unknown): PromotionPlacementItem {
  if (
    !isObject(value) ||
    !exactKeys(value, [
      "placement_key", "slot_code", "promotion_key", "publication_status", "display_status",
      "starts_at", "ends_at", "version", "created_at", "updated_at",
    ]) ||
    typeof value.placement_key !== "string" || !keyPattern.test(value.placement_key) ||
    typeof value.slot_code !== "string" || !slotPattern.test(value.slot_code) ||
    typeof value.promotion_key !== "string" || !keyPattern.test(value.promotion_key) ||
    typeof value.publication_status !== "string" || !publicationStatuses.has(value.publication_status as PromotionPublicationStatus) ||
    typeof value.display_status !== "string" || !displayStatuses.has(value.display_status as PromotionDisplayStatus) ||
    !isDate(value.starts_at) || !isDate(value.ends_at) || !isInteger(value.version, 1) ||
    !isDate(value.created_at) || !isDate(value.updated_at)
  ) invalidResponse();
  return {
    placementKey: value.placement_key,
    slotCode: value.slot_code,
    promotionKey: value.promotion_key,
    publicationStatus: value.publication_status as PromotionPublicationStatus,
    displayStatus: value.display_status as PromotionDisplayStatus,
    startsAt: value.starts_at,
    endsAt: value.ends_at,
    version: value.version,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function parseManagementMedia(value: unknown): PromotionManagementMedia {
  if (
    !isObject(value) ||
    !exactKeys(value, [
      "media_key", "variant", "sort_order", "storage_bucket", "storage_path", "alt_text",
      "media_status", "declared_mime_type", "declared_size_bytes", "version", "created_at", "updated_at",
    ]) ||
    typeof value.media_key !== "string" || !keyPattern.test(value.media_key) ||
    !(["desktop_banner", "mobile_banner", "detail"] as const).includes(value.variant as never) ||
    !isInteger(value.sort_order) || value.sort_order > 9 || value.storage_bucket !== "promotion-media" ||
    typeof value.storage_path !== "string" || !storagePathPattern.test(value.storage_path) ||
    typeof value.alt_text !== "string" ||
    !(["pending_upload", "available", "failed", "removed"] as const).includes(value.media_status as never) ||
    !(["image/jpeg", "image/png", "image/webp"] as const).includes(value.declared_mime_type as never) ||
    !isInteger(value.declared_size_bytes, 1) || value.declared_size_bytes > 5 * 1024 * 1024 ||
    !isInteger(value.version, 1) || !isDate(value.created_at) || !isDate(value.updated_at)
  ) invalidResponse();
  return {
    mediaKey: value.media_key,
    variant: value.variant as PromotionManagementMedia["variant"],
    sortOrder: value.sort_order,
    storageBucket: "promotion-media",
    storagePath: value.storage_path,
    altText: value.alt_text,
    mediaStatus: value.media_status as PromotionManagementMedia["mediaStatus"],
    declaredMimeType: value.declared_mime_type as PromotionManagementMedia["declaredMimeType"],
    declaredSizeBytes: value.declared_size_bytes,
    version: value.version,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

export function parsePromotionManagementDetail(value: unknown): PromotionManagementDetail {
  const itemKeys = [
    "promotion_key", "slug", "content_kind", "title", "summary", "link_type", "content_status",
    "version", "available_media_count", "published_placement_count", "created_at", "updated_at",
  ];
  if (
    !isObject(value) ||
    !exactKeys(value, [...itemKeys, "body", "external_url", "detail_cta_label", "detail_cta_url", "media", "placements"]) ||
    !isNullableString(value.body) || !isNullableString(value.external_url) ||
    !isNullableString(value.detail_cta_label) || !isNullableString(value.detail_cta_url) ||
    !Array.isArray(value.media) || !Array.isArray(value.placements)
  ) invalidResponse();
  const item = parsePromotionManagementItem(Object.fromEntries(itemKeys.map((key) => [key, value[key]])));
  return {
    ...item,
    body: value.body,
    externalUrl: value.external_url,
    detailCtaLabel: value.detail_cta_label,
    detailCtaUrl: value.detail_cta_url,
    media: value.media.map(parseManagementMedia),
    placements: value.placements.map(parsePromotionPlacementItem),
  };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new PromotionManagementError("authentication", "로그인이 필요합니다.", true);
  }
  if (/권한/.test(message)) {
    throw new PromotionManagementError("permission", "배너·홍보 관리 권한이 없습니다.");
  }
  if (/변경되었습니다/.test(message)) {
    throw new PromotionManagementError("conflict", "다른 변경이 있습니다. 최신 정보를 다시 확인해 주세요.", true);
  }
  if (/찾을 수 없습니다/.test(message)) {
    throw new PromotionManagementError("notFound", "홍보 관리 대상을 찾을 수 없습니다.");
  }
  if (/이미 게시|기간에 이미|재사용/.test(message)) {
    throw new PromotionManagementError("conflict", message, true);
  }
  if (/확인해 주세요|필요합니다|허용하지|지원하지|보관|게시 중/.test(message)) {
    throw new PromotionManagementError("validation", message || "홍보 관리 입력을 확인해 주세요.");
  }
  if (/fetch|network/i.test(message)) {
    throw new PromotionManagementError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new PromotionManagementError("unknown", "홍보 관리 작업을 완료하지 못했습니다.");
}

function validateRequestId(requestId: string) {
  if (!requestPattern.test(requestId)) {
    throw new PromotionManagementError("validation", "요청 식별자를 확인해 주세요.");
  }
}

function validateKey(value: string, label: string) {
  if (!keyPattern.test(value)) {
    throw new PromotionManagementError("validation", `${label} 식별자를 확인해 주세요.`);
  }
}

function parseMutationEnvelope(value: unknown, field: "promotion" | "placement") {
  if (
    !isObject(value) || !exactKeys(value, ["request_id", "replayed", field]) ||
    typeof value.request_id !== "string" || !requestPattern.test(value.request_id) ||
    typeof value.replayed !== "boolean" || !isObject(value[field])
  ) invalidResponse();
  return value;
}

export async function listPromotionsForManagement(
  client: SupabaseClient,
  filters: { contentStatus?: PromotionContentStatus; slotCode?: string } = {},
  limit = 50,
  offset = 0,
) {
  if (
    (filters.contentStatus && !statuses.has(filters.contentStatus)) ||
    (filters.slotCode && !slotPattern.test(filters.slotCode)) ||
    !isInteger(limit, 1) || limit > 100 || !isInteger(offset)
  ) throw new PromotionManagementError("validation", "홍보 관리 목록 조건을 확인해 주세요.");

  const { data, error } = await client.rpc("list_promotions_for_management", {
    p_content_status: filters.contentStatus ?? null,
    p_slot_code: filters.slotCode ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePromotionManagementPage(data);
}

export async function getPromotionForManagement(client: SupabaseClient, promotionKey: string) {
  validateKey(promotionKey, "홍보 콘텐츠");
  const { data, error } = await client.rpc("get_promotion_for_management", {
    p_promotion_key: promotionKey,
  });
  if (error) mapError(error);
  return parsePromotionManagementDetail(data);
}

export type PromotionMutationPayload = {
  content_kind?: PromotionContentKind;
  title?: string;
  summary?: string;
  link_type?: PromotionLinkType;
  slug?: string | null;
  body?: string | null;
  external_url?: string | null;
  detail_cta_label?: string | null;
  detail_cta_url?: string | null;
  content_status?: Exclude<PromotionContentStatus, "archived">;
};

export async function mutatePromotion(
  client: SupabaseClient,
  input: {
    requestId: string;
    operation: "create" | "update" | "archive";
    promotionKey?: string;
    expectedVersion?: number;
    payload?: PromotionMutationPayload;
  },
) {
  validateRequestId(input.requestId);
  if (input.operation === "create") {
    if (input.promotionKey || input.expectedVersion !== undefined || !input.payload) {
      throw new PromotionManagementError("validation", "신규 홍보 콘텐츠 요청을 확인해 주세요.");
    }
  } else {
    if (!input.promotionKey || !isInteger(input.expectedVersion, 1)) {
      throw new PromotionManagementError("validation", "홍보 콘텐츠와 버전을 확인해 주세요.");
    }
    validateKey(input.promotionKey, "홍보 콘텐츠");
  }
  const { data, error } = await client.rpc("mutate_promotion", {
    p_request_id: input.requestId,
    p_operation: input.operation,
    p_promotion_key: input.promotionKey ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_payload: input.payload ?? {},
  });
  if (error) mapError(error);
  const parsed = parseMutationEnvelope(data, "promotion");
  if (parsed.request_id !== input.requestId) invalidResponse();
  return {
    requestId: input.requestId,
    replayed: parsed.replayed as boolean,
    promotion: parsePromotionManagementItem(parsed.promotion),
  };
}

export async function mutatePromotionPlacement(
  client: SupabaseClient,
  input: {
    requestId: string;
    operation: "create" | "update" | "publish" | "hide";
    placementKey?: string;
    expectedVersion?: number;
    payload?: Record<string, unknown>;
  },
) {
  validateRequestId(input.requestId);
  if (input.operation === "create") {
    if (input.placementKey || input.expectedVersion !== undefined || !input.payload) {
      throw new PromotionManagementError("validation", "신규 게시 배정 요청을 확인해 주세요.");
    }
  } else {
    if (!input.placementKey || !isInteger(input.expectedVersion, 1)) {
      throw new PromotionManagementError("validation", "게시 배정과 버전을 확인해 주세요.");
    }
    validateKey(input.placementKey, "게시 배정");
  }
  const { data, error } = await client.rpc("mutate_promotion_placement", {
    p_request_id: input.requestId,
    p_operation: input.operation,
    p_placement_key: input.placementKey ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_payload: input.payload ?? {},
  });
  if (error) mapError(error);
  const parsed = parseMutationEnvelope(data, "placement");
  if (parsed.request_id !== input.requestId) invalidResponse();
  return {
    requestId: input.requestId,
    replayed: parsed.replayed as boolean,
    placement: parsePromotionPlacementItem(parsed.placement),
  };
}
