import "client-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ClubMembershipApplicationStatus =
  | "submitted"
  | "reviewing"
  | "additional_info_required"
  | "interview_requested"
  | "waitlisted"
  | "approved"
  | "rejected"
  | "withdrawn";

export type ClubMembershipApplicationManagementPermissions = {
  canRead: boolean;
  canManage: boolean;
  canDecide: boolean;
};

export type MembershipApplicationListItem = {
  applicationId: string;
  applicantDisplayName: string;
  status: ClubMembershipApplicationStatus;
  experienceCode: string;
  availableDayCode: string;
  interestCodes: string[];
  applicationVersion: number;
  submittedAt: string;
  statusChangedAt: string;
};

export type MembershipApplicationDetail = MembershipApplicationListItem & {
  recruitmentStatusAtSubmission: string;
  applicationReason: string;
  message?: string;
  guidelinesConfirmedAt: string;
  guidelinesVersion: string;
  finalizedAt?: string;
  updatedAt: string;
};

export type MembershipApplicationHistoryEntry = {
  historyId: string;
  eventCode: string;
  fromStatus?: ClubMembershipApplicationStatus;
  toStatus: ClubMembershipApplicationStatus;
  applicationVersion: number;
  createdAt: string;
};

export type MembershipApplicationSupplement = {
  supplementId: string;
  entryType: "additional_info_request" | "applicant_response";
  body: string;
  createdAt: string;
};

export type MembershipApplicationInternalNote = {
  noteId: string;
  body: string;
  createdAt: string;
};

export type MembershipApplicationMutationResult = {
  applicationId: string;
  currentStatus: ClubMembershipApplicationStatus;
  applicationVersion: number;
  changed: boolean;
  replayed: boolean;
  outcome: "success";
};

export type MembershipApplicationApprovalResult = {
  applicationId: string;
  applicationStatus: "approved";
  applicationVersion: number;
  membershipStatus: "active";
  roleCode: "club_member";
  membershipTransition: "created" | "reactivated";
  replayed: boolean;
  approvedAt: string;
};

export type MembershipApplicationListPage = {
  items: MembershipApplicationListItem[];
  nextCursor?: { submittedAt: string; applicationId: string };
};

export type MembershipApplicationDetailBundle = {
  detail: MembershipApplicationDetail;
  history: MembershipApplicationHistoryEntry[];
  supplements: MembershipApplicationSupplement[];
  internalNotes: MembershipApplicationInternalNote[];
};

export type ManagementOperation =
  | "review"
  | "request_additional_info"
  | "request_interview"
  | "waitlist"
  | "resume_review";

type ManagementErrorKind =
  | "authentication"
  | "permission"
  | "conflict"
  | "validation"
  | "notFound"
  | "network"
  | "unknown";

export class MembershipApplicationManagementError extends Error {
  constructor(
    readonly kind: ManagementErrorKind,
    readonly userMessage: string,
    readonly shouldRefresh = false,
    readonly preserveRequestId = false,
  ) {
    super(userMessage);
    this.name = "MembershipApplicationManagementError";
  }
}

const pageSize = 24;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set<string>([
  "submitted",
  "reviewing",
  "additional_info_required",
  "interview_requested",
  "waitlisted",
  "approved",
  "rejected",
  "withdrawn",
]);
const supplementTypes = new Set(["additional_info_request", "applicant_response"]);
const experienceCodes = new Set(["beginner", "underOneYear", "oneToThreeYears", "overThreeYears"]);
const availableDayCodes = new Set(["weekday", "weekend", "both", "flexible"]);
const interestCodes = new Set(["regularRound", "friendlyMatch", "screenPractice", "beginnerEducation", "clubEvent"]);
const recruitmentStatuses = new Set(["recruiting", "waiting", "closed"]);
const membershipTransitions = new Set(["created", "reactivated"]);

