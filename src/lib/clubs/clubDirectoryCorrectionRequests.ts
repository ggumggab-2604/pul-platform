import type { SupabaseClient } from "@supabase/supabase-js";

export const clubDirectoryCorrectionTargets = [
  "club_name",
  "region",
  "home_course",
  "schedule",
  "recruit_status",
  "join_conditions",
  "contact",
  "introduction",
  "other",
] as const;

export type ClubDirectoryCorrectionTarget =
  (typeof clubDirectoryCorrectionTargets)[number];
export type ClubDirectoryCorrectionStatus = "pending" | "completed" | "closed";
export type ClubDirectoryCorrectionResolution = "completed" | "closed";

export const clubDirectoryCorrectionTargetLabels: Readonly<
  Record<ClubDirectoryCorrectionTarget, string>
> = {
  club_name: "동호회명",
  region: "활동 지역",
  home_course: "주 활동 골프장",
  schedule: "정기 활동 시간",
  recruit_status: "회원 모집 상태",
  join_conditions: "가입 조건",
  contact: "운영진·문의 정보",
  introduction: "소개·주요 활동",
  other: "기타",
};

export const clubDirectoryCorrectionStatusLabels: Readonly<
  Record<ClubDirectoryCorrectionStatus, string>
> = {
  pending: "처리 대기",
  completed: "처리 완료",
  closed: "종료",
};

export type ClubDirectoryCorrectionSubmitInput = {
  clubPublicKey: string;
  requestId: string;
  payload: {
    target: ClubDirectoryCorrectionTarget;
    displayedValue?: string;
    proposedValue: string;
    reason: string;
    note?: string;
  };
};

export type ClubDirectoryCorrectionSubmitResult = {
  requestId: string;
  requestKey: string;
  clubPublicKey: string;
  requestStatus: "pending";
  version: number;
  createdAt: string;
  replayed: boolean;
};

export type ClubDirectoryCorrectionListItem = {
  requestKey: string;
  clubPublicKey: string;
  clubName: string;
  requesterLabel: string;
  correctionTarget: ClubDirectoryCorrectionTarget;
  proposedValuePreview: string;
  requestStatus: ClubDirectoryCorrectionStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
};

