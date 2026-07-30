import type {
  ClubMemberRoleMutationAction,
  ClubMemberRoleMutationOutcome,
} from "@/lib/clubs/clubMemberRoleManagement";

export type ClubMemberMutationKind = "status" | "role";

export type ClubMemberMutationClaim = Readonly<{
  membershipId: string;
  kind: ClubMemberMutationKind;
  sessionGeneration: number;
  operationSequence: number;
}>;

export type ClubMemberRoleMutationFeedback = {
  action: ClubMemberRoleMutationAction;
  membershipId: string;
  changed: boolean;
  replayed: boolean;
  outcome: ClubMemberRoleMutationOutcome;
  mutationSucceeded: true;
  refreshSucceeded: boolean;
};

export type ClubMemberRoleRefreshRecovery = Readonly<{
  membershipId: string;
  action: ClubMemberRoleMutationAction;
  sessionGeneration: number;
  queryGeneration: number;
  loadedItemCount: number;
  listRefreshed: boolean;
  detailRefreshed: boolean;
  filteredOut: boolean;
}>;

export type ClubMemberRoleOperationState = {
  membershipId: string;
  action?: ClubMemberRoleMutationAction;
  pending: boolean;
  operationClaim?: ClubMemberMutationClaim;
  result?: ClubMemberRoleMutationFeedback;
  safeError?: string;
  refreshWarning?: string;
  refreshRecovery?: ClubMemberRoleRefreshRecovery;
  refreshRetrying: boolean;
};

export type ClubMemberMutationOperationState = {
  claims: ReadonlyMap<string, ClubMemberMutationClaim>;
  roleOperations: ReadonlyMap<string, ClubMemberRoleOperationState>;
};

export type ClubMemberRoleMutationStateView = Omit<
  ClubMemberRoleOperationState,
  "operationClaim" | "refreshRecovery"
> & {
  hasRefreshRecovery: boolean;
};

export function createClubMemberMutationClaim(input: {
  membershipId: string;
  kind: ClubMemberMutationKind;
  sessionGeneration: number;
  operationSequence: number;
}): ClubMemberMutationClaim {
  return Object.freeze({ ...input });
}

export function createClubMemberMutationOperationState(): ClubMemberMutationOperationState {
  return {
    claims: new Map(),
    roleOperations: new Map(),
  };
}

function withRoleOperation(
  state: ClubMemberMutationOperationState,
  membershipId: string,
  operation: ClubMemberRoleOperationState | undefined,
): ClubMemberMutationOperationState {
  const roleOperations = new Map(state.roleOperations);
  if (operation) {
    roleOperations.set(membershipId, operation);
  } else {
    roleOperations.delete(membershipId);
  }
  return { ...state, roleOperations };
}

export function getClubMemberRoleOperationState(
  state: ClubMemberMutationOperationState,
  membershipId: string,
): ClubMemberRoleOperationState | undefined {
  return state.roleOperations.get(membershipId);
}

export function getClubMemberRoleMutationStateView(
  state: ClubMemberMutationOperationState,
  membershipId: string,
): ClubMemberRoleMutationStateView | undefined {
  const operation = getClubMemberRoleOperationState(state, membershipId);
  if (!operation) return undefined;
  return {
    membershipId: operation.membershipId,
    action: operation.action,
    pending: operation.pending,
    result: operation.result,
    safeError: operation.safeError,
    refreshWarning: operation.refreshWarning,
    refreshRetrying: operation.refreshRetrying,
    hasRefreshRecovery: operation.refreshRecovery !== undefined,
  };
}

export function isClubMemberMutationPending(
  state: ClubMemberMutationOperationState,
  membershipId: string,
): boolean {
  return state.claims.has(membershipId);
}

export function isClubMemberRoleMutationPending(
  state: ClubMemberMutationOperationState,
  membershipId: string,
): boolean {
  return state.claims.get(membershipId)?.kind === "role";
}

export function hasClubMemberRoleRefreshRecovery(
  state: ClubMemberMutationOperationState,
  membershipId: string,
): boolean {
  return state.roleOperations.get(membershipId)?.refreshRecovery !== undefined;
}

export function ownsClubMemberMutationClaim(
  state: ClubMemberMutationOperationState,
  membershipId: string,
  claim: ClubMemberMutationClaim,
): boolean {
  return state.claims.get(membershipId) === claim;
}

