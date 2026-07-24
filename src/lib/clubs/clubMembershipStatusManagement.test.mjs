import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ClubMembershipStatusMutationError,
  MAX_STATUS_MUTATION_REFRESH_MEMBERS,
  MAX_STATUS_MUTATION_REFRESH_PAGES,
  beginClubMemberBrowserSessionVerification,
  claimClubMemberPaginationRestoreCursor,
  createClubMemberBrowserSessionVerification,
  createClubMemberPaginationRestoreBudget,
  isClubMemberLoadedRangeRestored,
  isClubMemberPaginationRestoreCursorRepeated,
  isVisibleClubMemberStatusFocusTarget,
  normalizeClubMembershipStatusReason,
  parseClubMembershipStatusMutationResponse,
  recordClubMemberPaginationRestorePage,
  refreshClubMembershipStatusView,
  resolveClubMemberBrowserSessionVerification,
  resolveClubMemberMobileDetailAfterStatusRefresh,
  resolveClubMemberStatusManagementFocusTarget,
  resolveClubMembershipFilterPresence,
  resolveClubMembershipStatusRequestSlot,
  runClubMembershipStatusMutationLifecycle,
  shouldBlockClubMemberStatusActions,
  shouldExecuteScheduledClubMemberStatusFocus,
  shouldProvideClubMemberStatusMutationContext,
} from "./clubMembershipStatusManagement.ts";

const clubId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const targetUserId = "44444444-4444-4444-8444-444444444444";

function resultRow(overrides = {}) {
  return {
    request_id: requestId,
    action_code: "membership.suspend",
    club_id: clubId,
    target_user_id: targetUserId,
    membership_id: membershipId,
    previous_status: "active",
    current_status: "suspended",
    changed: true,
    replayed: false,
    outcome: "success",
    ...overrides,
  };
}

function parse(rows, action = "suspend") {
  return parseClubMembershipStatusMutationResponse(rows, {
    action,
    clubId,
    membershipId,
    requestId,
  });
}

test("normalizes valid reasons without changing internal content", () => {
  assert.equal(normalizeClubMembershipStatusReason("  정지 사유  "), "정지 사유");
  assert.equal(normalizeClubMembershipStatusReason("사유\n확인"), "사유\n확인");
  assert.equal(normalizeClubMembershipStatusReason("특수문자 !@#"), "특수문자 !@#");
  assert.equal(normalizeClubMembershipStatusReason("가".repeat(500)), "가".repeat(500));
});

test("rejects empty, one-character, and over-limit reasons", () => {
  for (const reason of ["", "   ", "가", "가".repeat(501)]) {
    assert.throws(
      () => normalizeClubMembershipStatusReason(reason),
      ClubMembershipStatusMutationError,
    );
  }
  assert.equal(normalizeClubMembershipStatusReason("가나"), "가나");
});

test("provides mutation context only to a matched current session generation", () => {
  const checking = createClubMemberBrowserSessionVerification();
  const verifying = beginClubMemberBrowserSessionVerification(checking, 1);
  const matched = resolveClubMemberBrowserSessionVerification(verifying, {
    sequence: 1,
    expectedUserId: targetUserId,
    sessionUserId: targetUserId,
  });
  const mismatched = resolveClubMemberBrowserSessionVerification(verifying, {
    sequence: 1,
    expectedUserId: targetUserId,
    sessionUserId: clubId,
  });

  assert.equal(
    shouldProvideClubMemberStatusMutationContext(true, checking, 0),
    false,
  );
  assert.equal(
    shouldProvideClubMemberStatusMutationContext(true, matched, 0),
    true,
  );
  assert.equal(
    shouldProvideClubMemberStatusMutationContext(false, matched, 0),
    false,
  );
  assert.equal(
    shouldProvideClubMemberStatusMutationContext(true, mismatched, 1),
    false,
  );
  assert.equal(
    shouldProvideClubMemberStatusMutationContext(true, matched, 1),
    false,
  );
});

test("keeps an auth event result when an older getSession result finishes late", () => {
  const initial = beginClubMemberBrowserSessionVerification(
    createClubMemberBrowserSessionVerification(),
    1,
  );
  const eventChecking = beginClubMemberBrowserSessionVerification(initial, 2);
  const managerResult = resolveClubMemberBrowserSessionVerification(
    eventChecking,
    {
      sequence: 2,
      expectedUserId: targetUserId,
      sessionUserId: clubId,
    },
  );
  const lateAdminResult = resolveClubMemberBrowserSessionVerification(
    managerResult,
    {
      sequence: 1,
      expectedUserId: targetUserId,
      sessionUserId: targetUserId,
    },
  );

  assert.equal(managerResult.status, "mismatched");
  assert.equal(managerResult.generation, 1);
  assert.equal(lateAdminResult, managerResult);
  assert.equal(
    shouldProvideClubMemberStatusMutationContext(
      true,
      lateAdminResult,
      lateAdminResult.generation,
    ),
    false,
  );
});

