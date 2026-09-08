import type { SupabaseClient } from "@supabase/supabase-js";

import type { MarketMutationResult } from "@/lib/market/market";

export class MarketListingReportError extends Error {
  readonly code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown";
  readonly userMessage: string;
  readonly shouldRefresh: boolean;

  constructor(
    code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown",
    userMessage: string,
    shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "MarketListingReportError";
    this.code = code;
    this.userMessage = userMessage;
    this.shouldRefresh = shouldRefresh;
  }
}

export type MarketListingReportReason =
  | "fraud_or_false"
  | "prohibited_or_inappropriate"
  | "spam_or_duplicate"
  | "privacy_exposure"
  | "other";
export type MarketListingReportStatus = "received" | "handled" | "dismissed";
export type MarketListingReportFilter = MarketListingReportStatus | "all";
export type MarketListingReportResolution = "handled" | "dismissed";

export type MarketListingReportInput = {
  listingId: string;
  reasonCode: MarketListingReportReason;
  note: string;
  requestId: string;
};

export type ManagedMarketListingReport = {
  reportKey: string;
  listingTitle: string;
  listingStatus: "selling" | "reserved" | "sold" | "removed";
  reasonCode: MarketListingReportReason;
  reportStatus: MarketListingReportStatus;
  version: number;
  createdAt: string;
  resolvedAt: string | null;
};

export type ManagedMarketListingReportDetail = ManagedMarketListingReport & {
  note: string;
  resolutionNote: string | null;
  listing: {
    id: string;
    name: string;
    sellerDisplayName: string;
    saleStatus: "selling" | "reserved" | "sold" | "removed";
    version: number;
  };
};