export type ClubDirectoryCorrectionPage = {
  items: ClubDirectoryCorrectionListItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type ClubDirectoryCorrectionDetail = {
  requestKey: string;
  clubPublicKey: string;
  clubName: string;
  requesterLabel: string;
  correctionTarget: ClubDirectoryCorrectionTarget;
  displayedValue?: string;
  proposedValue: string;
  reason: string;
  note?: string;
  requestStatus: ClubDirectoryCorrectionStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolverLabel?: "동호회 운영진" | "PUL 관리자";
  resolutionNote?: string;
};

export type ClubDirectoryCorrectionResolveInput = {
  requestKey: string;
  expectedVersion: number;
  resolution: ClubDirectoryCorrectionResolution;
  resolutionNote: string;
  requestId: string;
};

export type ClubDirectoryCorrectionResolveResult = {
  requestId: string;
  requestKey: string;
  clubPublicKey: string;
  requestStatus: ClubDirectoryCorrectionResolution;
  version: number;
  resolvedAt: string;
  replayed: boolean;
};

export type ClubDirectoryCorrectionActionState = {
  requestKey: string;
  resolutionNote: string;
  message: string;
  error: string;
  requestId: string | null;
};

export type ClubDirectoryCorrectionActionStateEvent =
  | { type: "edit"; requestKey: string; resolutionNote: string }
  | { type: "start"; requestKey: string; requestId: string }
  | { type: "failure"; requestKey: string; error: string }
  | { type: "success"; requestKey: string; message: string };

export function createClubDirectoryCorrectionActionState(
  requestKey: string,
): ClubDirectoryCorrectionActionState {
  return {
    requestKey,
    resolutionNote: "",
    message: "",
    error: "",
    requestId: null,
  };
}

export function reduceClubDirectoryCorrectionActionState(
  state: ClubDirectoryCorrectionActionState,
  event: ClubDirectoryCorrectionActionStateEvent,
): ClubDirectoryCorrectionActionState {
  if (event.requestKey !== state.requestKey) return state;
  switch (event.type) {
    case "edit":
      return {
        ...state,
        resolutionNote: event.resolutionNote,
        error: "",
        requestId: null,
      };
    case "start":
      return {
        ...state,
        message: "",
        error: "",
        requestId: event.requestId,
      };
    case "failure":
      return { ...state, error: event.error };
    case "success":
      return {
        ...state,
        resolutionNote: "",
        message: event.message,
        error: "",
        requestId: null,
      };
  }
}

type ErrorCode =
  | "authentication"
  | "permission"
  | "validation"
  | "conflict"
  | "notFound"
  | "network"
  | "unknown";

type JsonObject = Record<string, unknown>;

const targetSet = new Set<string>(clubDirectoryCorrectionTargets);
const statusSet = new Set<ClubDirectoryCorrectionStatus>([
  "pending",
  "completed",
  "closed",
]);
const publicKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const requestKeyPattern = /^[0-9a-f]{32}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const submitResultKeys = [
  "request_id",
  "request_key",
  "club_public_key",
  "request_status",
  "version",
  "created_at",
  "replayed",
] as const;
const listItemKeys = [
  "request_key",
  "club_public_key",
  "club_name",
  "requester_label",
  "correction_target",
  "proposed_value_preview",
  "request_status",
  "version",
  "created_at",
  "updated_at",
  "resolved_at",
] as const;
const detailKeys = [
  "request_key",
  "club_public_key",
  "club_name",
  "requester_label",
  "correction_target",
  "displayed_value",
  "proposed_value",
  "reason",
  "note",
  "request_status",
  "version",
  "created_at",
  "updated_at",
  "resolved_at",
  "resolver_label",
  "resolution_note",
] as const;
const resolveResultKeys = [
  "request_id",
  "request_key",
  "club_public_key",
  "request_status",
  "version",
  "resolved_at",
  "replayed",
] as const;

export class ClubDirectoryCorrectionError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = "ClubDirectoryCorrectionError";
  }
}

function plainObject(value: unknown): JsonObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return value as JsonObject;
}

function exactObject(value: unknown, expected: readonly string[]): JsonObject {
  const row = plainObject(value);
  if (!row) invalidResponse();
  const actual = Reflect.ownKeys(row);
  if (
    actual.some((key) => typeof key !== "string") ||
    actual.length !== expected.length ||
    !expected.every((key) => Object.prototype.propertyIsEnumerable.call(row, key)) ||
    actual.some((key) => !expected.includes(key as never))
  ) {
    invalidResponse();
  }
  return row;
}

function invalidResponse(): never {
  throw new ClubDirectoryCorrectionError(
    "unknown",
    "동호회 정보 수정 제보 응답 형식을 확인할 수 없습니다.",
  );
}

function requiredString(value: unknown, min: number, max: number, message: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < min || normalized.length > max) {
    throw new ClubDirectoryCorrectionError("validation", message);
  }
  return normalized;
}

function optionalString(value: unknown, max: number, message: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) {
    throw new ClubDirectoryCorrectionError("validation", message);
  }
  return normalized;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    invalidResponse();
  }
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    invalidResponse();
  }
  return value;
}

function nullableTimestamp(value: unknown): string | undefined {
  return value === null ? undefined : timestamp(value);
}

function parseTarget(value: unknown): ClubDirectoryCorrectionTarget {
  if (typeof value !== "string" || !targetSet.has(value)) invalidResponse();
  return value as ClubDirectoryCorrectionTarget;
}

function parseStatus(value: unknown): ClubDirectoryCorrectionStatus {
  if (typeof value !== "string" || !statusSet.has(value as ClubDirectoryCorrectionStatus)) {
    invalidResponse();
  }
  return value as ClubDirectoryCorrectionStatus;
}

