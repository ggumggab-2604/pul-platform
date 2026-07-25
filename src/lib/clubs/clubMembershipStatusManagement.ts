import "client-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ClubMemberCursor,
  ClubMembershipStatus,
} from "@/lib/clubs/clubMemberManagement";

export const CLUB_MEMBERSHIP_STATUS_REASON_MIN_LENGTH = 2;
export const CLUB_MEMBERSHIP_STATUS_REASON_MAX_LENGTH = 500;
export const MAX_STATUS_MUTATION_REFRESH_PAGES = 10;
export const MAX_STATUS_MUTATION_REFRESH_MEMBERS = 300;

export type ClubMembershipStatusMutationAction =
  | "suspend"
  | "resume"
  | "end"
  | "activate";
export type ClubMembershipStatusMutationOutcome = "success" | "noop";
export type ClubMemberStatusManagementFocusTarget =
  | "member_list_heading"
  | "member_detail_heading"
  | "status_refresh_warning"
  | "none";
export type ClubMembershipFilterPresence =
  | "filtered_out"
  | "still_in_filter";
export type ClubMembershipPagePresence =
  | "present_in_refreshed_results"
  | "not_present_in_refreshed_results"
  | "unknown";

export type ClubMembershipStatusMutationResult = {
  action: ClubMembershipStatusMutationAction;
  previousStatus: ClubMembershipStatus;
  currentStatus: ClubMembershipStatus;
  changed: boolean;
  replayed: boolean;
  outcome: ClubMembershipStatusMutationOutcome;
};

export type ClubMembershipStatusRequestSlot = {
  fingerprint: string;
  requestId: string;
};

export type ClubMemberBrowserSessionVerification = {
  status: "checking" | "matched" | "mismatched";
  generation: number;
  sequence: number;
};

export type ClubMemberMobileDetailRefreshSnapshot = {
  wasOpen: boolean;
  choiceGeneration: number;
  sessionGeneration: number;
  identityKey: string;
  membershipId: string;
  queryGeneration: number;
};

export type ClubMemberMobileDetailRefreshDecision =
  | "preserve_open"
  | "close_due_to_filter_exit"
  | "keep_current_user_choice"
  | "stale";

export type ClubMemberStatusFocusIdentity = {
  focusRequestGeneration: number;
  sessionGeneration: number;
  identityKey: string;
  selectedMembershipId: string | undefined;
  queryGeneration: number;
};

export type ClubMemberPaginationRestoreBudget = {
  seenCursorKeys: ReadonlySet<string>;
  fetchedPageCount: number;
  fetchedItemCount: number;
};

export type ClubMemberPaginationRestoreBudgetResult =
  | {
      status: "allowed";
      budget: ClubMemberPaginationRestoreBudget;
    }
  | {
      status: "blocked";
      reason: "repeated_cursor" | "page_limit" | "item_limit";
    };

export function createClubMemberBrowserSessionVerification(): ClubMemberBrowserSessionVerification {
  return {
    status: "checking",
    generation: 0,
    sequence: 0,
  };
}

export function beginClubMemberBrowserSessionVerification(
  current: ClubMemberBrowserSessionVerification,
  sequence: number,
): ClubMemberBrowserSessionVerification {
  if (!Number.isSafeInteger(sequence) || sequence <= current.sequence) {
    return current;
  }
  return {
    status: "checking",
    generation: current.generation,
    sequence,
  };
}

export function resolveClubMemberBrowserSessionVerification(
  current: ClubMemberBrowserSessionVerification,
  input: {
    sequence: number;
    expectedUserId: string;
    sessionUserId?: string;
  },
): ClubMemberBrowserSessionVerification {
  if (input.sequence !== current.sequence) return current;
  const matched = input.sessionUserId === input.expectedUserId;
  return {
    status: matched ? "matched" : "mismatched",
    generation:
      matched || current.status === "mismatched"
        ? current.generation
        : current.generation + 1,
    sequence: current.sequence,
  };
}