test("fails closed on getSession errors and removes context on account changes", () => {
  const initial = beginClubMemberBrowserSessionVerification(
    createClubMemberBrowserSessionVerification(),
    1,
  );
  const failed = resolveClubMemberBrowserSessionVerification(initial, {
    sequence: 1,
    expectedUserId: targetUserId,
    sessionUserId: undefined,
  });
  const retrying = beginClubMemberBrowserSessionVerification(failed, 2);
  const matched = resolveClubMemberBrowserSessionVerification(retrying, {
    sequence: 2,
    expectedUserId: targetUserId,
    sessionUserId: targetUserId,
  });
  const changing = beginClubMemberBrowserSessionVerification(matched, 3);
  const signedOut = resolveClubMemberBrowserSessionVerification(changing, {
    sequence: 3,
    expectedUserId: targetUserId,
    sessionUserId: undefined,
  });

  assert.equal(failed.status, "mismatched");
  assert.equal(matched.status, "matched");
  assert.equal(signedOut.status, "mismatched");
  assert.equal(signedOut.generation, matched.generation + 1);
  assert.equal(
    shouldProvideClubMemberStatusMutationContext(
      true,
      signedOut,
      signedOut.generation,
    ),
    false,
  );
});

test("blocks stale status actions until refresh recovery succeeds", () => {
  assert.equal(shouldBlockClubMemberStatusActions(undefined), false);
  assert.equal(
    shouldBlockClubMemberStatusActions("최신 정보를 다시 확인해 주세요."),
    true,
  );
});

test("accepts a normal suspension result", () => {
  assert.deepEqual(parse([resultRow()]), {
    action: "suspend",
    previousStatus: "active",
    currentStatus: "suspended",
    changed: true,
    replayed: false,
    outcome: "success",
  });
});

test("accepts a normal resumption result", () => {
  assert.deepEqual(
    parse(
      [
        resultRow({
          action_code: "membership.resume",
          previous_status: "suspended",
          current_status: "active",
        }),
      ],
      "resume",
    ),
    {
      action: "resume",
      previousStatus: "suspended",
      currentStatus: "active",
      changed: true,
      replayed: false,
      outcome: "success",
    },
  );
});

test("accepts noop and replay results only with coherent status semantics", () => {
  assert.equal(
    parse([
      resultRow({
        previous_status: "suspended",
        changed: false,
        outcome: "noop",
      }),
    ]).outcome,
    "noop",
  );
  assert.equal(
    parse([resultRow({ replayed: true })]).replayed,
    true,
  );
  assert.equal(
    parse([
      resultRow({
        previous_status: "suspended",
        changed: false,
        replayed: true,
        outcome: "noop",
      }),
    ]).replayed,
    true,
  );
});

test("rejects empty, multiple, and malformed result rows", () => {
  assert.throws(() => parse([]), ClubMembershipStatusMutationError);
  assert.throws(
    () => parse([resultRow(), resultRow()]),
    ClubMembershipStatusMutationError,
  );
  assert.throws(
    () => parse([{ ...resultRow(), extra: true }]),
    ClubMembershipStatusMutationError,
  );
  assert.throws(
    () => parse([{ ...resultRow(), changed: "true" }]),
    ClubMembershipStatusMutationError,
  );
});

test("rejects identifier and action contract mismatches", () => {
  const invalidRows = [
    resultRow({ request_id: targetUserId }),
    resultRow({ club_id: targetUserId }),
    resultRow({ membership_id: targetUserId }),
    resultRow({ target_user_id: "not-a-uuid" }),
    resultRow({ action_code: "membership.resume" }),
  ];
  for (const row of invalidRows) {
    assert.throws(() => parse([row]), ClubMembershipStatusMutationError);
  }
});

