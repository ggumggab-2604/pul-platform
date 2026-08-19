import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  HallOfFameDisputeCategory,
  HallOfFameDisputeStatus,
  HallOfFameDisputeType,
  HallOfFameResolutionOutcome,
} from "@/lib/hall-of-fame/hallOfFameMemberUi";

export type HallOfFameOperatorPermissions = {
  canRead: boolean;
  canReview: boolean;
  canResolve: boolean;
  canCorrect: boolean;
  canRevoke: boolean;
};

export type HallOfFameDisputeQueueItem = {
  disputeId: string;
  disputeType: HallOfFameDisputeType;
  category: HallOfFameDisputeCategory;
  status: HallOfFameDisputeStatus;
  version: number;
  statement: string;
  targetKind: "application_record" | "canonical_record";
  createdAt: string;
  updatedAt: string;
  reviewStartedAt?: string;
  resolutionOutcome?: HallOfFameResolutionOutcome;
  resolvedAt?: string;
};

export type HallOfFameDisputeReviewDetail = HallOfFameDisputeQueueItem & {
  resolutionMessage?: string;
};

export type HallOfFameDisputeInternalNote = {
  reviewId: string;
  reviewKind: string;
  note: string;
  createdAt: string;
};

export type HallOfFameDisputeResolutionContext = {
  disputeId: string;
  disputeType: Exclude<HallOfFameDisputeType, "decision_appeal">;
  disputeVersion: number;
  canonicalRecordId: string;
  canonicalRecordVersion: number;
  recordTypeCode: "hole_in_one" | "albatross" | "condor";
  playedOn: string;
  courseName: string;
  courseRegion: string;
  courseEnvironment: "outdoor" | "screen";
  courseLayout?: string;
  courseSegment: string;
  holeNumber: number;
  holePar?: number;
  strokes?: number;
  nominatingClubId?: string;
};

export type HallOfFameOperatorActionResult = {
  requestId: string;
  operation: string;
  disputeId: string;
  status: HallOfFameDisputeStatus;
  version: number;
  replayed: boolean;
  changed?: boolean;
};

export type HallOfFameNoActionInput = {
  disputeId: string;
  expectedVersion: number;
  resolutionOutcome: HallOfFameResolutionOutcome;
  resolutionMessage: string;
  internalNote: string;
};

export type HallOfFameCorrectionInput = {
  disputeId: string;
  expectedDisputeVersion: number;
  canonicalRecordId: string;
  expectedRecordVersion: number;
  recordTypeCode: "hole_in_one" | "albatross" | "condor";
  playedOn: string;
  courseName: string;
  courseRegion: string;
  courseEnvironment: "outdoor" | "screen";
  courseLayout?: string;
  courseSegment: string;
  holeNumber: number;
  holePar?: number;
  strokes?: number;
  nominatingClubId?: string;
  correctionReasonCode:
    | "factual_error"
    | "wrong_record_type"
    | "administrative_error"
    | "evidence_clarification";
  correctionReason: string;
  resolutionMessage: string;
  internalNote: string;
};

export type HallOfFameRevokeInput = {
  disputeId: string;
  expectedDisputeVersion: number;
  canonicalRecordId: string;
  expectedRecordVersion: number;
  revocationReasonCode:
    | "factual_error"
    | "insufficient_or_invalid_evidence"
    | "duplicate_record"
    | "wrong_subject"
    | "wrong_record_type"
    | "administrative_error"
    | "fraud_confirmed";
  revocationReason: string;
  resolutionMessage: string;
  internalNote: string;
};

export type HallOfFameOperatorErrorKind =
  | "authentication"
  | "validation"
  | "forbidden"
  | "conflict"
  | "notFound"
  | "network"
  | "malformedResponse"
  | "unknown";

export class HallOfFameOperatorError extends Error {
  readonly kind: HallOfFameOperatorErrorKind;
  readonly userMessage: string;
  readonly shouldRefresh: boolean;

