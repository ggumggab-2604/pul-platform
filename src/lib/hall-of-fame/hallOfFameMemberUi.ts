import type { SupabaseClient } from "@supabase/supabase-js";

export type HallOfFameDisputeType =
  | "correction_request"
  | "decision_appeal"
  | "subject_objection"
  | "fraud_report";

export type HallOfFameDisputeCategory =
  | "factual_error"
  | "wrong_record_type"
  | "administrative_error"
  | "evidence_clarification"
  | "decision_error"
  | "overlooked_evidence"
  | "procedural_error"
  | "other"
  | "wrong_subject"
  | "false_record"
  | "invalid_evidence"
  | "duplicate"
  | "impersonation";

export type HallOfFameApplicationType =
  | "club_nomination"
  | "direct_application"
  | "club_admin_vacancy_direct_application";

export type HallOfFameBatchStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "additional_info_required"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "withdrawn"
  | "cancelled";

export type HallOfFameApplicationRecordStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "additional_info_required"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "cancelled";

export type HallOfFameValidityStatus =
  | "active"
  | "provisional"
  | "corrected"
  | "revoked";

export type HallOfFamePublicationStatus =
  | "hidden"
  | "published"
  | "suppressed";

export type HallOfFameDisputeStatus =
  | "open"
  | "under_review"
  | "resolved"
  | "withdrawn";

export type HallOfFameResolutionOutcome =
  | "correction_applied"
  | "correction_denied"
  | "appeal_denied"
  | "re_review_recommended"
  | "objection_upheld_correction_applied"
  | "objection_upheld_revoke_applied"
  | "objection_not_upheld"
  | "fraud_substantiated_correction_applied"
  | "fraud_substantiated_revoke_applied"
  | "fraud_not_substantiated"
  | "already_remediated";

export type HallOfFamePublicBadge = {
  code: string;
  name: string;
  sourceCount: number;
};

export type HallOfFameMemberBadge = {
  code: string;
  name: string;
  status: "active" | "inactive";
};

export type HallOfFamePublicRecord = {
  recordTypeCode: string;
  recordTypeName: string;
  playedOn?: string;
  courseName?: string;
  courseRegion?: string;
  courseEnvironment?: string;
  courseLayout?: string;
  courseSegment?: string;
  holeNumber?: number;
  holePar?: number;
  strokes?: number;
  displayName?: string;
  avatarUrl?: string;
  clubName?: string;
  badges: HallOfFamePublicBadge[];
  approvedAt: string;
  publishedAt?: string;
};

export type MyHallOfFameApplication = {
  applicationRecordId: string;
  applicationType: HallOfFameApplicationType;
  batchStatus: HallOfFameBatchStatus;
  recordStatus: HallOfFameApplicationRecordStatus;
  recordTypeCode: string;
  recordTypeName: string;
  playedOn: string;
  courseName: string;
  courseRegion: string;
  courseEnvironment: string;
  courseLayout?: string;
  courseSegment: string;
  holeNumber: number;
  holePar?: number;
  strokes?: number;
  clubName?: string;
  createdAt: string;
  submittedAt?: string;
  finalizedAt?: string;
  isSubmitter: boolean;
  isSubject: boolean;
  allowedDisputeTypes: HallOfFameDisputeType[];
  canSubmitDispute: boolean;
};

export type MyHallOfFameRecord = {
  canonicalRecordId: string;
  recordTypeCode: string;
  recordTypeName: string;
  validityStatus: HallOfFameValidityStatus;
  publicationStatus: HallOfFamePublicationStatus;
  playedOn: string;
  courseName: string;
  courseRegion: string;
  courseEnvironment: string;
  courseLayout?: string;
  courseSegment: string;
  holeNumber: number;
  holePar?: number;
  strokes?: number;
  clubName?: string;
  approvedAt: string;
  publishedAt?: string;
  isSubmitter: boolean;
  isSubject: boolean;
  badges: HallOfFameMemberBadge[];
  allowedDisputeTypes: HallOfFameDisputeType[];
  canSubmitDispute: boolean;
};

export type MyHallOfFameDispute = {
  disputeId: string;
  disputeType: HallOfFameDisputeType;
  category: HallOfFameDisputeCategory;
  targetKind: "application_record" | "canonical_record";
  statement: string;
  status: HallOfFameDisputeStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  withdrawnAt?: string;
  resolutionOutcome?: HallOfFameResolutionOutcome;
  resolutionMessage?: string;
  resolvedAt?: string;
};

