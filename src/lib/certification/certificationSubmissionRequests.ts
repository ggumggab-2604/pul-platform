import type { SupabaseClient } from "@supabase/supabase-js";

export type CertificationSubmissionRequestType =
  | "course_registration"
  | "job_registration";
export type CertificationSubmissionRequestStatus =
  | "pending"
  | "resolved"
  | "dismissed";
export type CertificationSubmissionResolution = "resolved" | "dismissed";

export type CertificationSubmissionRequestInput = {
  requestType: CertificationSubmissionRequestType;
  title: string;
  organizationName: string;
  region: string;
  summary: string;
  sourceUrl: string;
};

export type ManagedCertificationSubmissionRequest = {
  requestKey: string;
  requestType: CertificationSubmissionRequestType;
  title: string;
  organizationName: string;
  region: string | null;
  summary: string;
  sourceUrl: string | null;
  requestStatus: CertificationSubmissionRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
};

export type CertificationSubmissionRequestPage = {
  items: ManagedCertificationSubmissionRequest[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type CertificationSubmissionRequestErrorCode =
  | "authentication"
  | "account"
  | "permission"
  | "notFound"
  | "validation"
  | "conflict"
  | "network"
  | "unknown";

export class CertificationSubmissionRequestError extends Error {
  readonly code: CertificationSubmissionRequestErrorCode;
  readonly userMessage: string;

  constructor(
    code: CertificationSubmissionRequestErrorCode,
    userMessage: string,
  ) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.name = "CertificationSubmissionRequestError";
  }
}

const requestKeyPattern = /^[0-9a-f]{32}$/;
const requestTypes = new Set<CertificationSubmissionRequestType>([
  "course_registration",
  "job_registration",
]);
const requestStatuses = new Set<CertificationSubmissionRequestStatus>([
  "pending",
  "resolved",
  "dismissed",
]);
const resolutions = new Set<CertificationSubmissionResolution>([
  "resolved",
  "dismissed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidResponse(): never {
  throw new CertificationSubmissionRequestError(
    "unknown",
    "자격증·심판 등록 문의 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
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

function length(value: string) {
  return Array.from(value).length;
}

function normalizeText(value: unknown, min: number, max: number, message: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (length(normalized) < min || length(normalized) > max) {
    throw new CertificationSubmissionRequestError("validation", message);
  }
  return normalized;
}

function normalizeOptionalText(value: unknown, max: number, message: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (length(normalized) > max) {
    throw new CertificationSubmissionRequestError("validation", message);
  }
  return normalized || null;
}

function isSafeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && length(value) <= 500 && !/\s/.test(value);
  } catch {
    return false;
  }
}

function normalizeSourceUrl(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return null;
  if (!isSafeSourceUrl(normalized)) {
    throw new CertificationSubmissionRequestError(
      "validation",
      "공식 확인 URL은 유효한 HTTPS 주소로 입력해 주세요.",
    );
  }
  return normalized;
}

function normalizeRequestKey(value: string) {
  const requestKey = value.trim();
  if (!requestKeyPattern.test(requestKey)) {
    throw new CertificationSubmissionRequestError("validation", "처리할 등록 문의를 확인해 주세요.");
  }
  return requestKey;
}

function validPage(limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
    throw new CertificationSubmissionRequestError("validation", "페이지 범위를 확인해 주세요.");
  }
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new CertificationSubmissionRequestError("authentication", "로그인이 필요합니다.");
  }
  if (/정상 활동 계정/.test(message)) {
    throw new CertificationSubmissionRequestError(
      "account",
      "현재 계정에서는 자격증·심판 등록 문의를 접수할 수 없습니다.",
    );
  }
  if (/운영 권한/.test(message)) {
    throw new CertificationSubmissionRequestError(
      "permission",
      "자격증·심판 정보 운영 권한이 없습니다.",
    );
  }
  if (/찾을 수 없/.test(message)) {
    throw new CertificationSubmissionRequestError("notFound", "처리할 등록 문의를 찾을 수 없습니다.");
  }
  if (/이미 처리|상태가 변경/.test(message)) {
    throw new CertificationSubmissionRequestError(
      "conflict",
      "이미 처리되었거나 상태가 변경된 등록 문의입니다. 목록을 새로 확인해 주세요.",
    );
  }
  if (/확인해 주세요|입력해 주세요|페이지 범위/.test(message)) {
    throw new CertificationSubmissionRequestError("validation", message);
  }
  if (/fetch|network/i.test(message)) {
    throw new CertificationSubmissionRequestError(
      "network",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  }
  throw new CertificationSubmissionRequestError(
    "unknown",
    "자격증·심판 등록 문의를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function parseSubmitResult(value: unknown) {
  const row = exact(value, ["request_key", "request_status"]);
  if (
    typeof row.request_key !== "string"
    || !requestKeyPattern.test(row.request_key)
    || row.request_status !== "pending"
  ) invalidResponse();
  return { requestKey: row.request_key, requestStatus: "pending" as const };
}

function parseManagedRequest(value: unknown): ManagedCertificationSubmissionRequest {
  const row = exact(value, [
    "request_key",
    "request_type",
    "title",
    "organization_name",
    "region",
    "summary",
    "source_url",
    "request_status",
    "created_at",
    "resolved_at",
  ]);
  if (
    typeof row.request_key !== "string" || !requestKeyPattern.test(row.request_key)
    || typeof row.request_type !== "string"
    || !requestTypes.has(row.request_type as CertificationSubmissionRequestType)
    || typeof row.title !== "string"
    || typeof row.organization_name !== "string"
    || (row.region !== null && typeof row.region !== "string")
    || typeof row.summary !== "string"
    || (
      row.source_url !== null
      && (typeof row.source_url !== "string" || !isSafeSourceUrl(row.source_url))
    )
    || typeof row.request_status !== "string"
    || !requestStatuses.has(row.request_status as CertificationSubmissionRequestStatus)
    || !validTimestamp(row.created_at)
    || (row.resolved_at !== null && !validTimestamp(row.resolved_at))
  ) invalidResponse();
  return {
    requestKey: row.request_key,
    requestType: row.request_type as CertificationSubmissionRequestType,
    title: row.title,
    organizationName: row.organization_name,
    region: row.region,
    summary: row.summary,
    sourceUrl: row.source_url,
    requestStatus: row.request_status as CertificationSubmissionRequestStatus,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function parsePage(value: unknown): CertificationSubmissionRequestPage {
  const row = exact(value, ["items", "total", "limit", "offset", "has_more"]);
  if (
    !Array.isArray(row.items)
    || typeof row.total !== "number" || !Number.isInteger(row.total) || row.total < 0
    || typeof row.limit !== "number" || !Number.isInteger(row.limit) || row.limit < 1 || row.limit > 50
    || typeof row.offset !== "number" || !Number.isInteger(row.offset) || row.offset < 0
    || typeof row.has_more !== "boolean"
  ) invalidResponse();
  return {
    items: row.items.map(parseManagedRequest),
    total: row.total,
    limit: row.limit,
    offset: row.offset,
    hasMore: row.has_more,
  };
}

function parseResolution(
  value: unknown,
  expectedKey: string,
  expectedResolution: CertificationSubmissionResolution,
) {
  const row = exact(value, ["request_key", "request_status", "resolved_at"]);
  if (
    row.request_key !== expectedKey
    || row.request_status !== expectedResolution
    || !validTimestamp(row.resolved_at)
  ) invalidResponse();
  return {
    requestKey: expectedKey,
    requestStatus: expectedResolution,
    resolvedAt: row.resolved_at,
  };
}

export async function submitCertificationSubmissionRequest(
  client: SupabaseClient,
  input: CertificationSubmissionRequestInput,
) {
  if (!input || !requestTypes.has(input.requestType)) {
    throw new CertificationSubmissionRequestError("validation", "등록 문의 유형을 확인해 주세요.");
  }
  const title = normalizeText(input.title, 2, 180, "제목은 2~180자로 입력해 주세요.");
  const organizationName = normalizeText(
    input.organizationName,
    2,
    160,
    "기관·업체명은 2~160자로 입력해 주세요.",
  );
  const region = normalizeOptionalText(input.region, 80, "지역은 80자 이내로 입력해 주세요.");
  const summary = normalizeText(input.summary, 10, 3000, "안내 내용은 10~3000자로 입력해 주세요.");
  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  const { data, error } = await client.rpc("submit_certification_submission_request", {
    p_request_type: input.requestType,
    p_title: title,
    p_organization_name: organizationName,
    p_region: region,
    p_summary: summary,
    p_source_url: sourceUrl,
  });
  if (error) mapError(error);
  return parseSubmitResult(data);
}

export async function listCertificationSubmissionRequestsForManagement(
  client: SupabaseClient,
  status: CertificationSubmissionRequestStatus | null = "pending",
  limit = 30,
  offset = 0,
) {
  if (status !== null && !requestStatuses.has(status)) {
    throw new CertificationSubmissionRequestError("validation", "등록 문의 상태를 확인해 주세요.");
  }
  validPage(limit, offset);
  const { data, error } = await client.rpc(
    "list_certification_submission_requests_for_management",
    { p_status: status, p_limit: limit, p_offset: offset },
  );
  if (error) mapError(error);
  return parsePage(data);
}

export async function resolveCertificationSubmissionRequest(
  client: SupabaseClient,
  requestKey: string,
  resolution: CertificationSubmissionResolution,
) {
  const key = normalizeRequestKey(requestKey);
  if (!resolutions.has(resolution)) {
    throw new CertificationSubmissionRequestError("validation", "처리 결과를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("resolve_certification_submission_request", {
    p_request_key: key,
    p_resolution: resolution,
  });
  if (error) mapError(error);
  return parseResolution(data, key, resolution);
}
