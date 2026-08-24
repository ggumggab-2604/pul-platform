import type { SupabaseClient } from "@supabase/supabase-js";

export type MarketRepairShopInquiryStatus = "pending" | "resolved" | "dismissed";
export type MarketRepairShopInquiryResolution = "resolved" | "dismissed";

export type MarketRepairShopInquiryInput = {
  shopName: string;
  region: string;
  summary: string;
  sourceUrl: string;
};

export type ManagedMarketRepairShopInquiry = {
  inquiryKey: string;
  shopName: string;
  region: string | null;
  summary: string;
  sourceUrl: string | null;
  inquiryStatus: MarketRepairShopInquiryStatus;
  createdAt: string;
  resolvedAt: string | null;
};

export type MarketRepairShopInquiryPage = {
  items: ManagedMarketRepairShopInquiry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type MarketRepairShopInquiryErrorCode =
  | "authentication"
  | "account"
  | "permission"
  | "notFound"
  | "validation"
  | "conflict"
  | "network"
  | "unknown";

export class MarketRepairShopInquiryError extends Error {
  readonly code: MarketRepairShopInquiryErrorCode;
  readonly userMessage: string;

  constructor(code: MarketRepairShopInquiryErrorCode, userMessage: string) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.name = "MarketRepairShopInquiryError";
  }
}

