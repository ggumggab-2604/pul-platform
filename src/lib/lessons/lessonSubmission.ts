import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  LessonMutationPayload,
  LessonVideoMutationPayload,
} from "@/lib/lessons/lessonDirectory";

export type LessonSubmissionRequestType = "lesson" | "video";
export type LessonSubmissionStatus = "pending" | "completed" | "rejected";

export type LessonSubmissionPayload = {
  title: string;
  providerName: string;
  region: string | null;
  category: string | null;
  summary: string;
  sourceUrl: string;
  secondaryUrl: string | null;
};

export type LessonSubmissionRequest = LessonSubmissionPayload & {
  requestKey: string;
  requestType: LessonSubmissionRequestType;
  requestStatus: LessonSubmissionStatus;
  resultPublicKey: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManagedLessonSubmissionRequest = LessonSubmissionRequest & {
  requesterDisplayName: string;
  version: number;
  processedAt: string | null;
};

export type LessonSubmissionPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type LessonSubmissionResult = {
  requestKey: string;
  requestStatus: LessonSubmissionStatus;
  version: number;
  replayed: boolean;
};

export type ResolveLessonSubmissionInput = {
  requestKey: string;
  expectedVersion: number;
  resolution: "completed" | "rejected";
  directoryKey: string | null;
  directoryPayload: LessonMutationPayload | LessonVideoMutationPayload | null;
  resolutionNote: string | null;
};

export type ResolveLessonSubmissionResult = {
  requestKey: string;
  requestStatus: Exclude<LessonSubmissionStatus, "pending">;
  version: number;
  resultPublicKey: string | null;
};

type JsonObject = Record<string, unknown>;

const requestKeyPattern = /^[0-9a-f]{32}$/;
const publicKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const requestTypes = new Set<LessonSubmissionRequestType>(["lesson", "video"]);
const statuses = new Set<LessonSubmissionStatus>(["pending", "completed", "rejected"]);

const requestKeys = [
  "request_key",
  "request_type",
  "title",
  "provider_name",
  "region",
  "category",
  "summary",
  "source_url",
  "secondary_url",
  "request_status",
  "result_public_key",
  "resolution_note",
  "created_at",
  "updated_at",
] as const;

export class LessonSubmissionError extends Error {
  readonly code: "authentication" | "permission" | "validation" | "conflict" | "network" | "unknown";
  readonly userMessage: string;
  readonly shouldRefresh: boolean;

  constructor(
    code: "authentication" | "permission" | "validation" | "conflict" | "network" | "unknown",
    userMessage: string,
    shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "LessonSubmissionError";
    this.code = code;
    this.userMessage = userMessage;
    this.shouldRefresh = shouldRefresh;
  }
}

function isRecord(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: JsonObject, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function invalidResponse(): never {
  throw new LessonSubmissionError("unknown", "등록 요청 응답 형식이 올바르지 않습니다.");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseRequest(value: unknown): LessonSubmissionRequest {
  if (!isRecord(value) || !exactKeys(value, requestKeys)) invalidResponse();
  if (
    typeof value.request_key !== "string" || !requestKeyPattern.test(value.request_key) ||
    typeof value.request_type !== "string" || !requestTypes.has(value.request_type as LessonSubmissionRequestType) ||
    typeof value.title !== "string" || typeof value.provider_name !== "string" ||
    !isNullableString(value.region) || !isNullableString(value.category) ||
    typeof value.summary !== "string" || typeof value.source_url !== "string" ||
    !isNullableString(value.secondary_url) ||
    typeof value.request_status !== "string" || !statuses.has(value.request_status as LessonSubmissionStatus) ||
    !isNullableString(value.result_public_key) ||
    (value.result_public_key !== null && !publicKeyPattern.test(value.result_public_key)) ||
    !isNullableString(value.resolution_note) ||
    !isIsoDate(value.created_at) || !isIsoDate(value.updated_at)
  ) invalidResponse();

  return {
    requestKey: value.request_key,
    requestType: value.request_type as LessonSubmissionRequestType,
    title: value.title,
    providerName: value.provider_name,
    region: value.region,
    category: value.category,
    summary: value.summary,
    sourceUrl: value.source_url,
    secondaryUrl: value.secondary_url,
    requestStatus: value.request_status as LessonSubmissionStatus,
    resultPublicKey: value.result_public_key,
    resolutionNote: value.resolution_note,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function parseManagedRequest(value: unknown): ManagedLessonSubmissionRequest {
  if (!isRecord(value) || !exactKeys(value, [...requestKeys, "requester_display_name", "version", "processed_at"])) {
    invalidResponse();
  }
  const base = Object.fromEntries(requestKeys.map((key) => [key, value[key]]));
  if (
    typeof value.requester_display_name !== "string" ||
    typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1 ||
    (value.processed_at !== null && !isIsoDate(value.processed_at))
  ) invalidResponse();
  return {
    ...parseRequest(base),
    requesterDisplayName: value.requester_display_name,
    version: value.version,
    processedAt: value.processed_at as string | null,
  };
}

function parsePage<T>(value: unknown, parseItem: (item: unknown) => T): LessonSubmissionPage<T> {
  if (!isRecord(value) || !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) || !Array.isArray(value.items)) {
    invalidResponse();
  }
  if (
    typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 50 ||
    typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) invalidResponse();
  return {
    items: value.items.map(parseItem),
    total: value.total,
    limit: value.limit,
    offset: value.offset,
    hasMore: value.has_more,
  };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) throw new LessonSubmissionError("authentication", "로그인이 필요합니다.", true);
  if (/권한|현재 계정/.test(message)) throw new LessonSubmissionError("permission", message || "등록 요청 권한이 없습니다.");
  if (/변경되었습니다|이미 처리/.test(message)) throw new LessonSubmissionError("conflict", message, true);
  if (/확인해 주세요|입력해 주세요|포함되어 있습니다|재사용/.test(message)) {
    throw new LessonSubmissionError("validation", message);
  }
  if (/fetch|network/i.test(message)) {
    throw new LessonSubmissionError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new LessonSubmissionError("unknown", "등록 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

function validPage(limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
    throw new LessonSubmissionError("validation", "페이지 범위를 확인해 주세요.");
  }
}

export async function submitLessonSubmissionRequest(
  client: SupabaseClient,
  requestId: string,
  requestType: LessonSubmissionRequestType,
  payload: LessonSubmissionPayload,
): Promise<LessonSubmissionResult> {
  const { data, error } = await client.rpc("submit_lesson_submission_request", {
    p_request_id: requestId,
    p_request_type: requestType,
    p_payload: {
      title: payload.title.trim(),
      provider_name: payload.providerName.trim(),
      region: payload.region?.trim() || null,
      category: payload.category?.trim() || null,
      summary: payload.summary.trim(),
      source_url: payload.sourceUrl.trim(),
      secondary_url: payload.secondaryUrl?.trim() || null,
    },
  });
  if (error) mapError(error);
  if (!isRecord(data) || !exactKeys(data, ["request_key", "request_status", "version", "replayed"])) invalidResponse();
  if (
    typeof data.request_key !== "string" || !requestKeyPattern.test(data.request_key) ||
    typeof data.request_status !== "string" || !statuses.has(data.request_status as LessonSubmissionStatus) ||
    typeof data.version !== "number" || !Number.isInteger(data.version) || data.version < 1 ||
    typeof data.replayed !== "boolean"
  ) invalidResponse();
  return {
    requestKey: data.request_key,
    requestStatus: data.request_status as LessonSubmissionStatus,
    version: data.version,
    replayed: data.replayed,
  };
}

export async function listMyLessonSubmissionRequests(client: SupabaseClient, limit = 20, offset = 0) {
  validPage(limit, offset);
  const { data, error } = await client.rpc("list_my_lesson_submission_requests", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parseRequest);
}

export async function listLessonSubmissionRequestsForManagement(
  client: SupabaseClient,
  status: LessonSubmissionStatus | null = null,
  limit = 30,
  offset = 0,
) {
  validPage(limit, offset);
  const { data, error } = await client.rpc("list_lesson_submission_requests_for_management", {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parseManagedRequest);
}

export async function resolveLessonSubmissionRequest(
  client: SupabaseClient,
  input: ResolveLessonSubmissionInput,
): Promise<ResolveLessonSubmissionResult> {
  const { data, error } = await client.rpc("resolve_lesson_submission_request", {
    p_request_key: input.requestKey,
    p_expected_version: input.expectedVersion,
    p_resolution: input.resolution,
    p_directory_key: input.directoryKey,
    p_directory_payload: input.directoryPayload,
    p_resolution_note: input.resolutionNote,
  });
  if (error) mapError(error);
  if (!isRecord(data) || !exactKeys(data, ["request_key", "request_status", "version", "result_public_key"])) invalidResponse();
  if (
    data.request_key !== input.requestKey ||
    typeof data.request_status !== "string" || !new Set(["completed", "rejected"]).has(data.request_status) ||
    typeof data.version !== "number" || !Number.isInteger(data.version) || data.version < 2 ||
    !isNullableString(data.result_public_key) ||
    (data.result_public_key !== null && !publicKeyPattern.test(data.result_public_key))
  ) invalidResponse();
  return {
    requestKey: data.request_key,
    requestStatus: data.request_status as "completed" | "rejected",
    version: data.version,
    resultPublicKey: data.result_public_key,
  };
}
