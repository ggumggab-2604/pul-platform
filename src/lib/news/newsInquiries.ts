import type { SupabaseClient } from "@supabase/supabase-js";

export type NewsInquiryType = "news_report" | "promotion_inquiry";
export type NewsInquiryStatus = "pending" | "resolved" | "dismissed";
export type NewsInquiryResolution = "resolved" | "dismissed";

export type NewsInquiryInput = {
  inquiryType: NewsInquiryType;
  inquiryBody: string;
};

export type ManagedNewsInquiry = {
  inquiryKey: string;
  inquiryType: NewsInquiryType;
  inquiryBody: string;
  inquiryStatus: NewsInquiryStatus;
  createdAt: string;
  resolvedAt: string | null;
};

export type NewsInquiryPage = {
  items: ManagedNewsInquiry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type NewsInquiryErrorCode =
  | "authentication"
  | "account"
  | "permission"
  | "notFound"
  | "validation"
  | "conflict"
  | "network"
  | "unknown";

export class NewsInquiryError extends Error {
  readonly code: NewsInquiryErrorCode;
  readonly userMessage: string;

  constructor(code: NewsInquiryErrorCode, userMessage: string) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.name = "NewsInquiryError";
  }
}

const inquiryKeyPattern = /^[0-9a-f]{32}$/;
const inquiryTypes = new Set<NewsInquiryType>(["news_report", "promotion_inquiry"]);
const inquiryStatuses = new Set<NewsInquiryStatus>(["pending", "resolved", "dismissed"]);
const resolutions = new Set<NewsInquiryResolution>(["resolved", "dismissed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidResponse(): never {
  throw new NewsInquiryError(
    "unknown",
    "뉴스 제보·홍보 문의 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
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

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeInquiryKey(value: string) {
  const inquiryKey = value.trim();
  if (!inquiryKeyPattern.test(inquiryKey)) {
    throw new NewsInquiryError("validation", "처리할 문의를 확인해 주세요.");
  }
  return inquiryKey;
}

function normalizeBody(value: string) {
  const body = value.trim();
  const length = Array.from(body).length;
  if (length < 10 || length > 3000) {
    throw new NewsInquiryError("validation", "접수 내용은 10~3000자로 입력해 주세요.");
  }
  return body;
}

function validPage(limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
    throw new NewsInquiryError("validation", "페이지 범위를 확인해 주세요.");
  }
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new NewsInquiryError("authentication", "로그인이 필요합니다.");
  }
  if (/정상 활동 계정/.test(message)) {
    throw new NewsInquiryError("account", "현재 계정에서는 뉴스 제보와 홍보 문의를 접수할 수 없습니다.");
  }
  if (/운영 권한/.test(message)) {
    throw new NewsInquiryError("permission", "뉴스·정보 운영 권한이 없습니다.");
  }
  if (/찾을 수 없/.test(message)) {
    throw new NewsInquiryError("notFound", "처리할 문의를 찾을 수 없습니다.");
  }
  if (/이미 처리|상태가 변경/.test(message)) {
    throw new NewsInquiryError("conflict", "이미 처리되었거나 상태가 변경된 문의입니다. 목록을 새로 확인해 주세요.");
  }
  if (/확인해 주세요|10~3000자|페이지 범위/.test(message)) {
    throw new NewsInquiryError("validation", message);
  }
  if (/fetch|network/i.test(message)) {
    throw new NewsInquiryError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new NewsInquiryError(
    "unknown",
    "뉴스 제보·홍보 문의를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function parseSubmitResult(value: unknown) {
  const row = exact(value, ["inquiry_key", "inquiry_status"]);
  if (
    typeof row.inquiry_key !== "string" || !inquiryKeyPattern.test(row.inquiry_key)
    || row.inquiry_status !== "pending"
  ) invalidResponse();
  return { inquiryKey: row.inquiry_key, inquiryStatus: "pending" as const };
}

function parseManagedInquiry(value: unknown): ManagedNewsInquiry {
  const row = exact(value, [
    "inquiry_key",
    "inquiry_type",
    "inquiry_body",
    "inquiry_status",
    "created_at",
    "resolved_at",
  ]);
  if (
    typeof row.inquiry_key !== "string" || !inquiryKeyPattern.test(row.inquiry_key)
    || typeof row.inquiry_type !== "string" || !inquiryTypes.has(row.inquiry_type as NewsInquiryType)
    || typeof row.inquiry_body !== "string"
    || typeof row.inquiry_status !== "string"
    || !inquiryStatuses.has(row.inquiry_status as NewsInquiryStatus)
    || !validTimestamp(row.created_at)
    || (row.resolved_at !== null && !validTimestamp(row.resolved_at))
  ) invalidResponse();
  return {
    inquiryKey: row.inquiry_key,
    inquiryType: row.inquiry_type as NewsInquiryType,
    inquiryBody: row.inquiry_body,
    inquiryStatus: row.inquiry_status as NewsInquiryStatus,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function parsePage(value: unknown): NewsInquiryPage {
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
  expectedResolution: NewsInquiryResolution,
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

export async function submitNewsInquiry(client: SupabaseClient, input: NewsInquiryInput) {
  if (!inquiryTypes.has(input.inquiryType)) {
    throw new NewsInquiryError("validation", "문의 유형을 확인해 주세요.");
  }
  const inquiryBody = normalizeBody(input.inquiryBody);
  const { data, error } = await client.rpc("submit_news_inquiry", {
    p_inquiry_type: input.inquiryType,
    p_inquiry_body: inquiryBody,
  });
  if (error) mapError(error);
  return parseSubmitResult(data);
}

export async function listNewsInquiriesForManagement(
  client: SupabaseClient,
  status: NewsInquiryStatus | null = "pending",
  limit = 30,
  offset = 0,
) {
  if (status !== null && !inquiryStatuses.has(status)) {
    throw new NewsInquiryError("validation", "문의 상태를 확인해 주세요.");
  }
  validPage(limit, offset);
  const { data, error } = await client.rpc("list_news_inquiries_for_management", {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data);
}

export async function resolveNewsInquiry(
  client: SupabaseClient,
  inquiryKey: string,
  resolution: NewsInquiryResolution,
) {
  const key = normalizeInquiryKey(inquiryKey);
  if (!resolutions.has(resolution)) {
    throw new NewsInquiryError("validation", "처리 결과를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("resolve_news_inquiry", {
    p_inquiry_key: key,
    p_resolution: resolution,
  });
  if (error) mapError(error);
  return parseResolution(data, key, resolution);
}
