import "client-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ClubMemberManagementError,
  comparePostgresTimestamptz,
  hasExactKeys,
  isRecord,
  parseNonEmptyString,
  parsePostgresTimestamptz,
  parseUuid,
  type ClubMembershipStatus,
} from "@/lib/clubs/clubMemberManagement";

export type ClubMemberDetailRole = {
  roleKey: string;
  roleName: string;
  assignedAt: string;
};

export type ClubMemberStatusHistoryItem = {
  fromStatus: ClubMembershipStatus | null;
  toStatus: ClubMembershipStatus;
  occurredAt: string;
};

export type ClubMemberRoleHistoryItem = {
  roleKey: string;
  roleName: string;
  event: "granted" | "revoked";
  occurredAt: string;
};

export type ClubMemberDetail = {
  member: {
    membershipId: string;
    displayName: string | null;
    joinedAt: string;
    membershipStatus: ClubMembershipStatus;
    statusChangedAt: string;
    currentRoles: ClubMemberDetailRole[];
  };
  historyScope: "current_only" | "limited_history";
  statusHistory: ClubMemberStatusHistoryItem[];
  roleHistory: ClubMemberRoleHistoryItem[];
  historyMeta: {
    statusHistoryTruncated: boolean;
    roleHistoryTruncated: boolean;
  };
};

const membershipStatuses = new Set<string>(["active", "suspended", "left"]);
const roleHistoryEvents = new Set<string>(["granted", "revoked"]);

function invalidDetailResponse(): ClubMemberManagementError {
  return new ClubMemberManagementError(
    "unknown",
    "회원 상세 정보를 불러오지 못했습니다.",
  );
}

function parseCanonicalUuid(value: unknown): string {
  const parsed = parseUuid(value);
  if (parsed !== parsed.toLowerCase()) throw invalidDetailResponse();
  return parsed;
}

function parseTimestamp(value: unknown): string {
  return parsePostgresTimestamptz(value).raw;
}

function parseMembershipStatus(value: unknown): ClubMembershipStatus {
  if (typeof value !== "string" || !membershipStatuses.has(value)) {
    throw invalidDetailResponse();
  }
  return value as ClubMembershipStatus;
}

function parseNullableMembershipStatus(value: unknown): ClubMembershipStatus | null {
  return value === null ? null : parseMembershipStatus(value);
}

function parseDisplayName(value: unknown): string | null {
  if (value === null || typeof value === "string") return value;
  throw invalidDetailResponse();
}

function parseCurrentRole(value: unknown): ClubMemberDetailRole {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["role_key", "role_name", "assigned_at"])
  ) {
    throw invalidDetailResponse();
  }
  return {
    roleKey: parseNonEmptyString(value.role_key),
    roleName: parseNonEmptyString(value.role_name),
    assignedAt: parseTimestamp(value.assigned_at),
  };
}

function parseStatusHistoryItem(value: unknown): ClubMemberStatusHistoryItem {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["from_status", "to_status", "occurred_at"])
  ) {
    throw invalidDetailResponse();
  }
  return {
    fromStatus: parseNullableMembershipStatus(value.from_status),
    toStatus: parseMembershipStatus(value.to_status),
    occurredAt: parseTimestamp(value.occurred_at),
  };
}

function parseRoleHistoryItem(value: unknown): ClubMemberRoleHistoryItem {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["role_key", "role_name", "event", "occurred_at"]) ||
    typeof value.event !== "string" ||
    !roleHistoryEvents.has(value.event)
  ) {
    throw invalidDetailResponse();
  }
  return {
    roleKey: parseNonEmptyString(value.role_key),
    roleName: parseNonEmptyString(value.role_name),
    event: value.event as ClubMemberRoleHistoryItem["event"],
    occurredAt: parseTimestamp(value.occurred_at),
  };
}

function assertDescending(items: ReadonlyArray<{ occurredAt: string }>): void {
  for (let index = 1; index < items.length; index += 1) {
    if (comparePostgresTimestamptz(items[index - 1].occurredAt, items[index].occurredAt) < 0) {
      throw invalidDetailResponse();
    }
  }
}