function parseSubmitResult(
  value: unknown,
  expected: { requestId: string; clubPublicKey: string },
): ClubDirectoryCorrectionSubmitResult {
  const row = exactObject(value, submitResultKeys);
  if (
    row.request_id !== expected.requestId ||
    row.club_public_key !== expected.clubPublicKey ||
    typeof row.request_key !== "string" ||
    !requestKeyPattern.test(row.request_key) ||
    row.request_status !== "pending" ||
    row.version !== 1 ||
    typeof row.replayed !== "boolean"
  ) {
    invalidResponse();
  }
  return {
    requestId: row.request_id,
    requestKey: row.request_key,
    clubPublicKey: row.club_public_key,
    requestStatus: "pending",
    version: 1,
    createdAt: timestamp(row.created_at),
    replayed: row.replayed,
  };
}

function parseListItem(value: unknown): ClubDirectoryCorrectionListItem {
  const row = exactObject(value, listItemKeys);
  if (
    typeof row.request_key !== "string" ||
    !requestKeyPattern.test(row.request_key) ||
    typeof row.club_public_key !== "string" ||
    !publicKeyPattern.test(row.club_public_key) ||
    typeof row.club_name !== "string" ||
    !row.club_name ||
    row.requester_label !== "로그인 회원" ||
    typeof row.proposed_value_preview !== "string" ||
    row.proposed_value_preview.length < 1 ||
    row.proposed_value_preview.length > 160
  ) {
    invalidResponse();
  }
  return {
    requestKey: row.request_key,
    clubPublicKey: row.club_public_key,
    clubName: row.club_name,
    requesterLabel: row.requester_label,
    correctionTarget: parseTarget(row.correction_target),
    proposedValuePreview: row.proposed_value_preview,
    requestStatus: parseStatus(row.request_status),
    version: positiveInteger(row.version),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    resolvedAt: nullableTimestamp(row.resolved_at),
  };
}

function parseDetail(value: unknown): ClubDirectoryCorrectionDetail {
  const row = exactObject(value, detailKeys);
  if (
    typeof row.proposed_value !== "string" ||
    row.proposed_value.length < 2 ||
    row.proposed_value.length > 500 ||
    typeof row.reason !== "string" ||
    row.reason.length < 2 ||
    row.reason.length > 500 ||
    !(row.displayed_value === null || (typeof row.displayed_value === "string" && row.displayed_value.length <= 500)) ||
    !(row.note === null || (typeof row.note === "string" && row.note.length <= 500)) ||
    !(
      row.resolver_label === null ||
      row.resolver_label === "동호회 운영진" ||
      row.resolver_label === "PUL 관리자"
    ) ||
    !(row.resolution_note === null || (typeof row.resolution_note === "string" && row.resolution_note.length <= 500))
  ) {
    invalidResponse();
  }
  const proposedValue = row.proposed_value as string;
  const reason = row.reason as string;
  const displayedValue = typeof row.displayed_value === "string" ? row.displayed_value : undefined;
  const note = typeof row.note === "string" ? row.note : undefined;
  const resolutionNote = typeof row.resolution_note === "string" ? row.resolution_note : undefined;
  const resolverLabel =
    row.resolver_label === "동호회 운영진" || row.resolver_label === "PUL 관리자"
      ? row.resolver_label
      : undefined;
  const listShape = parseListItem({
    request_key: row.request_key,
    club_public_key: row.club_public_key,
    club_name: row.club_name,
    requester_label: row.requester_label,
    correction_target: row.correction_target,
    proposed_value_preview: proposedValue.slice(0, 160),
    request_status: row.request_status,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
  });
  return {
    ...listShape,
    displayedValue,
    proposedValue,
    reason,
    note,
    resolverLabel,
    resolutionNote,
  };
}

