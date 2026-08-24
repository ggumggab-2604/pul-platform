import "client-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ClubJoinInquiryAvailableDay,
  ClubJoinInquiryExperience,
  ClubJoinInquiryInterest,
} from "@/types";

export type DatabaseClubJoinInquiryStatus =
  | "received"
  | "reviewing"
  | "replied"
  | "closed"
  | "withdrawn";

export type ClubJoinInquiryDetail = {
  inquiryId: string;
  experienceCode: ClubJoinInquiryExperience;
  availableDayCode: ClubJoinInquiryAvailableDay;
  interestCodes: ClubJoinInquiryInterest[];
  message?: string;
  status: DatabaseClubJoinInquiryStatus;
  isAssigned: boolean;
  publicReply?: string;
  submittedAt: string;
  reviewStartedAt?: string;
  repliedAt?: string;
  closedAt?: string;
  withdrawnAt?: string;
  updatedAt: string;
};

export type ClubJoinInquiryHistoryEntry = {
  eventCode:
    | "inquiry.submitted"
    | "inquiry.review_started"
    | "inquiry.replied"
    | "inquiry.closed"
    | "inquiry.withdrawn";
  previousStatus?: DatabaseClubJoinInquiryStatus;
  newStatus: DatabaseClubJoinInquiryStatus;
  isApplicantAction: boolean;
  createdAt: string;
};

export type ClubJoinInquirySnapshot = {
  inquiry: ClubJoinInquiryDetail | null;
  history: ClubJoinInquiryHistoryEntry[];
};

export type ClubJoinInquiryFormInput = {
  experience?: ClubJoinInquiryExperience;
  availableDay?: ClubJoinInquiryAvailableDay;
  interests: ClubJoinInquiryInterest[];
  message: string;
};

export type ValidatedClubJoinInquiryForm = {
  experience: ClubJoinInquiryExperience;
  availableDay: ClubJoinInquiryAvailableDay;
  interests: ClubJoinInquiryInterest[];
  message: string | null;
};

export type ClubJoinInquiryValidationResult =
  | { ok: true; value: ValidatedClubJoinInquiryForm }
  | { ok: false; fieldId: string; message: string };

export type ClubJoinInquiryMutationResult = {
  status: DatabaseClubJoinInquiryStatus;
  changed: boolean;
  replayed: boolean;
  outcome: string;
};

export type ClubJoinInquiryErrorKind =
  | "authentication"
  | "account"
  | "club"
  | "conflict"
  | "validation"
  | "permission"
  | "network"
  | "malformedResponse"
  | "unknown";

export class ClubJoinInquiryClientError extends Error {
  readonly kind: ClubJoinInquiryErrorKind;
  readonly userMessage: string;
  readonly shouldRefresh: boolean;
  readonly preserveRequestId: boolean;

  constructor(
    kind: ClubJoinInquiryErrorKind,
    userMessage: string,
    shouldRefresh = false,
    preserveRequestId = false,
  ) {
    super(userMessage);
    this.name = "ClubJoinInquiryClientError";
    this.kind = kind;
    this.userMessage = userMessage;
    this.shouldRefresh = shouldRefresh;
    this.preserveRequestId = preserveRequestId;
  }
}

export const clubJoinInquiryStatusLabels: Record<
  DatabaseClubJoinInquiryStatus,
  string
> = {
  received: "문의 접수",
  reviewing: "운영자 확인 중",
  replied: "운영자 답변 완료",
  closed: "문의 종료",
  withdrawn: "문의 철회",
};

export const clubJoinInquiryHistoryLabels: Record<
  ClubJoinInquiryHistoryEntry["eventCode"],
  string