  constructor(
    kind: HallOfFameOperatorErrorKind,
    userMessage: string,
    shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "HallOfFameOperatorError";
    this.kind = kind;
    this.userMessage = userMessage;
    this.shouldRefresh = shouldRefresh;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const disputeTypes = new Set<HallOfFameDisputeType>([
  "correction_request",
  "decision_appeal",
  "subject_objection",
  "fraud_report",
]);
const disputeStatuses = new Set<HallOfFameDisputeStatus>([
  "open",
  "under_review",
  "resolved",
  "withdrawn",
]);
const targetKinds = new Set(["application_record", "canonical_record"]);
const categories = new Set<HallOfFameDisputeCategory>([
  "factual_error",
  "wrong_record_type",
  "administrative_error",
  "evidence_clarification",
  "decision_error",
  "overlooked_evidence",
  "procedural_error",
  "other",
  "wrong_subject",
  "false_record",
  "invalid_evidence",
  "duplicate",
  "impersonation",
]);
const outcomes = new Set<HallOfFameResolutionOutcome>([
  "correction_applied",
  "correction_denied",
  "appeal_denied",
  "re_review_recommended",
  "objection_upheld_correction_applied",
  "objection_upheld_revoke_applied",
  "objection_not_upheld",
  "fraud_substantiated_correction_applied",
  "fraud_substantiated_revoke_applied",
  "fraud_not_substantiated",
  "already_remediated",
]);

const queueKeys = [
  "dispute_id",
  "dispute_type",
  "category",
  "status",
  "version",
  "statement",
  "target_kind",
  "application_record_id",
  "canonical_record_id",
  "submitted_by_user_id",
  "subject_user_id",
  "created_at",
  "updated_at",
  "review_started_at",
  "resolution_outcome",
  "resolved_at",
] as const;
const detailKeys = [
  "dispute_id",
  "dispute_type",
  "category",
  "status",
  "version",
  "statement",
  "target_kind",
  "application_record_id",
  "canonical_record_id",
  "submitted_by_user_id",
  "subject_user_id",
  "created_at",
  "updated_at",
  "review_started_at",
  "review_started_by_user_id",
  "resolution_outcome",
  "resolution_message",
  "resolution_canonical_record_id",
  "resolved_at",
] as const;
const noteKeys = ["review_id", "review_kind", "note", "actor_user_id", "created_at"] as const;
const contextKeys = [
  "dispute_id",
  "dispute_type",
  "dispute_version",
  "canonical_record_id",
  "canonical_record_version",
  "record_type_code",
  "played_on",
  "course_name_snapshot",
  "course_region_snapshot",
  "course_environment",
  "course_layout_snapshot",
  "course_segment_snapshot",
  "hole_number",
  "hole_par",
  "strokes",
  "nominating_club_id",
] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidResponse(): HallOfFameOperatorError {
  return new HallOfFameOperatorError(
    "malformedResponse",
    "운영 처리 결과를 안전하게 확인할 수 없습니다. 화면을 새로고침해 주세요.",
    true,
  );
}

function rowsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(isPlainRecord)) throw invalidResponse();
  return value;
}

function exact(row: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw invalidResponse();
  }
}

function stringValue(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) throw invalidResponse();
  return value;
}

function nullableString(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  if (value === null) return undefined;
  if (typeof value !== "string" || value.length === 0) throw invalidResponse();
  return value;
}

function uuidValue(row: Record<string, unknown>, key: string): string {
  const value = stringValue(row, key);
  if (!UUID_PATTERN.test(value)) throw invalidResponse();
  return value;
}

function nullableUuid(row: Record<string, unknown>, key: string): string | undefined {
  const value = nullableString(row, key);
  if (value !== undefined && !UUID_PATTERN.test(value)) throw invalidResponse();
  return value;
}

function integerValue(row: Record<string, unknown>, key: string, minimum = 0): number {
  const value = row[key];
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw invalidResponse();
  return value as number;
}

function nullableInteger(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  if (value === null) return undefined;
  if (!Number.isSafeInteger(value)) throw invalidResponse();
  return value as number;
}

function timestampValue(row: Record<string, unknown>, key: string): string {
  const value = stringValue(row, key);
  if (Number.isNaN(Date.parse(value))) throw invalidResponse();
  return value;
}

function nullableTimestamp(row: Record<string, unknown>, key: string): string | undefined {
  const value = nullableString(row, key);
  if (value !== undefined && Number.isNaN(Date.parse(value))) throw invalidResponse();
  return value;
}

function enumValue<T extends string>(
  row: Record<string, unknown>,
  key: string,
  values: ReadonlySet<T>,
): T {
  const value = stringValue(row, key);
  if (!values.has(value as T)) throw invalidResponse();
  return value as T;
}