test("rejects impossible status, changed, replay, and outcome combinations", () => {
  const invalidRows = [
    resultRow({ previous_status: "suspended" }),
    resultRow({ current_status: "active" }),
    resultRow({ changed: false }),
    resultRow({ replayed: "true" }),
    resultRow({ outcome: "unknown" }),
    resultRow({ outcome: "noop" }),
    resultRow({
      previous_status: "suspended",
      changed: true,
      outcome: "noop",
    }),
  ];
  for (const row of invalidRows) {
    assert.throws(() => parse([row]), ClubMembershipStatusMutationError);
  }
});

const successfulMutationResult = {
  action: "suspend",
  previousStatus: "active",
  currentStatus: "suspended",
  changed: true,
  replayed: false,
  outcome: "success",
};

test("resolves successful status focus targets from lifecycle results", () => {
  const synchronized = {
    status: "mutation_succeeded_and_synced",
    filteredOut: false,
    mutationResult: successfulMutationResult,
  };

  assert.equal(
    resolveClubMemberStatusManagementFocusTarget(synchronized),
    "member_detail_heading",
  );
  assert.equal(
    resolveClubMemberStatusManagementFocusTarget({
      ...synchronized,
      filteredOut: true,
    }),
    "member_list_heading",
  );
  assert.equal(
    resolveClubMemberStatusManagementFocusTarget({
      status: "mutation_succeeded_but_refresh_failed",
      listRefreshed: true,
      detailRefreshed: false,
      filteredOut: false,
      mutationResult: successfulMutationResult,
    }),
    "status_refresh_warning",
  );
  assert.equal(
    resolveClubMemberStatusManagementFocusTarget({
      status: "mutation_failed",
      error: new Error("expected test error"),
    }),
    "none",
  );
  assert.equal(
    resolveClubMemberStatusManagementFocusTarget({
      status: "stale_or_cancelled",
    }),
    "none",
  );
});

function currentLifecycle() {
  return true;
}

function successfulListRefresh(overrides = {}) {
  return {
    status: "success",
    filterPresence: "still_in_filter",
    pagePresence: "present_in_refreshed_results",
    paginationRestored: true,
    ...overrides,
  };
}

test("derives filter exit from the active status filter and mutation result", () => {
  assert.equal(
    resolveClubMembershipFilterPresence(null, "suspended"),
    "still_in_filter",
  );
  assert.equal(
    resolveClubMembershipFilterPresence("active", "suspended"),
    "filtered_out",
  );
  assert.equal(
    resolveClubMembershipFilterPresence("suspended", "active"),
    "filtered_out",
  );
  assert.equal(
    resolveClubMembershipFilterPresence("active", "active"),
    "still_in_filter",
  );
});

test("requires the previously loaded range unless the refreshed data is exhausted", () => {
  assert.equal(isClubMemberLoadedRangeRestored(60, 30, true), false);
  assert.equal(isClubMemberLoadedRangeRestored(60, 60, true), true);
  assert.equal(isClubMemberLoadedRangeRestored(60, 59, false), true);
  assert.equal(isClubMemberLoadedRangeRestored(-1, 30, false), false);
});

test("keeps mutation failures separate from refresh results", async () => {
  let refreshCalls = 0;
  const result = await runClubMembershipStatusMutationLifecycle({
    mutate: async () => {
      throw new Error("mutation failed");
    },
    refreshList: async () => {
      refreshCalls += 1;
      return successfulListRefresh();
    },
    refreshDetail: async () => "success",
    isCurrent: currentLifecycle,
  });

  assert.equal(result.status, "mutation_failed");
  assert.equal(refreshCalls, 0);
});

test("reports a fully synchronized mutation only after list and detail refresh", async () => {
  let mutationCalls = 0;
  let detailCalls = 0;
  const result = await runClubMembershipStatusMutationLifecycle({
    mutate: async () => {
      mutationCalls += 1;
      return successfulMutationResult;
    },
    refreshList: async () => successfulListRefresh(),
    refreshDetail: async () => {
      detailCalls += 1;
      return "success";
    },
    isCurrent: currentLifecycle,
  });

  assert.equal(result.status, "mutation_succeeded_and_synced");
  assert.equal(result.filteredOut, false);
  assert.equal(mutationCalls, 1);
  assert.equal(detailCalls, 1);
});