const mappedErrors: ReadonlyArray<{
  code: string;
  kind: ManagementErrorKind;
  message: string;
  refresh?: boolean;
}> = [
  { code: "AUTHENTICATION_REQUIRED", kind: "authentication", message: "로그인 상태를 다시 확인해 주세요.", refresh: true },
  { code: "ACCOUNT_NOT_ACTIVE", kind: "permission", message: "현재 계정 상태에서는 가입 신청을 관리할 수 없습니다." },
  { code: "APPROVER_ACCOUNT_NOT_ACTIVE", kind: "permission", message: "현재 계정 상태에서는 최종 결정을 처리할 수 없습니다." },
  { code: "CLUB_NOT_FOUND", kind: "notFound", message: "동호회 정보를 확인할 수 없습니다.", refresh: true },
  { code: "CLUB_NOT_ACTIVE", kind: "conflict", message: "현재 운영 중인 동호회에서만 처리할 수 있습니다.", refresh: true },
  { code: "APPLICATION_READ_PERMISSION_REQUIRED", kind: "permission", message: "가입 신청을 조회할 권한이 없습니다." },
  { code: "APPLICATION_MANAGE_PERMISSION_REQUIRED", kind: "permission", message: "가입 신청 상태를 처리할 권한이 없습니다." },
  { code: "APPLICATION_DECIDE_PERMISSION_REQUIRED", kind: "permission", message: "가입 신청을 최종 결정할 권한이 없습니다." },
  { code: "APPLICATION_ADMIN_OR_VICE_ADMIN_REQUIRED", kind: "permission", message: "회장 또는 부회장만 최종 결정할 수 있습니다." },
  { code: "APPLICATION_NOT_FOUND_OR_FORBIDDEN", kind: "notFound", message: "가입 신청을 확인할 수 없습니다.", refresh: true },
  { code: "APPLICATION_NOT_FOUND", kind: "notFound", message: "가입 신청을 확인할 수 없습니다.", refresh: true },
  { code: "APPLICATION_VERSION_CONFLICT", kind: "conflict", message: "다른 운영진이 먼저 신청 상태를 변경했습니다. 최신 내용을 다시 불러왔습니다.", refresh: true },
  { code: "APPLICATION_TRANSITION_FORBIDDEN", kind: "conflict", message: "현재 상태에서는 이 처리를 진행할 수 없습니다.", refresh: true },
  { code: "APPLICATION_APPROVAL_STATE_INVALID", kind: "conflict", message: "현재 상태에서는 가입 신청을 승인할 수 없습니다.", refresh: true },
  { code: "APPLICATION_REJECT_FORBIDDEN", kind: "conflict", message: "현재 상태에서는 가입 신청을 거절할 수 없습니다.", refresh: true },
  { code: "BODY_NOT_ALLOWED_FOR_OPERATION", kind: "validation", message: "이 처리에는 안내 내용을 함께 보낼 수 없습니다." },
  { code: "INVALID_APPLICATION_BODY", kind: "validation", message: "안내 내용은 1자 이상 1000자 이하로 입력해 주세요." },
  { code: "NONFINAL_OPERATION_REQUIRED", kind: "validation", message: "허용되지 않은 처리 방식입니다." },
  { code: "IDEMPOTENCY_KEY_REUSED", kind: "conflict", message: "이 요청은 이전 요청과 일치하지 않습니다. 다시 시도해 주세요." },
  { code: "IDEMPOTENCY_LEDGER_UNAVAILABLE", kind: "conflict", message: "요청 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.", refresh: true },
  { code: "IDEMPOTENCY_COMPLETION_FAILED", kind: "conflict", message: "처리 완료를 확인할 수 없습니다. 최신 상태를 확인해 주세요.", refresh: true },
  { code: "APPLICANT_ACCOUNT_NOT_ACTIVE", kind: "conflict", message: "신청자 계정 상태로 인해 승인할 수 없습니다.", refresh: true },
  { code: "MEMBERSHIP_APPLICATION_MEMBERSHIP_ALREADY_ACTIVE", kind: "conflict", message: "신청자가 이미 활동 회원입니다.", refresh: true },
  { code: "MEMBERSHIP_APPLICATION_MEMBERSHIP_SUSPENDED", kind: "conflict", message: "활동 정지 회원은 승인할 수 없습니다.", refresh: true },
  { code: "ACTIVE_MEMBERSHIP_EXISTS", kind: "conflict", message: "신청자가 이미 활동 회원입니다.", refresh: true },
  { code: "SUSPENDED_MEMBERSHIP_EXISTS", kind: "conflict", message: "활동 정지 회원은 승인할 수 없습니다.", refresh: true },
];

function invalidResponse(): MembershipApplicationManagementError {
  return new MembershipApplicationManagementError(
    "unknown",
    "처리 결과를 안전하게 확인할 수 없습니다. 최신 상태를 다시 불러와 주세요.",
    true,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRpcRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data) || !data.every(isRecord)) throw invalidResponse();
  return data;
}

