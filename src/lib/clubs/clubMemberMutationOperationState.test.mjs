import assert from "node:assert/strict";
import test from "node:test";

import {
  beginClubMemberRoleRefreshRetry,
  claimClubMemberMutation,
  claimClubMemberRoleOperation,
  clearClubMemberRoleMutationFeedback,
  completeClubMemberRoleRefreshRetry,
  createClubMemberMutationClaim,
  createClubMemberMutationOperationState,
  finishClubMemberRoleRefreshRetry,
  getClubMemberRoleOperationState,
  hasClubMemberRoleRefreshRecovery,
  isClubMemberMutationPending,
  ownsClubMemberMutationClaim,
  rebaseClubMemberRoleRefreshRecoveryForQuery,
  recordClubMemberRoleRefreshRetryProgress,
  releaseClubMemberMutation,
  setClubMemberRoleOperationError,
  setClubMemberRoleOperationResult,
  setClubMemberRolePreflightError,
  setClubMemberRoleRefreshRecovery,
} from "./clubMemberMutationOperationState.ts";
import { resolveClubMemberRoleRequestSlot } from "./clubMemberRoleManagement.ts";

const clubId = "11111111-1111-4111-8111-111111111111";
const membershipA = "22222222-2222-4222-8222-222222222222";
const membershipB = "22222222-2222-4222-8222-333333333333";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function feedback(membershipId, action = "grant", refreshSucceeded = false) {
  return {
    action,
    membershipId,
    changed: true,
    replayed: false,
    outcome: "success",
    mutationSucceeded: true,
    refreshSucceeded,
  };
}

function recovery(membershipId, action = "grant", progress = {}) {
  return Object.freeze({
    filteredOut: false,
    membershipId,
    action,
    sessionGeneration: 1,
    queryGeneration: 1,
    loadedItemCount: 20,
    listRefreshed: false,
    detailRefreshed: false,
    ...progress,
  });
}

function createHarness() {
  let state = createClubMemberMutationOperationState();
  let sequence = 0;
  const mutationCalls = new Map();

  function claim(kind, membershipId) {
    return createClubMemberMutationClaim({
      membershipId,
      kind,
      sessionGeneration: 1,
      operationSequence: ++sequence,
    });
  }

  function claimRole(membershipId, action = "grant", externalRecovery = false) {
    const operationClaim = claim("role", membershipId);
    const claimed = claimClubMemberRoleOperation(
      state,
      operationClaim,
      action,
      { hasExternalRefreshRecovery: externalRecovery },
    );
    state = claimed.state;
    return { operationClaim, claimed: claimed.claimed };
  }

  function claimStatus(membershipId, externalRecovery = false) {
    const operationClaim = claim("status", membershipId);
    const claimed = claimClubMemberMutation(state, operationClaim, {
      hasExternalRefreshRecovery: externalRecovery,
    });
    state = claimed.state;
    return { operationClaim, claimed: claimed.claimed };
  }

  async function runRole(
    membershipId,
    gate,
    { action = "grant", refreshFails = false } = {},
  ) {
    const { operationClaim, claimed } = claimRole(membershipId, action);
    if (!claimed) return { claimed: false };
    mutationCalls.set(membershipId, (mutationCalls.get(membershipId) ?? 0) + 1);
    try {
      await gate.promise;
      state = setClubMemberRoleOperationResult(
        state,
        membershipId,
        operationClaim,
        feedback(membershipId, action),
      );
      if (refreshFails) {
        state = setClubMemberRoleRefreshRecovery(
          state,
          membershipId,
          operationClaim,
          recovery(membershipId, action),
          "safe refresh warning",
        );
      } else {
        state = setClubMemberRoleOperationResult(
          state,
          membershipId,
          operationClaim,
          feedback(membershipId, action, true),
        );
      }
      return { claimed: true };
    } finally {
      state = releaseClubMemberMutation(state, membershipId, operationClaim);
    }
  }

  return {
    claim,
    claimRole,
    claimStatus,
    get state() {
      return state;
    },
    set state(next) {
      state = next;
    },
    mutationCalls,
    runRole,
  };
}

