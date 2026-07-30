import "client-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const CLUB_MEMBER_ROLE_REASON_MIN_LENGTH = 2;
export const CLUB_MEMBER_ROLE_REASON_MAX_LENGTH = 500;

export type ClubMemberRoleMutationAction = "grant" | "revoke";
export type ClubMemberRoleMutationActionCode =
  | "role.grant_manager"
  | "role.revoke_manager";
export type ClubMemberRoleMutationOutcome = "success" | "noop";

export type ClubMemberRoleMutationResult = {
  requestId: string;
  actionCode: ClubMemberRoleMutationActionCode;
  clubId: string;
  membershipId: string;
  roleCode: "club_manager";
  roleAssignmentId: string | null;
  previousActive: boolean;
  currentActive: boolean;
  changed: boolean;
  replayed: boolean;
  outcome: ClubMemberRoleMutationOutcome;
};

export type ClubMemberRoleMutationPayload = {
  action: ClubMemberRoleMutationAction;
  clubId: string;
  membershipId: string;
  reason: string;
};

export type ClubMemberRoleRequestSlot = {
  fingerprint: string;
  requestId: string;
};

export type ClubMemberRoleMutationErrorKind =
  | "authentication"
  | "conflict"
  | "permission"
  | "protectedTarget"
  | "unavailable"
  | "inactive"
  | "validation"
  | "network"
  | "malformedResponse"
  | "unknown";

