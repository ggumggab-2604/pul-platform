import "client-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ClubJoinApplicationStatus,
  ClubJoinInquiryAvailableDay,
  ClubJoinInquiryExperience,
  ClubJoinInquiryInterest,
  ClubRecruitStatus,
} from "@/types";

export type ClubMembershipState = "none" | "active" | "suspended" | "left";

export type DatabaseClubMembershipApplicationStatus =
  | "submitted"
  | "reviewing"
  | "additional_info_required"
  | "interview_requested"
  | "approved"
  | "waitlisted"
  | "rejected"
  | "withdrawn";

export type ClubMembershipApplicationDetail = {
  applicationId: string;
  clubId: string;
  status: DatabaseClubMembershipApplicationStatus;
  recruitmentStatusAtSubmission: ClubRecruitStatus;
  experienceCode: ClubJoinInquiryExperience;
  availableDayCode: ClubJoinInquiryAvailableDay;
  interestCodes: ClubJoinInquiryInterest[];
  applicationVersion: number;
  submittedAt: string;
  statusChangedAt: string;
  finalizedAt?: string;
  updatedAt: string;
};

export type ClubMembershipApplicationHistoryEntry = {
  historyId: string;
  eventCode: string;
  fromStatus?: DatabaseClubMembershipApplicationStatus;
  toStatus: DatabaseClubMembershipApplicationStatus;
  applicationVersion: number;
  isApplicantAction: boolean;
  createdAt: string;
};

export type ClubMembershipApplicationSupplement = {
  supplementId: string;
  entryType: "additional_info_request" | "applicant_response";
  body: string;
  isApplicantEntry: boolean;
  createdAt: string;
};

export type ClubMembershipApplicationMutationResult = {
  requestId: string;
  applicationId: string;
  previousStatus?: DatabaseClubMembershipApplicationStatus;
  currentStatus: DatabaseClubMembershipApplicationStatus;
  applicationVersion: number;
  changed: boolean;
  replayed: boolean;
  outcome: string;
};

export type ClubMembershipApplicationFormInput = {
  experience?: ClubJoinInquiryExperience;
  availableDay?: ClubJoinInquiryAvailableDay;
  interests: ClubJoinInquiryInterest[];
  applicationReason: string;
  message: string;
  rulesConfirmed: boolean;
  courtesyConfirmed: boolean;
  scheduleConfirmed: boolean;
};

export type ValidatedClubMembershipApplicationForm = {
  experience: ClubJoinInquiryExperience;
  availableDay: ClubJoinInquiryAvailableDay;
  interests: ClubJoinInquiryInterest[];
  applicationReason: string;
  message: string | null;
  rulesConfirmed: true;
  courtesyConfirmed: true;
  scheduleConfirmed: true;
};

export type MembershipApplicationValidationResult =
  | { ok: true; value: ValidatedClubMembershipApplicationForm }
  | { ok: false; fieldId: string; message: string };

export type MembershipApplicationErrorKind =
  | "authentication"
  | "account"
  | "club"
  | "membership"
  | "conflict"
  | "validation"
  | "network"
  | "notFound"
  | "unknown";

export class MembershipApplicationClientError extends Error {
  constructor(
    readonly kind: MembershipApplicationErrorKind,
    readonly userMessage: string,
    readonly shouldRefresh = false,
    readonly preserveRequestId = false,
  ) {
    super(userMessage);
    this.name = "MembershipApplicationClientError";
  }
}

const databaseStatuses: ReadonlySet<string> = new Set([
  "submitted",
  "reviewing",
  "additional_info_required",
  "interview_requested",
  "approved",
  "waitlisted",
  "rejected",
  "withdrawn",
]);

const experienceCodes: ReadonlySet<string> = new Set([
  "beginner",
  "underOneYear",
  "oneToThreeYears",
  "overThreeYears",
]);

const availableDayCodes: ReadonlySet<string> = new Set([
  "weekday",
  "weekend",
  "both",
  "flexible",
]);

const interestCodes: ReadonlySet<string> = new Set([
  "regularRound",
  "friendlyMatch",
  "screenPractice",
  "beginnerEducation",
  "clubEvent",
]);