test("Race A: duplicate role operation is rejected while the first Promise is pending", async () => {
  const harness = createHarness();
  const gate = deferred();
  const first = harness.runRole(membershipA, gate);
  assert.equal(isClubMemberMutationPending(harness.state, membershipA), true);
  const duplicate = harness.claimRole(membershipA, "revoke");
  assert.equal(duplicate.claimed, false);
  assert.equal(harness.mutationCalls.get(membershipA), 1);
  gate.resolve();
  await first;
  assert.equal(isClubMemberMutationPending(harness.state, membershipA), false);
});

test("Race B/C: role and status share one membership gate in both directions", () => {
  const roleFirst = createHarness();
  assert.equal(roleFirst.claimRole(membershipA).claimed, true);
  assert.equal(roleFirst.claimStatus(membershipA).claimed, false);

  const statusFirst = createHarness();
  assert.equal(statusFirst.claimStatus(membershipA).claimed, true);
  assert.equal(statusFirst.claimRole(membershipA).claimed, false);
});

test("Race D: different memberships run and complete independently", async () => {
  const harness = createHarness();
  const gateA = deferred();
  const gateB = deferred();
  const pendingA = harness.runRole(membershipA, gateA);
  const pendingB = harness.runRole(membershipB, gateB, { action: "revoke" });
  assert.equal(harness.state.claims.size, 2);

  gateB.resolve();
  await pendingB;
  assert.equal(isClubMemberMutationPending(harness.state, membershipA), true);
  assert.equal(isClubMemberMutationPending(harness.state, membershipB), false);
  assert.equal(getClubMemberRoleOperationState(harness.state, membershipB).result.membershipId, membershipB);

  gateA.resolve();
  await pendingA;
  assert.equal(harness.mutationCalls.get(membershipA), 1);
  assert.equal(harness.mutationCalls.get(membershipB), 1);
  assert.equal(getClubMemberRoleOperationState(harness.state, membershipA).result.membershipId, membershipA);
});

test("Race E: A refresh recovery and B success remain isolated", async () => {
  const harness = createHarness();
  const gateA = deferred();
  const gateB = deferred();
  const pendingA = harness.runRole(membershipA, gateA, { refreshFails: true });
  const pendingB = harness.runRole(membershipB, gateB);
  gateA.resolve();
  gateB.resolve();
  await Promise.all([pendingA, pendingB]);

  assert.equal(hasClubMemberRoleRefreshRecovery(harness.state, membershipA), true);
  assert.equal(hasClubMemberRoleRefreshRecovery(harness.state, membershipB), false);
  assert.equal(getClubMemberRoleOperationState(harness.state, membershipB).result.refreshSucceeded, true);
});

test("Race F: feedback clear during pending preserves claim and request slot", async () => {
  const harness = createHarness();
  const payload = {
    action: "grant",
    clubId,
    membershipId: membershipA,
    reason: "test reason",
  };
  const slot = resolveClubMemberRoleRequestSlot(undefined, payload);
  const slots = new Map([[membershipA, slot]]);
  const gate = deferred();
  const pending = harness.runRole(membershipA, gate);

  harness.state = clearClubMemberRoleMutationFeedback(harness.state, membershipA);
  assert.equal(isClubMemberMutationPending(harness.state, membershipA), true);
  assert.equal(getClubMemberRoleOperationState(harness.state, membershipA).pending, true);
  assert.equal(resolveClubMemberRoleRequestSlot(slots.get(membershipA), payload).requestId, slot.requestId);

  gate.resolve();
  await pending;
  assert.equal(getClubMemberRoleOperationState(harness.state, membershipA).result.refreshSucceeded, true);
});

test("Race G/H: stale finally releases only its own immutable claim", () => {
  const harness = createHarness();
  const stale = harness.claim("status", membershipA);
  const first = claimClubMemberMutation(harness.state, stale);
  harness.state = first.state;
  harness.state = releaseClubMemberMutation(harness.state, membershipA, stale);
  assert.equal(isClubMemberMutationPending(harness.state, membershipA), false);

  const oldClaim = stale;
  harness.state = createClubMemberMutationOperationState();
  const replacement = harness.claim("status", membershipA);
  const second = claimClubMemberMutation(harness.state, replacement);
  harness.state = second.state;
  harness.state = releaseClubMemberMutation(harness.state, membershipA, oldClaim);
  assert.equal(ownsClubMemberMutationClaim(harness.state, membershipA, replacement), true);
});

