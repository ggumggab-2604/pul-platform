import type { SupabaseClient } from "@supabase/supabase-js";

export type LessonInformationReportType =
  | "incorrect_information"
  | "operation_changed"
  | "inappropriate_content"
  | "other";
export type LessonInformationReportStatus = "pending" | "resolved" | "dismissed";
export type LessonInformationReportResolution = "resolved" | "dismissed";

export type LessonInformationReportInput = {
  lessonKey: string;
  reportType: LessonInformationReportType;
  reportBody: string;
};

export type ManagedLessonInformationReport = {
  reportKey: string;
  reportType: LessonInformationReportType;
  reportBody: string;
  reportStatus: LessonInformationReportStatus;
  lessonKey: string;
  lessonTitle: string;
  province: string;
  district: string;
  location: string;
  organizerName: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type LessonInformationReportPage = {
  items: ManagedLessonInformationReport[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type LessonInformationReportErrorCode =
  | "authentication"
  | "account"
  | "permission"
  | "notFound"
  | "validation"
  | "conflict"
  | "network"
  | "unknown";

export class LessonInformationReportError extends Error {
  readonly code: LessonInformationReportErrorCode;
  readonly userMessage: string;

  constructor(code: LessonInformationReportErrorCode, userMessage: string) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.name = "LessonInformationReportError";
  }
}

const lessonKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const reportKeyPattern = /^[0-9a-f]{32}$/;
const reportTypes = new Set<LessonInformationReportType>([
  "incorrect_information",
  "operation_changed",
  "inappropriate_content",
  "other",
]);
const reportStatuses = new Set<LessonInformationReportStatus>([
  "pending",
  "resolved",
  "dismissed",
]);
const resolutions = new Set<LessonInformationReportResolution>(["resolved", "dismissed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function invalidResponse(): never {
  throw new LessonInformationReportError(
    "unknown",
    "레슨 정보 제보 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeLessonKey(value: string) {
  const lessonKey = value.trim();
  if (!lessonKeyPattern.test(lessonKey)) {
    throw new LessonInformationReportError("validation", "제보할 레슨 정보를 확인해 주세요.");
  }
  return lessonKey;
}

function normalizeReportKey(value: string) {
  const reportKey = value.trim();
  if (!reportKeyPattern.test(reportKey)) {
    throw new LessonInformationReportError("validation", "처리할 제보를 확인해 주세요.");
  }
  return reportKey;
}

function normalizeBody(value: string) {
  const body = value.trim();
  const length = Array.from(body).length;
  if (length < 10 || length > 3000) {
    throw new LessonInformationReportError("validation", "제보 내용은 10~3000자로 입력해 주세요.");
  }
  return body;
}

function validPage(limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
    throw new LessonInformationReportError("validation", "페이지 범위를 확인해 주세요.");
  }
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new LessonInformationReportError("authentication", "로그인이 필요합니다.");
  }
  if (/정상 활동 계정/.test(message)) {
    throw new LessonInformationReportError("account", "현재 계정에서는 레슨 정보를 제보할 수 없습니다.");
  }
  if (/운영 권한/.test(message)) {
    throw new LessonInformationReportError("permission", "레슨 정보 제보 운영 권한이 없습니다.");
  }
  if (/찾을 수 없/.test(message)) {
    throw new LessonInformationReportError("notFound", "대상 레슨 또는 제보를 찾을 수 없습니다.");
  }
  if (/이미 처리|상태가 변경/.test(message)) {
    throw new LessonInformationReportError("conflict", "이미 처리되었거나 상태가 변경된 제보입니다. 목록을 새로 확인해 주세요.");
  }
  if (/확인해 주세요|10~3000자|페이지 범위/.test(message)) {
    throw new LessonInformationReportError("validation", message);
  }
  if (/fetch|network/i.test(message)) {
    throw new LessonInformationReportError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new LessonInformationReportError(
    "unknown",
    "레슨 정보 제보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function parseSubmitResult(value: unknown, expectedStatus: LessonInformationReportStatus = "pending") {
  const row = exact(value, ["report_key", "report_status"]);
  if (
    typeof row.report_key !== "string" || !reportKeyPattern.test(row.report_key)
    || row.report_status !== expectedStatus
  ) invalidResponse();
  return { reportKey: row.report_key, reportStatus: expectedStatus };
}

function parseManagedReport(value: unknown): ManagedLessonInformationReport {
  const row = exact(value, [
    "report_key", "report_type", "report_body", "report_status", "lesson_key",
    "lesson_title", "province", "district", "location", "organizer_name",
    "created_at", "resolved_at",
  ]);
  if (
    typeof row.report_key !== "string" || !reportKeyPattern.test(row.report_key)
    || typeof row.report_type !== "string" || !reportTypes.has(row.report_type as LessonInformationReportType)
    || typeof row.report_body !== "string"
    || typeof row.report_status !== "string" || !reportStatuses.has(row.report_status as LessonInformationReportStatus)
    || typeof row.lesson_key !== "string" || !lessonKeyPattern.test(row.lesson_key)
    || typeof row.lesson_title !== "string" || typeof row.province !== "string"
    || typeof row.district !== "string" || typeof row.location !== "string"
    || typeof row.organizer_name !== "string" || !validTimestamp(row.created_at)
    || (row.resolved_at !== null && !validTimestamp(row.resolved_at))
  ) invalidResponse();
  return {
    reportKey: row.report_key,
    reportType: row.report_type as LessonInformationReportType,
    reportBody: row.report_body,
    reportStatus: row.report_status as LessonInformationReportStatus,
    lessonKey: row.lesson_key,
    lessonTitle: row.lesson_title,
    province: row.province,
    district: row.district,
    location: row.location,
    organizerName: row.organizer_name,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function parsePage(value: unknown): LessonInformationReportPage {
  const row = exact(value, ["items", "total", "limit", "offset", "has_more"]);
  if (
    !Array.isArray(row.items)
    || typeof row.total !== "number" || !Number.isInteger(row.total) || row.total < 0
    || typeof row.limit !== "number" || !Number.isInteger(row.limit) || row.limit < 1 || row.limit > 50
    || typeof row.offset !== "number" || !Number.isInteger(row.offset) || row.offset < 0
    || typeof row.has_more !== "boolean"
  ) invalidResponse();
  return {
    items: row.items.map(parseManagedReport),
    total: row.total,
    limit: row.limit,
    offset: row.offset,
    hasMore: row.has_more,
  };
}

function parseResolution(value: unknown, expectedKey: string, expectedResolution: LessonInformationReportResolution) {
  const row = exact(value, ["report_key", "report_status", "resolved_at"]);
  if (
    row.report_key !== expectedKey
    || row.report_status !== expectedResolution
    || !validTimestamp(row.resolved_at)
  ) invalidResponse();
  return { reportKey: expectedKey, reportStatus: expectedResolution, resolvedAt: row.resolved_at };
}

export async function submitLessonInformationReport(
  client: SupabaseClient,
  input: LessonInformationReportInput,
) {
  const lessonKey = normalizeLessonKey(input.lessonKey);
  if (!reportTypes.has(input.reportType)) {
    throw new LessonInformationReportError("validation", "신고 유형을 확인해 주세요.");
  }
  const reportBody = normalizeBody(input.reportBody);
  const { data, error } = await client.rpc("submit_lesson_information_report", {
    p_lesson_key: lessonKey,
    p_report_type: input.reportType,
    p_report_body: reportBody,
  });
  if (error) mapError(error);
  return parseSubmitResult(data);
}

export async function listLessonInformationReportsForManagement(
  client: SupabaseClient,
  status: LessonInformationReportStatus | null = "pending",
  limit = 30,
  offset = 0,
) {
  if (status !== null && !reportStatuses.has(status)) {
    throw new LessonInformationReportError("validation", "제보 상태를 확인해 주세요.");
  }
  validPage(limit, offset);
  const { data, error } = await client.rpc("list_lesson_information_reports_for_management", {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data);
}

export async function resolveLessonInformationReport(
  client: SupabaseClient,
  reportKey: string,
  resolution: LessonInformationReportResolution,
) {
  const key = normalizeReportKey(reportKey);
  if (!resolutions.has(resolution)) {
    throw new LessonInformationReportError("validation", "처리 결과를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("resolve_lesson_information_report", {
    p_report_key: key,
    p_resolution: resolution,
  });
  if (error) mapError(error);
  return parseResolution(data, key, resolution);
}