> = {
  "inquiry.submitted": "가입 문의 접수",
  "inquiry.review_started": "운영자 확인 시작",
  "inquiry.replied": "운영자 답변 등록",
  "inquiry.closed": "문의 종료",
  "inquiry.withdrawn": "문의 철회",
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statusValues = new Set<DatabaseClubJoinInquiryStatus>([
  "received",
  "reviewing",
  "replied",
  "closed",
  "withdrawn",
]);
const experienceValues = new Set<ClubJoinInquiryExperience>([
  "beginner",
  "underOneYear",
  "oneToThreeYears",
  "overThreeYears",
]);
const availableDayValues = new Set<ClubJoinInquiryAvailableDay>([
  "weekday",
  "weekend",
  "both",
  "flexible",
]);
const interestValues = new Set<ClubJoinInquiryInterest>([
  "regularRound",
  "friendlyMatch",
  "screenPractice",
  "beginnerEducation",
  "clubEvent",
]);
const eventValues = new Set<ClubJoinInquiryHistoryEntry["eventCode"]>([
  "inquiry.submitted",
  "inquiry.review_started",
  "inquiry.replied",
  "inquiry.closed",
  "inquiry.withdrawn",
]);

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: JsonObject, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => typeof key === "string" && expected.includes(key))
  );
}

function malformedResponse(): never {
  throw new ClubJoinInquiryClientError(
    "malformedResponse",
    "가입 문의 정보를 안전하게 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function readRows(value: unknown): JsonObject[] {
  if (!Array.isArray(value) || !value.every(isPlainObject)) malformedResponse();
  return value;
}

function readUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) malformedResponse();
  return value;
}

function readString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) malformedResponse();
  return value;
}

function readNullableString(value: unknown, maxLength?: number): string | undefined {
  if (value === null) return undefined;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    (maxLength !== undefined && Array.from(value).length > maxLength)
  ) {
    malformedResponse();
  }
  return value;
}

function readTimestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    malformedResponse();
  }
  return value;
}

function readNullableTimestamp(value: unknown): string | undefined {
  if (value === null) return undefined;
  return readTimestamp(value);
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") malformedResponse();
  return value;
}

function readStatus(value: unknown): DatabaseClubJoinInquiryStatus {
  if (typeof value !== "string" || !statusValues.has(value as DatabaseClubJoinInquiryStatus)) {
    malformedResponse();
  }
  return value as DatabaseClubJoinInquiryStatus;
}

function readExperience(value: unknown): ClubJoinInquiryExperience {
  if (
    typeof value !== "string" ||
    !experienceValues.has(value as ClubJoinInquiryExperience)
  ) {
    malformedResponse();
  }
  return value as ClubJoinInquiryExperience;
}

function readAvailableDay(value: unknown): ClubJoinInquiryAvailableDay {
  if (
    typeof value !== "string" ||
    !availableDayValues.has(value as ClubJoinInquiryAvailableDay)
  ) {
    malformedResponse();
  }
  return value as ClubJoinInquiryAvailableDay;
}

function readInterests(value: unknown): ClubJoinInquiryInterest[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(
      (item) =>
        typeof item === "string" &&
        interestValues.has(item as ClubJoinInquiryInterest),
    ) ||
    new Set(value).size !== value.length
  ) {
    malformedResponse();
  }
  return value as ClubJoinInquiryInterest[];
}

function readEventCode(value: unknown): ClubJoinInquiryHistoryEntry["eventCode"] {
  if (
    typeof value !== "string" ||
    !eventValues.has(value as ClubJoinInquiryHistoryEntry["eventCode"])
  ) {
    malformedResponse();
  }
  return value as ClubJoinInquiryHistoryEntry["eventCode"];
}

const listKeys = [
  "inquiry_id",
  "club_id",
  "experience_code",
  "available_day_code",
  "interest_codes",
  "inquiry_status",
  "is_assigned",
  "has_public_reply",
  "submitted_at",
  "updated_at",
] as const;