test("Race I: same-membership opposite recovery blocks while another membership remains eligible", () => {
  const harness = createHarness();
  const { operationClaim } = harness.claimRole(membershipA);
  harness.state = setClubMemberRoleOperationResult(
    harness.state,
    membershipA,
    operationClaim,
    feedback(membershipA),
  );
  harness.state = setClubMemberRoleRefreshRecovery(
    harness.state,
    membershipA,
    operationClaim,
    recovery(membershipA),
    "safe refresh warning",
  );
  harness.state = releaseClubMemberMutation(harness.state, membershipA, operationClaim);
  assert.equal(harness.claimStatus(membershipA).claimed, false);
  assert.equal(harness.claimStatus(membershipB).claimed, true);

  const statusRecoveryHarness = createHarness();
  assert.equal(statusRecoveryHarness.claimRole(membershipA, "grant", true).claimed, false);
  assert.equal(statusRecoveryHarness.claimRole(membershipB).claimed, true);
});

test("Race J: retry performs refresh work only and clears only A recovery", () => {
  const harness = createHarness();
  for (const membershipId of [membershipA, membershipB]) {
    const { operationClaim } = harness.claimRole(membershipId);
    harness.state = setClubMemberRoleOperationResult(
      harness.state,
      membershipId,
      operationClaim,
      feedback(membershipId),
    );
    harness.state = setClubMemberRoleRefreshRecovery(
      harness.state,
      membershipId,
      operationClaim,
      recovery(membershipId),
      "safe refresh warning",
    );
    harness.state = releaseClubMemberMutation(
      harness.state,
      membershipId,
      operationClaim,
    );
  }

  let listFetches = 0;
  let detailFetches = 0;
  let mutationCalls = 0;
  const started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = started.state;
  assert.ok(started.recovery);
  listFetches += 1;
  detailFetches += 1;
  harness.state = completeClubMemberRoleRefreshRetry(
    harness.state,
    membershipA,
    started.recovery,
  );
  harness.state = finishClubMemberRoleRefreshRetry(
    harness.state,
    membershipA,
    started.recovery,
  );

  assert.equal(listFetches, 1);
  assert.equal(detailFetches, 1);
  assert.equal(mutationCalls, 0);
  assert.equal(hasClubMemberRoleRefreshRecovery(harness.state, membershipA), false);
  assert.equal(hasClubMemberRoleRefreshRecovery(harness.state, membershipB), true);
});

test("membership feedback clear removes only completed target feedback", () => {
  const harness = createHarness();
  for (const membershipId of [membershipA, membershipB]) {
    const { operationClaim } = harness.claimRole(membershipId);
    harness.state = setClubMemberRoleOperationResult(
      harness.state,
      membershipId,
      operationClaim,
      feedback(membershipId, "grant", true),
    );
    harness.state = releaseClubMemberMutation(harness.state, membershipId, operationClaim);
  }
  harness.state = clearClubMemberRoleMutationFeedback(harness.state, membershipA);
  assert.equal(getClubMemberRoleOperationState(harness.state, membershipA), undefined);
  assert.equal(getClubMemberRoleOperationState(harness.state, membershipB).result.membershipId, membershipB);

  harness.state = setClubMemberRolePreflightError(harness.state, membershipA, "safe error");
  assert.equal(getClubMemberRoleOperationState(harness.state, membershipA).safeError, "safe error");
  harness.state = clearClubMemberRoleMutationFeedback(harness.state, membershipA);
  assert.equal(getClubMemberRoleOperationState(harness.state, membershipA), undefined);
});

test("request slots survive feedback clear and reset only with the session", () => {
  const payload = {
    action: "grant",
    clubId,
    membershipId: membershipA,
    reason: "same payload",
  };
  const first = resolveClubMemberRoleRequestSlot(undefined, payload);
  const slots = new Map([[membershipA, first]]);
  const same = resolveClubMemberRoleRequestSlot(slots.get(membershipA), payload);
  assert.equal(same.requestId, first.requestId);

  const changed = resolveClubMemberRoleRequestSlot(slots.get(membershipA), {
    ...payload,
    reason: "changed payload",
  });
  assert.notEqual(changed.requestId, first.requestId);

  slots.clear();
  const afterSessionReset = resolveClubMemberRoleRequestSlot(
    slots.get(membershipA),
    payload,
  );
  assert.notEqual(afterSessionReset.requestId, first.requestId);
});