function nullableEnum<T extends string>(
  row: Record<string, unknown>,
  key: string,
  values: ReadonlySet<T>,
): T | undefined {
  const value = nullableString(row, key);
  if (value !== undefined && !values.has(value as T)) throw invalidResponse();
  return value as T | undefined;
}

function parseBaseRow(row: Record<string, unknown>): HallOfFameDisputeQueueItem {
  const targetKind = enumValue(row, "target_kind", targetKinds) as
    | "application_record"
    | "canonical_record";
  const applicationRecordId = nullableUuid(row, "application_record_id");
  const canonicalRecordId = nullableUuid(row, "canonical_record_id");
  uuidValue(row, "submitted_by_user_id");
  uuidValue(row, "subject_user_id");
  if (
    (targetKind === "application_record" && (!applicationRecordId || canonicalRecordId)) ||
    (targetKind === "canonical_record" && (!canonicalRecordId || applicationRecordId))
  ) {
    throw invalidResponse();
  }
  return {
    disputeId: uuidValue(row, "dispute_id"),
    disputeType: enumValue(row, "dispute_type", disputeTypes),
    category: enumValue(row, "category", categories),
    status: enumValue(row, "status", disputeStatuses),
    version: integerValue(row, "version", 1),
    statement: stringValue(row, "statement"),
    targetKind,
    createdAt: timestampValue(row, "created_at"),
    updatedAt: timestampValue(row, "updated_at"),
    reviewStartedAt: nullableTimestamp(row, "review_started_at"),
    resolutionOutcome: nullableEnum(row, "resolution_outcome", outcomes),
    resolvedAt: nullableTimestamp(row, "resolved_at"),
  };
}

export function parseHallOfFameDisputeReviewQueue(data: unknown) {
  return rowsOf(data).map((row) => {
    exact(row, queueKeys);
    return parseBaseRow(row);
  });
}

export function parseHallOfFameDisputeReviewDetail(data: unknown) {
  const rows = rowsOf(data);
  if (rows.length !== 1) throw invalidResponse();
  const row = rows[0];
  exact(row, detailKeys);
  nullableUuid(row, "review_started_by_user_id");
  nullableUuid(row, "resolution_canonical_record_id");
  return {
    ...parseBaseRow(row),
    resolutionMessage: nullableString(row, "resolution_message"),
  } satisfies HallOfFameDisputeReviewDetail;
}

export function parseHallOfFameDisputeInternalNotes(data: unknown) {
  return rowsOf(data).map((row) => {
    exact(row, noteKeys);
    uuidValue(row, "actor_user_id");
    return {
      reviewId: uuidValue(row, "review_id"),
      reviewKind: stringValue(row, "review_kind"),
      note: stringValue(row, "note"),
      createdAt: timestampValue(row, "created_at"),
    } satisfies HallOfFameDisputeInternalNote;
  });
}

export function parseHallOfFameDisputeResolutionContext(data: unknown) {
  const rows = rowsOf(data);
  if (rows.length !== 1) throw invalidResponse();
  const row = rows[0];
  exact(row, contextKeys);
  const disputeType = enumValue(row, "dispute_type", disputeTypes);
  if (disputeType === "decision_appeal") throw invalidResponse();
  const playedOn = stringValue(row, "played_on");
  if (!DATE_PATTERN.test(playedOn)) throw invalidResponse();
  const recordTypeCode = enumValue(
    row,
    "record_type_code",
    new Set<"hole_in_one" | "albatross" | "condor">([
      "hole_in_one",
      "albatross",
      "condor",
    ]),
  );
  const courseEnvironment = enumValue(
    row,
    "course_environment",
    new Set<"outdoor" | "screen">(["outdoor", "screen"]),
  );
  return {
    disputeId: uuidValue(row, "dispute_id"),
    disputeType,
    disputeVersion: integerValue(row, "dispute_version", 1),
    canonicalRecordId: uuidValue(row, "canonical_record_id"),
    canonicalRecordVersion: integerValue(row, "canonical_record_version", 1),
    recordTypeCode,
    playedOn,
    courseName: stringValue(row, "course_name_snapshot"),
    courseRegion: stringValue(row, "course_region_snapshot"),
    courseEnvironment,
    courseLayout: nullableString(row, "course_layout_snapshot"),
    courseSegment: stringValue(row, "course_segment_snapshot"),
    holeNumber: integerValue(row, "hole_number", 1),
    holePar: nullableInteger(row, "hole_par"),
    strokes: nullableInteger(row, "strokes"),
    nominatingClubId: nullableUuid(row, "nominating_club_id"),
  } satisfies HallOfFameDisputeResolutionContext;
}