const errorMessages: ReadonlyArray<{
  code: string;
  kind: MembershipApplicationErrorKind;
  message: string;
  refresh?: boolean;
}> = [
  { code: "AUTHENTICATION_REQUIRED", kind: "authentication", message: "로그인 상태를 다시 확인해 주세요.", refresh: true },
  { code: "ACCOUNT_NOT_ACTIVE", kind: "account", message: "현재 계정 상태에서는 가입 신청을 이용할 수 없습니다." },
  { code: "CLUB_NOT_FOUND", kind: "club", message: "가입 신청 대상 동호회를 확인할 수 없습니다." },
  { code: "CLUB_NOT_ACTIVE", kind: "club", message: "현재 운영 중인 동호회에서만 가입 신청할 수 있습니다.", refresh: true },
  { code: "MEMBERSHIP_RECRUITMENT_CLOSED", kind: "club", message: "회원 모집이 마감되었습니다.", refresh: true },
  { code: "ALREADY_ACTIVE_MEMBER", kind: "membership", message: "이미 이 동호회의 활동 회원입니다.", refresh: true },
  { code: "SUSPENDED_MEMBER", kind: "membership", message: "활동 정지 상태에서는 가입 신청을 제출할 수 없습니다.", refresh: true },
  { code: "MEMBERSHIP_STATE_NOT_ELIGIBLE", kind: "membership", message: "현재 회원 관계 상태에서는 가입 신청을 제출할 수 없습니다.", refresh: true },
  { code: "ACTIVE_APPLICATION_EXISTS", kind: "conflict", message: "이미 처리 중인 가입 신청이 있습니다.", refresh: true },
  { code: "APPLICATION_VERSION_CONFLICT", kind: "conflict", message: "가입 신청 상태가 변경되었습니다. 최신 상태를 다시 확인합니다.", refresh: true },
  { code: "APPLICATION_WITHDRAW_FORBIDDEN", kind: "conflict", message: "현재 상태에서는 가입 신청을 취소할 수 없습니다.", refresh: true },
  { code: "SUPPLEMENT_RESPONSE_STATE_INVALID", kind: "conflict", message: "현재 상태에서는 추가 답변을 제출할 수 없습니다.", refresh: true },
  { code: "APPLICATION_TRANSITION_FORBIDDEN", kind: "conflict", message: "가입 신청 상태가 변경되어 요청을 처리할 수 없습니다.", refresh: true },
  { code: "MEMBERSHIP_APPLICATION_FINAL", kind: "conflict", message: "이미 처리가 완료된 가입 신청입니다.", refresh: true },
  { code: "APPLICATION_NOT_FOUND_OR_FORBIDDEN", kind: "notFound", message: "가입 신청을 확인할 수 없습니다.", refresh: true },
  { code: "APPLICATION_NOT_FOUND", kind: "notFound", message: "가입 신청을 확인할 수 없습니다.", refresh: true },
  { code: "INVALID_APPLICATION_BODY", kind: "validation", message: "추가 답변은 1자 이상 500자 이하로 입력해 주세요." },
  { code: "INVALID_EXPERIENCE_CODE", kind: "validation", message: "파크골프 경력을 다시 선택해 주세요." },
  { code: "INVALID_AVAILABLE_DAY_CODE", kind: "validation", message: "활동 가능한 요일을 다시 선택해 주세요." },
  { code: "INVALID_INTEREST_CODES", kind: "validation", message: "희망 활동을 하나 이상 선택해 주세요." },
  { code: "INVALID_APPLICATION_REASON", kind: "validation", message: "가입을 희망하는 이유를 1자 이상 500자 이하로 입력해 주세요." },
  { code: "INVALID_APPLICATION_MESSAGE", kind: "validation", message: "운영진에게 전할 내용은 500자 이하로 입력해 주세요." },
  { code: "GUIDELINES_CONFIRMATION_REQUIRED", kind: "validation", message: "필수 운영 기준을 모두 확인해 주세요." },
  { code: "IDEMPOTENCY_KEY_REUSED", kind: "conflict", message: "이 요청은 이전 요청과 일치하지 않습니다. 입력 내용을 확인해 주세요." },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) throw invalidResponse();
  return value;
}

function readOptionalString(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw invalidResponse();
  return value;
}

function readBoolean(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") throw invalidResponse();
  return value;
}

function readVersion(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw invalidResponse();
  return parsed;
}