test("retry failure keeps recovery and session reset rejects old completion", () => {
  const harness = createHarness();
  const { operationClaim } = harness.claimRole(membershipA);
  harness.state = setClubMemberRoleOperationError(
    harness.state,
    membershipA,
    operationClaim,
    "safe error",
  );
  harness.state = setClubMemberRoleRefreshRecovery(
    harness.state,
    membershipA,
    operationClaim,
    recovery(membershipA),
    "safe refresh warning",
  );
  harness.state = releaseClubMemberMutation(harness.state, membershipA, operationClaim);
  const started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = started.state;
  harness.state = finishClubMemberRoleRefreshRetry(
    harness.state,
    membershipA,
    started.recovery,
  );
  assert.equal(hasClubMemberRoleRefreshRecovery(harness.state, membershipA), true);

  harness.state = createClubMemberMutationOperationState();
  const afterOldCompletion = completeClubMemberRoleRefreshRetry(
    harness.state,
    membershipA,
    started.recovery,
  );
  assert.equal(afterOldCompletion, harness.state);
});
function attachRecovery(harness, membershipId, progress = {}) {
  const { operationClaim } = harness.claimRole(membershipId);
  const currentRecovery = recovery(membershipId, "grant", progress);
  harness.state = setClubMemberRoleOperationResult(
    harness.state,
    membershipId,
    operationClaim,
    feedback(membershipId),
  );
  harness.state = setClubMemberRoleRefreshRecovery(
    harness.state,
    membershipId,
    operationClaim,
    currentRecovery,
    "safe refresh warning",
  );
  harness.state = releaseClubMemberMutation(
    harness.state,
    membershipId,
    operationClaim,
  );
  return currentRecovery;
}

test("partial retry records newly successful list refresh", () => {
  const harness = createHarness();
  const initialRecovery = attachRecovery(harness, membershipA);
  const started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = started.state;
  const recorded = recordClubMemberRoleRefreshRetryProgress(
    harness.state,
    membershipA,
    started.recovery,
    {
      listRefreshed: true,
      detailRefreshed: false,
      filteredOut: false,
    },
  );
  harness.state = recorded.state;

  assert.notEqual(recorded.recovery, initialRecovery);
  assert.equal(recorded.recovery.listRefreshed, true);
  assert.equal(recorded.recovery.detailRefreshed, false);
  assert.equal(
    getClubMemberRoleOperationState(harness.state, membershipA).refreshRecovery,
    recorded.recovery,
  );
});

test("accumulated list progress skips list work on the next retry", () => {
  const harness = createHarness();
  attachRecovery(harness, membershipA, { listRefreshed: true });
  const started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  let listFetches = 0;
  let detailFetches = 0;

  if (!started.recovery.listRefreshed) listFetches += 1;
  if (!started.recovery.detailRefreshed) detailFetches += 1;

  assert.equal(listFetches, 0);
  assert.equal(detailFetches, 1);
});

test("detail success completes recovery after prior list success", () => {
  const harness = createHarness();
  attachRecovery(harness, membershipA, { listRefreshed: true });
  const started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = started.state;
  const recorded = recordClubMemberRoleRefreshRetryProgress(
    harness.state,
    membershipA,
    started.recovery,
    {
      listRefreshed: false,
      detailRefreshed: true,
      filteredOut: false,
    },
  );
  harness.state = recorded.state;

  assert.equal(recorded.recovery.listRefreshed, true);
  assert.equal(recorded.recovery.detailRefreshed, true);
  harness.state = completeClubMemberRoleRefreshRetry(
    harness.state,
    membershipA,
    recorded.recovery,
  );
  assert.equal(hasClubMemberRoleRefreshRecovery(harness.state, membershipA), false);
});

test("partial retry progress never regresses a prior success", () => {
  const harness = createHarness();
  const currentRecovery = attachRecovery(harness, membershipA, {
    listRefreshed: true,
  });
  const started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = started.state;
  const recorded = recordClubMemberRoleRefreshRetryProgress(
    harness.state,
    membershipA,
    started.recovery,
    {
      listRefreshed: false,
      detailRefreshed: false,
      filteredOut: false,
    },
  );

  assert.equal(recorded.state, harness.state);
  assert.equal(recorded.recovery, currentRecovery);
  assert.equal(recorded.recovery.listRefreshed, true);
});