test("does not misclassify an off-page member as filtered out", async () => {
  let mutationCalls = 0;
  let detailCalls = 0;
  const result = await runClubMembershipStatusMutationLifecycle({
    mutate: async () => {
      mutationCalls += 1;
      return successfulMutationResult;
    },
    refreshList: async () => successfulListRefresh({
      pagePresence: "not_present_in_refreshed_results",
      paginationRestored: false,
    }),
    refreshDetail: async () => {
      detailCalls += 1;
      return "success";
    },
    isCurrent: currentLifecycle,
  });

  assert.equal(result.status, "mutation_succeeded_but_refresh_failed");
  assert.equal(result.filteredOut, false);
  assert.equal(result.listRefreshed, false);
  assert.equal(result.detailRefreshed, true);
  assert.equal(mutationCalls, 1);
  assert.equal(detailCalls, 1);
});

test("synchronizes an off-page member after the loaded range is restored", async () => {
  let detailCalls = 0;
  const result = await runClubMembershipStatusMutationLifecycle({
    mutate: async () => successfulMutationResult,
    refreshList: async () => successfulListRefresh(),
    refreshDetail: async () => {
      detailCalls += 1;
      return "success";
    },
    isCurrent: currentLifecycle,
  });

  assert.equal(result.status, "mutation_succeeded_and_synced");
  assert.equal(result.filteredOut, false);
  assert.equal(detailCalls, 1);
});

test("treats a restored range without the still-filtered target as partial sync", async () => {
  let detailCalls = 0;
  const result = await runClubMembershipStatusMutationLifecycle({
    mutate: async () => successfulMutationResult,
    refreshList: async () => successfulListRefresh({
      pagePresence: "not_present_in_refreshed_results",
    }),
    refreshDetail: async () => {
      detailCalls += 1;
      return "success";
    },
    isCurrent: currentLifecycle,
  });

  assert.equal(result.status, "mutation_succeeded_but_refresh_failed");
  assert.equal(result.filteredOut, false);
  assert.equal(result.listRefreshed, false);
  assert.equal(result.detailRefreshed, true);
  assert.equal(detailCalls, 1);
});

test("reports partial success when list refresh fails without repeating mutation", async () => {
  let mutationCalls = 0;
  let detailCalls = 0;
  const result = await runClubMembershipStatusMutationLifecycle({
    mutate: async () => {
      mutationCalls += 1;
      return successfulMutationResult;
    },
    refreshList: async () => ({ status: "failed" }),
    refreshDetail: async () => {
      detailCalls += 1;
      return "success";
    },
    isCurrent: currentLifecycle,
  });

  assert.deepEqual(
    {
      status: result.status,
      listRefreshed: result.listRefreshed,
      detailRefreshed: result.detailRefreshed,
    },
    {
      status: "mutation_succeeded_but_refresh_failed",
      listRefreshed: false,
      detailRefreshed: false,
    },
  );
  assert.equal(mutationCalls, 1);
  assert.equal(detailCalls, 0);
});

test("reports partial success when detail refresh fails after list refresh", async () => {
  let mutationCalls = 0;
  const result = await runClubMembershipStatusMutationLifecycle({
    mutate: async () => {
      mutationCalls += 1;
      return successfulMutationResult;
    },
    refreshList: async () => successfulListRefresh(),
    refreshDetail: async () => "failed",
    isCurrent: currentLifecycle,
  });

  assert.equal(result.status, "mutation_succeeded_but_refresh_failed");
  assert.equal(result.listRefreshed, true);
  assert.equal(result.detailRefreshed, false);
  assert.equal(mutationCalls, 1);
});

test("treats a filtered-out target as synchronized without detail refresh", async () => {
  let detailCalls = 0;
  const result = await runClubMembershipStatusMutationLifecycle({
    mutate: async () => successfulMutationResult,
    refreshList: async () => successfulListRefresh({
      filterPresence: "filtered_out",
      pagePresence: "not_present_in_refreshed_results",
    }),
    refreshDetail: async () => {
      detailCalls += 1;
      return "success";
    },
    isCurrent: currentLifecycle,
  });

  assert.equal(result.status, "mutation_succeeded_and_synced");
  assert.equal(result.filteredOut, true);
  assert.equal(detailCalls, 0);
});

test("discards a mutation result after member identity changes", async () => {
  let current = true;
  let refreshCalls = 0;
  const result = await runClubMembershipStatusMutationLifecycle({
    mutate: async () => {
      current = false;
      return successfulMutationResult;
    },
    refreshList: async () => {
      refreshCalls += 1;
      return successfulListRefresh();
    },
    refreshDetail: async () => "success",
    isCurrent: () => current,
  });

  assert.equal(result.status, "stale_or_cancelled");
  assert.equal(refreshCalls, 0);
});