export type HallOfFameDisputeMutationResult = {
  requestId: string;
  operation: "hall_of_fame.dispute.submit" | "hall_of_fame.dispute.withdraw";
  disputeId: string;
  disputeType: HallOfFameDisputeType;
  status: HallOfFameDisputeStatus;
  version: number;
  changed: boolean;
  replayed: boolean;
};

export type HallOfFamePrivateIdentityState = {
  showPrivate: boolean;
  refreshRequired: boolean;
};

export function getHallOfFamePrivateIdentityState(
  serverUserId: string | undefined,
  browserUserId: string | null | undefined,
): HallOfFamePrivateIdentityState {
  if (browserUserId === undefined) {
    return { showPrivate: false, refreshRequired: false };
  }

  const normalizedServerUserId = serverUserId ?? null;
  return {
    showPrivate:
      normalizedServerUserId !== null &&
      normalizedServerUserId === browserUserId,
    refreshRequired: normalizedServerUserId !== browserUserId,
  };
}

export type HallOfFameDisputeSubmitInput = {
  disputeType: HallOfFameDisputeType;
  category: HallOfFameDisputeCategory;
  targetKind: "application_record" | "canonical_record";
  targetId: string;
  statement: string;
};

export type HallOfFameDisputeWithdrawInput = {
  disputeId: string;
  expectedVersion: number;
};

export type HallOfFameMemberUiErrorKind =
  | "authentication"
  | "account"
  | "validation"
  | "forbidden"
  | "conflict"
  | "notFound"
  | "network"
  | "malformedResponse"
  | "unknown";

export class HallOfFameMemberUiError extends Error {
  readonly kind: HallOfFameMemberUiErrorKind;
  readonly userMessage: string;
  readonly shouldRefresh: boolean;