test("recording A progress preserves B recovery by identity", () => {
  const harness = createHarness();
  attachRecovery(harness, membershipA);
  attachRecovery(harness, membershipB, { detailRefreshed: true });
  const beforeB = getClubMemberRoleOperationState(
    harness.state,
    membershipB,
  ).refreshRecovery;
  const started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = started.state;
  const recorded = recordClubMemberRoleRefreshRetryProgress(
    harness.state,
    membershipA,
    started.recovery,
    {
      listRefreshed: true,
      detailRefreshed: false,
      filteredOut: false,
    },
  );
  harness.state = recorded.state;

  assert.equal(
    getClubMemberRoleOperationState(harness.state, membershipB).refreshRecovery,
    beforeB,
  );
  assert.equal(beforeB.detailRefreshed, true);
});

test("an old recovery identity cannot overwrite a replacement recovery", () => {
  const harness = createHarness();
  const oldRecovery = attachRecovery(harness, membershipA);
  let started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = completeClubMemberRoleRefreshRetry(
    started.state,
    membershipA,
    started.recovery,
  );
  harness.state = clearClubMemberRoleMutationFeedback(
    harness.state,
    membershipA,
  );
  const replacement = attachRecovery(harness, membershipA, {
    detailRefreshed: true,
  });
  started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = started.state;
  const before = harness.state;
  const recorded = recordClubMemberRoleRefreshRetryProgress(
    harness.state,
    membershipA,
    oldRecovery,
    {
      listRefreshed: true,
      detailRefreshed: true,
      filteredOut: true,
    },
  );

  assert.equal(recorded.state, before);
  assert.equal(recorded.recovery, undefined);
  assert.equal(
    getClubMemberRoleOperationState(harness.state, membershipA).refreshRecovery,
    replacement,
  );
});

test("session reset rejects an old retry completion", () => {
  const harness = createHarness();
  attachRecovery(harness, membershipA);
  const started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = createClubMemberMutationOperationState();
  const before = harness.state;
  const recorded = recordClubMemberRoleRefreshRetryProgress(
    harness.state,
    membershipA,
    started.recovery,
    {
      listRefreshed: true,
      detailRefreshed: true,
      filteredOut: true,
    },
  );

  assert.equal(recorded.state, before);
  assert.equal(recorded.recovery, undefined);
  assert.equal(hasClubMemberRoleRefreshRecovery(harness.state, membershipA), false);
});

test("filtered-out progress is monotonic within one recovery identity", () => {
  const harness = createHarness();
  attachRecovery(harness, membershipA);
  let started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = started.state;
  let recorded = recordClubMemberRoleRefreshRetryProgress(
    harness.state,
    membershipA,
    started.recovery,
    {
      listRefreshed: false,
      detailRefreshed: false,
      filteredOut: true,
    },
  );
  harness.state = recorded.state;
  assert.equal(recorded.recovery.filteredOut, true);

  harness.state = finishClubMemberRoleRefreshRetry(
    harness.state,
    membershipA,
    recorded.recovery,
  );
  started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = started.state;
  recorded = recordClubMemberRoleRefreshRetryProgress(
    harness.state,
    membershipA,
    started.recovery,
    {
      listRefreshed: false,
      detailRefreshed: false,
      filteredOut: false,
    },
  );

  assert.equal(recorded.recovery.filteredOut, true);
});
test("query mismatch rebases recovery for the current query", () => {
  const harness = createHarness();
  const original = attachRecovery(harness, membershipA, {
    queryGeneration: 10,
    loadedItemCount: 30,
    listRefreshed: true,
    detailRefreshed: true,
    filteredOut: true,
  });
  const rebased = rebaseClubMemberRoleRefreshRecoveryForQuery(
    harness.state,
    membershipA,
    original,
    {
      queryGeneration: 11,
      loadedItemCount: 7,
      detailRequired: true,
    },
  );

  assert.notEqual(rebased.recovery, original);
  assert.equal(rebased.recovery.queryGeneration, 11);
  assert.equal(rebased.recovery.loadedItemCount, 7);
  assert.equal(rebased.recovery.listRefreshed, false);
  assert.equal(rebased.recovery.detailRefreshed, false);
  assert.equal(rebased.recovery.filteredOut, false);
  assert.equal(original.queryGeneration, 10);
  assert.equal(original.listRefreshed, true);
  assert.equal(original.filteredOut, true);
});