function mapError(error: { message?: string; code?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new ClubDirectoryCorrectionError("authentication", "로그인이 필요합니다.");
  }
  if (/권한|정상 활동 계정|현재 계정 상태/.test(message) || error?.code === "42501") {
    throw new ClubDirectoryCorrectionError("permission", message || "이 작업을 수행할 권한이 없습니다.");
  }
  if (/request ID|처리 중|처리 대기|이미 처리|상태가 변경|duplicate key/i.test(message) || error?.code === "40901" || error?.code === "40001") {
    throw new ClubDirectoryCorrectionError("conflict", message || "최신 상태를 다시 확인해 주세요.");
  }
  if (/찾을 수 없/.test(message) || error?.code === "P0002") {
    throw new ClubDirectoryCorrectionError("notFound", message || "제보를 찾을 수 없습니다.");
  }
  if (/확인해 주세요|입력해 주세요|지원하지 않는|페이지 범위/.test(message) || error?.code === "22023") {
    throw new ClubDirectoryCorrectionError("validation", message || "입력 내용을 확인해 주세요.");
  }
  if (/fetch|network/i.test(message)) {
    throw new ClubDirectoryCorrectionError(
      "network",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  }
  throw new ClubDirectoryCorrectionError(
    "unknown",
    "동호회 정보 수정 제보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

export async function submitClubDirectoryCorrectionRequest(
  client: SupabaseClient,
  input: ClubDirectoryCorrectionSubmitInput,
): Promise<ClubDirectoryCorrectionSubmitResult> {
  const clubPublicKey = requiredString(
    input.clubPublicKey,
    1,
    64,
    "제보할 동호회를 확인해 주세요.",
  );
  if (!publicKeyPattern.test(clubPublicKey)) {
    throw new ClubDirectoryCorrectionError("validation", "제보할 동호회를 확인해 주세요.");
  }
  const requestId = requiredString(input.requestId, 36, 36, "제보 request ID를 확인해 주세요.");
  if (!uuidPattern.test(requestId)) {
    throw new ClubDirectoryCorrectionError("validation", "제보 request ID를 확인해 주세요.");
  }
  if (!targetSet.has(input.payload.target)) {
    throw new ClubDirectoryCorrectionError("validation", "수정 대상을 확인해 주세요.");
  }
  const displayedValue = optionalString(
    input.payload.displayedValue,
    500,
    "현재 표시된 내용은 500자 이하로 입력해 주세요.",
  );
  if (input.payload.target === "other" && !displayedValue) {
    throw new ClubDirectoryCorrectionError(
      "validation",
      "기타 수정 대상의 현재 표시 내용을 입력해 주세요.",
    );
  }
  const proposedValue = requiredString(
    input.payload.proposedValue,
    2,
    500,
    "변경이 필요한 내용은 2~500자로 입력해 주세요.",
  );
  const reason = requiredString(
    input.payload.reason,
    2,
    500,
    "변경 사유 또는 확인 근거는 2~500자로 입력해 주세요.",
  );
  const note = optionalString(input.payload.note, 500, "참고사항은 500자 이하로 입력해 주세요.");

  const { data, error } = await client.rpc("submit_club_directory_correction_request", {
    p_request_id: requestId,
    p_club_public_key: clubPublicKey,
    p_payload: {
      target: input.payload.target,
      displayed_value: displayedValue ?? null,
      proposed_value: proposedValue,
      reason,
      note: note ?? null,
    },
  });
  if (error) mapError(error);
  return parseSubmitResult(data, { requestId, clubPublicKey });
}

export async function listClubDirectoryCorrectionRequestsForManagement(
  client: SupabaseClient,
  options: {
    clubPublicKey?: string;
    status?: ClubDirectoryCorrectionStatus;
    limit?: number;
    offset?: number;
  } = {},
): Promise<ClubDirectoryCorrectionPage> {
  const clubPublicKey = options.clubPublicKey
    ? requiredString(options.clubPublicKey, 1, 64, "관리할 동호회를 확인해 주세요.")
    : undefined;
  if (clubPublicKey && !publicKeyPattern.test(clubPublicKey)) {
    throw new ClubDirectoryCorrectionError("validation", "관리할 동호회를 확인해 주세요.");
  }
  if (options.status && !statusSet.has(options.status)) {
    throw new ClubDirectoryCorrectionError("validation", "제보 상태를 확인해 주세요.");
  }
  const limit = options.limit ?? 30;
  const offset = options.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new ClubDirectoryCorrectionError("validation", "페이지 범위를 확인해 주세요.");
  }
  const { data, error } = await client.rpc(
    "list_club_directory_correction_requests_for_management",
    {
      p_club_public_key: clubPublicKey ?? null,
      p_status: options.status ?? null,
      p_limit: limit,
      p_offset: offset,
    },
  );
  if (error) mapError(error);
  const root = exactObject(data, ["items", "total", "limit", "offset", "has_more"]);
  if (
    !Array.isArray(root.items) ||
    typeof root.total !== "number" ||
    !Number.isSafeInteger(root.total) ||
    root.total < 0 ||
    root.limit !== limit ||
    root.offset !== offset ||
    typeof root.has_more !== "boolean"
  ) {
    invalidResponse();
  }
  return {
    items: root.items.map(parseListItem),
    total: root.total,
    limit,
    offset,
    hasMore: root.has_more,
  };
}

export async function getClubDirectoryCorrectionRequestForManagement(
  client: SupabaseClient,
  requestKey: string,
): Promise<ClubDirectoryCorrectionDetail> {
  const normalized = requiredString(requestKey, 32, 32, "확인할 제보를 선택해 주세요.");
  if (!requestKeyPattern.test(normalized)) {
    throw new ClubDirectoryCorrectionError("validation", "확인할 제보를 선택해 주세요.");
  }
  const { data, error } = await client.rpc(
    "get_club_directory_correction_request_for_management",
    { p_request_key: normalized },
  );
  if (error) mapError(error);
  const detail = parseDetail(data);
  if (detail.requestKey !== normalized) invalidResponse();
  return detail;
}

export async function resolveClubDirectoryCorrectionRequest(
  client: SupabaseClient,
  input: ClubDirectoryCorrectionResolveInput,
): Promise<ClubDirectoryCorrectionResolveResult> {
  const requestKey = requiredString(input.requestKey, 32, 32, "처리할 제보를 확인해 주세요.");
  if (!requestKeyPattern.test(requestKey)) {
    throw new ClubDirectoryCorrectionError("validation", "처리할 제보를 확인해 주세요.");
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new ClubDirectoryCorrectionError("validation", "제보 version을 확인해 주세요.");
  }
  if (input.resolution !== "completed" && input.resolution !== "closed") {
    throw new ClubDirectoryCorrectionError("validation", "처리 결과를 확인해 주세요.");
  }
  const resolutionNote = requiredString(
    input.resolutionNote,
    2,
    500,
    "처리 메모는 2~500자로 입력해 주세요.",
  );
  const requestId = requiredString(input.requestId, 36, 36, "처리 request ID를 확인해 주세요.");
  if (!uuidPattern.test(requestId)) {
    throw new ClubDirectoryCorrectionError("validation", "처리 request ID를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("resolve_club_directory_correction_request", {
    p_request_key: requestKey,
    p_expected_version: input.expectedVersion,
    p_resolution: input.resolution,
    p_resolution_note: resolutionNote,
    p_request_id: requestId,
  });
  if (error) mapError(error);
  const row = exactObject(data, resolveResultKeys);
  if (
    row.request_id !== requestId ||
    row.request_key !== requestKey ||
    typeof row.club_public_key !== "string" ||
    !publicKeyPattern.test(row.club_public_key) ||
    row.request_status !== input.resolution ||
    row.version !== input.expectedVersion + 1 ||
    typeof row.replayed !== "boolean"
  ) {
    invalidResponse();
  }
  return {
    requestId,
    requestKey,
    clubPublicKey: row.club_public_key,
    requestStatus: input.resolution,
    version: row.version,
    resolvedAt: timestamp(row.resolved_at),
    replayed: row.replayed,
  };
}