function parseLatestInquiryId(value: unknown, expectedClubId: string): string | null {
  const rows = readRows(value);
  if (rows.length === 0) return null;
  if (rows.length !== 1 || !hasExactKeys(rows[0], listKeys)) malformedResponse();
  const row = rows[0];
  if (readUuid(row.club_id) !== expectedClubId) malformedResponse();
  readExperience(row.experience_code);
  readAvailableDay(row.available_day_code);
  readInterests(row.interest_codes);
  readStatus(row.inquiry_status);
  readBoolean(row.is_assigned);
  readBoolean(row.has_public_reply);
  readTimestamp(row.submitted_at);
  readTimestamp(row.updated_at);
  return readUuid(row.inquiry_id);
}

const detailKeys = [
  "inquiry_id",
  "club_id",
  "applicant_id",
  "experience_code",
  "available_day_code",
  "interest_codes",
  "message",
  "inquiry_status",
  "is_assigned",
  "public_reply",
  "submitted_at",
  "review_started_at",
  "replied_at",
  "closed_at",
  "withdrawn_at",
  "updated_at",
] as const;

export function parseClubJoinInquiryDetail(
  value: unknown,
  expectedClubId: string,
  expectedInquiryId: string,
): ClubJoinInquiryDetail {
  const rows = readRows(value);
  if (rows.length !== 1 || !hasExactKeys(rows[0], detailKeys)) malformedResponse();
  const row = rows[0];
  const inquiryId = readUuid(row.inquiry_id);
  if (
    inquiryId !== expectedInquiryId ||
    readUuid(row.club_id) !== expectedClubId
  ) {
    malformedResponse();
  }
  readUuid(row.applicant_id);
  return {
    inquiryId,
    experienceCode: readExperience(row.experience_code),
    availableDayCode: readAvailableDay(row.available_day_code),
    interestCodes: readInterests(row.interest_codes),
    message: readNullableString(row.message, 500),
    status: readStatus(row.inquiry_status),
    isAssigned: readBoolean(row.is_assigned),
    publicReply: readNullableString(row.public_reply),
    submittedAt: readTimestamp(row.submitted_at),
    reviewStartedAt: readNullableTimestamp(row.review_started_at),
    repliedAt: readNullableTimestamp(row.replied_at),
    closedAt: readNullableTimestamp(row.closed_at),
    withdrawnAt: readNullableTimestamp(row.withdrawn_at),
    updatedAt: readTimestamp(row.updated_at),
  };
}

const historyKeys = [
  "history_id",
  "inquiry_id",
  "event_code",
  "previous_status",
  "new_status",
  "is_applicant_action",
  "created_at",
] as const;

export function parseClubJoinInquiryHistory(
  value: unknown,
  expectedInquiryId: string,
): ClubJoinInquiryHistoryEntry[] {
  return readRows(value).map((row) => {
    if (!hasExactKeys(row, historyKeys)) malformedResponse();
    readUuid(row.history_id);
    if (readUuid(row.inquiry_id) !== expectedInquiryId) malformedResponse();
    return {
      eventCode: readEventCode(row.event_code),
      previousStatus:
        row.previous_status === null ? undefined : readStatus(row.previous_status),
      newStatus: readStatus(row.new_status),
      isApplicantAction: readBoolean(row.is_applicant_action),
      createdAt: readTimestamp(row.created_at),
    };
  });
}

function readOneMutationRow(value: unknown, keys: readonly string[]): JsonObject {
  const rows = readRows(value);
  if (rows.length !== 1 || !hasExactKeys(rows[0], keys)) malformedResponse();
  return rows[0];
}

const submitKeys = [
  "request_id",
  "action_code",
  "inquiry_id",
  "club_id",
  "applicant_id",
  "inquiry_status",
  "changed",
  "replayed",
  "outcome",
] as const;

const withdrawKeys = [
  "request_id",
  "action_code",
  "inquiry_id",
  "club_id",
  "applicant_id",
  "previous_status",
  "current_status",
  "changed",
  "replayed",
  "outcome",
] as const;