export function shouldProvideClubMemberStatusMutationContext(
  canManageMembershipStatus: boolean,
  sessionVerification: ClubMemberBrowserSessionVerification,
  currentSessionGeneration: number,
): boolean {
  return (
    canManageMembershipStatus &&
    sessionVerification.status === "matched" &&
    sessionVerification.generation === currentSessionGeneration
  );
}

export function resolveClubMemberMobileDetailAfterStatusRefresh(
  snapshot: ClubMemberMobileDetailRefreshSnapshot,
  current: {
    isMounted: boolean;
    sessionMatchesIdentity: boolean;
    mobileDetailOpen: boolean;
    choiceGeneration: number;
    sessionGeneration: number;
    identityKey: string;
    membershipId: string | undefined;
    queryGeneration: number;
    filteredOut: boolean;
    detailRefreshed: boolean;
  },
): ClubMemberMobileDetailRefreshDecision {
  if (
    !current.isMounted ||
    !current.sessionMatchesIdentity ||
    current.sessionGeneration !== snapshot.sessionGeneration ||
    current.identityKey !== snapshot.identityKey ||
    current.membershipId !== snapshot.membershipId ||
    current.queryGeneration !== snapshot.queryGeneration
  ) {
    return "stale";
  }
  if (current.filteredOut) return "close_due_to_filter_exit";
  if (
    current.choiceGeneration !== snapshot.choiceGeneration ||
    current.mobileDetailOpen !== snapshot.wasOpen ||
    !current.detailRefreshed
  ) {
    return "keep_current_user_choice";
  }
  return snapshot.wasOpen ? "preserve_open" : "keep_current_user_choice";
}

export function shouldExecuteScheduledClubMemberStatusFocus(
  scheduled: ClubMemberStatusFocusIdentity,
  current: ClubMemberStatusFocusIdentity & {
    isMounted: boolean;
    sessionMatchesIdentity: boolean;
  },
): boolean {
  return (
    current.isMounted &&
    current.sessionMatchesIdentity &&
    current.focusRequestGeneration === scheduled.focusRequestGeneration &&
    current.sessionGeneration === scheduled.sessionGeneration &&
    current.identityKey === scheduled.identityKey &&
    current.selectedMembershipId === scheduled.selectedMembershipId &&
    current.queryGeneration === scheduled.queryGeneration
  );
}

export function isVisibleClubMemberStatusFocusTarget(
  target: HTMLElement | null | undefined,
): target is HTMLElement {
  return Boolean(target?.isConnected && target.getClientRects().length > 0);
}

export function serializeClubMemberCursor(
  cursor: ClubMemberCursor | null,
): string | null {
  if (!cursor) return null;
  if (
    typeof cursor.joinedAt !== "string" ||
    cursor.joinedAt.length === 0 ||
    typeof cursor.membershipId !== "string" ||
    !uuidPattern.test(cursor.membershipId)
  ) {
    throw new ClubMembershipStatusMutationError(
      "unknown",
      "최신 회원 목록을 안전하게 확인할 수 없습니다.",
    );
  }
  return JSON.stringify([cursor.joinedAt, cursor.membershipId.toLowerCase()]);
}

export function isClubMemberPaginationRestoreCursorRepeated(
  current: ClubMemberPaginationRestoreBudget,
  cursor: ClubMemberCursor | null,
): boolean {
  const cursorKey = serializeClubMemberCursor(cursor);
  return Boolean(cursorKey && current.seenCursorKeys.has(cursorKey));
}

export function createClubMemberPaginationRestoreBudget(
  firstPageItemCount: number,
): ClubMemberPaginationRestoreBudget {
  if (
    !Number.isSafeInteger(firstPageItemCount) ||
    firstPageItemCount < 0 ||
    firstPageItemCount > MAX_STATUS_MUTATION_REFRESH_MEMBERS
  ) {
    throw new ClubMembershipStatusMutationError(
      "unknown",
      "최신 회원 목록을 안전하게 확인할 수 없습니다.",
    );
  }
  return {
    seenCursorKeys: new Set<string>(),
    fetchedPageCount: 1,
    fetchedItemCount: firstPageItemCount,
  };
}

