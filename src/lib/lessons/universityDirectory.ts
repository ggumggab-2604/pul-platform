import type { SupabaseClient } from "@supabase/supabase-js";

export const UNIVERSITY_REGIONS = ["서울", "경기", "인천", "충청", "강원", "전라", "경상", "제주"] as const;

export type UniversityRegion = (typeof UNIVERSITY_REGIONS)[number];
export type UniversityDepartmentPublicationStatus = "published" | "hidden";
export type UniversityDepartmentMutationOperation = "create" | "update" | "publish" | "hide";
export type UniversityDepartmentRequestStatus = "pending" | "completed" | "closed";

export type PublicUniversityDepartment = {
  departmentKey: string;
  universityName: string;
  departmentName: string;
  summary: string;
  region: UniversityRegion;
  officialUrl: string | null;
  admissionsUrl: string | null;
};

export type ManagedUniversityDepartment = PublicUniversityDepartment & {
  publicationStatus: UniversityDepartmentPublicationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type UniversityDepartmentSubmissionRequest = {
  requestKey: string;
  universityName: string;
  departmentName: string;
  region: UniversityRegion;
  referenceUrl: string | null;
  requestMessage: string;
  requestStatus: UniversityDepartmentRequestStatus;
  version: number;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UniversityDirectoryPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type UniversityDepartmentPayload = {
  universityName: string;
  departmentName: string;
  summary: string;
  region: UniversityRegion;
  officialUrl: string | null;
  admissionsUrl: string | null;
};

export type UniversityDepartmentRequestPayload = {
  universityName: string;
  departmentName: string;
  region: UniversityRegion;
  referenceUrl: string | null;
  requestMessage: string;
};

type JsonObject = Record<string, unknown>;

const regions = new Set<string>(UNIVERSITY_REGIONS);
const publicKeys = [
  "department_key", "university_name", "department_name", "summary", "region",
  "official_url", "admissions_url",
] as const;
const managedKeys = [
  ...publicKeys, "publication_status", "version", "created_at", "updated_at",
] as const;
const requestKeys = [
  "request_key", "university_name", "department_name", "region", "reference_url",
  "request_message", "request_status", "version", "resolution_note", "resolved_at",
  "created_at", "updated_at",
] as const;

export class UniversityDirectoryError extends Error {
  readonly code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown";
  readonly userMessage: string;
  readonly shouldRefresh: boolean;

  constructor(
    code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown",
    userMessage: string,
    shouldRefresh = false,
  ) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.shouldRefresh = shouldRefresh;
    this.name = "UniversityDirectoryError";
  }
}

function isObject(value: unknown): value is JsonObject {
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
  throw new UniversityDirectoryError("unknown", "대학·학과 정보 응답 형식이 올바르지 않습니다.");
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isSafeUniversityUrl(value: string | null) {
  if (value === null) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && value.length <= 500 && !/\s/.test(value);
  } catch {
    return false;
  }
}

function baseDepartment(value: JsonObject): PublicUniversityDepartment {
  if (
    typeof value.department_key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value.department_key) ||
    typeof value.university_name !== "string" || typeof value.department_name !== "string" ||
    typeof value.summary !== "string" || typeof value.region !== "string" || !regions.has(value.region) ||
    !nullableString(value.official_url) || !isSafeUniversityUrl(value.official_url) ||
    !nullableString(value.admissions_url) || !isSafeUniversityUrl(value.admissions_url)
  ) invalidResponse();
  return {
    departmentKey: value.department_key,
    universityName: value.university_name,
    departmentName: value.department_name,
    summary: value.summary,
    region: value.region as UniversityRegion,
    officialUrl: value.official_url,
    admissionsUrl: value.admissions_url,
  };
}

export function parsePublicUniversityDepartment(value: unknown): PublicUniversityDepartment {
  if (!isObject(value) || !exactKeys(value, publicKeys)) invalidResponse();
  return baseDepartment(value);
}