export function claimClubMemberMutation(
  state: ClubMemberMutationOperationState,
  claim: ClubMemberMutationClaim,
  options: { hasExternalRefreshRecovery?: boolean } = {},
): { state: ClubMemberMutationOperationState; claimed: boolean } {
  if (
    state.claims.has(claim.membershipId) ||
    options.hasExternalRefreshRecovery === true ||
    hasClubMemberRoleRefreshRecovery(state, claim.membershipId)
  ) {
    return { state, claimed: false };
  }
  const claims = new Map(state.claims);
  claims.set(claim.membershipId, claim);
  return { state: { ...state, claims }, claimed: true };
}

export function claimClubMemberRoleOperation(
  state: ClubMemberMutationOperationState,
  claim: ClubMemberMutationClaim,
  action: ClubMemberRoleMutationAction,
  options: { hasExternalRefreshRecovery?: boolean } = {},
): { state: ClubMemberMutationOperationState; claimed: boolean } {
  if (claim.kind !== "role") return { state, claimed: false };
  const claimed = claimClubMemberMutation(state, claim, options);
  if (!claimed.claimed) return claimed;
  return {
    claimed: true,
    state: withRoleOperation(claimed.state, claim.membershipId, {
      membershipId: claim.membershipId,
      action,
      pending: true,
      operationClaim: claim,
      refreshRetrying: false,
    }),
  };
}

export function releaseClubMemberMutation(
  state: ClubMemberMutationOperationState,
  membershipId: string,
  claim: ClubMemberMutationClaim,
): ClubMemberMutationOperationState {
  if (!ownsClubMemberMutationClaim(state, membershipId, claim)) return state;
  const claims = new Map(state.claims);
  claims.delete(membershipId);
  let next: ClubMemberMutationOperationState = { ...state, claims };
  const operation = next.roleOperations.get(membershipId);
  if (operation?.operationClaim === claim && operation.pending) {
    next = withRoleOperation(next, membershipId, {
      ...operation,
      operationClaim: undefined,
      pending: false,
    });
  }
  return next;
}

export function setClubMemberRolePreflightError(
  state: ClubMemberMutationOperationState,
  membershipId: string,
  safeError: string,
): ClubMemberMutationOperationState {
  const current = state.roleOperations.get(membershipId);
  if (current?.pending || current?.refreshRecovery) return state;
  return withRoleOperation(state, membershipId, {
    membershipId,
    action: current?.action,
    pending: false,
    safeError,
    refreshRetrying: false,
  });
}

export function setClubMemberRoleOperationError(
  state: ClubMemberMutationOperationState,
  membershipId: string,
  claim: ClubMemberMutationClaim,
  safeError: string,
): ClubMemberMutationOperationState {
  const current = state.roleOperations.get(membershipId);
  if (current?.operationClaim !== claim) return state;
  return withRoleOperation(state, membershipId, {
    ...current,
    result: undefined,
    safeError,
    refreshWarning: undefined,
    refreshRecovery: undefined,
    refreshRetrying: false,
  });
}

export function setClubMemberRoleOperationResult(
  state: ClubMemberMutationOperationState,
  membershipId: string,
  claim: ClubMemberMutationClaim,
  result: ClubMemberRoleMutationFeedback,
): ClubMemberMutationOperationState {
  const current = state.roleOperations.get(membershipId);
  if (current?.operationClaim !== claim) return state;
  return withRoleOperation(state, membershipId, {
    ...current,
    result,
    safeError: undefined,
  });
}

export function setClubMemberRoleRefreshRecovery(
  state: ClubMemberMutationOperationState,
  membershipId: string,
  claim: ClubMemberMutationClaim,
  recovery: ClubMemberRoleRefreshRecovery,
  refreshWarning: string,
): ClubMemberMutationOperationState {
  const current = state.roleOperations.get(membershipId);
  if (current?.operationClaim !== claim) return state;
  return withRoleOperation(state, membershipId, {
    ...current,
    refreshWarning,
    refreshRecovery: recovery,
    refreshRetrying: false,
  });
}