function requireSingleRpcRow(data: unknown): Record<string, unknown> {
  const rows = requireRpcRows(data);
  if (rows.length !== 1) throw invalidResponse();
  return rows[0];
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) throw invalidResponse();
  return value;
}

function optionalString(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw invalidResponse();
  return value;
}

function uuid(row: Record<string, unknown>, key: string): string {
  const value = requiredString(row, key);
  if (!uuidPattern.test(value)) throw invalidResponse();
  return value;
}

function dateString(row: Record<string, unknown>, key: string): string {
  const value = requiredString(row, key);
  if (Number.isNaN(Date.parse(value))) throw invalidResponse();
  return value;
}

function optionalDateString(row: Record<string, unknown>, key: string): string | undefined {
  const value = optionalString(row, key);
  if (value !== undefined && Number.isNaN(Date.parse(value))) throw invalidResponse();
  return value;
}

function version(row: Record<string, unknown>, key: string): number {
  const raw = row[key];
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 1) throw invalidResponse();
  return value;
}

function boolean(row: Record<string, unknown>, key: string): boolean {
  if (typeof row[key] !== "boolean") throw invalidResponse();
  return row[key];
}

function stringArray(row: Record<string, unknown>, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0)) {
    throw invalidResponse();
  }
  return [...value];
}

function allowedString(row: Record<string, unknown>, key: string, allowed: ReadonlySet<string>): string {
  const value = requiredString(row, key);
  if (!allowed.has(value)) throw invalidResponse();
  return value;
}

function status(value: unknown): ClubMembershipApplicationStatus {
  if (typeof value !== "string" || !statuses.has(value)) throw invalidResponse();
  return value as ClubMembershipApplicationStatus;
}

function parseListItem(row: Record<string, unknown>): MembershipApplicationListItem {
  uuid(row, "club_id");
  uuid(row, "applicant_id");
  return {
    applicationId: uuid(row, "application_id"),
    applicantDisplayName: requiredString(row, "applicant_display_name"),
    status: status(row.status),
    experienceCode: allowedString(row, "experience_code", experienceCodes),
    availableDayCode: allowedString(row, "available_day_code", availableDayCodes),
    interestCodes: stringArray(row, "interest_codes").map((value) => {
      if (!interestCodes.has(value)) throw invalidResponse();
      return value;
    }),
    applicationVersion: version(row, "application_version"),
    submittedAt: dateString(row, "submitted_at"),
    statusChangedAt: dateString(row, "status_changed_at"),
  };
}

function parseDetail(row: Record<string, unknown>): MembershipApplicationDetail {
  const item = parseListItem(row);
  return {
    ...item,
    recruitmentStatusAtSubmission: allowedString(row, "recruitment_status_at_submission", recruitmentStatuses),
    applicationReason: requiredString(row, "application_reason"),
    message: optionalString(row, "message"),
    guidelinesConfirmedAt: dateString(row, "guidelines_confirmed_at"),
    guidelinesVersion: requiredString(row, "guidelines_version"),
    finalizedAt: optionalDateString(row, "finalized_at"),
    updatedAt: dateString(row, "updated_at"),
  };
}

async function rpc(supabase: SupabaseClient, name: string, args: Record<string, unknown>) {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw toMembershipApplicationManagementError(error);
    return data;
  } catch (error) {
    if (error instanceof MembershipApplicationManagementError) throw error;
    throw toMembershipApplicationManagementError(error);
  }
}

export function createManagementRequestId(): string {
  return crypto.randomUUID();
}

export function validateManagementBody(value: string, label: string): string {
  const body = value.trim();
  if (body.length < 1 || body.length > 1000) {
    throw new MembershipApplicationManagementError(
      "validation",
      `${label}은 1자 이상 1000자 이하로 입력해 주세요.`,
    );
  }
  return body;
}

export async function listMembershipApplications(
  supabase: SupabaseClient,
  clubId: string,
  statusFilter: ClubMembershipApplicationStatus | null,
  cursor?: { submittedAt: string; applicationId: string },
): Promise<MembershipApplicationListPage> {
  const data = await rpc(supabase, "list_club_membership_applications", {
    p_club_id: clubId,
    p_status: statusFilter,
    p_limit: pageSize,
    p_before_submitted_at: cursor?.submittedAt ?? null,
    p_before_application_id: cursor?.applicationId ?? null,
  });
  const items = requireRpcRows(data).map(parseListItem);
  const last = items.at(-1);
  return {
    items,
    nextCursor: items.length === pageSize && last
      ? { submittedAt: last.submittedAt, applicationId: last.applicationId }
      : undefined,
  };
}