export function parseManagedUniversityDepartment(value: unknown): ManagedUniversityDepartment {
  if (!isObject(value) || !exactKeys(value, managedKeys)) invalidResponse();
  if (
    value.publication_status !== "published" && value.publication_status !== "hidden" ||
    typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1 ||
    !validDate(value.created_at) || !validDate(value.updated_at)
  ) invalidResponse();
  return {
    ...baseDepartment(value),
    publicationStatus: value.publication_status,
    version: value.version,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

export function parseUniversityDepartmentRequest(value: unknown): UniversityDepartmentSubmissionRequest {
  if (!isObject(value) || !exactKeys(value, requestKeys)) invalidResponse();
  if (
    typeof value.request_key !== "string" || !/^[0-9a-f-]{36}$/i.test(value.request_key) ||
    typeof value.university_name !== "string" || typeof value.department_name !== "string" ||
    typeof value.region !== "string" || !regions.has(value.region) ||
    !nullableString(value.reference_url) || !isSafeUniversityUrl(value.reference_url) ||
    typeof value.request_message !== "string" ||
    !new Set(["pending", "completed", "closed"]).has(String(value.request_status)) ||
    typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1 ||
    !nullableString(value.resolution_note) ||
    !(value.resolved_at === null || validDate(value.resolved_at)) ||
    !validDate(value.created_at) || !validDate(value.updated_at)
  ) invalidResponse();
  return {
    requestKey: value.request_key,
    universityName: value.university_name,
    departmentName: value.department_name,
    region: value.region as UniversityRegion,
    referenceUrl: value.reference_url,
    requestMessage: value.request_message,
    requestStatus: value.request_status as UniversityDepartmentRequestStatus,
    version: value.version,
    resolutionNote: value.resolution_note,
    resolvedAt: value.resolved_at,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function parsePage<T>(value: unknown, parseItem: (item: unknown) => T): UniversityDirectoryPage<T> {
  if (!isObject(value) || !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) || !Array.isArray(value.items)) invalidResponse();
  if (
    typeof value.total !== "number" || !Number.isSafeInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 50 ||
    typeof value.offset !== "number" || !Number.isSafeInteger(value.offset) || value.offset < 0 ||
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

function validPage(limit: number, offset: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new UniversityDirectoryError("validation", "페이지 범위를 확인해 주세요.");
  }
}

function validRegion(region: string | null | undefined) {
  if (region && !regions.has(region)) throw new UniversityDirectoryError("validation", "지역을 확인해 주세요.");
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) throw new UniversityDirectoryError("authentication", "로그인이 필요합니다.");
  if (/권한|현재 계정/.test(message)) throw new UniversityDirectoryError("permission", "대학·학과 정보를 처리할 권한이 없습니다.");
  if (/변경되었습니다/.test(message)) throw new UniversityDirectoryError("conflict", message, true);
  if (/찾을 수 없습니다/.test(message)) throw new UniversityDirectoryError("notFound", "대학·학과 정보를 찾을 수 없습니다.");
  if (/확인해 주세요|사용 중|지원하지 않는|이미 있습니다|입력해 주세요|재사용/.test(message)) {
    throw new UniversityDirectoryError("validation", message);
  }
  if (/fetch|network/i.test(message)) throw new UniversityDirectoryError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  throw new UniversityDirectoryError("unknown", "대학·학과 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

function payload(value: UniversityDepartmentPayload) {
  return {
    university_name: value.universityName.trim(),
    department_name: value.departmentName.trim(),
    summary: value.summary.trim(),
    region: value.region,
    official_url: value.officialUrl?.trim() || null,
    admissions_url: value.admissionsUrl?.trim() || null,
  };
}

export async function listPublicUniversityDepartments(
  client: SupabaseClient,
  keyword?: string,
  region?: UniversityRegion,
  limit = 24,
  offset = 0,
) {
  validPage(limit, offset);
  validRegion(region);
  const normalizedKeyword = keyword?.trim() || null;
  if (normalizedKeyword && [...normalizedKeyword].length > 100) throw new UniversityDirectoryError("validation", "검색어는 100자 이하로 입력해 주세요.");
  const { data, error } = await client.rpc("list_public_lesson_university_departments", {
    p_keyword: normalizedKeyword,
    p_region: region ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parsePublicUniversityDepartment);
}

export async function listUniversityDepartmentsForManagement(
  client: SupabaseClient,
  keyword?: string,
  status?: UniversityDepartmentPublicationStatus,
  limit = 30,
  offset = 0,
) {
  validPage(limit, offset);
  const { data, error } = await client.rpc("list_lesson_university_departments_for_management", {
    p_keyword: keyword?.trim() || null,
    p_publication_status: status ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parseManagedUniversityDepartment);
}

export async function mutateUniversityDepartment(
  client: SupabaseClient,
  operation: UniversityDepartmentMutationOperation,
  departmentKey: string,
  expectedVersion: number | null,
  value?: UniversityDepartmentPayload,
) {
  const key = departmentKey.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(key)) throw new UniversityDirectoryError("validation", "공개 department key를 확인해 주세요.");
  const { data, error } = await client.rpc("mutate_lesson_university_department", {
    p_operation: operation,
    p_department_key: key,
    p_expected_version: expectedVersion,
    p_payload: value ? payload(value) : {},
  });
  if (error) mapError(error);
  if (
    !isObject(data) || !exactKeys(data, ["department_key", "publication_status", "version"]) ||
    data.department_key !== key ||
    (data.publication_status !== "published" && data.publication_status !== "hidden") ||
    typeof data.version !== "number" || !Number.isSafeInteger(data.version) || data.version < 1
  ) invalidResponse();
  return { departmentKey: key, publicationStatus: data.publication_status, version: data.version };
}

export async function submitUniversityDepartmentRequest(
  client: SupabaseClient,
  requestId: string,
  value: UniversityDepartmentRequestPayload,
) {
  const { data, error } = await client.rpc("submit_lesson_university_department_request", {
    p_request_id: requestId,
    p_payload: {
      university_name: value.universityName.trim(),
      department_name: value.departmentName.trim(),
      region: value.region,
      reference_url: value.referenceUrl?.trim() || null,
      request_message: value.requestMessage.trim(),
    },
  });
  if (error) mapError(error);
  if (
    !isObject(data) || !exactKeys(data, ["request_key", "request_status", "version", "replayed"]) ||
    typeof data.request_key !== "string" || data.request_status !== "pending" ||
    typeof data.version !== "number" || !Number.isSafeInteger(data.version) || data.version < 1 ||
    typeof data.replayed !== "boolean"
  ) invalidResponse();
  return { requestKey: data.request_key, requestStatus: "pending" as const, version: data.version, replayed: data.replayed };
}

export async function listUniversityDepartmentRequestsForManagement(
  client: SupabaseClient,
  status: UniversityDepartmentRequestStatus | null = "pending",
  limit = 30,
  offset = 0,
) {
  validPage(limit, offset);
  const { data, error } = await client.rpc("list_lesson_university_department_requests_for_management", {
    p_request_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parseUniversityDepartmentRequest);
}

export async function resolveUniversityDepartmentRequest(
  client: SupabaseClient,
  requestKey: string,
  expectedVersion: number,
  resolution: "completed" | "closed",
  resolutionNote: string | null,
) {
  const { data, error } = await client.rpc("resolve_lesson_university_department_request", {
    p_request_key: requestKey,
    p_expected_version: expectedVersion,
    p_resolution: resolution,
    p_resolution_note: resolutionNote?.trim() || null,
  });
  if (error) mapError(error);
  return parseUniversityDepartmentRequest(data);
}