function readRows(data: unknown): Record<string, unknown>[] {
  if (data === null || data === undefined) return [];
  const rows = Array.isArray(data) ? data : [data];
  if (!rows.every(isRecord)) throw invalidResponse();
  return rows;
}

function invalidResponse() {
  return new MembershipApplicationClientError(
    "unknown",
    "가입 신청 정보를 안전하게 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function parseDatabaseStatus(value: unknown): DatabaseClubMembershipApplicationStatus {
  if (typeof value !== "string" || !databaseStatuses.has(value)) throw invalidResponse();
  return value as DatabaseClubMembershipApplicationStatus;
}

export function parseRecruitmentStatus(value: unknown): ClubRecruitStatus {
  if (value === "recruiting" || value === "waiting" || value === "closed") return value;
  throw invalidResponse();
}

function parseExperience(value: unknown): ClubJoinInquiryExperience {
  if (typeof value !== "string" || !experienceCodes.has(value)) throw invalidResponse();
  return value as ClubJoinInquiryExperience;
}

function parseAvailableDay(value: unknown): ClubJoinInquiryAvailableDay {
  if (typeof value !== "string" || !availableDayCodes.has(value)) throw invalidResponse();
  return value as ClubJoinInquiryAvailableDay;
}

function parseInterests(value: unknown): ClubJoinInquiryInterest[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && interestCodes.has(item))) {
    throw invalidResponse();
  }
  return value as ClubJoinInquiryInterest[];
}

function parseApplication(row: Record<string, unknown>): ClubMembershipApplicationDetail {
  return {
    applicationId: readRequiredString(row, "application_id"),
    clubId: readRequiredString(row, "club_id"),
    status: parseDatabaseStatus(row.status),
    recruitmentStatusAtSubmission: parseRecruitmentStatus(row.recruitment_status_at_submission),
    experienceCode: parseExperience(row.experience_code),
    availableDayCode: parseAvailableDay(row.available_day_code),
    interestCodes: parseInterests(row.interest_codes),
    applicationVersion: readVersion(row, "application_version"),
    submittedAt: readRequiredString(row, "submitted_at"),
    statusChangedAt: readRequiredString(row, "status_changed_at"),
    finalizedAt: readOptionalString(row, "finalized_at"),
    updatedAt: readRequiredString(row, "updated_at"),
  };
}

function parseMutation(row: Record<string, unknown>): ClubMembershipApplicationMutationResult {
  return {
    requestId: readRequiredString(row, "request_id"),
    applicationId: readRequiredString(row, "application_id"),
    previousStatus: row.previous_status === null ? undefined : parseDatabaseStatus(row.previous_status),
    currentStatus: parseDatabaseStatus(row.current_status),
    applicationVersion: readVersion(row, "application_version"),
    changed: readBoolean(row, "changed"),
    replayed: readBoolean(row, "replayed"),
    outcome: readRequiredString(row, "outcome"),
  };
}

async function runRpc(
  supabase: SupabaseClient,
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  try {
    const { data, error } = await supabase.rpc(functionName, parameters);
    if (error) throw error;
    return data as unknown;
  } catch (error) {
    throw toMembershipApplicationError(error);
  }
}