  constructor(
    kind: HallOfFameMemberUiErrorKind,
    userMessage: string,
    shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "HallOfFameMemberUiError";
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
const applicationTypes = new Set<HallOfFameApplicationType>([
  "club_nomination",
  "direct_application",
  "club_admin_vacancy_direct_application",
]);
const batchStatuses = new Set<HallOfFameBatchStatus>([
  "draft",
  "submitted",
  "under_review",
  "additional_info_required",
  "approved",
  "partially_approved",
  "rejected",
  "withdrawn",
  "cancelled",
]);
const applicationRecordStatuses = new Set<HallOfFameApplicationRecordStatus>([
  "draft",
  "submitted",
  "under_review",
  "additional_info_required",
  "approved",
  "rejected",
  "withdrawn",
  "cancelled",
]);
const validityStatuses = new Set<HallOfFameValidityStatus>([
  "active",
  "provisional",
  "corrected",
  "revoked",
]);
const publicationStatuses = new Set<HallOfFamePublicationStatus>([
  "hidden",
  "published",
  "suppressed",
]);
const disputeStatuses = new Set<HallOfFameDisputeStatus>([
  "open",
  "under_review",
  "resolved",
  "withdrawn",
]);
const resolutionOutcomesByDisputeType: Readonly<
  Record<HallOfFameDisputeType, ReadonlySet<HallOfFameResolutionOutcome>>
> = {
  correction_request: new Set([
    "correction_applied",
    "correction_denied",
    "already_remediated",
  ]),
  decision_appeal: new Set([
    "appeal_denied",
    "re_review_recommended",
    "already_remediated",
  ]),
  subject_objection: new Set([
    "objection_upheld_correction_applied",
    "objection_upheld_revoke_applied",
    "objection_not_upheld",
    "already_remediated",
  ]),
  fraud_report: new Set([
    "fraud_substantiated_correction_applied",
    "fraud_substantiated_revoke_applied",
    "fraud_not_substantiated",
    "already_remediated",
  ]),
};

export const HALL_OF_FAME_DISPUTE_CATEGORY_OPTIONS: Readonly<
  Record<
    HallOfFameDisputeType,
    ReadonlyArray<{ value: HallOfFameDisputeCategory; label: string }>
  >
> = {
  correction_request: [
    { value: "factual_error", label: "기록 내용이 사실과 다름" },
    { value: "wrong_record_type", label: "기록 종류가 잘못됨" },
    { value: "administrative_error", label: "등록 과정의 오류" },
    { value: "evidence_clarification", label: "확인 자료에 대한 설명" },
  ],
  decision_appeal: [
    { value: "decision_error", label: "처리 결과에 오류가 있음" },
    { value: "overlooked_evidence", label: "확인되지 않은 자료가 있음" },
    { value: "procedural_error", label: "처리 절차에 문제가 있음" },
    { value: "other", label: "그 밖의 사유" },
  ],
  subject_objection: [
    { value: "wrong_subject", label: "기록 대상자가 잘못됨" },
    { value: "factual_error", label: "기록 내용이 사실과 다름" },
    { value: "other", label: "그 밖의 사유" },
  ],
  fraud_report: [
    { value: "false_record", label: "사실과 다른 기록" },
    { value: "invalid_evidence", label: "유효하지 않은 확인 자료" },
    { value: "duplicate", label: "중복된 기록" },
    { value: "wrong_subject", label: "기록 대상자가 잘못됨" },
    { value: "wrong_record_type", label: "기록 종류가 잘못됨" },
    { value: "impersonation", label: "다른 사람을 사칭한 기록" },
    { value: "other", label: "그 밖의 사유" },
  ],
};

const knownErrors: ReadonlyArray<{
  code: string;
  kind: HallOfFameMemberUiErrorKind;
  message: string;
  refresh?: boolean;
}> = [
  {
    code: "HOF_AUTHENTICATION_REQUIRED",
    kind: "authentication",
    message: "로그인 상태를 다시 확인해 주세요.",
    refresh: true,
  },
  {
    code: "HOF_ACCOUNT_NOT_ACTIVE",
    kind: "account",
    message: "현재 계정 상태에서는 이 기능을 이용할 수 없습니다.",
  },
  {
    code: "HOF_INVALID_DISPUTE_REQUEST",
    kind: "validation",
    message: "요청 종류와 내용을 다시 확인해 주세요.",
  },
  {
    code: "HOF_INVALID_DISPUTE_WITHDRAWAL_REQUEST",
    kind: "validation",
    message: "취소할 요청 정보를 다시 확인해 주세요.",
  },
  {
    code: "HOF_DISPUTE_CATEGORY_INVALID",
    kind: "validation",
    message: "선택한 요청 사유를 다시 확인해 주세요.",
  },
  {
    code: "HOF_DISPUTE_SUBMITTER_NOT_ELIGIBLE",
    kind: "forbidden",
    message: "현재 회원은 이 요청을 제출할 수 없습니다.",
    refresh: true,
  },
  {
    code: "HOF_DISPUTE_TARGET_INVALID",
    kind: "conflict",
    message: "기록 상태가 변경되었습니다. 최신 정보를 다시 확인해 주세요.",
    refresh: true,
  },
  {
    code: "HOF_OPEN_DISPUTE_ALREADY_EXISTS",
    kind: "conflict",
    message: "같은 기록에 이미 처리 중인 요청이 있습니다.",
    refresh: true,
  },
  {
    code: "HOF_STALE_DISPUTE_VERSION",
    kind: "conflict",
    message: "요청 상태가 변경되었습니다. 최신 정보를 다시 확인해 주세요.",
    refresh: true,
  },
  {
    code: "HOF_DISPUTE_TERMINAL_STATE",
    kind: "conflict",
    message: "이미 처리가 끝난 요청은 취소할 수 없습니다.",
    refresh: true,
  },
  {
    code: "HOF_DISPUTE_STATE_INVALID",
    kind: "conflict",
    message: "현재 상태에서는 요청을 취소할 수 없습니다.",
    refresh: true,
  },
  {
    code: "HOF_DISPUTE_NOT_FOUND",
    kind: "notFound",
    message: "요청을 찾을 수 없습니다.",
    refresh: true,
  },
  {
    code: "HOF_INVALID_PAGINATION",
    kind: "validation",
    message: "목록 요청을 처리할 수 없습니다.",
  },
  {
    code: "HOF_INVALID_PUBLIC_LIST_REQUEST",
    kind: "validation",
    message: "공개 기록 목록을 불러올 수 없습니다.",
  },
  {
    code: "IDEMPOTENCY_KEY_REUSED",
    kind: "conflict",
    message: "이 요청은 이전 요청과 일치하지 않습니다. 다시 시도해 주세요.",
  },
];

function invalidResponse(): HallOfFameMemberUiError {
  return new HallOfFameMemberUiError(
    "malformedResponse",
    "명예의 전당 정보를 안전하게 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(row: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw invalidResponse();
  }
}

function rowsOf(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data) || !data.every(isPlainRecord)) {
    throw invalidResponse();
  }
  return data;
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) throw invalidResponse();
  return value;
}

function nullableString(
  row: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = row[key];
  if (value === null) return undefined;
  if (typeof value !== "string" || value.length === 0) throw invalidResponse();
  return value;
}

function uuid(row: Record<string, unknown>, key: string): string {
  const value = requiredString(row, key);
  if (!UUID_PATTERN.test(value)) throw invalidResponse();
  return value;
}

function booleanValue(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") throw invalidResponse();
  return value;
}