test("discards refresh completion after account identity changes", async () => {
  let current = true;
  let detailCalls = 0;
  const result = await runClubMembershipStatusMutationLifecycle({
    mutate: async () => successfulMutationResult,
    refreshList: async () => {
      current = false;
      return successfulListRefresh();
    },
    refreshDetail: async () => {
      detailCalls += 1;
      return "success";
    },
    isCurrent: () => current,
  });

  assert.equal(result.status, "stale_or_cancelled");
  assert.equal(detailCalls, 0);
});

test("reuses a request ID only for the same normalized payload fingerprint", () => {
  const generatedIds = [
    "55555555-5555-4555-8555-555555555555",
    "66666666-6666-4666-8666-666666666666",
    "77777777-7777-4777-8777-777777777777",
  ];
  let generated = 0;
  const createRequestId = () => generatedIds[generated++];
  const first = resolveClubMembershipStatusRequestSlot(
    undefined,
    "member:suspend:reason",
    createRequestId,
  );
  const retry = resolveClubMembershipStatusRequestSlot(
    first,
    "member:suspend:reason",
    createRequestId,
  );
  const changedReason = resolveClubMembershipStatusRequestSlot(
    retry,
    "member:suspend:changed-reason",
    createRequestId,
  );

  const afterSuccess = resolveClubMembershipStatusRequestSlot(
    undefined,
    "member:suspend:reason",
    createRequestId,
  );

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(first.requestId, uuidPattern);
  assert.equal(retry.requestId, first.requestId);
  assert.match(changedReason.requestId, uuidPattern);
  assert.notEqual(changedReason.requestId, first.requestId);
  assert.match(afterSuccess.requestId, uuidPattern);
  assert.notEqual(afterSuccess.requestId, first.requestId);
  assert.notEqual(afterSuccess.requestId, changedReason.requestId);
  assert.equal(generated, 3);
});

test("refresh-only recovery performs reads without a mutation dependency", async () => {
  let listCalls = 0;
  let detailCalls = 0;
  const result = await refreshClubMembershipStatusView({
    refreshList: async () => {
      listCalls += 1;
      return successfulListRefresh();
    },
    refreshDetail: async () => {
      detailCalls += 1;
      return "success";
    },
    isCurrent: currentLifecycle,
  });

  assert.deepEqual(result, { status: "synced", filteredOut: false });
  assert.equal(listCalls, 1);
  assert.equal(detailCalls, 1);
});

