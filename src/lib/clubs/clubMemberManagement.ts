import "client-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const CLUB_MEMBER_PAGE_SIZE = 30;
export const CLUB_MEMBER_SEARCH_MAX_LENGTH = 100;

export const clubMemberRoleFilters = [
  { roleKey: "club_member", roleName: "일반회원" },
  { roleKey: "club_manager", roleName: "운영진" },
  { roleKey: "club_vice_admin", roleName: "부회장" },
  { roleKey: "club_admin", roleName: "대표운영자" },
] as const;

export type ClubMembershipStatus = "active" | "suspended" | "left";
export type ClubMemberRoleFilterKey = (typeof clubMemberRoleFilters)[number]["roleKey"];

export type ClubMemberRole = {
  roleKey: string;
  roleName: string;
};

export type ClubMemberListItem = {
  membershipId: string;
  displayName: string | null;
  joinedAt: string;
  membershipStatus: ClubMembershipStatus;
  currentRoles: ClubMemberRole[];
};

export type ClubMemberCursor = {
  joinedAt: string;
  membershipId: string;
};

export type ClubMemberListQuery = {
  search: string | null;
  membershipStatus: ClubMembershipStatus | null;
  roleKey: ClubMemberRoleFilterKey | null;
};

export type ClubMemberListResponse = {
  items: ClubMemberListItem[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: ClubMemberCursor | null;
  };
  filters: ClubMemberListQuery;
};

type ClubMemberManagementErrorKind =
  | "authentication"
  | "permission"
  | "account"
  | "validation"
  | "network"
  | "unknown";