function integer(
  row: Record<string, unknown>,
  key: string,
  minimum = 0,
): number {
  const value = row[key];
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw invalidResponse();
  }
  return value as number;
}

function nullableInteger(
  row: Record<string, unknown>,
  key: string,
  minimum = 0,
): number | undefined {
  if (row[key] === null) return undefined;
  return integer(row, key, minimum);
}

function dateValue(row: Record<string, unknown>, key: string): string {
  const value = requiredString(row, key);
  if (!DATE_PATTERN.test(value)) throw invalidResponse();
  return value;
}

function nullableDate(row: Record<string, unknown>, key: string): string | undefined {
  if (row[key] === null) return undefined;
  return dateValue(row, key);
}

function timestamp(row: Record<string, unknown>, key: string): string {
  const value = requiredString(row, key);
  if (Number.isNaN(Date.parse(value))) throw invalidResponse();
  return value;
}

function nullableTimestamp(
  row: Record<string, unknown>,
  key: string,
): string | undefined {
  if (row[key] === null) return undefined;
  return timestamp(row, key);
}

function enumValue<T extends string>(
  row: Record<string, unknown>,
  key: string,
  values: ReadonlySet<T>,
): T {
  const value = row[key];
  if (typeof value !== "string" || !values.has(value as T)) {
    throw invalidResponse();
  }
  return value as T;
}

function disputeType(row: Record<string, unknown>, key: string) {
  return enumValue(row, key, disputeTypes);
}

function parseAllowedDisputeTypes(value: unknown): HallOfFameDisputeType[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) => typeof item === "string" && disputeTypes.has(item as HallOfFameDisputeType),
    ) ||
    new Set(value).size !== value.length
  ) {
    throw invalidResponse();
  }
  return value as HallOfFameDisputeType[];
}

function parsePublicBadges(value: unknown): HallOfFamePublicBadge[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map((item) => {
    if (!isPlainRecord(item)) throw invalidResponse();
    assertExactKeys(item, ["code", "name", "source_count"]);
    return {
      code: requiredString(item, "code"),
      name: requiredString(item, "name"),
      sourceCount: integer(item, "source_count", 1),
    };
  });
}

function parseMemberBadges(value: unknown): HallOfFameMemberBadge[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map((item) => {
    if (!isPlainRecord(item)) throw invalidResponse();
    assertExactKeys(item, ["code", "name", "status"]);
    const status = item.status;
    if (status !== "active" && status !== "inactive") throw invalidResponse();
    return {
      code: requiredString(item, "code"),
      name: requiredString(item, "name"),
      status,
    };
  });
}

const publicRecordKeys = [
  "record_type_code",
  "record_type_name",
  "played_on",
  "course_name",
  "course_region",
  "course_environment",
  "course_layout",
  "course_segment",
  "hole_number",
  "hole_par",
  "strokes",
  "display_name",
  "avatar_url",
  "club_name",
  "badges",
  "approved_at",
  "published_at",
] as const;

export function parseHallOfFamePublicRecords(data: unknown): HallOfFamePublicRecord[] {
  return rowsOf(data).map((row) => {
    assertExactKeys(row, publicRecordKeys);
    return {
      recordTypeCode: requiredString(row, "record_type_code"),
      recordTypeName: requiredString(row, "record_type_name"),
      playedOn: nullableDate(row, "played_on"),
      courseName: nullableString(row, "course_name"),
      courseRegion: nullableString(row, "course_region"),
      courseEnvironment: nullableString(row, "course_environment"),
      courseLayout: nullableString(row, "course_layout"),
      courseSegment: nullableString(row, "course_segment"),
      holeNumber: nullableInteger(row, "hole_number", 1),
      holePar: nullableInteger(row, "hole_par", 1),
      strokes: nullableInteger(row, "strokes", 1),
      displayName: nullableString(row, "display_name"),
      avatarUrl: nullableString(row, "avatar_url"),
      clubName: nullableString(row, "club_name"),
      badges: parsePublicBadges(row.badges),
      approvedAt: timestamp(row, "approved_at"),
      publishedAt: nullableTimestamp(row, "published_at"),
    };
  });
}

const applicationKeys = [
  "application_record_id",
  "application_type",
  "batch_status",
  "record_status",
  "record_type_code",
  "record_type_name",
  "played_on",
  "course_name",
  "course_region",
  "course_environment",
  "course_layout",
  "course_segment",
  "hole_number",
  "hole_par",
  "strokes",
  "club_name",
  "created_at",
  "submitted_at",
  "finalized_at",
  "is_submitter",
  "is_subject",
  "allowed_dispute_types",
  "can_submit_dispute",
] as const;