export function rebaseClubMemberRoleRefreshRecoveryForQuery(
  state: ClubMemberMutationOperationState,
  membershipId: string,
  recovery: ClubMemberRoleRefreshRecovery,
  input: Readonly<{
    queryGeneration: number;
    loadedItemCount: number;
    detailRequired: boolean;
  }>,
): {
  state: ClubMemberMutationOperationState;
  recovery?: ClubMemberRoleRefreshRecovery;
} {
  const current = state.roleOperations.get(membershipId);
  if (
    current?.refreshRecovery !== recovery ||
    current.pending ||
    current.refreshRetrying
  ) {
    return { state };
  }
  if (recovery.queryGeneration === input.queryGeneration) {
    return { state, recovery };
  }
  const nextRecovery = Object.freeze({
    ...recovery,
    queryGeneration: input.queryGeneration,
    loadedItemCount: input.loadedItemCount,
    listRefreshed: false,
    detailRefreshed: !input.detailRequired,
    filteredOut: false,
  });
  return {
    recovery: nextRecovery,
    state: withRoleOperation(state, membershipId, {
      ...current,
      refreshRecovery: nextRecovery,
    }),
  };
}

export function recordClubMemberRoleRefreshRetryProgress(
  state: ClubMemberMutationOperationState,
  membershipId: string,
  recovery: ClubMemberRoleRefreshRecovery,
  progress: Pick<
    ClubMemberRoleRefreshRecovery,
    "listRefreshed" | "detailRefreshed" | "filteredOut"
  >,
): {
  state: ClubMemberMutationOperationState;
  recovery?: ClubMemberRoleRefreshRecovery;
} {
  const current = state.roleOperations.get(membershipId);
  if (
    current?.refreshRecovery !== recovery ||
    !current.refreshRetrying
  ) {
    return { state };
  }
  const nextRecovery = Object.freeze({
    ...recovery,
    listRefreshed: recovery.listRefreshed || progress.listRefreshed,
    detailRefreshed: recovery.detailRefreshed || progress.detailRefreshed,
    filteredOut: recovery.filteredOut || progress.filteredOut,
  });
  if (
    nextRecovery.listRefreshed === recovery.listRefreshed &&
    nextRecovery.detailRefreshed === recovery.detailRefreshed &&
    nextRecovery.filteredOut === recovery.filteredOut
  ) {
    return { state, recovery };
  }
  return {
    recovery: nextRecovery,
    state: withRoleOperation(state, membershipId, {
      ...current,
      refreshRecovery: nextRecovery,
    }),
  };
}

export function beginClubMemberRoleRefreshRetry(
  state: ClubMemberMutationOperationState,
  membershipId: string,
): {
  state: ClubMemberMutationOperationState;
  recovery?: ClubMemberRoleRefreshRecovery;
} {
  const current = state.roleOperations.get(membershipId);
  if (
    !current?.refreshRecovery ||
    current.pending ||
    current.refreshRetrying
  ) {
    return { state };
  }
  return {
    recovery: current.refreshRecovery,
    state: withRoleOperation(state, membershipId, {
      ...current,
      safeError: undefined,
      refreshRetrying: true,
    }),
  };
}

export function completeClubMemberRoleRefreshRetry(
  state: ClubMemberMutationOperationState,
  membershipId: string,
  recovery: ClubMemberRoleRefreshRecovery,
): ClubMemberMutationOperationState {
  const current = state.roleOperations.get(membershipId);
  if (current?.refreshRecovery !== recovery) return state;
  return withRoleOperation(state, membershipId, {
    ...current,
    result: current.result
      ? { ...current.result, refreshSucceeded: true }
      : undefined,
    safeError: undefined,
    refreshWarning: undefined,
    refreshRecovery: undefined,
    refreshRetrying: false,
  });
}

export function finishClubMemberRoleRefreshRetry(
  state: ClubMemberMutationOperationState,
  membershipId: string,
  recovery: ClubMemberRoleRefreshRecovery,
): ClubMemberMutationOperationState {
  const current = state.roleOperations.get(membershipId);
  if (
    current?.refreshRecovery !== recovery ||
    !current.refreshRetrying
  ) {
    return state;
  }
  return withRoleOperation(state, membershipId, {
    ...current,
    refreshRetrying: false,
  });
}

export function clearClubMemberRoleMutationFeedback(
  state: ClubMemberMutationOperationState,
  membershipId: string,
): ClubMemberMutationOperationState {
  const current = state.roleOperations.get(membershipId);
  if (!current) return state;
  if (current.pending) {
    return withRoleOperation(state, membershipId, {
      membershipId,
      action: current.action,
      pending: true,
      operationClaim: current.operationClaim,
      refreshRetrying: false,
    });
  }
  return withRoleOperation(state, membershipId, undefined);
}