test("same query keeps the existing recovery identity and partial progress", () => {
  const harness = createHarness();
  const original = attachRecovery(harness, membershipA, {
    queryGeneration: 11,
    listRefreshed: true,
    filteredOut: true,
  });
  const before = harness.state;
  const rebased = rebaseClubMemberRoleRefreshRecoveryForQuery(
    harness.state,
    membershipA,
    original,
    {
      queryGeneration: 11,
      loadedItemCount: 99,
      detailRequired: true,
    },
  );

  assert.equal(rebased.state, before);
  assert.equal(rebased.recovery, original);
  assert.equal(rebased.recovery.listRefreshed, true);
  assert.equal(rebased.recovery.filteredOut, true);
});

test("rebasing A preserves the complete B operation by identity", () => {
  const harness = createHarness();
  const recoveryA = attachRecovery(harness, membershipA, {
    queryGeneration: 10,
    listRefreshed: true,
  });
  attachRecovery(harness, membershipB, {
    queryGeneration: 10,
    detailRefreshed: true,
  });
  const beforeB = getClubMemberRoleOperationState(harness.state, membershipB);
  const rebased = rebaseClubMemberRoleRefreshRecoveryForQuery(
    harness.state,
    membershipA,
    recoveryA,
    {
      queryGeneration: 11,
      loadedItemCount: 8,
      detailRequired: true,
    },
  );

  assert.equal(
    getClubMemberRoleOperationState(rebased.state, membershipB),
    beforeB,
  );
  assert.deepEqual(
    getClubMemberRoleOperationState(rebased.state, membershipB),
    beforeB,
  );
});

test("an old recovery identity cannot rebase a replacement", () => {
  const harness = createHarness();
  const oldRecovery = attachRecovery(harness, membershipA, {
    queryGeneration: 10,
  });
  harness.state = clearClubMemberRoleMutationFeedback(
    harness.state,
    membershipA,
  );
  const replacement = attachRecovery(harness, membershipA, {
    queryGeneration: 10,
    detailRefreshed: true,
  });
  const before = harness.state;
  const rebased = rebaseClubMemberRoleRefreshRecoveryForQuery(
    harness.state,
    membershipA,
    oldRecovery,
    {
      queryGeneration: 11,
      loadedItemCount: 4,
      detailRequired: true,
    },
  );

  assert.equal(rebased.state, before);
  assert.equal(rebased.recovery, undefined);
  assert.equal(
    getClubMemberRoleOperationState(harness.state, membershipA).refreshRecovery,
    replacement,
  );
});

test("query rebase resets an old filtered-out result", () => {
  const harness = createHarness();
  const original = attachRecovery(harness, membershipA, {
    queryGeneration: 20,
    filteredOut: true,
  });
  const rebased = rebaseClubMemberRoleRefreshRecoveryForQuery(
    harness.state,
    membershipA,
    original,
    {
      queryGeneration: 21,
      loadedItemCount: 0,
      detailRequired: false,
    },
  );

  assert.equal(rebased.recovery.filteredOut, false);
});

test("query rebase requires a current-query list refresh", () => {
  const harness = createHarness();
  const original = attachRecovery(harness, membershipA, {
    queryGeneration: 20,
    listRefreshed: true,
  });
  const rebased = rebaseClubMemberRoleRefreshRecoveryForQuery(
    harness.state,
    membershipA,
    original,
    {
      queryGeneration: 21,
      loadedItemCount: 12,
      detailRequired: false,
    },
  );

  assert.equal(rebased.recovery.listRefreshed, false);
  let listFetches = 0;
  if (!rebased.recovery.listRefreshed) listFetches += 1;
  assert.equal(listFetches, 1);
});