export function parseMyHallOfFameApplications(data: unknown): MyHallOfFameApplication[] {
  return rowsOf(data).map((row) => {
    assertExactKeys(row, applicationKeys);
    const allowedDisputeTypes = parseAllowedDisputeTypes(row.allowed_dispute_types);
    const canSubmitDispute = booleanValue(row, "can_submit_dispute");
    if (canSubmitDispute !== (allowedDisputeTypes.length > 0)) throw invalidResponse();
    return {
      applicationRecordId: uuid(row, "application_record_id"),
      applicationType: enumValue(row, "application_type", applicationTypes),
      batchStatus: enumValue(row, "batch_status", batchStatuses),
      recordStatus: enumValue(row, "record_status", applicationRecordStatuses),
      recordTypeCode: requiredString(row, "record_type_code"),
      recordTypeName: requiredString(row, "record_type_name"),
      playedOn: dateValue(row, "played_on"),
      courseName: requiredString(row, "course_name"),
      courseRegion: requiredString(row, "course_region"),
      courseEnvironment: requiredString(row, "course_environment"),
      courseLayout: nullableString(row, "course_layout"),
      courseSegment: requiredString(row, "course_segment"),
      holeNumber: integer(row, "hole_number", 1),
      holePar: nullableInteger(row, "hole_par", 1),
      strokes: nullableInteger(row, "strokes", 1),
      clubName: nullableString(row, "club_name"),
      createdAt: timestamp(row, "created_at"),
      submittedAt: nullableTimestamp(row, "submitted_at"),
      finalizedAt: nullableTimestamp(row, "finalized_at"),
      isSubmitter: booleanValue(row, "is_submitter"),
      isSubject: booleanValue(row, "is_subject"),
      allowedDisputeTypes,
      canSubmitDispute,
    };
  });
}

const memberRecordKeys = [
  "canonical_record_id",
  "record_type_code",
  "record_type_name",
  "validity_status",
  "publication_status",
  "played_on",
  "course_name",
  "course_region",
  "course_environment",
  "course_layout",
  "course_segment",
  "hole_number",
  "hole_par",
  "strokes",
  "club_name",
  "approved_at",
  "published_at",
  "is_submitter",
  "is_subject",
  "badges",
  "allowed_dispute_types",
  "can_submit_dispute",
] as const;

export function parseMyHallOfFameRecords(data: unknown): MyHallOfFameRecord[] {
  return rowsOf(data).map((row) => {
    assertExactKeys(row, memberRecordKeys);
    const allowedDisputeTypes = parseAllowedDisputeTypes(row.allowed_dispute_types);
    const canSubmitDispute = booleanValue(row, "can_submit_dispute");
    if (canSubmitDispute !== (allowedDisputeTypes.length > 0)) throw invalidResponse();
    return {
      canonicalRecordId: uuid(row, "canonical_record_id"),
      recordTypeCode: requiredString(row, "record_type_code"),
      recordTypeName: requiredString(row, "record_type_name"),
      validityStatus: enumValue(row, "validity_status", validityStatuses),
      publicationStatus: enumValue(row, "publication_status", publicationStatuses),
      playedOn: dateValue(row, "played_on"),
      courseName: requiredString(row, "course_name"),
      courseRegion: requiredString(row, "course_region"),
      courseEnvironment: requiredString(row, "course_environment"),
      courseLayout: nullableString(row, "course_layout"),
      courseSegment: requiredString(row, "course_segment"),
      holeNumber: integer(row, "hole_number", 1),
      holePar: nullableInteger(row, "hole_par", 1),
      strokes: nullableInteger(row, "strokes", 1),
      clubName: nullableString(row, "club_name"),
      approvedAt: timestamp(row, "approved_at"),
      publishedAt: nullableTimestamp(row, "published_at"),
      isSubmitter: booleanValue(row, "is_submitter"),
      isSubject: booleanValue(row, "is_subject"),
      badges: parseMemberBadges(row.badges),
      allowedDisputeTypes,
      canSubmitDispute,
    };
  });
}

const disputeKeys = [
  "dispute_id",
  "dispute_type",
  "category",
  "target_kind",
  "statement",
  "status",
  "version",
  "created_at",
  "updated_at",
  "withdrawn_at",
  "resolution_outcome",
  "resolution_message",
  "resolved_at",
] as const;

const allCategories = new Set<HallOfFameDisputeCategory>(
  Object.values(HALL_OF_FAME_DISPUTE_CATEGORY_OPTIONS)
    .flat()
    .map((option) => option.value),
);