export class ClubMemberManagementError extends Error {
  constructor(
    readonly kind: ClubMemberManagementErrorKind,
    readonly userMessage: string,
    readonly clearSensitiveData = false,
  ) {
    super(userMessage);
    this.name = "ClubMemberManagementError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const postgresTimestamptzPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const MICROSECONDS_PER_SECOND = 1_000_000;
const MICROSECONDS_PER_MINUTE = 60 * MICROSECONDS_PER_SECOND;
const MICROSECONDS_PER_DAY = 24 * 60 * MICROSECONDS_PER_MINUTE;
const membershipStatuses = new Set<string>(["active", "suspended", "left"]);
const roleFilterKeys = new Set<string>(clubMemberRoleFilters.map(({ roleKey }) => roleKey));

export type ParsedPostgresTimestamptz = {
  raw: string;
  day: number;
  microsecondsOfDay: number;
};

const mappedErrors: ReadonlyArray<{
  code: string;
  kind: ClubMemberManagementErrorKind;
  message: string;
  clearSensitiveData?: boolean;
}> = [
  {
    code: "AUTHENTICATION_REQUIRED",
    kind: "authentication",
    message: "로그인이 필요합니다.",
    clearSensitiveData: true,
  },
  {
    code: "ACCOUNT_NOT_ACTIVE",
    kind: "account",
    message: "계정 상태를 확인할 수 없습니다.",
    clearSensitiveData: true,
  },
  {
    code: "CLUB_MEMBER_READ_PERMISSION_REQUIRED",
    kind: "permission",
    message: "회원 관리 권한이 없습니다.",
    clearSensitiveData: true,
  },
  {
    code: "CLUB_REQUIRED",
    kind: "validation",
    message: "동호회 정보를 확인할 수 없습니다.",
    clearSensitiveData: true,
  },
  {
    code: "SEARCH_TOO_LONG",
    kind: "validation",
    message: "검색어가 너무 깁니다.",
  },
  {
    code: "INVALID_MEMBERSHIP_STATUS",
    kind: "validation",
    message: "올바르지 않은 회원 상태입니다.",
  },
  {
    code: "INVALID_ROLE_KEY",
    kind: "validation",
    message: "올바르지 않은 역할입니다.",
  },
  {
    code: "INVALID_PAGE_LIMIT",
    kind: "validation",
    message: "회원 목록을 불러올 수 없습니다.",
  },
  {
    code: "INVALID_PAGE_CURSOR",
    kind: "validation",
    message: "회원 목록을 이어서 불러올 수 없습니다.",
  },
];

function invalidResponse(): ClubMemberManagementError {
  return new ClubMemberManagementError("unknown", "회원 목록을 불러오지 못했습니다.");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function parseNonEmptyString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw invalidResponse();
  return value;
}

export function parseUuid(value: unknown): string {
  const parsed = parseNonEmptyString(value);
  if (parsed.length !== 36 || !uuidPattern.test(parsed)) throw invalidResponse();
  return parsed;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getDaysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function daysFromCivil(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;

  return era * 146097 + dayOfEra - 719468;
}

export function parsePostgresTimestamptz(value: unknown): ParsedPostgresTimestamptz {
  const parsed = parseNonEmptyString(value);
  const match = postgresTimestamptzPattern.exec(parsed);
  if (!match || match[0].length !== parsed.length) throw invalidResponse();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fractionalMicroseconds = Number((match[7] ?? "").padEnd(6, "0"));
  const timezone = match[8];
  const offsetHour = timezone === "Z" ? 0 : Number(match[10]);
  const offsetMinute = timezone === "Z" ? 0 : Number(match[11]);

  if (
    year === 0 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > getDaysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 15 ||
    offsetMinute > 59
  ) {
    throw invalidResponse();
  }

  const offsetDirection = timezone === "Z" ? 0 : match[9] === "+" ? 1 : -1;
  const offsetMicroseconds =
    offsetDirection * (offsetHour * 60 + offsetMinute) * MICROSECONDS_PER_MINUTE;
  let normalizedDay = daysFromCivil(year, month, day);
  let microsecondsOfDay =
    ((hour * 60 + minute) * 60 + second) * MICROSECONDS_PER_SECOND +
    fractionalMicroseconds -
    offsetMicroseconds;

  if (microsecondsOfDay < 0) {
    normalizedDay -= 1;
    microsecondsOfDay += MICROSECONDS_PER_DAY;
  } else if (microsecondsOfDay >= MICROSECONDS_PER_DAY) {
    normalizedDay += 1;
    microsecondsOfDay -= MICROSECONDS_PER_DAY;
  }

  return {
    raw: parsed,
    day: normalizedDay,
    microsecondsOfDay,
  };
}

function parseDate(value: unknown): string {
  return parsePostgresTimestamptz(value).raw;
}

export function comparePostgresTimestamptz(left: string, right: string): number {
  const parsedLeft = parsePostgresTimestamptz(left);
  const parsedRight = parsePostgresTimestamptz(right);

  if (parsedLeft.day !== parsedRight.day) {
    return parsedLeft.day < parsedRight.day ? -1 : 1;
  }
  if (parsedLeft.microsecondsOfDay === parsedRight.microsecondsOfDay) return 0;
  return parsedLeft.microsecondsOfDay < parsedRight.microsecondsOfDay ? -1 : 1;
}

function compareUuid(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  if (normalizedLeft === normalizedRight) return 0;
  return normalizedLeft < normalizedRight ? -1 : 1;
}

function compareMemberCursor(left: ClubMemberCursor, right: ClubMemberCursor): number {
  const timestampComparison = comparePostgresTimestamptz(left.joinedAt, right.joinedAt);
  return timestampComparison === 0
    ? compareUuid(left.membershipId, right.membershipId)
    : timestampComparison;
}

function parseNullableString(value: unknown): string | null {
  if (value === null) return null;
  return parseNonEmptyString(value);
}

function parseNullableDisplayName(value: unknown): string | null {
  if (value === null || typeof value === "string") return value;
  throw invalidResponse();
}

function parseRole(value: unknown): ClubMemberRole {
  if (!isRecord(value) || !hasExactKeys(value, ["role_key", "role_name"])) {
    throw invalidResponse();
  }
  return {
    roleKey: parseNonEmptyString(value.role_key),
    roleName: parseNonEmptyString(value.role_name),
  };
}

function parseItem(value: unknown): ClubMemberListItem {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "membership_id",
      "display_name",
      "joined_at",
      "membership_status",
      "current_roles",
    ]) ||
    !Array.isArray(value.current_roles) ||
    typeof value.membership_status !== "string" ||
    !membershipStatuses.has(value.membership_status)
  ) {
    throw invalidResponse();
  }

  return {
    membershipId: parseUuid(value.membership_id),
    displayName: parseNullableDisplayName(value.display_name),
    joinedAt: parseDate(value.joined_at),
    membershipStatus: value.membership_status as ClubMembershipStatus,
    currentRoles: value.current_roles.map(parseRole),
  };
}

function parseCursor(value: unknown): ClubMemberCursor {
  if (!isRecord(value) || !hasExactKeys(value, ["joined_at", "membership_id"])) {
    throw invalidResponse();
  }
  return {
    joinedAt: parseDate(value.joined_at),
    membershipId: parseUuid(value.membership_id),
  };
}