function parseMutationResult(
  data: unknown,
  expected: { requestId: string; disputeId: string; operation: string },
): HallOfFameOperatorActionResult {
  const rows = rowsOf(data);
  if (rows.length !== 1) throw invalidResponse();
  const row = rows[0];
  const resultKeysByOperation: Readonly<Record<string, readonly string[]>> = {
    "hall_of_fame.dispute.review.start": [
      "request_id",
      "operation",
      "dispute_id",
      "status",
      "version",
      "review_started_at",
      "changed",
      "replayed",
    ],
    "hall_of_fame.dispute.review.note": [
      "request_id",
      "operation",
      "dispute_id",
      "status",
      "version",
      "review_id",
      "created_at",
      "replayed",
    ],
    "hall_of_fame.dispute.resolve": [
      "request_id",
      "operation",
      "dispute_id",
      "status",
      "version",
      "resolution_outcome",
      "resolved_at",
      "changed",
      "replayed",
    ],
    "hall_of_fame.dispute.resolve.correction": [
      "request_id",
      "operation",
      "dispute_id",
      "status",
      "version",
      "resolution_outcome",
      "canonical_record_id",
      "resolved_at",
      "changed",
      "replayed",
    ],
    "hall_of_fame.dispute.resolve.revoke": [
      "request_id",
      "operation",
      "dispute_id",
      "status",
      "version",
      "resolution_outcome",
      "canonical_record_id",
      "resolved_at",
      "changed",
      "replayed",
    ],
  };
  const resultKeys = resultKeysByOperation[expected.operation];
  if (!resultKeys) throw invalidResponse();
  exact(row, resultKeys);
  const requestId = uuidValue(row, "request_id");
  const disputeId = uuidValue(row, "dispute_id");
  const operation = stringValue(row, "operation");
  const replayed = row.replayed;
  const changed = row.changed;
  if (
    requestId !== expected.requestId ||
    disputeId !== expected.disputeId ||
    operation !== expected.operation ||
    typeof replayed !== "boolean" ||
    (changed !== undefined && typeof changed !== "boolean")
  ) {
    throw invalidResponse();
  }
  if (expected.operation === "hall_of_fame.dispute.review.start") {
    timestampValue(row, "review_started_at");
  } else if (expected.operation === "hall_of_fame.dispute.review.note") {
    uuidValue(row, "review_id");
    timestampValue(row, "created_at");
  } else {
    enumValue(row, "resolution_outcome", outcomes);
    timestampValue(row, "resolved_at");
    if (expected.operation !== "hall_of_fame.dispute.resolve") {
      uuidValue(row, "canonical_record_id");
    }
  }
  return {
    requestId,
    operation,
    disputeId,
    status: enumValue(row, "status", disputeStatuses),
    version: integerValue(row, "version", 1),
    replayed,
    changed: changed as boolean | undefined,
  };
}

const knownErrors: ReadonlyArray<{
  code: string;
  kind: HallOfFameOperatorErrorKind;
  message: string;
  refresh?: boolean;
}> = [
  {
    code: "HOF_STALE_DISPUTE_VERSION",
    kind: "conflict",
    message: "다른 운영자가 먼저 처리했습니다. 최신 내용을 다시 불러왔습니다.",
    refresh: true,
  },
  {
    code: "HOF_STALE_RECORD_VERSION",
    kind: "conflict",
    message: "기록 정보가 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.",
    refresh: true,
  },
  {
    code: "HOF_DISPUTE_RESOLUTION_CONTEXT_UNAVAILABLE",
    kind: "conflict",
    message: "현재 기록 상태에서는 이 처리를 계속할 수 없습니다. 최신 내용을 다시 확인해 주세요.",
    refresh: true,
  },
  {
    code: "HOF_DISPUTE_REVIEW_CONFLICT_OF_INTEREST",
    kind: "forbidden",
    message: "이 요청은 이해관계 충돌 방침에 따라 직접 처리할 수 없습니다.",
  },
  {
    code: "HOF_REVIEW_NOT_AUTHORIZED",
    kind: "forbidden",
    message: "이 작업에 필요한 운영 권한이 없습니다.",
    refresh: true,
  },
  {
    code: "HOF_AUTHENTICATION_REQUIRED",
    kind: "authentication",
    message: "로그인 상태를 다시 확인해 주세요.",
    refresh: true,
  },
  {
    code: "HOF_DISPUTE_NOT_FOUND",
    kind: "notFound",
    message: "요청을 찾을 수 없습니다. 목록을 새로고침해 주세요.",
    refresh: true,
  },
  {
    code: "HOF_DISPUTE_",
    kind: "validation",
    message: "현재 상태와 입력 내용을 다시 확인해 주세요.",
  },
  {
    code: "ACCOUNT_NOT_ACTIVE",
    kind: "authentication",
    message: "활성 계정으로 다시 로그인해 주세요.",
    refresh: true,
  },
];