function parseDispute(row: Record<string, unknown>): MyHallOfFameDispute {
  assertExactKeys(row, disputeKeys);
  const parsedDisputeType = disputeType(row, "dispute_type");
  const category = enumValue(row, "category", allCategories);
  if (
    !HALL_OF_FAME_DISPUTE_CATEGORY_OPTIONS[parsedDisputeType].some(
      (option) => option.value === category,
    )
  ) {
    throw invalidResponse();
  }
  const targetKind = row.target_kind;
  if (targetKind !== "application_record" && targetKind !== "canonical_record") {
    throw invalidResponse();
  }
  const status = enumValue(row, "status", disputeStatuses);
  const withdrawnAt = nullableTimestamp(row, "withdrawn_at");
  const rawResolutionOutcome = nullableString(row, "resolution_outcome");
  const resolutionOutcome = rawResolutionOutcome as
    | HallOfFameResolutionOutcome
    | undefined;
  const resolutionMessage = nullableString(row, "resolution_message");
  const resolvedAt = nullableTimestamp(row, "resolved_at");
  if (
    (resolutionOutcome !== undefined &&
      !resolutionOutcomesByDisputeType[parsedDisputeType].has(resolutionOutcome)) ||
    (status === "resolved" &&
      (resolutionOutcome === undefined ||
        resolutionMessage === undefined ||
        resolvedAt === undefined ||
        withdrawnAt !== undefined)) ||
    (status === "withdrawn" &&
      (withdrawnAt === undefined ||
        resolutionOutcome !== undefined ||
        resolutionMessage !== undefined ||
        resolvedAt !== undefined)) ||
    (["open", "under_review"].includes(status) &&
      (withdrawnAt !== undefined ||
        resolutionOutcome !== undefined ||
        resolutionMessage !== undefined ||
        resolvedAt !== undefined))
  ) {
    throw invalidResponse();
  }
  return {
    disputeId: uuid(row, "dispute_id"),
    disputeType: parsedDisputeType,
    category,
    targetKind,
    statement: requiredString(row, "statement"),
    status,
    version: integer(row, "version", 1),
    createdAt: timestamp(row, "created_at"),
    updatedAt: timestamp(row, "updated_at"),
    withdrawnAt,
    resolutionOutcome,
    resolutionMessage,
    resolvedAt,
  };
}

export function parseMyHallOfFameDisputes(data: unknown): MyHallOfFameDispute[] {
  return rowsOf(data).map(parseDispute);
}

export function parseMyHallOfFameDisputeDetail(
  data: unknown,
): MyHallOfFameDispute | null {
  const rows = rowsOf(data);
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw invalidResponse();
  return parseDispute(rows[0]);
}

const mutationKeys = [
  "request_id",
  "operation",
  "dispute_id",
  "dispute_type",
  "status",
  "version",
  "changed",
  "replayed",
] as const;

export function parseHallOfFameDisputeMutationResult(
  data: unknown,
  expected: {
    requestId: string;
    operation: HallOfFameDisputeMutationResult["operation"];
    disputeId?: string;
    disputeType?: HallOfFameDisputeType;
  },
): HallOfFameDisputeMutationResult {
  const rows = rowsOf(data);
  if (rows.length !== 1) throw invalidResponse();
  const row = rows[0];
  assertExactKeys(row, mutationKeys);
  const operation = requiredString(row, "operation");
  if (operation !== expected.operation) throw invalidResponse();
  const result = {
    requestId: uuid(row, "request_id"),
    operation,
    disputeId: uuid(row, "dispute_id"),
    disputeType: disputeType(row, "dispute_type"),
    status: enumValue(row, "status", disputeStatuses),
    version: integer(row, "version", 1),
    changed: booleanValue(row, "changed"),
    replayed: booleanValue(row, "replayed"),
  } satisfies HallOfFameDisputeMutationResult;
  if (
    result.requestId !== expected.requestId ||
    (expected.disputeId !== undefined && result.disputeId !== expected.disputeId) ||
    (expected.disputeType !== undefined && result.disputeType !== expected.disputeType)
  ) {
    throw invalidResponse();
  }
  return result;
}

function assertPlainExactInput(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!isPlainRecord(input)) {
    throw new HallOfFameMemberUiError(
      "validation",
      "요청 정보를 다시 확인해 주세요.",
    );
  }
  const actual = Object.keys(input).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new HallOfFameMemberUiError(
      "validation",
      "요청 정보를 다시 확인해 주세요.",
    );
  }
  return input;
}