function parseResponse(
  value: unknown,
  query: ClubMemberListQuery,
  requestCursor: ClubMemberCursor | null,
): ClubMemberListResponse {
  if (!isRecord(value) || !hasExactKeys(value, ["items", "page", "filters"])) {
    throw invalidResponse();
  }
  if (!Array.isArray(value.items) || !isRecord(value.page) || !isRecord(value.filters)) {
    throw invalidResponse();
  }
  if (!hasExactKeys(value.page, ["limit", "has_more", "next_cursor"])) {
    throw invalidResponse();
  }
  if (!hasExactKeys(value.filters, ["search", "membership_status", "role_key"])) {
    throw invalidResponse();
  }
  if (
    value.page.limit !== CLUB_MEMBER_PAGE_SIZE ||
    typeof value.page.has_more !== "boolean"
  ) {
    throw invalidResponse();
  }

  const returnedSearch = parseNullableString(value.filters.search);
  const returnedMembershipStatus = parseNullableString(value.filters.membership_status);
  const returnedRoleKey = parseNullableString(value.filters.role_key);
  if (
    returnedSearch !== query.search ||
    returnedMembershipStatus !== query.membershipStatus ||
    returnedRoleKey !== query.roleKey
  ) {
    throw invalidResponse();
  }

  const nextCursor = value.page.next_cursor === null ? null : parseCursor(value.page.next_cursor);
  if (value.page.has_more !== (nextCursor !== null)) throw invalidResponse();

  const items = value.items.map(parseItem);
  if (
    items.length > CLUB_MEMBER_PAGE_SIZE ||
    new Set(items.map(({ membershipId }) => membershipId)).size !== items.length
  ) {
    throw invalidResponse();
  }
  if (value.page.has_more && items.length === 0) throw invalidResponse();
  if (nextCursor) {
    const lastItem = items.at(-1);
    if (
      items.length !== CLUB_MEMBER_PAGE_SIZE ||
      !lastItem ||
      lastItem.joinedAt !== nextCursor.joinedAt ||
      lastItem.membershipId !== nextCursor.membershipId
    ) {
      throw invalidResponse();
    }
  }
  if (requestCursor) {
    const parsedRequestCursor: ClubMemberCursor = {
      joinedAt: parseDate(requestCursor.joinedAt),
      membershipId: parseUuid(requestCursor.membershipId),
    };
    if (
      items.some((item) => compareMemberCursor(item, parsedRequestCursor) >= 0) ||
      (nextCursor && compareMemberCursor(nextCursor, parsedRequestCursor) >= 0)
    ) {
      throw invalidResponse();
    }
  }
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (compareMemberCursor(previous, current) <= 0) throw invalidResponse();
  }

  return {
    items,
    page: {
      limit: CLUB_MEMBER_PAGE_SIZE,
      hasMore: value.page.has_more,
      nextCursor,
    },
    filters: query,
  };
}

export function getClubMemberDisplayName(displayName: string | null): string {
  return displayName?.trim() ? displayName : "표시명 미설정";
}

export function normalizeClubMemberSearch(value: string): string | null {
  const normalized = value.trim();
  if (normalized.length > CLUB_MEMBER_SEARCH_MAX_LENGTH) {
    throw new ClubMemberManagementError("validation", "검색어는 100자 이하로 입력해 주세요.");
  }
  return normalized.length > 0 ? normalized : null;
}

export function isClubMembershipStatus(value: string): value is ClubMembershipStatus {
  return membershipStatuses.has(value);
}

export function isClubMemberRoleFilterKey(value: string): value is ClubMemberRoleFilterKey {
  return roleFilterKeys.has(value);
}

export function toClubMemberManagementError(error: unknown): ClubMemberManagementError {
  if (error instanceof ClubMemberManagementError) return error;

  const errorRecord = isRecord(error) ? error : undefined;
  const code = typeof errorRecord?.code === "string" ? errorRecord.code : "";
  const message = typeof errorRecord?.message === "string" ? errorRecord.message : "";
  const mapped = mappedErrors.find(({ code: knownCode }) =>
    code === knownCode || message.includes(knownCode),
  );
  if (mapped) {
    return new ClubMemberManagementError(
      mapped.kind,
      mapped.message,
      mapped.clearSensitiveData,
    );
  }

  if (code.startsWith("PGRST") || message.toLowerCase().includes("fetch")) {
    return new ClubMemberManagementError(
      "network",
      "네트워크 연결을 확인해 주세요.",
    );
  }
  return new ClubMemberManagementError("unknown", "회원 목록을 불러오지 못했습니다.");
}

export async function listClubMembersForManagement(
  supabase: SupabaseClient,
  clubId: string,
  query: ClubMemberListQuery,
  cursor: ClubMemberCursor | null = null,
): Promise<ClubMemberListResponse> {
  const { data, error } = await supabase.rpc("list_club_members_for_management", {
    p_club_id: clubId,
    p_limit: CLUB_MEMBER_PAGE_SIZE,
    p_cursor_joined_at: cursor?.joinedAt ?? null,
    p_cursor_membership_id: cursor?.membershipId ?? null,
    p_search: query.search,
    p_membership_status: query.membershipStatus,
    p_role_key: query.roleKey,
  });

  if (error) throw toClubMemberManagementError(error);
  return parseResponse(data, query, cursor);
}