export function toMembershipApplicationError(error: unknown): MembershipApplicationClientError {
  if (error instanceof MembershipApplicationClientError) return error;
  const rawMessage = isRecord(error) && typeof error.message === "string" ? error.message : "";

  for (const known of errorMessages) {
    if (rawMessage.includes(known.code)) {
      return new MembershipApplicationClientError(known.kind, known.message, known.refresh ?? false);
    }
  }

  if (
    error instanceof TypeError ||
    rawMessage.includes("Failed to fetch") ||
    rawMessage.includes("NetworkError") ||
    rawMessage.includes("fetch failed")
  ) {
    return new MembershipApplicationClientError(
      "network",
      "네트워크 연결을 확인한 뒤 같은 요청을 다시 시도해 주세요.",
      false,
      true,
    );
  }

  return new MembershipApplicationClientError(
    "unknown",
    "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

export function toUiApplicationStatus(
  status: DatabaseClubMembershipApplicationStatus,
): Exclude<ClubJoinApplicationStatus, "draft"> {
  if (status === "additional_info_required") return "additionalInfoRequired";
  if (status === "interview_requested") return "interviewRequested";
  return status;
}

export function isProcessingApplicationStatus(status: DatabaseClubMembershipApplicationStatus) {
  return (
    status === "submitted" ||
    status === "reviewing" ||
    status === "additional_info_required" ||
    status === "interview_requested" ||
    status === "waitlisted"
  );
}

export function canWithdrawApplication(status: DatabaseClubMembershipApplicationStatus) {
  return isProcessingApplicationStatus(status);
}

export function validateMembershipApplicationForm(
  input: ClubMembershipApplicationFormInput,
): MembershipApplicationValidationResult {
  if (!input.experience || !experienceCodes.has(input.experience)) {
    return { ok: false, fieldId: "club-application-experience-beginner", message: "파크골프 경력을 선택해 주세요." };
  }
  if (!input.availableDay || !availableDayCodes.has(input.availableDay)) {
    return { ok: false, fieldId: "club-application-day-weekday", message: "활동 가능한 요일을 선택해 주세요." };
  }
  if (
    input.interests.length < 1 ||
    new Set(input.interests).size !== input.interests.length ||
    input.interests.some((item) => !interestCodes.has(item))
  ) {
    return { ok: false, fieldId: "club-application-interest-regularRound", message: "희망 활동을 하나 이상 중복 없이 선택해 주세요." };
  }

  const applicationReason = input.applicationReason.trim();
  if (applicationReason.length < 1 || applicationReason.length > 500) {
    return { ok: false, fieldId: "club-application-motivation", message: "가입을 희망하는 이유를 1자 이상 500자 이하로 입력해 주세요." };
  }

  const message = input.message.trim();
  if (message.length > 500) {
    return { ok: false, fieldId: "club-application-message", message: "운영진에게 전할 내용은 500자 이하로 입력해 주세요." };
  }

  if (!input.rulesConfirmed || !input.courtesyConfirmed || !input.scheduleConfirmed) {
    return { ok: false, fieldId: "club-application-rules", message: "필수 운영 기준을 모두 확인해 주세요." };
  }

  return {
    ok: true,
    value: {
      experience: input.experience,
      availableDay: input.availableDay,
      interests: [...input.interests],
      applicationReason,
      message: message || null,
      rulesConfirmed: true,
      courtesyConfirmed: true,
      scheduleConfirmed: true,
    },
  };
}

export function validateSupplementBody(body: string) {
  const normalized = body.trim();
  if (normalized.length < 1 || normalized.length > 500) {
    throw new MembershipApplicationClientError(
      "validation",
      "추가 답변은 1자 이상 500자 이하로 입력해 주세요.",
    );
  }
  return normalized;
}

export function createMutationRequestId() {
  if (typeof globalThis.crypto === "undefined" || typeof globalThis.crypto.randomUUID !== "function") {
    throw new MembershipApplicationClientError(
      "unknown",
      "안전한 요청 식별자를 만들 수 없습니다. 브라우저를 새로고침해 주세요.",
    );
  }
  return globalThis.crypto.randomUUID();
}

export async function fetchClubRecruitmentStatus(
  supabase: SupabaseClient,
  clubId: string,
): Promise<ClubRecruitStatus> {
  try {
    const { data, error } = await supabase
      .from("clubs")
      .select("membership_recruitment_status")
      .eq("id", clubId)
      .maybeSingle();
    if (error) throw error;
    if (!isRecord(data)) throw invalidResponse();
    return parseRecruitmentStatus(data.membership_recruitment_status);
  } catch (error) {
    throw toMembershipApplicationError(error);
  }
}

export async function fetchOwnClubMembershipState(
  supabase: SupabaseClient,
  clubId: string,
): Promise<ClubMembershipState> {
  try {
    const { data, error } = await supabase
      .from("club_memberships")
      .select("membership_status")
      .eq("club_id", clubId)
      .maybeSingle();
    if (error) throw error;
    if (data === null) return "none";
    if (!isRecord(data)) throw invalidResponse();
    const status = data.membership_status;
    if (status === "active" || status === "suspended" || status === "left") return status;
    throw invalidResponse();
  } catch (error) {
    throw toMembershipApplicationError(error);
  }
}

export async function fetchActiveMembershipApplication(
  supabase: SupabaseClient,
  clubId: string,
): Promise<ClubMembershipApplicationDetail | null> {
  const rows = readRows(await runRpc(supabase, "get_my_active_club_membership_application", { p_club_id: clubId }));
  return rows[0] ? parseApplication(rows[0]) : null;
}

export async function fetchLatestMembershipApplication(
  supabase: SupabaseClient,
  clubId: string,
): Promise<ClubMembershipApplicationDetail | null> {
  const rows = readRows(
    await runRpc(supabase, "list_my_club_membership_applications", {
      p_club_id: clubId,
      p_limit: 1,
      p_before_submitted_at: null,
      p_before_application_id: null,
    }),
  );
  return rows[0] ? parseApplication(rows[0]) : null;
}

export async function fetchMembershipApplicationDetail(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<ClubMembershipApplicationDetail> {
  const rows = readRows(await runRpc(supabase, "get_my_club_membership_application", { p_application_id: applicationId }));
  if (!rows[0]) throw invalidResponse();
  return parseApplication(rows[0]);
}

export async function fetchMembershipApplicationHistory(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<ClubMembershipApplicationHistoryEntry[]> {
  return readRows(
    await runRpc(supabase, "list_my_club_membership_application_history", { p_application_id: applicationId }),
  ).map((row) => ({
    historyId: readRequiredString(row, "history_id"),
    eventCode: readRequiredString(row, "event_code"),
    fromStatus: row.from_status === null ? undefined : parseDatabaseStatus(row.from_status),
    toStatus: parseDatabaseStatus(row.to_status),
    applicationVersion: readVersion(row, "application_version"),
    isApplicantAction: readBoolean(row, "is_applicant_action"),
    createdAt: readRequiredString(row, "created_at"),
  }));
}

export async function fetchMembershipApplicationSupplements(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<ClubMembershipApplicationSupplement[]> {
  return readRows(
    await runRpc(supabase, "list_my_club_membership_application_supplements", { p_application_id: applicationId }),
  ).map((row) => {
    const entryType = readRequiredString(row, "entry_type");
    if (entryType !== "additional_info_request" && entryType !== "applicant_response") throw invalidResponse();
    return {
      supplementId: readRequiredString(row, "supplement_id"),
      entryType,
      body: readRequiredString(row, "body"),
      isApplicantEntry: readBoolean(row, "is_applicant_entry"),
      createdAt: readRequiredString(row, "created_at"),
    };
  });
}

export async function submitMembershipApplication(
  supabase: SupabaseClient,
  clubId: string,
  input: ValidatedClubMembershipApplicationForm,
  requestId: string,
): Promise<ClubMembershipApplicationMutationResult> {
  const rows = readRows(
    await runRpc(supabase, "submit_club_membership_application", {
      p_club_id: clubId,
      p_experience_code: input.experience,
      p_available_day_code: input.availableDay,
      p_interest_codes: input.interests,
      p_application_reason: input.applicationReason,
      p_message: input.message,
      p_rules_confirmed: input.rulesConfirmed,
      p_courtesy_confirmed: input.courtesyConfirmed,
      p_schedule_confirmed: input.scheduleConfirmed,
      p_request_id: requestId,
    }),
  );
  if (!rows[0]) throw invalidResponse();
  return parseMutation(rows[0]);
}

export async function withdrawMembershipApplication(
  supabase: SupabaseClient,
  applicationId: string,
  expectedVersion: number,
  requestId: string,
): Promise<ClubMembershipApplicationMutationResult> {
  const rows = readRows(
    await runRpc(supabase, "withdraw_club_membership_application", {
      p_application_id: applicationId,
      p_expected_version: expectedVersion,
      p_request_id: requestId,
    }),
  );
  if (!rows[0]) throw invalidResponse();
  return parseMutation(rows[0]);
}

export async function submitMembershipApplicationSupplement(
  supabase: SupabaseClient,
  applicationId: string,
  expectedVersion: number,
  body: string,
  requestId: string,
): Promise<ClubMembershipApplicationMutationResult> {
  const rows = readRows(
    await runRpc(supabase, "submit_club_membership_application_supplement", {
      p_application_id: applicationId,
      p_expected_version: expectedVersion,
      p_body: validateSupplementBody(body),
      p_request_id: requestId,
    }),
  );
  if (!rows[0]) throw invalidResponse();
  return parseMutation(rows[0]);
}