function parseMutationResult(
  value: unknown,
  expected: {
    actionCode: "inquiry.submit" | "inquiry.withdraw";
    clubId: string;
    requestId: string;
    inquiryId?: string;
  },
): ClubJoinInquiryMutationResult {
  const row = readOneMutationRow(
    value,
    expected.actionCode === "inquiry.submit" ? submitKeys : withdrawKeys,
  );
  const inquiryId = readUuid(row.inquiry_id);
  if (
    readUuid(row.request_id) !== expected.requestId ||
    row.action_code !== expected.actionCode ||
    readUuid(row.club_id) !== expected.clubId ||
    (expected.inquiryId !== undefined && inquiryId !== expected.inquiryId)
  ) {
    malformedResponse();
  }
  readUuid(row.applicant_id);
  const status = readStatus(
    expected.actionCode === "inquiry.submit"
      ? row.inquiry_status
      : row.current_status,
  );
  if (expected.actionCode === "inquiry.submit" && status !== "received") {
    malformedResponse();
  }
  if (expected.actionCode === "inquiry.withdraw") {
    const previous = readStatus(row.previous_status);
    if (!new Set(["received", "reviewing"]).has(previous) || status !== "withdrawn") {
      malformedResponse();
    }
  }
  const changed = readBoolean(row.changed);
  const replayed = readBoolean(row.replayed);
  const outcome = readString(row.outcome);
  if (outcome !== "success" || !changed) malformedResponse();
  return { status, changed, replayed, outcome };
}

async function runRpc(
  client: SupabaseClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  try {
    const { data, error } = await client.rpc(name, parameters);
    if (error) throw error;
    return data as unknown;
  } catch (error) {
    throw toClubJoinInquiryError(error);
  }
}

export function validateClubJoinInquiryForm(
  input: ClubJoinInquiryFormInput,
): ClubJoinInquiryValidationResult {
  if (!input.experience || !experienceValues.has(input.experience)) {
    return {
      ok: false,
      fieldId: "club-join-experience-beginner",
      message: "파크골프 경력을 선택해 주세요.",
    };
  }
  if (!input.availableDay || !availableDayValues.has(input.availableDay)) {
    return {
      ok: false,
      fieldId: "club-join-available-weekday",
      message: "활동 가능한 요일을 선택해 주세요.",
    };
  }
  if (
    input.interests.length === 0 ||
    new Set(input.interests).size !== input.interests.length ||
    !input.interests.every((item) => interestValues.has(item))
  ) {
    return {
      ok: false,
      fieldId: "club-join-interest-regularRound",
      message: "희망 활동을 하나 이상 선택해 주세요.",
    };
  }
  const message = input.message.trim();
  if (Array.from(message).length > 500) {
    return {
      ok: false,
      fieldId: "club-join-message",
      message: "운영자에게 전할 내용은 500자 이하로 입력해 주세요.",
    };
  }
  return {
    ok: true,
    value: {
      experience: input.experience,
      availableDay: input.availableDay,
      interests: [...input.interests],
      message: message || null,
    },
  };
}

export function createClubJoinInquiryRequestId(): string {
  const requestId = globalThis.crypto?.randomUUID();
  if (!requestId || !uuidPattern.test(requestId)) {
    throw new ClubJoinInquiryClientError(
      "validation",
      "안전한 요청 식별자를 만들 수 없습니다. 페이지를 새로고침해 주세요.",
    );
  }
  return requestId;
}

export function isActiveClubJoinInquiryStatus(
  status: DatabaseClubJoinInquiryStatus,
): boolean {
  return status === "received" || status === "reviewing";
}

export async function loadMyClubJoinInquirySnapshot(
  client: SupabaseClient,
  clubId: string,
): Promise<ClubJoinInquirySnapshot> {
  if (!uuidPattern.test(clubId)) malformedResponse();
  const list = await runRpc(client, "list_my_club_join_inquiries", {
    p_club_id: clubId,
    p_limit: 1,
    p_before_submitted_at: null,
    p_before_inquiry_id: null,
  });
  const inquiryId = parseLatestInquiryId(list, clubId);
  if (!inquiryId) return { inquiry: null, history: [] };
  const [detail, history] = await Promise.all([
    runRpc(client, "get_my_club_join_inquiry", {
      p_inquiry_id: inquiryId,
    }),
    runRpc(client, "list_my_club_join_inquiry_history", {
      p_inquiry_id: inquiryId,
    }),
  ]);
  return {
    inquiry: parseClubJoinInquiryDetail(detail, clubId, inquiryId),
    history: parseClubJoinInquiryHistory(history, inquiryId),
  };
}