export function parseClubMemberDetailResponse(
  value: unknown,
  requestedMembershipId: string,
): ClubMemberDetail {
  try {
    const canonicalRequestedMembershipId = parseCanonicalUuid(requestedMembershipId);
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "member",
        "history_scope",
        "status_history",
        "role_history",
        "history_meta",
      ]) ||
      !isRecord(value.member) ||
      !hasExactKeys(value.member, [
        "membership_id",
        "display_name",
        "joined_at",
        "membership_status",
        "status_changed_at",
        "current_roles",
      ]) ||
      !Array.isArray(value.member.current_roles) ||
      !Array.isArray(value.status_history) ||
      !Array.isArray(value.role_history) ||
      !isRecord(value.history_meta) ||
      !hasExactKeys(value.history_meta, [
        "status_history_truncated",
        "role_history_truncated",
      ]) ||
      typeof value.history_meta.status_history_truncated !== "boolean" ||
      typeof value.history_meta.role_history_truncated !== "boolean" ||
      (value.history_scope !== "current_only" && value.history_scope !== "limited_history")
    ) {
      throw invalidDetailResponse();
    }

    const membershipId = parseCanonicalUuid(value.member.membership_id);
    if (membershipId !== canonicalRequestedMembershipId) throw invalidDetailResponse();

    const statusHistory = value.status_history.map(parseStatusHistoryItem);
    const roleHistory = value.role_history.map(parseRoleHistoryItem);
    if (statusHistory.length > 50 || roleHistory.length > 50) {
      throw invalidDetailResponse();
    }
    assertDescending(statusHistory);
    assertDescending(roleHistory);

    const statusHistoryTruncated = value.history_meta.status_history_truncated;
    const roleHistoryTruncated = value.history_meta.role_history_truncated;
    if (
      value.history_scope === "current_only" &&
      (statusHistory.length > 0 ||
        roleHistory.length > 0 ||
        statusHistoryTruncated ||
        roleHistoryTruncated)
    ) {
      throw invalidDetailResponse();
    }

    return {
      member: {
        membershipId,
        displayName: parseDisplayName(value.member.display_name),
        joinedAt: parseTimestamp(value.member.joined_at),
        membershipStatus: parseMembershipStatus(value.member.membership_status),
        statusChangedAt: parseTimestamp(value.member.status_changed_at),
        currentRoles: value.member.current_roles.map(parseCurrentRole),
      },
      historyScope: value.history_scope,
      statusHistory,
      roleHistory,
      historyMeta: {
        statusHistoryTruncated,
        roleHistoryTruncated,
      },
    };
  } catch {
    throw invalidDetailResponse();
  }
}

export function toClubMemberDetailManagementError(error: unknown): ClubMemberManagementError {
  if (error instanceof ClubMemberManagementError) return error;

  const errorRecord = isRecord(error) ? error : undefined;
  const code = typeof errorRecord?.code === "string" ? errorRecord.code : "";
  const message = typeof errorRecord?.message === "string" ? errorRecord.message : "";
  const includes = (knownCode: string) => code === knownCode || message.includes(knownCode);

  if (includes("AUTHENTICATION_REQUIRED")) {
    return new ClubMemberManagementError("authentication", "로그인이 필요합니다.", true);
  }
  if (includes("ACCOUNT_NOT_ACTIVE")) {
    return new ClubMemberManagementError("account", "계정 상태를 확인할 수 없습니다.", true);
  }
  if (includes("CLUB_MEMBER_READ_PERMISSION_REQUIRED")) {
    return new ClubMemberManagementError("permission", "회원 관리 권한이 없습니다.", true);
  }
  if (includes("CLUB_REQUIRED")) {
    return new ClubMemberManagementError("validation", "동호회 정보를 확인할 수 없습니다.", true);
  }
  if (includes("MEMBERSHIP_REQUIRED") || includes("CLUB_MEMBER_NOT_FOUND_OR_FORBIDDEN")) {
    return invalidDetailResponse();
  }
  if (includes("CLUB_MEMBER_DATA_CONTRACT_INVALID")) {
    return invalidDetailResponse();
  }
  if (code.startsWith("PGRST") || message.toLowerCase().includes("fetch")) {
    return new ClubMemberManagementError("network", "네트워크 연결을 확인해 주세요.");
  }
  return invalidDetailResponse();
}

export async function getClubMemberDetailForManagement(
  supabase: SupabaseClient,
  clubId: string,
  membershipId: string,
): Promise<ClubMemberDetail> {
  const { data, error } = await supabase.rpc("get_club_member_detail_for_management", {
    p_club_id: clubId,
    p_membership_id: membershipId,
  });

  if (error) throw toClubMemberDetailManagementError(error);
  return parseClubMemberDetailResponse(data, membershipId);
}