test("an old retry result cannot update a rebased recovery", () => {
  const harness = createHarness();
  const oldRecovery = attachRecovery(harness, membershipA, {
    queryGeneration: 20,
    listRefreshed: true,
  });
  const rebased = rebaseClubMemberRoleRefreshRecoveryForQuery(
    harness.state,
    membershipA,
    oldRecovery,
    {
      queryGeneration: 21,
      loadedItemCount: 6,
      detailRequired: true,
    },
  );
  harness.state = rebased.state;
  const started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = started.state;
  const before = harness.state;
  const recorded = recordClubMemberRoleRefreshRetryProgress(
    harness.state,
    membershipA,
    oldRecovery,
    {
      listRefreshed: true,
      detailRefreshed: true,
      filteredOut: true,
    },
  );

  assert.equal(recorded.state, before);
  assert.equal(recorded.recovery, undefined);
  assert.equal(
    getClubMemberRoleOperationState(harness.state, membershipA).refreshRecovery,
    started.recovery,
  );
});

test("session reset rejects old recovery rebase and progress", () => {
  const harness = createHarness();
  const oldRecovery = attachRecovery(harness, membershipA, {
    queryGeneration: 20,
  });
  harness.state = createClubMemberMutationOperationState();
  const before = harness.state;
  const rebased = rebaseClubMemberRoleRefreshRecoveryForQuery(
    harness.state,
    membershipA,
    oldRecovery,
    {
      queryGeneration: 21,
      loadedItemCount: 0,
      detailRequired: false,
    },
  );
  const recorded = recordClubMemberRoleRefreshRetryProgress(
    rebased.state,
    membershipA,
    oldRecovery,
    {
      listRefreshed: true,
      detailRefreshed: true,
      filteredOut: true,
    },
  );

  assert.equal(rebased.state, before);
  assert.equal(rebased.recovery, undefined);
  assert.equal(recorded.state, before);
  assert.equal(recorded.recovery, undefined);
});

test("query rebase is immutable and marks an unselected detail as unnecessary", () => {
  const harness = createHarness();
  const original = attachRecovery(harness, membershipA, {
    queryGeneration: 30,
    listRefreshed: true,
    detailRefreshed: false,
    filteredOut: true,
  });
  const beforeState = harness.state;
  const beforeMap = beforeState.roleOperations;
  const beforeOperation = getClubMemberRoleOperationState(
    beforeState,
    membershipA,
  );
  const rebased = rebaseClubMemberRoleRefreshRecoveryForQuery(
    beforeState,
    membershipA,
    original,
    {
      queryGeneration: 31,
      loadedItemCount: 5,
      detailRequired: false,
    },
  );

  assert.notEqual(rebased.state, beforeState);
  assert.notEqual(rebased.state.roleOperations, beforeMap);
  assert.equal(beforeOperation.refreshRecovery, original);
  assert.equal(beforeOperation.refreshWarning, "safe refresh warning");
  assert.equal(rebased.recovery.detailRefreshed, true);
  assert.equal(Object.isFrozen(rebased.recovery), true);
  assert.equal(
    getClubMemberRoleOperationState(rebased.state, membershipA).result,
    beforeOperation.result,
  );
  assert.equal(
    getClubMemberRoleOperationState(rebased.state, membershipA).refreshWarning,
    beforeOperation.refreshWarning,
  );
});
test("query change during an active retry waits for ownership cleanup", () => {
  const harness = createHarness();
  const original = attachRecovery(harness, membershipA, {
    queryGeneration: 40,
    listRefreshed: true,
  });
  const started = beginClubMemberRoleRefreshRetry(harness.state, membershipA);
  harness.state = started.state;
  const duringRetry = rebaseClubMemberRoleRefreshRecoveryForQuery(
    harness.state,
    membershipA,
    original,
    {
      queryGeneration: 41,
      loadedItemCount: 3,
      detailRequired: true,
    },
  );

  assert.equal(duringRetry.state, harness.state);
  assert.equal(duringRetry.recovery, undefined);
  harness.state = finishClubMemberRoleRefreshRetry(
    harness.state,
    membershipA,
    started.recovery,
  );
  assert.equal(
    getClubMemberRoleOperationState(harness.state, membershipA).refreshRetrying,
    false,
  );

  const afterCleanup = rebaseClubMemberRoleRefreshRecoveryForQuery(
    harness.state,
    membershipA,
    original,
    {
      queryGeneration: 41,
      loadedItemCount: 3,
      detailRequired: true,
    },
  );
  assert.equal(afterCleanup.recovery.queryGeneration, 41);
  assert.notEqual(afterCleanup.recovery, original);
});