export function claimClubMemberPaginationRestoreCursor(
  current: ClubMemberPaginationRestoreBudget,
  cursor: ClubMemberCursor,
): ClubMemberPaginationRestoreBudgetResult {
  if (current.fetchedPageCount >= MAX_STATUS_MUTATION_REFRESH_PAGES) {
    return { status: "blocked", reason: "page_limit" };
  }
  const cursorKey = serializeClubMemberCursor(cursor);
  if (!cursorKey || current.seenCursorKeys.has(cursorKey)) {
    return { status: "blocked", reason: "repeated_cursor" };
  }
  const seenCursorKeys = new Set(current.seenCursorKeys);
  seenCursorKeys.add(cursorKey);
  return {
    status: "allowed",
    budget: {
      seenCursorKeys,
      fetchedPageCount: current.fetchedPageCount + 1,
      fetchedItemCount: current.fetchedItemCount,
    },
  };
}

export function recordClubMemberPaginationRestorePage(
  current: ClubMemberPaginationRestoreBudget,
  rawPageItemCount: number,
): ClubMemberPaginationRestoreBudgetResult {
  if (
    !Number.isSafeInteger(rawPageItemCount) ||
    rawPageItemCount < 0 ||
    current.fetchedItemCount + rawPageItemCount >
      MAX_STATUS_MUTATION_REFRESH_MEMBERS
  ) {
    return { status: "blocked", reason: "item_limit" };
  }
  return {
    status: "allowed",
    budget: {
      ...current,
      fetchedItemCount: current.fetchedItemCount + rawPageItemCount,
    },
  };
}

export function shouldBlockClubMemberStatusActions(
  statusRefreshWarning: string | undefined,
): boolean {
  return statusRefreshWarning !== undefined;
}

export type ClubMembershipStatusListRefreshResult =
  | {
      status: "success";
      filterPresence: ClubMembershipFilterPresence;
      pagePresence: ClubMembershipPagePresence;
      paginationRestored: boolean;
    }
  | {
      status: "failed";
    }
  | {
      status: "stale";
    };

export type ClubMembershipStatusDetailRefreshResult =
  | "success"
  | "failed"
  | "stale";

export type ClubMembershipStatusViewRefreshResult =
  | {
      status: "synced";
      filteredOut: boolean;
    }
  | {
      status: "refresh_failed";
      listRefreshed: boolean;
      detailRefreshed: boolean;
      filteredOut: boolean;
    }
  | {
      status: "stale_or_cancelled";
    };

export type ClubMembershipStatusMutationLifecycleResult =
  | {
      status: "mutation_failed";
      error: unknown;
    }
  | {
      status: "mutation_succeeded_and_synced";
      filteredOut: boolean;
      mutationResult: ClubMembershipStatusMutationResult;
    }
  | {
      status: "mutation_succeeded_but_refresh_failed";
      listRefreshed: boolean;
      detailRefreshed: boolean;
      filteredOut: boolean;
      mutationResult: ClubMembershipStatusMutationResult;
    }
  | {
      status: "stale_or_cancelled";
    };

export function resolveClubMemberStatusManagementFocusTarget(
  result: ClubMembershipStatusMutationLifecycleResult,
): ClubMemberStatusManagementFocusTarget {
  if (result.status === "mutation_succeeded_but_refresh_failed") {
    return "status_refresh_warning";
  }
  if (result.status === "mutation_succeeded_and_synced") {
    return result.filteredOut
      ? "member_list_heading"
      : "member_detail_heading";
  }
  return "none";
}

type ClubMembershipStatusMutationErrorKind =
  | "authentication"
  | "account"
  | "permission"
  | "protectedTarget"
  | "notFound"
  | "validation"
  | "conflict"
  | "network"
  | "unknown";