export type MarketListingReportPage = {
  items: ManagedMarketListingReport[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reportKeyPattern = /^[0-9a-f]{32}$/;
const reasons = new Set<MarketListingReportReason>([
  "fraud_or_false",
  "prohibited_or_inappropriate",
  "spam_or_duplicate",
  "privacy_exposure",
  "other",
]);
const statuses = new Set<MarketListingReportStatus>(["received", "handled", "dismissed"]);
const filters = new Set<MarketListingReportFilter>(["received", "handled", "dismissed", "all"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) invalidResponse();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalidResponse();
  return value;
}

function invalidResponse(): never {
  throw new MarketListingReportError("unknown", "판매글 신고 응답 형식이 올바르지 않습니다.");
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function mapReportError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) throw new MarketListingReportError("authentication", "로그인 후 이용해 주세요.");
  if (/정상 활동 계정|본인의 판매글|운영 권한/.test(message)) throw new MarketListingReportError("permission", message || "이 작업을 수행할 권한이 없습니다.");
  if (/찾을 수 없/.test(message)) throw new MarketListingReportError("notFound", message, true);
  if (/이미|변경되었습니다|request ID/.test(message)) throw new MarketListingReportError("conflict", message, true);
  if (/확인해 주세요|입력해 주세요|페이지 범위/.test(message)) throw new MarketListingReportError("validation", message);
  if (/fetch|network/i.test(message)) throw new MarketListingReportError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  throw new MarketListingReportError("unknown", "판매글 신고 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

function normalizeReportKey(value: string) {
  const key = value.trim();
  if (!reportKeyPattern.test(key)) throw new MarketListingReportError("validation", "판매글 신고 식별자를 확인해 주세요.");
  return key;
}

function normalizeNote(value: string, minimum: number, maximum: number, message: string) {
  const note = value.trim();
  const length = Array.from(note).length;
  if (length < minimum || length > maximum) throw new MarketListingReportError("validation", message);
  return note;
}

function parseReportSummary(value: unknown): ManagedMarketListingReport {
  const row = exact(value, [
    "report_key", "listing_title", "listing_status", "reason_code", "report_status",
    "version", "created_at", "resolved_at",
  ]);
  if (
    typeof row.report_key !== "string" || !reportKeyPattern.test(row.report_key)
    || typeof row.listing_title !== "string"
    || !["selling", "reserved", "sold", "removed"].includes(String(row.listing_status))
    || typeof row.reason_code !== "string" || !reasons.has(row.reason_code as MarketListingReportReason)
    || typeof row.report_status !== "string" || !statuses.has(row.report_status as MarketListingReportStatus)
    || typeof row.version !== "number" || !Number.isInteger(row.version) || row.version < 1
    || !validTimestamp(row.created_at)
    || (row.resolved_at !== null && !validTimestamp(row.resolved_at))
  ) invalidResponse();
  return {
    reportKey: row.report_key,
    listingTitle: row.listing_title,
    listingStatus: row.listing_status as ManagedMarketListingReport["listingStatus"],
    reasonCode: row.reason_code as MarketListingReportReason,
    reportStatus: row.report_status as MarketListingReportStatus,
    version: row.version,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function parseSubmit(value: unknown, requestId: string) {
  const row = exact(value, ["report_key", "report_status", "version", "request_id", "replayed"]);
  if (
    typeof row.report_key !== "string" || !reportKeyPattern.test(row.report_key)
    || row.report_status !== "received"
    || typeof row.version !== "number" || !Number.isInteger(row.version) || row.version < 1
    || row.request_id !== requestId
    || typeof row.replayed !== "boolean"
  ) invalidResponse();
  return {
    reportKey: row.report_key,
    reportStatus: "received" as const,
    version: row.version,
    requestId,
    replayed: row.replayed,
  };
}

function parseResolution(value: unknown, reportKey: string, requestId: string) {
  const row = exact(value, ["report_key", "report_status", "version", "resolved_at", "request_id", "replayed"]);
  if (
    row.report_key !== reportKey
    || (row.report_status !== "handled" && row.report_status !== "dismissed")
    || typeof row.version !== "number" || !Number.isInteger(row.version) || row.version < 2
    || !validTimestamp(row.resolved_at)
    || row.request_id !== requestId
    || typeof row.replayed !== "boolean"
  ) invalidResponse();
  return {
    reportKey,
    reportStatus: row.report_status,
    version: row.version,
    resolvedAt: row.resolved_at,
    requestId,
    replayed: row.replayed,
  };
}

function parseModeration(value: unknown, listingId: string, requestId: string): MarketMutationResult {
  const row = exact(value, ["request_id", "listing_id", "sale_status", "version", "replayed", "removed_storage_paths"]);
  if (
    row.request_id !== requestId || row.listing_id !== listingId || row.sale_status !== "removed"
    || typeof row.version !== "number" || !Number.isInteger(row.version) || row.version < 2
    || typeof row.replayed !== "boolean" || !Array.isArray(row.removed_storage_paths)
    || row.removed_storage_paths.some((path) => typeof path !== "string")
  ) invalidResponse();
  return {
    requestId,
    id: listingId,
    status: "removed",
    version: row.version,
    replayed: row.replayed,
    removedStoragePaths: row.removed_storage_paths as string[],
  };
}

export function validateMarketListingReportInput(input: MarketListingReportInput) {
  if (!uuidPattern.test(input.listingId) || !uuidPattern.test(input.requestId)) throw new MarketListingReportError("validation", "판매글 신고 식별자를 확인해 주세요.");
  if (!reasons.has(input.reasonCode)) throw new MarketListingReportError("validation", "신고 사유를 확인해 주세요.");
  return { ...input, note: normalizeNote(input.note, 10, 1000, "신고 내용은 10~1000자로 입력해 주세요.") };
}

export async function submitMarketListingReport(client: SupabaseClient, input: MarketListingReportInput) {
  const normalized = validateMarketListingReportInput(input);
  const { data, error } = await client.rpc("submit_market_listing_report", {
    p_listing_id: normalized.listingId,
    p_reason_code: normalized.reasonCode,
    p_note: normalized.note,
    p_request_id: normalized.requestId,
  });
  if (error) mapReportError(error);
  return parseSubmit(data, normalized.requestId);
}

export async function listMarketListingReportsForManagement(
  client: SupabaseClient,
  status: MarketListingReportFilter = "received",
  limit = 30,
  offset = 0,
) {
  if (!filters.has(status) || !Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
    throw new MarketListingReportError("validation", "신고 목록 조건을 확인해 주세요.");
  }
  const { data, error } = await client.rpc("list_market_listing_reports_for_management", {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapReportError(error);
  const row = exact(data, ["items", "total", "limit", "offset", "has_more"]);
  if (
    !Array.isArray(row.items)
    || typeof row.total !== "number" || !Number.isInteger(row.total) || row.total < 0
    || row.limit !== limit || row.offset !== offset || typeof row.has_more !== "boolean"
  ) invalidResponse();
  return {
    items: row.items.map(parseReportSummary),
    total: row.total,
    limit,
    offset,
    hasMore: row.has_more,
  } as MarketListingReportPage;
}

export async function getMarketListingReportForManagement(client: SupabaseClient, reportKey: string) {
  const key = normalizeReportKey(reportKey);
  const { data, error } = await client.rpc("get_market_listing_report_for_management", { p_report_key: key });
  if (error) mapReportError(error);
  const row = exact(data, [
    "report_key", "reason_code", "note", "report_status", "version", "created_at",
    "resolved_at", "resolution_note", "listing",
  ]);
  const listing = exact(row.listing, ["id", "name", "seller_display_name", "sale_status", "version"]);
  if (
    row.report_key !== key || typeof row.note !== "string"
    || typeof row.reason_code !== "string" || !reasons.has(row.reason_code as MarketListingReportReason)
    || typeof row.report_status !== "string" || !statuses.has(row.report_status as MarketListingReportStatus)
    || typeof row.version !== "number" || !Number.isInteger(row.version) || row.version < 1
    || !validTimestamp(row.created_at) || (row.resolved_at !== null && !validTimestamp(row.resolved_at))
    || (row.resolution_note !== null && typeof row.resolution_note !== "string")
    || typeof listing.id !== "string" || !uuidPattern.test(listing.id)
    || typeof listing.name !== "string" || typeof listing.seller_display_name !== "string"
    || !["selling", "reserved", "sold", "removed"].includes(String(listing.sale_status))
    || typeof listing.version !== "number" || !Number.isInteger(listing.version) || listing.version < 1
  ) invalidResponse();
  return {
    reportKey: key,
    listingTitle: listing.name,
    listingStatus: listing.sale_status,
    reasonCode: row.reason_code,
    reportStatus: row.report_status,
    version: row.version,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    note: row.note,
    resolutionNote: row.resolution_note,
    listing: {
      id: listing.id,
      name: listing.name,
      sellerDisplayName: listing.seller_display_name,
      saleStatus: listing.sale_status,
      version: listing.version,
    },
  } as ManagedMarketListingReportDetail;
}

export async function resolveMarketListingReport(
  client: SupabaseClient,
  input: { reportKey: string; expectedVersion: number; resolution: MarketListingReportResolution; note: string; requestId: string },
) {
  const reportKey = normalizeReportKey(input.reportKey);
  const note = normalizeNote(input.note, 2, 500, "처리 메모는 2~500자로 입력해 주세요.");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 || !["handled", "dismissed"].includes(input.resolution) || !uuidPattern.test(input.requestId)) {
    throw new MarketListingReportError("validation", "신고 처리 입력을 확인해 주세요.");
  }
  const { data, error } = await client.rpc("resolve_market_listing_report", {
    p_report_key: reportKey,
    p_expected_version: input.expectedVersion,
    p_resolution_status: input.resolution,
    p_resolution_note: note,
    p_request_id: input.requestId,
  });
  if (error) mapReportError(error);
  return parseResolution(data, reportKey, input.requestId);
}

export async function removeMarketListingForModeration(
  client: SupabaseClient,
  input: { listingId: string; expectedVersion: number; reason: string; requestId: string },
) {
  const reason = normalizeNote(input.reason, 2, 500, "비공개 처리 사유는 2~500자로 입력해 주세요.");
  if (!uuidPattern.test(input.listingId) || !uuidPattern.test(input.requestId) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new MarketListingReportError("validation", "판매글 비공개 처리 입력을 확인해 주세요.");
  }
  const { data, error } = await client.rpc("remove_market_listing_for_moderation", {
    p_listing_id: input.listingId,
    p_expected_version: input.expectedVersion,
    p_reason: reason,
    p_request_id: input.requestId,
  });
  if (error) mapReportError(error);
  return parseModeration(data, input.listingId, input.requestId);
}