export function normalizeHallOfFameDisputeSubmitInput(
  input: unknown,
): HallOfFameDisputeSubmitInput {
  const row = assertPlainExactInput(input, [
    "disputeType",
    "category",
    "targetKind",
    "targetId",
    "statement",
  ]);
  const disputeTypeValue = row.disputeType;
  const categoryValue = row.category;
  const targetKind = row.targetKind;
  const targetId = row.targetId;
  const statement = typeof row.statement === "string" ? row.statement.trim() : "";
  if (
    typeof disputeTypeValue !== "string" ||
    !disputeTypes.has(disputeTypeValue as HallOfFameDisputeType) ||
    typeof categoryValue !== "string" ||
    !allCategories.has(categoryValue as HallOfFameDisputeCategory) ||
    (targetKind !== "application_record" && targetKind !== "canonical_record") ||
    typeof targetId !== "string" ||
    !UUID_PATTERN.test(targetId) ||
    [...statement].length < 2 ||
    [...statement].length > 2000
  ) {
    throw new HallOfFameMemberUiError(
      "validation",
      "요청 종류와 내용을 다시 확인해 주세요.",
    );
  }
  const typedDisputeType = disputeTypeValue as HallOfFameDisputeType;
  const typedCategory = categoryValue as HallOfFameDisputeCategory;
  if (
    !HALL_OF_FAME_DISPUTE_CATEGORY_OPTIONS[typedDisputeType].some(
      (option) => option.value === typedCategory,
    ) ||
    (targetKind === "application_record" && typedDisputeType !== "decision_appeal")
  ) {
    throw new HallOfFameMemberUiError(
      "validation",
      "선택한 요청 사유를 다시 확인해 주세요.",
    );
  }
  return {
    disputeType: typedDisputeType,
    category: typedCategory,
    targetKind,
    targetId,
    statement,
  };
}

export function normalizeHallOfFameDisputeWithdrawInput(
  input: unknown,
): HallOfFameDisputeWithdrawInput {
  const row = assertPlainExactInput(input, ["disputeId", "expectedVersion"]);
  if (
    typeof row.disputeId !== "string" ||
    !UUID_PATTERN.test(row.disputeId) ||
    !Number.isSafeInteger(row.expectedVersion) ||
    (row.expectedVersion as number) < 1
  ) {
    throw new HallOfFameMemberUiError(
      "validation",
      "취소할 요청 정보를 다시 확인해 주세요.",
    );
  }
  return {
    disputeId: row.disputeId,
    expectedVersion: row.expectedVersion as number,
  };
}