export function toHallOfFameOperatorError(error: unknown): HallOfFameOperatorError {
  if (error instanceof HallOfFameOperatorError) return error;
  const message = isPlainRecord(error) && typeof error.message === "string" ? error.message : "";
  const known = knownErrors.find(({ code }) => message.includes(code));
  if (known) {
    return new HallOfFameOperatorError(
      known.kind,
      known.message,
      known.refresh ?? false,
    );
  }
  if (
    error instanceof TypeError ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("fetch failed")
  ) {
    return new HallOfFameOperatorError(
      "network",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  }
  return new HallOfFameOperatorError(
    "unknown",
    "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

async function runRpc(
  supabase: SupabaseClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  try {
    const { data, error } = await supabase.rpc(name, parameters);
    if (error) throw error;
    return data as unknown;
  } catch (error) {
    throw toHallOfFameOperatorError(error);
  }
}

export async function listHallOfFameDisputeReviewQueue(
  supabase: SupabaseClient,
  status: HallOfFameDisputeStatus | null,
  disputeType: HallOfFameDisputeType | null,
  limit = 50,
  offset = 0,
) {
  return parseHallOfFameDisputeReviewQueue(
    await runRpc(supabase, "list_hall_of_fame_dispute_review_queue", {
      p_status: status,
      p_dispute_type: disputeType,
      p_limit: limit,
      p_offset: offset,
    }),
  );
}

export async function getHallOfFameDisputeForReview(
  supabase: SupabaseClient,
  disputeId: string,
) {
  return parseHallOfFameDisputeReviewDetail(
    await runRpc(supabase, "get_hall_of_fame_dispute_for_review", {
      p_dispute_id: disputeId,
    }),
  );
}

export async function listHallOfFameDisputeInternalNotes(
  supabase: SupabaseClient,
  disputeId: string,
) {
  return parseHallOfFameDisputeInternalNotes(
    await runRpc(supabase, "list_hall_of_fame_dispute_internal_notes", {
      p_dispute_id: disputeId,
      p_limit: 100,
      p_offset: 0,
    }),
  );
}

export async function getHallOfFameDisputeResolutionContext(
  supabase: SupabaseClient,
  disputeId: string,
) {
  return parseHallOfFameDisputeResolutionContext(
    await runRpc(supabase, "get_hall_of_fame_dispute_resolution_context", {
      p_dispute_id: disputeId,
    }),
  );
}

export async function startHallOfFameDisputeReview(
  supabase: SupabaseClient,
  disputeId: string,
  expectedVersion: number,
  requestId: string,
) {
  return parseMutationResult(
    await runRpc(supabase, "start_hall_of_fame_dispute_review", {
      p_dispute_id: disputeId,
      p_expected_version: expectedVersion,
      p_request_id: requestId,
    }),
    {
      requestId,
      disputeId,
      operation: "hall_of_fame.dispute.review.start",
    },
  );
}

export async function addHallOfFameDisputeInternalNote(
  supabase: SupabaseClient,
  disputeId: string,
  expectedVersion: number,
  note: string,
  requestId: string,
) {
  return parseMutationResult(
    await runRpc(supabase, "add_hall_of_fame_dispute_internal_note", {
      p_dispute_id: disputeId,
      p_expected_version: expectedVersion,
      p_note: note,
      p_request_id: requestId,
    }),
    {
      requestId,
      disputeId,
      operation: "hall_of_fame.dispute.review.note",
    },
  );
}

export async function resolveHallOfFameDispute(
  supabase: SupabaseClient,
  input: HallOfFameNoActionInput,
  requestId: string,
) {
  return parseMutationResult(
    await runRpc(supabase, "resolve_hall_of_fame_dispute", {
      p_dispute_id: input.disputeId,
      p_expected_version: input.expectedVersion,
      p_resolution_outcome: input.resolutionOutcome,
      p_resolution_message: input.resolutionMessage,
      p_internal_note: input.internalNote,
      p_request_id: requestId,
    }),
    { requestId, disputeId: input.disputeId, operation: "hall_of_fame.dispute.resolve" },
  );
}

export async function resolveHallOfFameDisputeWithCorrection(
  supabase: SupabaseClient,
  input: HallOfFameCorrectionInput,
  requestId: string,
) {
  return parseMutationResult(
    await runRpc(supabase, "resolve_hall_of_fame_dispute_with_correction", {
      p_dispute_id: input.disputeId,
      p_expected_dispute_version: input.expectedDisputeVersion,
      p_record_id: input.canonicalRecordId,
      p_expected_record_version: input.expectedRecordVersion,
      p_record_type_code: input.recordTypeCode,
      p_played_on: input.playedOn,
      p_course_name_snapshot: input.courseName,
      p_course_region_snapshot: input.courseRegion,
      p_course_environment: input.courseEnvironment,
      p_course_layout_snapshot: input.courseLayout ?? null,
      p_course_segment_snapshot: input.courseSegment,
      p_hole_number: input.holeNumber,
      p_hole_par: input.holePar ?? null,
      p_strokes: input.strokes ?? null,
      p_nominating_club_id: input.nominatingClubId ?? null,
      p_correction_reason_code: input.correctionReasonCode,
      p_correction_reason: input.correctionReason,
      p_resolution_message: input.resolutionMessage,
      p_internal_note: input.internalNote,
      p_request_id: requestId,
    }),
    {
      requestId,
      disputeId: input.disputeId,
      operation: "hall_of_fame.dispute.resolve.correction",
    },
  );
}

export async function resolveHallOfFameDisputeWithRevoke(
  supabase: SupabaseClient,
  input: HallOfFameRevokeInput,
  requestId: string,
) {
  return parseMutationResult(
    await runRpc(supabase, "resolve_hall_of_fame_dispute_with_revoke", {
      p_dispute_id: input.disputeId,
      p_expected_dispute_version: input.expectedDisputeVersion,
      p_record_id: input.canonicalRecordId,
      p_expected_record_version: input.expectedRecordVersion,
      p_revocation_reason_code: input.revocationReasonCode,
      p_revocation_reason: input.revocationReason,
      p_resolution_message: input.resolutionMessage,
      p_internal_note: input.internalNote,
      p_request_id: requestId,
    }),
    {
      requestId,
      disputeId: input.disputeId,
      operation: "hall_of_fame.dispute.resolve.revoke",
    },
  );
}

export const HALL_OF_FAME_OPERATOR_STATUS_LABELS: Readonly<
  Record<HallOfFameDisputeStatus, string>
> = {
  open: "접수됨",
  under_review: "검토 중",
  resolved: "처리 완료",
  withdrawn: "회원 취소",
};

export const HALL_OF_FAME_OPERATOR_OUTCOME_LABELS: Readonly<
  Record<HallOfFameResolutionOutcome, string>
> = {
  correction_applied: "정정 반영",
  correction_denied: "정정 요청 반려",
  appeal_denied: "이의 신청 반려",
  re_review_recommended: "재심사 권고",
  objection_upheld_correction_applied: "이의 인정·정정",
  objection_upheld_revoke_applied: "이의 인정·기록 무효화",
  objection_not_upheld: "이의 불인정",
  fraud_substantiated_correction_applied: "신고 인정·정정",
  fraud_substantiated_revoke_applied: "신고 인정·기록 무효화",
  fraud_not_substantiated: "신고 불인정",
  already_remediated: "이미 조치됨",
};

export const HALL_OF_FAME_NO_ACTION_OUTCOMES: Readonly<
  Record<HallOfFameDisputeType, readonly HallOfFameResolutionOutcome[]>
> = {
  correction_request: ["correction_denied", "already_remediated"],
  decision_appeal: ["appeal_denied", "re_review_recommended", "already_remediated"],
  subject_objection: ["objection_not_upheld", "already_remediated"],
  fraud_report: ["fraud_not_substantiated", "already_remediated"],
};