export async function submitClubJoinInquiry(
  client: SupabaseClient,
  clubId: string,
  form: ValidatedClubJoinInquiryForm,
  requestId: string,
): Promise<ClubJoinInquiryMutationResult> {
  if (!uuidPattern.test(clubId) || !uuidPattern.test(requestId)) malformedResponse();
  const value = await runRpc(client, "submit_club_join_inquiry", {
    p_club_id: clubId,
    p_experience_code: form.experience,
    p_available_day_code: form.availableDay,
    p_interest_codes: form.interests,
    p_message: form.message,
    p_request_id: requestId,
  });
  return parseMutationResult(value, {
    actionCode: "inquiry.submit",
    clubId,
    requestId,
  });
}

export async function withdrawClubJoinInquiry(
  client: SupabaseClient,
  clubId: string,
  inquiryId: string,
  requestId: string,
): Promise<ClubJoinInquiryMutationResult> {
  if (
    !uuidPattern.test(clubId) ||
    !uuidPattern.test(inquiryId) ||
    !uuidPattern.test(requestId)
  ) {
    malformedResponse();
  }
  const value = await runRpc(client, "withdraw_club_join_inquiry", {
    p_inquiry_id: inquiryId,
    p_request_id: requestId,
  });
  return parseMutationResult(value, {
    actionCode: "inquiry.withdraw",
    clubId,
    requestId,
    inquiryId,
  });
}

export function toClubJoinInquiryError(error: unknown): ClubJoinInquiryClientError {
  if (error instanceof ClubJoinInquiryClientError) return error;
  const message =
    isPlainObject(error) && typeof error.message === "string" ? error.message : "";
  if (/fetch|network|load failed/i.test(message) || error instanceof TypeError) {
    return new ClubJoinInquiryClientError(
      "network",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
      false,
      true,
    );
  }
  if (/로그인/.test(message)) {
    return new ClubJoinInquiryClientError(
      "authentication",
      "로그인 상태를 다시 확인해 주세요.",
      true,
    );
  }
  if (/활성 계정/.test(message)) {
    return new ClubJoinInquiryClientError(
      "account",
      "현재 계정 상태에서는 가입 문의를 이용할 수 없습니다.",
    );
  }
  if (/동호회.*(?:찾을 수|운영 중)|동호회 식별자|활성 동호회/.test(message)) {
    return new ClubJoinInquiryClientError(
      "club",
      "가입 문의 대상 동호회를 확인할 수 없습니다.",
      true,
    );
  }
  if (/이미 처리 중|동시에 변경|현재 상태에서는.*철회/.test(message)) {
    return new ClubJoinInquiryClientError(
      "conflict",
      "가입 문의 상태가 변경되었습니다. 최신 상태를 다시 확인해 주세요.",
      true,
    );
  }
  if (/같은 요청 식별자|재사용/.test(message)) {
    return new ClubJoinInquiryClientError(
      "conflict",
      "이전 요청과 다른 내용이 감지됐습니다. 입력 내용을 확인해 주세요.",
      true,
    );
  }
  if (/가입 문의가 없거나 접근 권한/.test(message)) {
    return new ClubJoinInquiryClientError(
      "permission",
      "가입 문의를 확인할 수 없거나 처리할 권한이 없습니다.",
      true,
    );
  }
  if (/경력|요일|희망 활동|500자|올바르지|필요합니다/.test(message)) {
    return new ClubJoinInquiryClientError(
      "validation",
      "가입 문의 입력 내용을 다시 확인해 주세요.",
    );
  }
  return new ClubJoinInquiryClientError(
    "unknown",
    "가입 문의를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}