export class ClubMembershipStatusMutationError extends Error {
  constructor(
    readonly kind: ClubMembershipStatusMutationErrorKind,
    readonly userMessage: string,
    readonly shouldRefresh = false,
    readonly clearSensitiveData = false,
    readonly preserveRequestId = false,
  ) {
    super(userMessage);
    this.name = "ClubMembershipStatusMutationError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const exactResultKeys = [
  "request_id",
  "action_code",
  "club_id",
  "target_user_id",
  "membership_id",
  "previous_status",
  "current_status",
  "changed",
  "replayed",
  "outcome",
] as const;

const actionCodes: Record<ClubMembershipStatusMutationAction, string> = {
  suspend: "membership.suspend",
  resume: "membership.resume",
  end: "membership.end",
  activate: "membership.activate",
};

function invalidResponse(): ClubMembershipStatusMutationError {
  return new ClubMembershipStatusMutationError(
    "unknown",
    "회원 상태 변경 결과를 안전하게 확인할 수 없습니다. 최신 상태를 다시 확인해 주세요.",
    true,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function parseUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw invalidResponse();
  }
  return value;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidResponse();
  return value;
}

export function createClubMembershipStatusRequestId(): string {
  return crypto.randomUUID();
}

export function resolveClubMembershipStatusRequestSlot(
  current: ClubMembershipStatusRequestSlot | undefined,
  fingerprint: string,
  createRequestId: () => string = createClubMembershipStatusRequestId,
): ClubMembershipStatusRequestSlot {
  if (current?.fingerprint === fingerprint) return current;
  return {
    fingerprint,
    requestId: createRequestId(),
  };
}

export function normalizeClubMembershipStatusReason(value: string): string {
  const normalized = value.trim();
  const length = Array.from(normalized).length;
  if (
    length < CLUB_MEMBERSHIP_STATUS_REASON_MIN_LENGTH ||
    length > CLUB_MEMBERSHIP_STATUS_REASON_MAX_LENGTH
  ) {
    throw new ClubMembershipStatusMutationError(
      "validation",
      "처리 사유는 2자 이상 500자 이하로 입력해 주세요.",
    );
  }
  return normalized;
}

export function resolveClubMembershipFilterPresence(
  membershipStatusFilter: ClubMembershipStatus | null,
  currentStatus: ClubMembershipStatusMutationResult["currentStatus"],
): ClubMembershipFilterPresence {
  if (membershipStatusFilter === null) return "still_in_filter";
  return membershipStatusFilter === currentStatus
    ? "still_in_filter"
    : "filtered_out";
}

export function isClubMemberLoadedRangeRestored(
  previousLoadedItemCount: number,
  refreshedItemCount: number,
  hasMore: boolean,
): boolean {
  if (
    !Number.isSafeInteger(previousLoadedItemCount) ||
    previousLoadedItemCount < 0 ||
    !Number.isSafeInteger(refreshedItemCount) ||
    refreshedItemCount < 0
  ) {
    return false;
  }
  return refreshedItemCount >= previousLoadedItemCount || !hasMore;
}

export function parseClubMembershipStatusMutationResponse(
  value: unknown,
  expected: {
    action: ClubMembershipStatusMutationAction;
    clubId: string;
    membershipId: string;
    requestId: string;
  },
): ClubMembershipStatusMutationResult {
  try {
    const expectedClubId = parseUuid(expected.clubId);
    const expectedMembershipId = parseUuid(expected.membershipId);
    const expectedRequestId = parseUuid(expected.requestId);

    if (
      !Array.isArray(value) ||
      value.length !== 1 ||
      !isRecord(value[0]) ||
      !hasExactKeys(value[0], exactResultKeys)
    ) {
      throw invalidResponse();
    }

    const row = value[0];
    if (
      parseUuid(row.request_id) !== expectedRequestId ||
      parseUuid(row.club_id) !== expectedClubId ||
      parseUuid(row.membership_id) !== expectedMembershipId
    ) {
      throw invalidResponse();
    }

    parseUuid(row.target_user_id);

    if (row.action_code !== actionCodes[expected.action]) {
      throw invalidResponse();
    }

    const changed = parseBoolean(row.changed);
    const replayed = parseBoolean(row.replayed);
    if (row.outcome !== "success" && row.outcome !== "noop") {
      throw invalidResponse();
    }

    const isSuccess = row.outcome === "success" && changed;
    const isNoop = row.outcome === "noop" && !changed;
    const transitionIsValid = (() => {
      if (expected.action === "suspend") {
        return (
          (isSuccess &&
            row.previous_status === "active" &&
            row.current_status === "suspended") ||
          (isNoop &&
            row.previous_status === "suspended" &&
            row.current_status === "suspended")
        );
      }
      if (expected.action === "resume") {
        return (
          (isSuccess &&
            row.previous_status === "suspended" &&
            row.current_status === "active") ||
          (isNoop &&
            row.previous_status === "active" &&
            row.current_status === "active")
        );
      }
      if (expected.action === "end") {
        return (
          (isSuccess &&
            (row.previous_status === "active" ||
              row.previous_status === "suspended") &&
            row.current_status === "left") ||
          (isNoop &&
            row.previous_status === "left" &&
            row.current_status === "left")
        );
      }
      return (
        (isSuccess &&
          row.previous_status === "left" &&
          row.current_status === "active") ||
        (isNoop &&
          row.previous_status === "active" &&
          row.current_status === "active")
      );
    })();
    if (!transitionIsValid) throw invalidResponse();

    const previousStatus = row.previous_status as ClubMembershipStatus;
    const currentStatus = row.current_status as ClubMembershipStatus;

    return {
      action: expected.action,
      previousStatus,
      currentStatus,
      changed,
      replayed,
      outcome: row.outcome,
    };
  } catch (error) {
    if (error instanceof ClubMembershipStatusMutationError) throw error;
    throw invalidResponse();
  }
}

export async function refreshClubMembershipStatusView(input: {
  refreshList: () => Promise<ClubMembershipStatusListRefreshResult>;
  refreshDetail: () => Promise<ClubMembershipStatusDetailRefreshResult>;
  isCurrent: (
    phase: "after_list" | "after_detail",
    filteredOut: boolean,
  ) => boolean;
}): Promise<ClubMembershipStatusViewRefreshResult> {
  let listResult: ClubMembershipStatusListRefreshResult;
  try {
    listResult = await input.refreshList();
  } catch {
    return {
      status: "refresh_failed",
      listRefreshed: false,
      detailRefreshed: false,
      filteredOut: false,
    };
  }

  if (listResult.status === "stale") {
    return { status: "stale_or_cancelled" };
  }
  if (listResult.status === "failed") {
    if (!input.isCurrent("after_list", false)) {
      return { status: "stale_or_cancelled" };
    }
    return {
      status: "refresh_failed",
      listRefreshed: false,
      detailRefreshed: false,
      filteredOut: false,
    };
  }

  const filteredOut = listResult.filterPresence === "filtered_out";
  if (!input.isCurrent("after_list", filteredOut)) {
    return { status: "stale_or_cancelled" };
  }

  const targetPresenceMatchesFilter = filteredOut
    ? listResult.pagePresence === "not_present_in_refreshed_results"
    : listResult.pagePresence === "present_in_refreshed_results";
  const listSynchronized =
    listResult.paginationRestored && targetPresenceMatchesFilter;

  if (filteredOut && listSynchronized) {
    return {
      status: "synced",
      filteredOut: true,
    };
  }

  let detailResult: ClubMembershipStatusDetailRefreshResult;
  try {
    detailResult = await input.refreshDetail();
  } catch {
    detailResult = "failed";
  }

  if (
    detailResult === "stale" ||
    !input.isCurrent("after_detail", filteredOut)
  ) {
    return { status: "stale_or_cancelled" };
  }
  if (detailResult === "failed") {
    return {
      status: "refresh_failed",
      listRefreshed: listSynchronized,
      detailRefreshed: false,
      filteredOut,
    };
  }
  if (!listSynchronized) {
    return {
      status: "refresh_failed",
      listRefreshed: false,
      detailRefreshed: true,
      filteredOut,
    };
  }
  return {
    status: "synced",
    filteredOut,
  };
}
export async function runClubMembershipStatusMutationLifecycle(input: {
  mutate: () => Promise<ClubMembershipStatusMutationResult>;
  refreshList: () => Promise<ClubMembershipStatusListRefreshResult>;
  refreshDetail: () => Promise<ClubMembershipStatusDetailRefreshResult>;
  isCurrent: (
    phase: "after_mutation" | "after_list" | "after_detail",
    filteredOut: boolean,
  ) => boolean;
}): Promise<ClubMembershipStatusMutationLifecycleResult> {
  let mutationResult: ClubMembershipStatusMutationResult;
  try {
    mutationResult = await input.mutate();
  } catch (error) {
    if (!input.isCurrent("after_mutation", false)) {
      return { status: "stale_or_cancelled" };
    }
    return {
      status: "mutation_failed",
      error,
    };
  }

  if (!input.isCurrent("after_mutation", false)) {
    return { status: "stale_or_cancelled" };
  }

  const refreshResult = await refreshClubMembershipStatusView({
    refreshList: input.refreshList,
    refreshDetail: input.refreshDetail,
    isCurrent: (phase, filteredOut) =>
      input.isCurrent(phase, filteredOut),
  });

  if (refreshResult.status === "stale_or_cancelled") {
    return refreshResult;
  }
  if (refreshResult.status === "refresh_failed") {
    return {
      status: "mutation_succeeded_but_refresh_failed",
      listRefreshed: refreshResult.listRefreshed,
      detailRefreshed: refreshResult.detailRefreshed,
      filteredOut: refreshResult.filteredOut,
      mutationResult,
    };
  }
  return {
    status: "mutation_succeeded_and_synced",
    filteredOut: refreshResult.filteredOut,
    mutationResult,
  };
}

export function toClubMembershipStatusMutationError(
  error: unknown,
  action?: ClubMembershipStatusMutationAction,
): ClubMembershipStatusMutationError {
  if (error instanceof ClubMembershipStatusMutationError) return error;

  const record = isRecord(error) ? error : undefined;
  const code = typeof record?.code === "string" ? record.code : "";
  const message = typeof record?.message === "string" ? record.message : "";
  const includes = (fragment: string) =>
    code === fragment || message.includes(fragment);

  if (includes("로그인이 필요합니다")) {
    return new ClubMembershipStatusMutationError(
      "authentication",
      "로그인 상태를 다시 확인해 주세요.",
      false,
      true,
    );
  }
  if (includes("활성 계정만 회원 관계 작업을 수행할 수 있습니다")) {
    return new ClubMembershipStatusMutationError(
      "account",
      "현재 계정 상태에서는 회원 관리 작업을 수행할 수 없습니다.",
      false,
      true,
    );
  }
  if (includes("관리 작업으로 본인의 회원 관계를 변경할 수 없습니다")) {
    return new ClubMembershipStatusMutationError(
      "protectedTarget",
      action === "end"
        ? "본인 계정은 강제 탈퇴할 수 없습니다."
        : action === "activate"
          ? "본인 계정은 이 화면에서 재가입 처리할 수 없습니다."
          : action === "suspend" || action === "resume"
            ? "본인 계정의 회원 상태는 변경할 수 없습니다."
            : "본인 또는 회장·부회장 역할을 가진 회원의 상태는 이 화면에서 변경할 수 없습니다.",
      true,
    );
  }
  if (
    includes("회장 권한을 다른 회원에게 먼저 이전해야 합니다") ||
    includes("회장 역할이 남은 정지 회원")
  ) {
    return new ClubMembershipStatusMutationError(
      "protectedTarget",
      action === "end"
        ? "회장 회원은 강제 탈퇴할 수 없습니다."
        : action === "activate"
          ? "회장 회원은 이 화면에서 재가입 처리할 수 없습니다."
          : action === "suspend" || action === "resume"
            ? "회장 회원의 상태는 이 화면에서 변경할 수 없습니다."
            : "본인 또는 회장·부회장 역할을 가진 회원의 상태는 이 화면에서 변경할 수 없습니다.",
      true,
    );
  }
  if (includes("부회장 역할을 먼저 해제해야 합니다")) {
    return new ClubMembershipStatusMutationError(
      "protectedTarget",
      action === "end"
        ? "부회장 역할을 먼저 해제해야 합니다."
        : action === "activate"
          ? "부회장 역할이 있는 회원은 이 화면에서 재가입 처리할 수 없습니다."
          : action === "suspend" || action === "resume"
            ? "부회장 회원의 상태는 이 화면에서 변경할 수 없습니다."
            : "본인 또는 회장·부회장 역할을 가진 회원의 상태는 이 화면에서 변경할 수 없습니다.",
      true,
    );
  }
  if (
    includes("동호회 회원 관리 권한이 없습니다") ||
    includes("대상 동호회 회원 관계를 찾을 수 없거나 관리 권한이 없습니다") ||
    code === "42501"
  ) {
    return new ClubMembershipStatusMutationError(
      "permission",
      "이 회원을 처리할 권한이 없습니다.",
      false,
      true,
    );
  }
  if (
    includes("대상 동호회 회원 관계를 찾을 수 없습니다") ||
    code === "P0002"
  ) {
    return new ClubMembershipStatusMutationError(
      "notFound",
      "회원 정보를 찾을 수 없습니다.",
      true,
    );
  }
  if (
    includes("관리 사유는 2자 이상 500자 이하여야 합니다") ||
    code === "22023"
  ) {
    return new ClubMembershipStatusMutationError(
      "validation",
      "처리 사유는 2자 이상 500자 이하로 입력해 주세요.",
    );
  }
  if (includes("같은 요청 식별자를 다른 입력에 재사용할 수 없습니다")) {
    return new ClubMembershipStatusMutationError(
      "conflict",
      "이미 다른 요청으로 처리된 작업입니다. 회원 상태를 다시 확인해 주세요.",
      true,
    );
  }
  if (includes("정지된 회원은 정지 해제 작업을 사용해야 합니다")) {
    return new ClubMembershipStatusMutationError(
      "conflict",
      "현재 정지 상태에서는 바로 재가입 처리할 수 없습니다.",
      true,
    );
  }
  if (
    includes("탈퇴한 회원") ||
    includes("활성 계정만 가입 또는 정지 해제할 수 있습니다") ||
    includes("활성 동호회")
  ) {
    return new ClubMembershipStatusMutationError(
      "conflict",
      "대상 또는 동호회 상태가 변경되었습니다. 최신 상태를 다시 확인해 주세요.",
      true,
    );
  }

  const normalizedMessage = message.toLowerCase();
  if (
    code.startsWith("PGRST") ||
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("networkerror") ||
    normalizedMessage.includes("fetch")
  ) {
    return new ClubMembershipStatusMutationError(
      "network",
      "네트워크 연결을 확인한 후 다시 시도해 주세요.",
      false,
      false,
      true,
    );
  }

  return invalidResponse();
}

export async function mutateClubMembershipStatus(
  supabase: SupabaseClient,
  input: {
    action: ClubMembershipStatusMutationAction;
    clubId: string;
    membershipId: string;
    requestId: string;
    reason: string;
  },
): Promise<ClubMembershipStatusMutationResult> {
  try {
    const { data, error } =
      input.action === "end" || input.action === "activate"
        ? await supabase.rpc(
            input.action === "end"
              ? "end_club_membership_by_membership_id"
              : "activate_club_membership_by_membership_id",
            {
              p_membership_id: input.membershipId,
              p_request_id: input.requestId,
              p_reason: input.reason,
            },
          )
        : await supabase.rpc(
            input.action === "suspend"
              ? "suspend_club_membership_by_membership_id"
              : "resume_club_membership_by_membership_id",
            {
              p_club_id: input.clubId,
              p_membership_id: input.membershipId,
              p_request_id: input.requestId,
              p_reason: input.reason,
            },
          );
    if (error) throw toClubMembershipStatusMutationError(error, input.action);
    return parseClubMembershipStatusMutationResponse(data, input);
  } catch (error) {
    throw toClubMembershipStatusMutationError(error, input.action);
  }
}