export class ClubMemberRoleMutationError extends Error {
  constructor(
    readonly kind: ClubMemberRoleMutationErrorKind,
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = "ClubMemberRoleMutationError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const exactResultKeys = [
  "request_id",
  "action_code",
  "club_id",
  "membership_id",
  "role_code",
  "role_assignment_id",
  "previous_active",
  "current_active",
  "changed",
  "replayed",
  "outcome",
] as const;
const actionCodes: Record<
  ClubMemberRoleMutationAction,
  ClubMemberRoleMutationActionCode
> = {
  grant: "role.grant_manager",
  revoke: "role.revoke_manager",
};
const rpcNames: Record<ClubMemberRoleMutationAction, string> = {
  grant: "grant_club_manager_role_by_membership",
  revoke: "revoke_club_manager_role_by_membership",
};

function invalidResponse(): ClubMemberRoleMutationError {
  return new ClubMemberRoleMutationError(
    "malformedResponse",
    "역할 변경 결과를 확인하지 못했습니다.",
  );
}

function invalidInput(): ClubMemberRoleMutationError {
  return new ClubMemberRoleMutationError(
    "validation",
    "역할 변경 요청 정보를 다시 확인해 주세요.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Reflect.ownKeys(value);
  return (
    actual.length === expected.length &&
    actual.every(
      (key) => typeof key === "string" && expected.includes(key),
    ) &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function requireInputUuid(value: unknown): string {
  if (!isUuid(value)) throw invalidInput();
  return value;
}

function parseUuid(value: unknown): string {
  if (!isUuid(value)) throw invalidResponse();
  return value;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidResponse();
  return value;
}

function assertAction(
  value: unknown,
): asserts value is ClubMemberRoleMutationAction {
  if (value !== "grant" && value !== "revoke") throw invalidInput();
}

export function createClubMemberRoleRequestId(): string {
  return crypto.randomUUID();
}

export function normalizeClubMemberRoleReason(value: string): string {
  if (typeof value !== "string") {
    throw new ClubMemberRoleMutationError(
      "validation",
      "역할 변경 사유는 2자 이상 500자 이하로 입력해 주세요.",
    );
  }
  const normalized = value.trim();
  const length = Array.from(normalized).length;
  if (
    length < CLUB_MEMBER_ROLE_REASON_MIN_LENGTH ||
    length > CLUB_MEMBER_ROLE_REASON_MAX_LENGTH
  ) {
    throw new ClubMemberRoleMutationError(
      "validation",
      "역할 변경 사유는 2자 이상 500자 이하로 입력해 주세요.",
    );
  }
  return normalized;
}

export function createClubMemberRolePayloadFingerprint(
  input: ClubMemberRoleMutationPayload,
): string {
  assertAction(input.action);
  const clubId = requireInputUuid(input.clubId);
  const membershipId = requireInputUuid(input.membershipId);
  const reason = normalizeClubMemberRoleReason(input.reason);
  return JSON.stringify([input.action, clubId, membershipId, reason]);
}

export function resolveClubMemberRoleRequestSlot(
  current: ClubMemberRoleRequestSlot | undefined,
  input: ClubMemberRoleMutationPayload,
  createRequestId: () => string = createClubMemberRoleRequestId,
): ClubMemberRoleRequestSlot {
  const fingerprint = createClubMemberRolePayloadFingerprint(input);
  if (current?.fingerprint === fingerprint) return current;
  const requestId = createRequestId();
  if (!isUuid(requestId)) throw invalidInput();
  return { fingerprint, requestId };
}

export function clearClubMemberRoleRequestSlot(): undefined {
  return undefined;
}

export function parseClubMemberRoleMutationResponse(
  value: unknown,
  expected: {
    action: ClubMemberRoleMutationAction;
    clubId: string;
    membershipId: string;
    requestId: string;
  },
): ClubMemberRoleMutationResult {
  try {
    assertAction(expected.action);
    const expectedClubId = parseUuid(expected.clubId);
    const expectedMembershipId = parseUuid(expected.membershipId);
    const expectedRequestId = parseUuid(expected.requestId);
    if (
      !Array.isArray(value) ||
      value.length !== 1 ||
      !isRecord(value[0]) ||
      "target_user_id" in value[0] ||
      !hasExactKeys(value[0], exactResultKeys)
    ) {
      throw invalidResponse();
    }

    const row = value[0];
    const requestId = parseUuid(row.request_id);
    const clubId = parseUuid(row.club_id);
    const membershipId = parseUuid(row.membership_id);
    if (
      requestId !== expectedRequestId ||
      clubId !== expectedClubId ||
      membershipId !== expectedMembershipId
    ) {
      throw invalidResponse();
    }

    const actionCode = actionCodes[expected.action];
    if (
      row.action_code !== actionCode ||
      row.role_code !== "club_manager"
    ) {
      throw invalidResponse();
    }

    const previousActive = parseBoolean(row.previous_active);
    const currentActive = parseBoolean(row.current_active);
    const changed = parseBoolean(row.changed);
    const replayed = parseBoolean(row.replayed);
    if (row.outcome !== "success" && row.outcome !== "noop") {
      throw invalidResponse();
    }
    const outcome = row.outcome;
    const isSuccess = changed && outcome === "success";
    const isNoop = !changed && outcome === "noop";
    const stateIsValid =
      expected.action === "grant"
        ? (isSuccess && !previousActive && currentActive) ||
          (isNoop && previousActive && currentActive)
        : (isSuccess && previousActive && !currentActive) ||
          (isNoop && !previousActive && !currentActive);
    if (!stateIsValid) throw invalidResponse();

    const roleAssignmentId =
      row.role_assignment_id === null
        ? null
        : parseUuid(row.role_assignment_id);
    const roleAssignmentMustBeNull =
      expected.action === "revoke" && isNoop;
    if (
      roleAssignmentMustBeNull
        ? roleAssignmentId !== null
        : roleAssignmentId === null
    ) {
      throw invalidResponse();
    }

    return {
      requestId,
      actionCode,
      clubId,
      membershipId,
      roleCode: "club_manager",
      roleAssignmentId,
      previousActive,
      currentActive,
      changed,
      replayed,
      outcome,
    };
  } catch (error) {
    if (error instanceof ClubMemberRoleMutationError) throw error;
    throw invalidResponse();
  }
}

export function toClubMemberRoleMutationError(
  error: unknown,
): ClubMemberRoleMutationError {
  if (error instanceof ClubMemberRoleMutationError) return error;
  const record = isRecord(error) ? error : undefined;
  const code = typeof record?.code === "string" ? record.code : "";
  const message = typeof record?.message === "string" ? record.message : "";
  const status = typeof record?.status === "number" ? record.status : undefined;
  const includes = (fragment: string) =>
    code === fragment || message.includes(fragment);
  const normalizedMessage = message.toLowerCase();

  if (
    error instanceof TypeError ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("networkerror") ||
    normalizedMessage.includes("network request failed") ||
    code === "NETWORK_ERROR"
  ) {
    return new ClubMemberRoleMutationError(
      "network",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  }
  if (
    includes("로그인이 필요합니다") ||
    normalizedMessage.includes("jwt") ||
    normalizedMessage.includes("session") ||
    status === 401
  ) {
    return new ClubMemberRoleMutationError(
      "authentication",
      "로그인 상태를 다시 확인해 주세요.",
    );
  }
  if (includes("같은 요청 식별자를 다른 입력에 재사용할 수 없습니다")) {
    return new ClubMemberRoleMutationError(
      "conflict",
      "이전 요청과 다른 내용이 감지됐습니다. 새 요청으로 다시 시도해 주세요.",
    );
  }
  if (
    includes("본인의 운영진 역할을 변경할 수 없습니다") ||
    includes("회장 역할을 가진 회원은 일반 역할 작업으로 변경할 수 없습니다") ||
    includes("부회장은 일반 운영진 역할 작업으로 변경할 수 없습니다")
  ) {
    return new ClubMemberRoleMutationError(
      "protectedTarget",
      "이 회원의 역할은 이 화면에서 변경할 수 없습니다.",
    );
  }
  if (
    includes(
      "대상 동호회 회원 관계를 찾을 수 없거나 역할 관리 권한이 없습니다",
    ) ||
    includes("대상 동호회 회원 관계를 찾을 수 없습니다") ||
    includes("대상 회원 계정을 찾을 수 없습니다") ||
    includes("동호회를 찾을 수 없습니다") ||
    code === "P0002"
  ) {
    return new ClubMemberRoleMutationError(
      "unavailable",
      "대상 회원을 확인할 수 없거나 역할을 변경할 수 없습니다.",
    );
  }
  if (
    includes("활성 계정만 동호회 역할 작업을 수행할 수 있습니다") ||
    includes("활성 계정의 역할만 변경할 수 있습니다") ||
    includes("정상 활동 중인 동호회 회원의 역할만 변경할 수 있습니다") ||
    includes("활성 동호회에서만 역할을 변경할 수 있습니다")
  ) {
    return new ClubMemberRoleMutationError(
      "inactive",
      "현재 상태에서는 운영진 역할을 변경할 수 없습니다.",
    );
  }
  if (
    includes("동호회 역할 관리 권한이 없습니다") ||
    includes("현재 동호회 회장만 운영진 역할을 변경할 수 있습니다") ||
    includes(
      "현재 활성 회장 또는 부회장만 일반 운영진 역할을 변경할 수 있습니다",
    ) ||
    code === "42501" ||
    status === 403
  ) {
    return new ClubMemberRoleMutationError(
      "permission",
      "운영진 역할을 관리할 권한이 없습니다.",
    );
  }
  if (
    includes("역할 변경 사유는 2자 이상 500자 이하여야 합니다") ||
    code === "22023"
  ) {
    return new ClubMemberRoleMutationError(
      "validation",
      "역할 변경 사유는 2자 이상 500자 이하로 입력해 주세요.",
    );
  }
  if (
    includes("운영진 역할 변경 결과를 확인할 수 없습니다") ||
    includes("요청 처리 기록 결과를 확인할 수 없습니다")
  ) {
    return invalidResponse();
  }
  return new ClubMemberRoleMutationError(
    "unknown",
    "운영진 역할 변경을 처리하지 못했습니다.",
  );
}

export async function mutateClubMemberRole(
  supabase: SupabaseClient,
  input: ClubMemberRoleMutationPayload & { requestId: string },
): Promise<ClubMemberRoleMutationResult> {
  try {
    assertAction(input.action);
    const clubId = requireInputUuid(input.clubId);
    const membershipId = requireInputUuid(input.membershipId);
    const requestId = requireInputUuid(input.requestId);
    const reason = normalizeClubMemberRoleReason(input.reason);
    const { data, error } = await supabase.rpc(rpcNames[input.action], {
      p_club_id: clubId,
      p_target_membership_id: membershipId,
      p_request_id: requestId,
      p_reason: reason,
    });
    if (error) throw toClubMemberRoleMutationError(error);
    return parseClubMemberRoleMutationResponse(data, {
      action: input.action,
      clubId,
      membershipId,
      requestId,
    });
  } catch (error) {
    throw toClubMemberRoleMutationError(error);
  }
}