function restoreCursor(index) {
  return {
    joinedAt: "2026-08-01T00:00:00.000000+00:00",
    membershipId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`,
  };
}

test("restores a normal two-page range within the pagination budget", () => {
  const initial = createClubMemberPaginationRestoreBudget(30);
  const claimed = claimClubMemberPaginationRestoreCursor(
    initial,
    restoreCursor(1),
  );
  assert.equal(claimed.status, "allowed");
  const recorded = recordClubMemberPaginationRestorePage(claimed.budget, 30);
  assert.equal(recorded.status, "allowed");
  assert.equal(recorded.budget.fetchedPageCount, 2);
  assert.equal(recorded.budget.fetchedItemCount, 60);
});

test("blocks an immediately repeated pagination cursor", () => {
  const cursor = restoreCursor(1);
  const first = claimClubMemberPaginationRestoreCursor(
    createClubMemberPaginationRestoreBudget(30),
    cursor,
  );
  assert.equal(first.status, "allowed");
  assert.equal(
    isClubMemberPaginationRestoreCursorRepeated(first.budget, cursor),
    true,
  );
  const repeated = claimClubMemberPaginationRestoreCursor(first.budget, cursor);
  assert.deepEqual(repeated, {
    status: "blocked",
    reason: "repeated_cursor",
  });
});

test("blocks an A to B to A pagination cursor cycle", () => {
  const first = claimClubMemberPaginationRestoreCursor(
    createClubMemberPaginationRestoreBudget(30),
    restoreCursor(1),
  );
  assert.equal(first.status, "allowed");
  const second = claimClubMemberPaginationRestoreCursor(
    first.budget,
    restoreCursor(2),
  );
  assert.equal(second.status, "allowed");
  assert.equal(
    isClubMemberPaginationRestoreCursorRepeated(
      second.budget,
      restoreCursor(1),
    ),
    true,
  );
  const cycle = claimClubMemberPaginationRestoreCursor(
    second.budget,
    restoreCursor(1),
  );
  assert.deepEqual(cycle, {
    status: "blocked",
    reason: "repeated_cursor",
  });
});

test("blocks pagination before requesting beyond the maximum page count", () => {
  let budget = createClubMemberPaginationRestoreBudget(30);
  for (let index = 1; index < MAX_STATUS_MUTATION_REFRESH_PAGES; index += 1) {
    const claimed = claimClubMemberPaginationRestoreCursor(
      budget,
      restoreCursor(index),
    );
    assert.equal(claimed.status, "allowed");
    budget = claimed.budget;
  }
  assert.equal(budget.fetchedPageCount, MAX_STATUS_MUTATION_REFRESH_PAGES);
  assert.deepEqual(
    claimClubMemberPaginationRestoreCursor(budget, restoreCursor(99)),
    { status: "blocked", reason: "page_limit" },
  );
});

test("counts raw rows and blocks pagination beyond the member budget", () => {
  const initial = createClubMemberPaginationRestoreBudget(30);
  const atLimit = recordClubMemberPaginationRestorePage(
    initial,
    MAX_STATUS_MUTATION_REFRESH_MEMBERS - 30,
  );
  assert.equal(atLimit.status, "allowed");
  assert.equal(
    atLimit.budget.fetchedItemCount,
    MAX_STATUS_MUTATION_REFRESH_MEMBERS,
  );
  assert.deepEqual(recordClubMemberPaginationRestorePage(atLimit.budget, 1), {
    status: "blocked",
    reason: "item_limit",
  });
});

test("preserves the latest mobile detail choice across refresh recovery", () => {
  const snapshot = {
    wasOpen: true,
    choiceGeneration: 4,
    sessionGeneration: 2,
    identityKey: "account-a:club-a",
    membershipId,
    queryGeneration: 7,
  };
  const current = {
    isMounted: true,
    sessionMatchesIdentity: true,
    mobileDetailOpen: true,
    choiceGeneration: 4,
    sessionGeneration: 2,
    identityKey: "account-a:club-a",
    membershipId,
    queryGeneration: 7,
    filteredOut: false,
    detailRefreshed: true,
  };

  assert.equal(
    resolveClubMemberMobileDetailAfterStatusRefresh(snapshot, current),
    "preserve_open",
  );
  assert.equal(
    resolveClubMemberMobileDetailAfterStatusRefresh(
      { ...snapshot, wasOpen: false },
      { ...current, mobileDetailOpen: false },
    ),
    "keep_current_user_choice",
  );
  assert.equal(
    resolveClubMemberMobileDetailAfterStatusRefresh(snapshot, {
      ...current,
      mobileDetailOpen: false,
      choiceGeneration: 5,
    }),
    "keep_current_user_choice",
  );
  assert.equal(
    resolveClubMemberMobileDetailAfterStatusRefresh(snapshot, {
      ...current,
      detailRefreshed: false,
    }),
    "keep_current_user_choice",
  );
  assert.equal(
    resolveClubMemberMobileDetailAfterStatusRefresh(snapshot, {
      ...current,
      filteredOut: true,
      detailRefreshed: false,
    }),
    "close_due_to_filter_exit",
  );
});

test("rejects stale mobile detail recovery snapshots", () => {
  const snapshot = {
    wasOpen: true,
    choiceGeneration: 1,
    sessionGeneration: 3,
    identityKey: "account-a:club-a",
    membershipId,
    queryGeneration: 9,
  };
  const current = {
    isMounted: true,
    sessionMatchesIdentity: true,
    mobileDetailOpen: true,
    choiceGeneration: 1,
    sessionGeneration: 3,
    identityKey: "account-a:club-a",
    membershipId,
    queryGeneration: 9,
    filteredOut: false,
    detailRefreshed: true,
  };
  const staleCases = [
    { isMounted: false },
    { sessionMatchesIdentity: false },
    { sessionGeneration: 4 },
    { identityKey: "account-b:club-a" },
    { identityKey: "account-a:club-b" },
    { membershipId: targetUserId },
    { queryGeneration: 10 },
  ];

  for (const changes of staleCases) {
    assert.equal(
      resolveClubMemberMobileDetailAfterStatusRefresh(snapshot, {
        ...current,
        ...changes,
      }),
      "stale",
    );
  }
});

test("executes status focus only for the scheduled current identity", () => {
  const scheduled = {
    focusRequestGeneration: 5,
    sessionGeneration: 3,
    identityKey: "account-a:club-a",
    selectedMembershipId: membershipId,
    queryGeneration: 8,
  };
  const current = {
    ...scheduled,
    isMounted: true,
    sessionMatchesIdentity: true,
  };

  assert.equal(
    shouldExecuteScheduledClubMemberStatusFocus(scheduled, current),
    true,
  );
  for (const changes of [
    { isMounted: false },
    { sessionMatchesIdentity: false },
    { focusRequestGeneration: 6 },
    { sessionGeneration: 4 },
    { identityKey: "account-b:club-a" },
    { identityKey: "account-a:club-b" },
    { selectedMembershipId: targetUserId },
    { queryGeneration: 9 },
  ]) {
    assert.equal(
      shouldExecuteScheduledClubMemberStatusFocus(scheduled, {
        ...current,
        ...changes,
      }),
      false,
    );
  }
});

test("focuses only connected and visible status refresh targets", () => {
  assert.equal(
    isVisibleClubMemberStatusFocusTarget({
      isConnected: true,
      getClientRects: () => [{}],
    }),
    true,
  );
  assert.equal(
    isVisibleClubMemberStatusFocusTarget({
      isConnected: false,
      getClientRects: () => [{}],
    }),
    false,
  );
  assert.equal(
    isVisibleClubMemberStatusFocusTarget({
      isConnected: true,
      getClientRects: () => [],
    }),
    false,
  );
  assert.equal(isVisibleClubMemberStatusFocusTarget(null), false);
});

test("preserves mobile detail during retry and cancels stale focus in the provider", async () => {
  const providerSource = await readFile(
    new URL(
      "../../components/clubs/manage/ClubMemberManagementProvider.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const retryStart = providerSource.indexOf("const retryStatusRefresh =");
  const mutationStart = providerSource.indexOf("const runStatusMutation =");
  const retrySource = providerSource.slice(retryStart, mutationStart);

  assert.notEqual(retryStart, -1);
  assert.notEqual(mutationStart, -1);
  assert.match(retrySource, /mobileDetailBehavior: "preserve"/);

  assert.doesNotMatch(
    retrySource,
    /loadDetail\(\s*recovery\.membershipId,\s*false/,
  );
  assert.match(retrySource, /mobileDetailSnapshot/);
  assert.match(retrySource, /mobileDetailDecision/);
  assert.match(providerSource, /const cancelPendingStatusFocus = useCallback/);
  assert.match(providerSource, /statusFocusRequestGeneration/);
  assert.match(providerSource, /shouldExecuteScheduledClubMemberStatusFocus/);
  assert.match(providerSource, /isVisibleClubMemberStatusFocusTarget/);
  assert.match(
    providerSource,
    /const closeMobileDetail = useCallback\(\(\) => \{\s*cancelPendingStatusFocus\(\)/,
  );
});

test("uses the visible member-list heading as the status focus fallback", async () => {
  const [listSource, providerSource] = await Promise.all([
    readFile(
      new URL(
        "../../components/clubs/manage/ClubMemberList.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/clubs/manage/ClubMemberManagementProvider.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(
    listSource,
    /id="club-member-list-heading"[\s\S]*?tabIndex=\{-1\}[\s\S]*?>\s*회원 목록\s*<\/h2>/,
  );
  assert.doesNotMatch(listSource, /club-member-list-focus/);
  assert.match(
    providerSource,
    /getElementById\("club-member-list-heading"\)/,
  );
});

test("routes successful dialog focus through the provider scheduler", async () => {
  const [providerSource, actionsSource] = await Promise.all([
    readFile(
      new URL(
        "../../components/clubs/manage/ClubMemberManagementProvider.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/clubs/manage/ClubMemberStatusActions.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(
    providerSource,
    /const finalizeStatusMutationUi = useCallback\([\s\S]*?resolveClubMemberStatusManagementFocusTarget\(result\)[\s\S]*?scheduleStatusManagementFocus\(focusTarget\)/,
  );
  assert.match(actionsSource, /if \(completedRef\.current\) return;/);
  assert.doesNotMatch(
    actionsSource,
    /data-club-member-status-refresh-warning|data-club-member-detail-focus|club-member-list-heading/,
  );
});

test("separates read and mutation contexts without exposing the handler", async () => {
  const providerSource = await readFile(
    new URL(
      "../../components/clubs/manage/ClubMemberManagementProvider.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const readValueStart = providerSource.indexOf("const readValue =");
  const mutationValueStart = providerSource.indexOf("const mutationValue =");
  const providerReturnStart = providerSource.indexOf("return (", mutationValueStart);

  assert.notEqual(readValueStart, -1);
  assert.notEqual(mutationValueStart, -1);
  assert.doesNotMatch(
    providerSource.slice(readValueStart, mutationValueStart),
    /runStatusMutation/,
  );
  assert.match(
    providerSource.slice(mutationValueStart, providerReturnStart),
    /runStatusMutation/,
  );
  assert.match(
    providerSource.slice(providerReturnStart),
    /provideMutationContext[\s\S]*?ClubMemberStatusMutationContext\.Provider/,
  );
});

test("shows mobile refresh recovery and blocks stale status actions", async () => {
  const [providerSource, detailSource, listSource, actionsSource] =
    await Promise.all([
      readFile(
        new URL(
          "../../components/clubs/manage/ClubMemberManagementProvider.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../components/clubs/manage/ClubMemberDetailPanel.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../components/clubs/manage/ClubMemberList.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../components/clubs/manage/ClubMemberStatusActions.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

  assert.match(
    detailSource,
    /mobileDetailOpen && statusMutation\?\.statusRefreshWarning/,
  );
  assert.match(detailSource, /club-member-detail-status-refresh-warning/);
  assert.match(listSource, /club-member-list-status-refresh-warning/);
  assert.match(
    detailSource,
    /!statusMutation\.statusActionsBlockedUntilRefresh/,
  );
  assert.match(
    actionsSource,
    /statusMutation\.statusActionsBlockedUntilRefresh/,
  );
  assert.match(providerSource, /data-club-member-status-refresh-warning/);
  assert.match(providerSource, /retryStatusRefresh/);
  assert.doesNotMatch(
    providerSource.slice(
      providerSource.indexOf("const runStatusMutation ="),
      providerSource.indexOf("const readValue ="),
    ),
    /requestIdentity === identityKey/,
  );
});


test("starts session verification fail-closed and invalidates late getSession results", async () => {
  const providerSource = await readFile(
    new URL(
      "../../components/clubs/manage/ClubMemberManagementProvider.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    providerSource.includes(
      "useState<ClubMemberBrowserSessionVerification>(\n      createClubMemberBrowserSessionVerification",
    ),
    true,
  );
  assert.equal(
    providerSource.includes("const sessionMatchesIdentity = useRef(false)"),
    true,
  );
  assert.equal(providerSource.includes("sessionVerificationSequence"), true);
  assert.ok(
    providerSource.indexOf("onAuthStateChange") <
      providerSource.indexOf(".getSession()"),
  );
  assert.equal(
    providerSource.includes(
      "sequence !== sessionVerificationSequence.current",
    ),
    true,
  );
});

test("bounds pagination restoration with cursor and raw-row guards", async () => {
  const providerSource = await readFile(
    new URL(
      "../../components/clubs/manage/ClubMemberManagementProvider.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    providerSource.includes("createClubMemberPaginationRestoreBudget"),
    true,
  );
  assert.equal(
    providerSource.includes("claimClubMemberPaginationRestoreCursor"),
    true,
  );
  assert.equal(
    providerSource.includes("recordClubMemberPaginationRestorePage"),
    true,
  );
  assert.equal(
    providerSource.includes(
      "isClubMemberPaginationRestoreCursorRepeated",
    ),
    true,
  );
  assert.equal(
    providerSource.includes('claimedCursor.status === "blocked"'),
    true,
  );
});

test("routes cancel, backdrop, and Escape through shared dialog cleanup", async () => {
  const actionsSource = await readFile(
    new URL(
      "../../components/clubs/manage/ClubMemberStatusActions.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    actionsSource.includes("const cleanupAndCloseDialog = useCallback"),
    true,
  );
  const escapeStart = actionsSource.indexOf('if (event.key === "Escape")');
  const tabStart = actionsSource.indexOf('if (event.key !== "Tab")', escapeStart);
  const escapeBranch = actionsSource.slice(escapeStart, tabStart);
  assert.notEqual(escapeStart, -1);
  assert.notEqual(tabStart, -1);
  assert.equal(escapeBranch.includes("cleanupAndCloseDialog()"), true);
  assert.equal(escapeBranch.includes("onClose()"), false);
  assert.equal(
    actionsSource.includes(
      "event.target === event.currentTarget) cleanupAndCloseDialog()",
    ),
    true,
  );
  assert.equal(
    actionsSource.includes("onClick={() => cleanupAndCloseDialog()}"),
    true,
  );
  assert.equal(
    actionsSource.includes("statusMutation?.clearStatusMutationState()"),
    true,
  );
});