const inquiryKeyPattern = /^[0-9a-f]{32}$/;
const httpsUrlPattern = /^https:\/\/[A-Za-z0-9][^\s]*$/;
const inquiryStatuses = new Set<MarketRepairShopInquiryStatus>([
  "pending",
  "resolved",
  "dismissed",
]);
const resolutions = new Set<MarketRepairShopInquiryResolution>(["resolved", "dismissed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidResponse(): never {
  throw new MarketRepairShopInquiryError(
    "unknown",
    "수리업체 등록 문의 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function exact(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) invalidResponse();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalidResponse();
  }
  return value;
}

function textLength(value: string) {
  return Array.from(value).length;
}

function normalizeRequiredText(value: unknown, minimum: number, maximum: number, message: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const length = textLength(normalized);
  if (length < minimum || length > maximum) {
    throw new MarketRepairShopInquiryError("validation", message);
  }
  return normalized;
}

function normalizeRegion(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (textLength(normalized) > 100) {
    throw new MarketRepairShopInquiryError("validation", "지역은 100자 이내로 입력해 주세요.");
  }
  return normalized || null;
}

function normalizeSourceUrl(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return null;
  if (
    textLength(normalized) < 12
    || textLength(normalized) > 500
    || !httpsUrlPattern.test(normalized)
    || /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new MarketRepairShopInquiryError(
      "validation",
      "확인 URL은 https:// 주소로 500자 이내로 입력해 주세요.",
    );
  }
  return normalized;
}

function normalizeInquiryKey(value: unknown) {
  const inquiryKey = typeof value === "string" ? value.trim() : "";
  if (!inquiryKeyPattern.test(inquiryKey)) {
    throw new MarketRepairShopInquiryError("validation", "처리할 문의를 확인해 주세요.");
  }
  return inquiryKey;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validPage(limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
    throw new MarketRepairShopInquiryError("validation", "페이지 범위를 확인해 주세요.");
  }
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new MarketRepairShopInquiryError("authentication", "로그인이 필요합니다.");
  }
  if (/정상 활동 계정/.test(message)) {
    throw new MarketRepairShopInquiryError(
      "account",
      "현재 계정에서는 수리업체 등록 문의를 접수할 수 없습니다.",
    );
  }
  if (/운영 권한/.test(message)) {
    throw new MarketRepairShopInquiryError("permission", "장터 문의 운영 권한이 없습니다.");
  }
  if (/찾을 수 없/.test(message)) {
    throw new MarketRepairShopInquiryError("notFound", "처리할 문의를 찾을 수 없습니다.");
  }
  if (/이미 처리|상태가 변경/.test(message)) {
    throw new MarketRepairShopInquiryError(
      "conflict",
      "이미 처리되었거나 상태가 변경된 문의입니다. 목록을 새로 확인해 주세요.",
    );
  }
  if (/입력해 주세요|확인해 주세요|페이지 범위/.test(message)) {
    throw new MarketRepairShopInquiryError("validation", message);
  }
  if (/fetch|network/i.test(message)) {
    throw new MarketRepairShopInquiryError(
      "network",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  }
  throw new MarketRepairShopInquiryError(
    "unknown",
    "수리업체 등록 문의를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function parseSubmitResult(value: unknown) {
  const row = exact(value, ["inquiry_key", "inquiry_status"]);
  if (
    typeof row.inquiry_key !== "string"
    || !inquiryKeyPattern.test(row.inquiry_key)
    || row.inquiry_status !== "pending"
  ) invalidResponse();
  return { inquiryKey: row.inquiry_key, inquiryStatus: "pending" as const };
}

function parseManagedInquiry(value: unknown): ManagedMarketRepairShopInquiry {
  const row = exact(value, [
    "inquiry_key",
    "shop_name",
    "region",
    "summary",
    "source_url",
    "inquiry_status",
    "created_at",
    "resolved_at",
  ]);
  if (
    typeof row.inquiry_key !== "string"
    || !inquiryKeyPattern.test(row.inquiry_key)
    || typeof row.shop_name !== "string"
    || (row.region !== null && typeof row.region !== "string")
    || typeof row.summary !== "string"
    || (row.source_url !== null && typeof row.source_url !== "string")
    || typeof row.inquiry_status !== "string"
    || !inquiryStatuses.has(row.inquiry_status as MarketRepairShopInquiryStatus)
    || !validTimestamp(row.created_at)
    || (row.resolved_at !== null && !validTimestamp(row.resolved_at))
  ) invalidResponse();
  return {
    inquiryKey: row.inquiry_key,
    shopName: row.shop_name,
    region: row.region,
    summary: row.summary,
    sourceUrl: row.source_url,
    inquiryStatus: row.inquiry_status as MarketRepairShopInquiryStatus,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function parsePage(value: unknown): MarketRepairShopInquiryPage {
  const row = exact(value, ["items", "total", "limit", "offset", "has_more"]);
  if (
    !Array.isArray(row.items)
    || typeof row.total !== "number" || !Number.isInteger(row.total) || row.total < 0
    || typeof row.limit !== "number" || !Number.isInteger(row.limit) || row.limit < 1 || row.limit > 50
    || typeof row.offset !== "number" || !Number.isInteger(row.offset) || row.offset < 0
    || typeof row.has_more !== "boolean"
  ) invalidResponse();
  return {
    items: row.items.map(parseManagedInquiry),
    total: row.total,
    limit: row.limit,
    offset: row.offset,
    hasMore: row.has_more,
  };
}

function parseResolution(
  value: unknown,
  expectedKey: string,
  expectedResolution: MarketRepairShopInquiryResolution,
) {
  const row = exact(value, ["inquiry_key", "inquiry_status", "resolved_at"]);
  if (
    row.inquiry_key !== expectedKey
    || row.inquiry_status !== expectedResolution
    || !validTimestamp(row.resolved_at)
  ) invalidResponse();
  return {
    inquiryKey: expectedKey,
    inquiryStatus: expectedResolution,
    resolvedAt: row.resolved_at,
  };
}

export async function submitMarketRepairShopInquiry(
  client: SupabaseClient,
  input: MarketRepairShopInquiryInput,
) {
  const shopName = normalizeRequiredText(
    input?.shopName,
    2,
    120,
    "업체명은 2~120자로 입력해 주세요.",
  );
  const region = normalizeRegion(input?.region);
  const summary = normalizeRequiredText(
    input?.summary,
    10,
    3000,
    "업체·서비스 소개는 10~3000자로 입력해 주세요.",
  );
  const sourceUrl = normalizeSourceUrl(input?.sourceUrl);
  const { data, error } = await client.rpc("submit_market_repair_shop_inquiry", {
    p_shop_name: shopName,
    p_region: region,
    p_summary: summary,
    p_source_url: sourceUrl,
  });
  if (error) mapError(error);
  return parseSubmitResult(data);
}

export async function listMarketRepairShopInquiriesForManagement(
  client: SupabaseClient,
  status: MarketRepairShopInquiryStatus | null = "pending",
  limit = 30,
  offset = 0,
) {
  if (status !== null && !inquiryStatuses.has(status)) {
    throw new MarketRepairShopInquiryError("validation", "문의 상태를 확인해 주세요.");
  }
  validPage(limit, offset);
  const { data, error } = await client.rpc("list_market_repair_shop_inquiries_for_management", {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data);
}

export async function resolveMarketRepairShopInquiry(
  client: SupabaseClient,
  inquiryKey: string,
  resolution: MarketRepairShopInquiryResolution,
) {
  const key = normalizeInquiryKey(inquiryKey);
  if (!resolutions.has(resolution)) {
    throw new MarketRepairShopInquiryError("validation", "처리 결과를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("resolve_market_repair_shop_inquiry", {
    p_inquiry_key: key,
    p_resolution: resolution,
  });
  if (error) mapError(error);
  return parseResolution(data, key, resolution);
}