export function toHallOfFameMemberUiError(error: unknown): HallOfFameMemberUiError {
  if (error instanceof HallOfFameMemberUiError) return error;
  const message =
    isPlainRecord(error) && typeof error.message === "string" ? error.message : "";
  for (const known of knownErrors) {
    if (message.includes(known.code)) {
      return new HallOfFameMemberUiError(
        known.kind,
        known.message,
        known.refresh ?? false,
      );
    }
  }
  if (
    error instanceof TypeError ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("fetch failed")
  ) {
    return new HallOfFameMemberUiError(
      "network",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  }
  return new HallOfFameMemberUiError(
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
    throw toHallOfFameMemberUiError(error);
  }
}

export async function listHallOfFamePublicRecords(
  supabase: SupabaseClient,
  limit = 50,
  offset = 0,
) {
  return parseHallOfFamePublicRecords(
    await runRpc(supabase, "list_hall_of_fame_public_records", {
      p_limit: limit,
      p_offset: offset,
    }),
  );
}

export async function listMyHallOfFameApplications(
  supabase: SupabaseClient,
  limit = 50,
  offset = 0,
) {
  return parseMyHallOfFameApplications(
    await runRpc(supabase, "list_my_hall_of_fame_applications", {
      p_limit: limit,
      p_offset: offset,
    }),
  );
}

export async function listMyHallOfFameRecords(
  supabase: SupabaseClient,
  limit = 50,
  offset = 0,
) {
  return parseMyHallOfFameRecords(
    await runRpc(supabase, "list_my_hall_of_fame_records", {
      p_limit: limit,
      p_offset: offset,
    }),
  );
}

export async function listMyHallOfFameDisputes(
  supabase: SupabaseClient,
  limit = 50,
  offset = 0,
) {
  return parseMyHallOfFameDisputes(
    await runRpc(supabase, "list_my_hall_of_fame_disputes", {
      p_limit: limit,
      p_offset: offset,
    }),
  );
}

export async function getMyHallOfFameDispute(
  supabase: SupabaseClient,
  disputeId: string,
) {
  if (!UUID_PATTERN.test(disputeId)) throw invalidResponse();
  return parseMyHallOfFameDisputeDetail(
    await runRpc(supabase, "get_my_hall_of_fame_dispute", {
      p_dispute_id: disputeId,
    }),
  );
}

export async function submitHallOfFameDispute(
  supabase: SupabaseClient,
  input: HallOfFameDisputeSubmitInput,
  requestId: string,
) {
  if (!UUID_PATTERN.test(requestId)) throw invalidResponse();
  const data = await runRpc(supabase, "submit_hall_of_fame_dispute", {
    p_dispute_type: input.disputeType,
    p_category: input.category,
    p_application_record_id:
      input.targetKind === "application_record" ? input.targetId : null,
    p_canonical_record_id:
      input.targetKind === "canonical_record" ? input.targetId : null,
    p_statement: input.statement,
    p_request_id: requestId,
  });
  return parseHallOfFameDisputeMutationResult(data, {
    requestId,
    operation: "hall_of_fame.dispute.submit",
    disputeType: input.disputeType,
  });
}

export async function withdrawHallOfFameDispute(
  supabase: SupabaseClient,
  input: HallOfFameDisputeWithdrawInput,
  requestId: string,
) {
  if (!UUID_PATTERN.test(requestId)) throw invalidResponse();
  const data = await runRpc(supabase, "withdraw_hall_of_fame_dispute", {
    p_dispute_id: input.disputeId,
    p_expected_version: input.expectedVersion,
    p_request_id: requestId,
  });
  return parseHallOfFameDisputeMutationResult(data, {
    requestId,
    operation: "hall_of_fame.dispute.withdraw",
    disputeId: input.disputeId,
  });
}

export const HALL_OF_FAME_DISPUTE_TYPE_LABELS: Readonly<
  Record<HallOfFameDisputeType, string>
> = {
  correction_request: "기록 정정 요청",
  decision_appeal: "처리 결과 이의 신청",
  subject_objection: "내 기록 이의 제기",
  fraud_report: "잘못된 기록 신고",
};

export const HALL_OF_FAME_APPLICATION_TYPE_LABELS: Readonly<
  Record<HallOfFameApplicationType, string>
> = {
  club_nomination: "동호회 추천",
  direct_application: "직접 신청",
  club_admin_vacancy_direct_application: "회장 공석 직접 신청",
};

export const HALL_OF_FAME_BATCH_STATUS_LABELS: Readonly<
  Record<HallOfFameBatchStatus, string>
> = {
  draft: "작성 중",
  submitted: "접수됨",
  under_review: "확인 중",
  additional_info_required: "추가 정보 필요",
  approved: "승인됨",
  partially_approved: "일부 승인됨",
  rejected: "승인되지 않음",
  withdrawn: "신청 취소",
  cancelled: "처리 취소",
};

export const HALL_OF_FAME_RECORD_STATUS_LABELS: Readonly<
  Record<HallOfFameApplicationRecordStatus, string>
> = {
  draft: "작성 중",
  submitted: "접수됨",
  under_review: "확인 중",
  additional_info_required: "추가 정보 필요",
  approved: "승인됨",
  rejected: "승인되지 않음",
  withdrawn: "신청 취소",
  cancelled: "처리 취소",
};

export const HALL_OF_FAME_VALIDITY_STATUS_LABELS: Readonly<
  Record<HallOfFameValidityStatus, string>
> = {
  active: "정상 기록",
  provisional: "확인 중인 기록",
  corrected: "정정된 기록",
  revoked: "등재 취소된 기록",
};

export const HALL_OF_FAME_PUBLICATION_STATUS_LABELS: Readonly<
  Record<HallOfFamePublicationStatus, string>
> = {
  hidden: "비공개",
  published: "공개 중",
  suppressed: "공개 중지",
};

export const HALL_OF_FAME_DISPUTE_STATUS_LABELS: Readonly<
  Record<HallOfFameDisputeStatus, string>
> = {
  open: "접수됨",
  under_review: "확인 중",
  resolved: "처리 완료",
  withdrawn: "요청 취소",
};

export const HALL_OF_FAME_RESOLUTION_OUTCOME_LABELS: Readonly<
  Record<HallOfFameResolutionOutcome, string>
> = {
  correction_applied: "정정 반영",
  correction_denied: "정정 미반영",
  appeal_denied: "이의 신청 미반영",
  re_review_recommended: "재검토 안내",
  objection_upheld_correction_applied: "이의 인정·정정 반영",
  objection_upheld_revoke_applied: "이의 인정·등재 취소",
  objection_not_upheld: "이의 미인정",
  fraud_substantiated_correction_applied: "신고 확인·정정 반영",
  fraud_substantiated_revoke_applied: "신고 확인·등재 취소",
  fraud_not_substantiated: "신고 내용 미확인",
  already_remediated: "이미 조치 완료",
};