export async function getMembershipApplicationDetailBundle(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<MembershipApplicationDetailBundle> {
  const [detailData, historyData, supplementData, noteData] = await Promise.all([
    rpc(supabase, "get_club_membership_application_for_management", { p_application_id: applicationId }),
    rpc(supabase, "list_club_membership_application_history_for_management", { p_application_id: applicationId }),
    rpc(supabase, "list_club_membership_application_supplements_for_management", { p_application_id: applicationId }),
    rpc(supabase, "list_club_membership_application_internal_notes", { p_application_id: applicationId }),
  ]);
  return {
    detail: parseDetail(requireSingleRpcRow(detailData)),
    history: requireRpcRows(historyData).map((row) => {
      uuid(row, "application_id");
      uuid(row, "club_id");
      uuid(row, "actor_user_id");
      uuid(row, "request_id");
      return {
        historyId: uuid(row, "history_id"),
        eventCode: requiredString(row, "event_code"),
        fromStatus: row.from_status === null ? undefined : status(row.from_status),
        toStatus: status(row.to_status),
        applicationVersion: version(row, "application_version"),
        createdAt: dateString(row, "created_at"),
      };
    }),
    supplements: requireRpcRows(supplementData).map((row) => {
      uuid(row, "application_id");
      uuid(row, "club_id");
      uuid(row, "author_user_id");
      const entryType = requiredString(row, "entry_type");
      if (!supplementTypes.has(entryType)) throw invalidResponse();
      return {
        supplementId: uuid(row, "supplement_id"),
        entryType: entryType as MembershipApplicationSupplement["entryType"],
        body: requiredString(row, "body"),
        createdAt: dateString(row, "created_at"),
      };
    }),
    internalNotes: requireRpcRows(noteData).map((row) => {
      uuid(row, "application_id");
      uuid(row, "club_id");
      uuid(row, "author_user_id");
      return {
        noteId: uuid(row, "note_id"),
        body: requiredString(row, "body"),
        createdAt: dateString(row, "created_at"),
      };
    }),
  };
}

type MutationResultContract = {
  applicationId: string;
  requestId: string;
  actionCode: string;
  currentStatus: ClubMembershipApplicationStatus;
  applicationVersion: number;
  relatedEntry: "required" | "null";
};

function parseMutation(data: unknown, contract: MutationResultContract): MembershipApplicationMutationResult {
  const row = requireSingleRpcRow(data);
  if (uuid(row, "request_id") !== contract.requestId) throw invalidResponse();
  uuid(row, "club_id");
  uuid(row, "applicant_id");
  if (requiredString(row, "action_code") !== contract.actionCode) throw invalidResponse();
  if (row.previous_status !== null) status(row.previous_status);
  const applicationId = uuid(row, "application_id");
  const currentStatus = status(row.current_status);
  const applicationVersion = version(row, "application_version");
  if (applicationId !== contract.applicationId) throw invalidResponse();
  if (currentStatus !== contract.currentStatus) throw invalidResponse();
  if (applicationVersion !== contract.applicationVersion) throw invalidResponse();
  if (contract.relatedEntry === "required") uuid(row, "related_entry_id");
  else if (row.related_entry_id !== null) throw invalidResponse();
  if (requiredString(row, "outcome") !== "success") throw invalidResponse();
  return {
    applicationId,
    currentStatus,
    applicationVersion,
    changed: boolean(row, "changed"),
    replayed: boolean(row, "replayed"),
    outcome: "success",
  };
}

export async function manageMembershipApplication(
  supabase: SupabaseClient,
  input: {
    applicationId: string;
    operation: ManagementOperation;
    expectedVersion: number;
    publicRequestBody: string | null;
    requestId: string;
  },
): Promise<MembershipApplicationMutationResult> {
  const resultContracts: Record<ManagementOperation, Omit<MutationResultContract, "applicationId" | "applicationVersion" | "requestId">> = {
    review: { actionCode: "membership_application.review", currentStatus: "reviewing", relatedEntry: "null" },
    request_additional_info: { actionCode: "membership_application.request_additional_info", currentStatus: "additional_info_required", relatedEntry: "required" },
    request_interview: { actionCode: "membership_application.request_interview", currentStatus: "interview_requested", relatedEntry: "null" },
    waitlist: { actionCode: "membership_application.waitlist", currentStatus: "waitlisted", relatedEntry: "null" },
    resume_review: { actionCode: "membership_application.resume_review", currentStatus: "reviewing", relatedEntry: "null" },
  };
  return parseMutation(
    await rpc(supabase, "manage_club_membership_application", {
      p_application_id: input.applicationId,
      p_operation: input.operation,
      p_expected_version: input.expectedVersion,
      p_public_request_body: input.publicRequestBody,
      p_request_id: input.requestId,
    }),
    {
      applicationId: input.applicationId,
      applicationVersion: input.expectedVersion + 1,
      requestId: input.requestId,
      ...resultContracts[input.operation],
    },
  );
}

export async function addMembershipApplicationInternalNote(
  supabase: SupabaseClient,
  applicationId: string,
  body: string,
  requestId: string,
  expectedStatus: ClubMembershipApplicationStatus,
  expectedVersion: number,
): Promise<MembershipApplicationMutationResult> {
  return parseMutation(
    await rpc(supabase, "add_club_membership_application_internal_note", {
      p_application_id: applicationId,
      p_body: body,
      p_request_id: requestId,
    }),
    {
      applicationId,
      requestId,
      actionCode: "membership_application.internal_note",
      currentStatus: expectedStatus,
      applicationVersion: expectedVersion,
      relatedEntry: "required",
    },
  );
}

export async function rejectMembershipApplication(
  supabase: SupabaseClient,
  applicationId: string,
  expectedVersion: number,
  requestId: string,
): Promise<MembershipApplicationMutationResult> {
  return parseMutation(
    await rpc(supabase, "reject_club_membership_application", {
      p_application_id: applicationId,
      p_expected_version: expectedVersion,
      p_request_id: requestId,
    }),
    {
      applicationId,
      requestId,
      actionCode: "membership_application.reject",
      currentStatus: "rejected",
      applicationVersion: expectedVersion + 1,
      relatedEntry: "null",
    },
  );
}

export async function approveMembershipApplication(
  supabase: SupabaseClient,
  applicationId: string,
  expectedVersion: number,
  requestId: string,
): Promise<MembershipApplicationApprovalResult> {
  const row = requireSingleRpcRow(await rpc(supabase, "approve_club_membership_application", {
    p_application_id: applicationId,
    p_expected_version: expectedVersion,
    p_request_id: requestId,
  }));
  if (uuid(row, "request_id") !== requestId) throw invalidResponse();
  uuid(row, "club_id");
  uuid(row, "applicant_id");
  uuid(row, "membership_id");
  uuid(row, "role_assignment_id");
  if (requiredString(row, "action_code") !== "membership_application.approve") throw invalidResponse();
  if (uuid(row, "application_id") !== applicationId) throw invalidResponse();
  if (version(row, "application_version") !== expectedVersion + 1) throw invalidResponse();
  if (row.application_status !== "approved" || row.membership_status !== "active" || row.role_code !== "club_member") {
    throw invalidResponse();
  }
  return {
    applicationId: uuid(row, "application_id"),
    applicationStatus: "approved",
    applicationVersion: version(row, "application_version"),
    membershipStatus: "active",
    roleCode: "club_member",
    membershipTransition: allowedString(
      row,
      "membership_transition",
      membershipTransitions,
    ) as MembershipApplicationApprovalResult["membershipTransition"],
    replayed: boolean(row, "replayed"),
    approvedAt: dateString(row, "approved_at"),
  };
}

export function toMembershipApplicationManagementError(error: unknown): MembershipApplicationManagementError {
  if (error instanceof MembershipApplicationManagementError) return error;
  const message = isRecord(error) && typeof error.message === "string" ? error.message : "";
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "";
  const match = mappedErrors.find((item) => message.includes(item.code) || code === item.code);
  if (match) {
    return new MembershipApplicationManagementError(match.kind, match.message, match.refresh, false);
  }
  const isNetwork = message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("fetch");
  return new MembershipApplicationManagementError(
    isNetwork ? "network" : "unknown",
    isNetwork
      ? "네트워크 응답을 확인할 수 없습니다. 같은 요청으로 다시 시도해 주세요."
      : "처리 중 문제가 발생했습니다. 최신 상태를 다시 확인해 주세요.",
    !isNetwork,
    isNetwork,
  );
}
