"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  ClubMemberManagementError,
  listClubMembersForManagement,
  normalizeClubMemberSearch,
  toClubMemberManagementError,
  type ClubMemberCursor,
  type ClubMemberListItem,
  type ClubMemberListQuery,
  type ClubMemberRoleFilterKey,
  type ClubMembershipStatus,
} from "@/lib/clubs/clubMemberManagement";
import {
  getClubMemberDetailForManagement,
  toClubMemberDetailManagementError,
  type ClubMemberDetail,
} from "@/lib/clubs/clubMemberDetailManagement";
import {
  beginClubMemberBrowserSessionVerification,
  claimClubMemberPaginationRestoreCursor,
  createClubMemberBrowserSessionVerification,
  createClubMemberPaginationRestoreBudget,
  mutateClubMembershipStatus,
  normalizeClubMembershipStatusReason,
  recordClubMemberPaginationRestorePage,
  refreshClubMembershipStatusView,
  isClubMemberLoadedRangeRestored,
  isClubMemberPaginationRestoreCursorRepeated,
  isVisibleClubMemberStatusFocusTarget,
  resolveClubMemberBrowserSessionVerification,
  resolveClubMemberMobileDetailAfterStatusRefresh,
  resolveClubMemberStatusManagementFocusTarget,
  resolveClubMembershipFilterPresence,
  resolveClubMembershipStatusRequestSlot,
  runClubMembershipStatusMutationLifecycle,
  shouldBlockClubMemberStatusActions,
  shouldExecuteScheduledClubMemberStatusFocus,
  shouldProvideClubMemberStatusMutationContext,
  toClubMembershipStatusMutationError,
  type ClubMemberBrowserSessionVerification,
  type ClubMemberStatusManagementFocusTarget,
  type ClubMembershipFilterPresence,
  type ClubMembershipStatusDetailRefreshResult,
  type ClubMembershipStatusListRefreshResult,
  type ClubMembershipStatusMutationAction,
  type ClubMembershipStatusMutationLifecycleResult,
  type ClubMembershipStatusMutationResult,
  type ClubMembershipStatusRequestSlot,
} from "@/lib/clubs/clubMembershipStatusManagement";
import {
  ClubMemberRoleMutationError,
  mutateClubMemberRole,
  normalizeClubMemberRoleReason,
  resolveClubMemberRoleRequestSlot,
  toClubMemberRoleMutationError,
  type ClubMemberRoleMutationAction,
  type ClubMemberRoleRequestSlot,
} from "@/lib/clubs/clubMemberRoleManagement";
import {
  beginClubMemberRoleRefreshRetry,
  claimClubMemberMutation,
  claimClubMemberRoleOperation,
  clearClubMemberRoleMutationFeedback,
  completeClubMemberRoleRefreshRetry,
  createClubMemberMutationClaim,
  createClubMemberMutationOperationState,
  finishClubMemberRoleRefreshRetry,
  getClubMemberRoleMutationStateView,
  hasClubMemberRoleRefreshRecovery,
  isClubMemberMutationPending,
  isClubMemberRoleMutationPending,
  ownsClubMemberMutationClaim,
  rebaseClubMemberRoleRefreshRecoveryForQuery,
  recordClubMemberRoleRefreshRetryProgress,
  releaseClubMemberMutation,
  setClubMemberRoleOperationError,
  setClubMemberRoleOperationResult,
  setClubMemberRolePreflightError,
  setClubMemberRoleRefreshRecovery,
  type ClubMemberMutationClaim,
  type ClubMemberMutationOperationState,
  type ClubMemberRoleMutationFeedback,
  type ClubMemberRoleMutationStateView,
} from "@/lib/clubs/clubMemberMutationOperationState";
import { createClient } from "@/lib/supabase/client";

const canonicalMembershipIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function parseCanonicalMembershipId(value: unknown): string | null {
  return typeof value === "string" && canonicalMembershipIdPattern.test(value)
    ? value
    : null;
}

type ClubMemberManagementReadContextValue = {
  canManageMembershipStatus: boolean;
  canManageClubRoles: boolean;
  draftSearch: string;
  appliedSearch: string | null;
  searchError?: string;
  membershipStatus: ClubMembershipStatus | null;
  roleKey: ClubMemberRoleFilterKey | null;
  items: ClubMemberListItem[];
  initialLoading: boolean;
  loadingMore: boolean;
  initialError?: string;
  loadMoreError?: string;
  hasMore: boolean;
  liveMessage: string;
  hasActiveFilters: boolean;
  selectedMembershipId?: string;
  detail?: ClubMemberDetail;
  detailLoading: boolean;
  detailError?: string;
  detailLiveMessage: string;
  mobileDetailOpen: boolean;

  setDraftSearch: (value: string) => void;
  submitSearch: (event: FormEvent<HTMLFormElement>) => void;
  setMembershipStatus: (value: ClubMembershipStatus | null) => void;
  setRoleKey: (value: ClubMemberRoleFilterKey | null) => void;
  resetFilters: () => void;
  retryInitial: () => void;
  loadMore: () => Promise<void>;
  selectMember: (
    membershipId: string,
    trigger: HTMLButtonElement,
    openMobileDetail: boolean,
  ) => void;
  retryDetail: () => void;
  closeMobileDetail: () => void;
};

type ClubMemberStatusMutationContextValue = {
  statusMutationAction?: ClubMembershipStatusMutationAction;
  statusMutationError?: string;
  statusMutationSuccess?: string;
  statusRefreshWarning?: string;
  statusRefreshRetrying: boolean;
  statusActionsBlockedUntilRefresh: boolean;
  runStatusMutation: (
    action: ClubMembershipStatusMutationAction,
    reason: string,
  ) => Promise<ClubMembershipStatusMutationLifecycleResult>;
  finalizeStatusMutationUi: (
    result: ClubMembershipStatusMutationLifecycleResult,
  ) => void;
  retryStatusRefresh: () => Promise<void>;
  clearStatusMutationState: () => void;
  isMembershipMutationPending: (membershipId: string) => boolean;
};

type ClubMemberRoleMutationRunResult =
  | {
      status: "mutation_failed";
      error: ClubMemberRoleMutationError;
    }
  | {
      status: "mutation_succeeded_and_synced";
      filteredOut: boolean;
      result: ClubMemberRoleMutationFeedback;
    }
  | {
      status: "mutation_succeeded_but_refresh_failed";
      listRefreshed: boolean;
      detailRefreshed: boolean;
      filteredOut: boolean;
      result: ClubMemberRoleMutationFeedback;
    }
  | { status: "stale_or_cancelled" };

type ClubMemberRoleMutationContextValue = {
  canManageClubRoles: boolean;
  isSelfTarget: (membershipId: string) => boolean;
  grantManagerRole: (
    membershipId: string,
    reason: string,
  ) => Promise<ClubMemberRoleMutationRunResult>;
  revokeManagerRole: (
    membershipId: string,
    reason: string,
  ) => Promise<ClubMemberRoleMutationRunResult>;
  isRoleMutationPending: (membershipId: string) => boolean;
  isMembershipMutationPending: (membershipId: string) => boolean;
  getRoleMutationState: (
    membershipId: string,
  ) => ClubMemberRoleMutationStateView | undefined;
  clearRoleMutationFeedback: (membershipId: string) => void;
  retryRoleMutationRefresh: (membershipId: string) => Promise<void>;
};

const ClubMemberManagementReadContext =
  createContext<ClubMemberManagementReadContextValue | null>(null);
const ClubMemberStatusMutationContext =
  createContext<ClubMemberStatusMutationContextValue | null>(null);
const ClubMemberRoleMutationContext =
  createContext<ClubMemberRoleMutationContextValue | null>(null);

const statusRefreshNoticeClass =
  "rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2";
const statusRefreshButtonClass =
  "mt-3 min-h-11 rounded-lg border border-amber-400 bg-white px-4 font-bold text-amber-950 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60";

export function useClubMemberManagement() {
  const value = useContext(ClubMemberManagementReadContext);
  if (!value) throw new Error("ClubMemberManagementProvider is required.");
  return value;
}

export function useClubMemberStatusMutation() {
  return useContext(ClubMemberStatusMutationContext);
}

export function useClubMemberRoleMutation() {
  return useContext(ClubMemberRoleMutationContext);
}

export function ClubMemberStatusRefreshNotice({
  id,
  className = "",
}: {
  id: string;
  className?: string;
}) {
  const statusMutation = useClubMemberStatusMutation();
  if (!statusMutation?.statusRefreshWarning) return null;
  return (
    <div
      id={id}
      data-club-member-status-refresh-warning
      role="status"
      tabIndex={-1}
      className={`${statusRefreshNoticeClass} ${className}`}
    >
      <p className="break-words text-[15px] font-bold leading-6">
        {statusMutation.statusRefreshWarning}
      </p>
      <button
        type="button"
        onClick={() => void statusMutation.retryStatusRefresh()}
        disabled={statusMutation.statusRefreshRetrying}
        className={statusRefreshButtonClass}
      >
        {statusMutation.statusRefreshRetrying
          ? "최신 정보 불러오는 중..."
          : "최신 정보 다시 불러오기"}
      </button>
    </div>
  );
}

type ProviderProps = {
  authenticatedUserId: string;
  clubUuid: string;
  actorMembershipId?: string | null;
  children: ReactNode;
  canManageMembershipStatus: boolean;
  canManageClubRoles?: boolean;
};

type LoadClubMemberDetailOptions = {
  mobileDetailBehavior?: "open" | "close" | "preserve";
  trigger?: HTMLButtonElement;
  backgroundRefresh?: boolean;
};

export function ClubMemberManagementProvider({
  actorMembershipId = null,
  authenticatedUserId,
  clubUuid,
  children,
  canManageMembershipStatus,
  canManageClubRoles = false,
}: ProviderProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const trustedActorMembershipId = canManageClubRoles
    ? parseCanonicalMembershipId(actorMembershipId)
    : null;
  const identityKey = `${authenticatedUserId}:${clubUuid}:${trustedActorMembershipId ?? "unavailable"}`;
  const [draftSearch, setDraftSearchState] = useState("");
  const [appliedSearch, setAppliedSearch] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string>();
  const [membershipStatus, setMembershipStatusState] = useState<ClubMembershipStatus | null>(null);
  const [roleKey, setRoleKeyState] = useState<ClubMemberRoleFilterKey | null>(null);
  const [items, setItems] = useState<ClubMemberListItem[]>([]);
  const [dataIdentityKey, setDataIdentityKey] = useState<string>();
  const [cursor, setCursor] = useState<ClubMemberCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState<string>();
  const [loadMoreError, setLoadMoreError] = useState<string>();
  const [liveMessage, setLiveMessage] = useState("");
  const [queryRevision, setQueryRevision] = useState(0);
  const [selectedMembershipId, setSelectedMembershipId] = useState<string>();
  const [detail, setDetail] = useState<ClubMemberDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [detailLiveMessage, setDetailLiveMessage] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [statusMutationAction, setStatusMutationAction] =
    useState<ClubMembershipStatusMutationAction>();
  const [statusMutationError, setStatusMutationError] = useState<string>();
  const [statusMutationSuccess, setStatusMutationSuccess] = useState<string>();
  const [statusRefreshWarning, setStatusRefreshWarning] = useState<string>();
  const [statusRefreshRetrying, setStatusRefreshRetrying] = useState(false);
  const [membershipMutationState, setMembershipMutationState] =
    useState<ClubMemberMutationOperationState>(
      createClubMemberMutationOperationState,
    );
  const [sessionVerification, setSessionVerification] =
    useState<ClubMemberBrowserSessionVerification>(
      createClubMemberBrowserSessionVerification,
    );
  const [currentSessionGeneration, setCurrentSessionGeneration] = useState(0);
  const mutationGeneration = useRef(0);
  const statusMutationRequestSlot =
    useRef<ClubMembershipStatusRequestSlot | undefined>(undefined);
  const statusRefreshRecovery = useRef<{
    sessionGeneration: number;
    membershipId: string;
    currentStatus: ClubMembershipStatusMutationResult["currentStatus"];
    loadedItemCount: number;
  } | undefined>(undefined);
  const roleMutationGeneration = useRef(0);
  const roleMutationRequestSlots =
    useRef<Map<string, ClubMemberRoleRequestSlot>>(new Map());
  const membershipMutationStateRef = useRef(membershipMutationState);
  const membershipMutationOperationSequence = useRef(0);
  const requestGeneration = useRef(0);
  const queryGeneration = useRef(0);
  const detailRequestGeneration = useRef(0);
  const selectedMembershipIdRef = useRef<string | undefined>(undefined);
  const mobileDetailOpenRef = useRef(false);
  const mobileDetailChoiceGeneration = useRef(0);
  const detailReturnFocusRef = useRef<HTMLButtonElement | null>(null);

  const detailFocusFrameRef = useRef<number | undefined>(undefined);
  const statusFocusFrameRef = useRef<number | undefined>(undefined);
  const statusFocusRequestGeneration = useRef(0);
  const mounted = useRef(true);
  const authRefreshStarted = useRef(false);
  const sessionMatchesIdentity = useRef(false);
  const sessionGeneration = useRef(0);
  const sessionVerificationRef =
    useRef<ClubMemberBrowserSessionVerification>(
      createClubMemberBrowserSessionVerification(),
    );
  const sessionVerificationSequence = useRef(0);

  const query = useMemo<ClubMemberListQuery>(
    () => ({ search: appliedSearch, membershipStatus, roleKey }),
    [appliedSearch, membershipStatus, roleKey],
  );
  const commitMembershipMutationState = useCallback((
    next: ClubMemberMutationOperationState,
  ) => {
    if (next === membershipMutationStateRef.current) return;
    membershipMutationStateRef.current = next;
    if (mounted.current) setMembershipMutationState(next);
  }, []);

  const claimStatusMembershipMutation = useCallback((
    claim: ClubMemberMutationClaim,
    hasExternalRefreshRecovery: boolean,
  ): boolean => {
    const claimed = claimClubMemberMutation(
      membershipMutationStateRef.current,
      claim,
      { hasExternalRefreshRecovery },
    );
    commitMembershipMutationState(claimed.state);
    return claimed.claimed;
  }, [commitMembershipMutationState]);

  const claimRoleMembershipMutation = useCallback((
    claim: ClubMemberMutationClaim,
    action: ClubMemberRoleMutationAction,
    hasExternalRefreshRecovery: boolean,
  ): boolean => {
    const claimed = claimClubMemberRoleOperation(
      membershipMutationStateRef.current,
      claim,
      action,
      { hasExternalRefreshRecovery },
    );
    commitMembershipMutationState(claimed.state);
    return claimed.claimed;
  }, [commitMembershipMutationState]);

  const releaseMembershipMutation = useCallback((
    membershipId: string,
    claim: ClubMemberMutationClaim,
  ) => {
    commitMembershipMutationState(
      releaseClubMemberMutation(
        membershipMutationStateRef.current,
        membershipId,
        claim,
      ),
    );
  }, [commitMembershipMutationState]);

  const resetMembershipMutationState = useCallback(() => {
    const next = createClubMemberMutationOperationState();
    membershipMutationStateRef.current = next;
    if (mounted.current) setMembershipMutationState(next);
  }, []);

  const getRoleMutationState = useCallback(
    (membershipId: string) =>
      getClubMemberRoleMutationStateView(
        membershipMutationState,
        membershipId,
      ),
    [membershipMutationState],
  );

  const isMembershipMutationPendingForId = useCallback(
    (membershipId: string) =>
      isClubMemberMutationPending(membershipMutationState, membershipId),
    [membershipMutationState],
  );
  const isRoleMutationPendingForId = useCallback(
    (membershipId: string) =>
      isClubMemberRoleMutationPending(membershipMutationState, membershipId),
    [membershipMutationState],
  );

  const setRolePreflightError = useCallback((
    membershipId: string,
    safeError: string,
  ) => {
    commitMembershipMutationState(
      setClubMemberRolePreflightError(
        membershipMutationStateRef.current,
        membershipId,
        safeError,
      ),
    );
  }, [commitMembershipMutationState]);

  const cancelPendingStatusFocus = useCallback(() => {
    if (statusFocusFrameRef.current !== undefined) {
      window.cancelAnimationFrame(statusFocusFrameRef.current);
      statusFocusFrameRef.current = undefined;
    }
    statusFocusRequestGeneration.current += 1;
  }, []);

  const clearStatusRefreshState = useCallback(() => {
    cancelPendingStatusFocus();
    statusRefreshRecovery.current = undefined;
    setStatusRefreshWarning(undefined);
    setStatusRefreshRetrying(false);
  }, [cancelPendingStatusFocus]);

  const clearRoleMutationFeedbackForId = useCallback((
    membershipId: string,
  ) => {
    commitMembershipMutationState(
      clearClubMemberRoleMutationFeedback(
        membershipMutationStateRef.current,
        membershipId,
      ),
    );
  }, [commitMembershipMutationState]);
  const scheduleStatusManagementFocus = useCallback((
    target: Exclude<ClubMemberStatusManagementFocusTarget, "none">,
  ) => {
    cancelPendingStatusFocus();
    const focusRequestGeneration = ++statusFocusRequestGeneration.current;
    const scheduled = {
      focusRequestGeneration,
      sessionGeneration: sessionGeneration.current,
      identityKey,
      selectedMembershipId: selectedMembershipIdRef.current,
      queryGeneration: queryGeneration.current,
    };
    statusFocusFrameRef.current = window.requestAnimationFrame(() => {
      statusFocusFrameRef.current = undefined;
      if (
        !shouldExecuteScheduledClubMemberStatusFocus(scheduled, {
          focusRequestGeneration: statusFocusRequestGeneration.current,
          sessionGeneration: sessionGeneration.current,
          identityKey,
          selectedMembershipId: selectedMembershipIdRef.current,
          queryGeneration: queryGeneration.current,
          isMounted: mounted.current,
          sessionMatchesIdentity: sessionMatchesIdentity.current,
        })
      ) {
        return;
      }

      if (target === "status_refresh_warning") {
        const refreshWarning = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-club-member-status-refresh-warning]",
          ),
        ).find(isVisibleClubMemberStatusFocusTarget);
        refreshWarning?.focus({ preventScroll: true });
        return;
      }

      if (target === "member_list_heading") {
        const listHeading = document.getElementById("club-member-list-heading");
        if (isVisibleClubMemberStatusFocusTarget(listHeading)) {
          listHeading.focus({ preventScroll: true });
        }
        return;
      }

      const detailHeading = document.querySelector<HTMLElement>(
        "[data-club-member-detail-focus]",
      );
      if (isVisibleClubMemberStatusFocusTarget(detailHeading)) {
        detailHeading.focus({ preventScroll: true });
      }
    });
  }, [cancelPendingStatusFocus, identityKey]);

  const setMobileDetailVisibility = useCallback((open: boolean) => {
    mobileDetailChoiceGeneration.current += 1;
    mobileDetailOpenRef.current = open;
    setMobileDetailOpen(open);
  }, []);

  const clearStatusMutationState = useCallback(() => {
    mutationGeneration.current += 1;
    statusMutationRequestSlot.current = undefined;
    setStatusMutationAction(undefined);
    setStatusMutationError(undefined);
    setStatusMutationSuccess(undefined);
    clearStatusRefreshState();
  }, [clearStatusRefreshState]);

  const clearDetailState = useCallback((preserveStatusMutation = false) => {
    cancelPendingStatusFocus();
    detailRequestGeneration.current += 1;
    selectedMembershipIdRef.current = undefined;
    detailReturnFocusRef.current = null;
    if (detailFocusFrameRef.current !== undefined) {
      window.cancelAnimationFrame(detailFocusFrameRef.current);
      detailFocusFrameRef.current = undefined;
    }
    setSelectedMembershipId(undefined);
    setDetail(undefined);
    setDetailLoading(false);
    setDetailError(undefined);
    setDetailLiveMessage("");
    setMobileDetailVisibility(false);
    if (!preserveStatusMutation) clearStatusMutationState();
  }, [
    cancelPendingStatusFocus,
    clearStatusMutationState,
    setMobileDetailVisibility,
  ]);

  const clearSensitiveState = useCallback(() => {
    requestGeneration.current += 1;
    queryGeneration.current += 1;
    clearDetailState();
    roleMutationGeneration.current += 1;
    roleMutationRequestSlots.current.clear();
    resetMembershipMutationState();
    setDraftSearchState("");
    setAppliedSearch(null);
    setSearchError(undefined);
    setMembershipStatusState(null);
    setRoleKeyState(null);
    setItems([]);
    setDataIdentityKey(undefined);
    setCursor(null);
    setHasMore(false);
    setInitialLoading(false);
    setLoadingMore(false);
    setInitialError(undefined);
    setLoadMoreError(undefined);
    setLiveMessage("");
  }, [
    clearDetailState,
    resetMembershipMutationState,
  ]);

  const applyBrowserSessionVerification = useCallback((
    sessionUserId: string | undefined,
    sequence: number,
    mismatchMessage?: string,
  ) => {
    cancelPendingStatusFocus();
    const previous = sessionVerificationRef.current;
    const next = resolveClubMemberBrowserSessionVerification(previous, {
      sequence,
      expectedUserId: authenticatedUserId,
      sessionUserId,
    });
    if (next === previous) return;

    sessionVerificationRef.current = next;
    sessionGeneration.current = next.generation;
    sessionMatchesIdentity.current = next.status === "matched";
    setCurrentSessionGeneration(next.generation);
    setSessionVerification(next);

    if (next.status === "matched") {
      authRefreshStarted.current = false;
      return;
    }

    clearSensitiveState();
    if (mismatchMessage) setInitialError(mismatchMessage);
    if (!authRefreshStarted.current) {
      authRefreshStarted.current = true;
      router.refresh();
    }
  }, [
    authenticatedUserId,
    cancelPendingStatusFocus,
    clearSensitiveState,
    router,
  ]);

  const refreshAfterSensitiveFailure = useCallback((message: string) => {
    cancelPendingStatusFocus();
    const sequence = ++sessionVerificationSequence.current;
    const checking = beginClubMemberBrowserSessionVerification(
      sessionVerificationRef.current,
      sequence,
    );
    sessionVerificationRef.current = checking;
    sessionMatchesIdentity.current = false;
    setCurrentSessionGeneration(checking.generation);
    setSessionVerification(checking);
    applyBrowserSessionVerification(undefined, sequence, message);
  }, [applyBrowserSessionVerification, cancelPendingStatusFocus]);

  useEffect(() => {
    mounted.current = true;
    const roleRequestSlots = roleMutationRequestSlots.current;
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
      detailRequestGeneration.current += 1;
      mutationGeneration.current += 1;
      roleMutationGeneration.current += 1;
      roleRequestSlots.clear();
      membershipMutationStateRef.current = createClubMemberMutationOperationState();
      sessionVerificationSequence.current += 1;
      if (detailFocusFrameRef.current !== undefined) {
        window.cancelAnimationFrame(detailFocusFrameRef.current);
      }
      cancelPendingStatusFocus();
    };
  }, [cancelPendingStatusFocus]);

  useEffect(() => {
    let active = true;
    cancelPendingStatusFocus();
    const initialSequence = ++sessionVerificationSequence.current;
    const checking = beginClubMemberBrowserSessionVerification(
      sessionVerificationRef.current,
      initialSequence,
    );
    sessionVerificationRef.current = checking;
    sessionMatchesIdentity.current = false;
    setCurrentSessionGeneration(checking.generation);
    setSessionVerification(checking);

    const handleSessionUser = (
      sessionUserId: string | undefined,
      sequence: number,
    ) => {
      if (!active || sequence !== sessionVerificationSequence.current) return;
      applyBrowserSessionVerification(sessionUserId, sequence);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      cancelPendingStatusFocus();
      const eventSequence = ++sessionVerificationSequence.current;
      const eventChecking = beginClubMemberBrowserSessionVerification(
        sessionVerificationRef.current,
        eventSequence,
      );
      sessionVerificationRef.current = eventChecking;
      sessionMatchesIdentity.current = false;
      setCurrentSessionGeneration(eventChecking.generation);
      setSessionVerification(eventChecking);
      handleSessionUser(session?.user.id, eventSequence);
    });

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        handleSessionUser(data.session?.user.id, initialSequence);
      })
      .catch(() => handleSessionUser(undefined, initialSequence));

    return () => {
      active = false;
      sessionVerificationSequence.current += 1;
      listener.subscription.unsubscribe();
    };
  }, [applyBrowserSessionVerification, cancelPendingStatusFocus, supabase]);


  const loadDetail = useCallback(async (
    membershipId: string,
    {
      mobileDetailBehavior = "preserve",
      trigger,
      backgroundRefresh = false,
    }: LoadClubMemberDetailOptions = {},
  ): Promise<ClubMembershipStatusDetailRefreshResult> => {
    if (!sessionMatchesIdentity.current) return "stale";
    cancelPendingStatusFocus();
    const generation = ++detailRequestGeneration.current;
    const requestIdentity = identityKey;
    selectedMembershipIdRef.current = membershipId;
    if (trigger) detailReturnFocusRef.current = trigger;
    setSelectedMembershipId(membershipId);
    if (mobileDetailBehavior !== "preserve") {
      setMobileDetailVisibility(mobileDetailBehavior === "open");
    }
    if (!backgroundRefresh) {
      setDetail(undefined);
      setDetailLoading(true);
      setDetailError(undefined);
      setDetailLiveMessage("회원 상세 정보를 불러오는 중입니다.");
    }

    try {
      const response = await getClubMemberDetailForManagement(
        supabase,
        clubUuid,
        membershipId,
      );
      if (
        !mounted.current ||
        generation !== detailRequestGeneration.current ||
        requestIdentity !== identityKey ||
        selectedMembershipIdRef.current !== membershipId
      ) {
        return "stale";
      }
      setDetail(response);
      setDetailError(undefined);
      setDetailLiveMessage("회원 상세 정보를 불러왔습니다.");
      return "success";
    } catch (error) {
      if (
        !mounted.current ||
        generation !== detailRequestGeneration.current ||
        requestIdentity !== identityKey ||
        selectedMembershipIdRef.current !== membershipId
      ) {
        return "stale";
      }
      const mapped = toClubMemberDetailManagementError(error);
      if (mapped.clearSensitiveData) {
        refreshAfterSensitiveFailure(mapped.userMessage);
        return "stale";
      }
      if (!backgroundRefresh) {
        setDetail(undefined);
        setDetailError(mapped.userMessage);
        setDetailLiveMessage("회원 상세 정보를 불러오지 못했습니다.");
      }
      return "failed";
    } finally {
      if (
        !backgroundRefresh &&
        mounted.current &&
        generation === detailRequestGeneration.current &&
        selectedMembershipIdRef.current === membershipId
      ) {
        setDetailLoading(false);
      }
    }
  }, [
    cancelPendingStatusFocus,
    clubUuid,
    identityKey,
    refreshAfterSensitiveFailure,
    setMobileDetailVisibility,
    supabase,
  ]);

  const loadFirstPage = useCallback(async ({
    preserveStatusMutation = false,
    targetMembershipId,
    filterPresence = "still_in_filter",
    deriveFilterPresenceFromTarget = false,
    restoreLoadedItemCount = 0,
    deferSelectionClear = false,
    backgroundRefresh = false,
  }: {
    preserveStatusMutation?: boolean;
    targetMembershipId?: string;
    filterPresence?: ClubMembershipFilterPresence;
    deriveFilterPresenceFromTarget?: boolean;
    restoreLoadedItemCount?: number;
    deferSelectionClear?: boolean;
    backgroundRefresh?: boolean;
  } = {}): Promise<ClubMembershipStatusListRefreshResult> => {
    if (!sessionMatchesIdentity.current) {
      return { status: "stale" };
    }
    cancelPendingStatusFocus();
    const generation = ++requestGeneration.current;
    const requestIdentity = identityKey;
    const requiredItemCount = Math.max(0, restoreLoadedItemCount);
    if (!backgroundRefresh) {
      setInitialLoading(true);
      setInitialError(undefined);
      setLoadMoreError(undefined);
    }
    try {
      const firstResponse = await listClubMembersForManagement(
        supabase,
        clubUuid,
        query,
      );
      let refreshedItems = [...firstResponse.items];
      let refreshedCursor = firstResponse.page.nextCursor;
      let refreshedHasMore = firstResponse.page.hasMore;
      let restoreBudget = createClubMemberPaginationRestoreBudget(
        firstResponse.items.length,
      );

      while (
        refreshedItems.length < requiredItemCount &&
        refreshedHasMore &&
        refreshedCursor
      ) {
        const claimedCursor = claimClubMemberPaginationRestoreCursor(
          restoreBudget,
          refreshedCursor,
        );
        if (claimedCursor.status === "blocked") {
          throw new ClubMemberManagementError(
            "unknown",
            "최신 회원 목록을 모두 불러오지 못했습니다. 다시 시도해 주세요.",
          );
        }
        restoreBudget = claimedCursor.budget;

        const response = await listClubMembersForManagement(
          supabase,
          clubUuid,
          query,
          refreshedCursor,
        );
        const recordedPage = recordClubMemberPaginationRestorePage(
          restoreBudget,
          response.items.length,
        );
        if (recordedPage.status === "blocked") {
          throw new ClubMemberManagementError(
            "unknown",
            "최신 회원 목록을 모두 불러오지 못했습니다. 다시 시도해 주세요.",
          );
        }
        restoreBudget = recordedPage.budget;
        if (
          isClubMemberPaginationRestoreCursorRepeated(
            restoreBudget,
            response.page.nextCursor,
          )
        ) {
          throw new ClubMemberManagementError(
            "unknown",
            "최신 회원 목록을 모두 불러오지 못했습니다. 다시 시도해 주세요.",
          );
        }
        if (
          !mounted.current ||
          generation !== requestGeneration.current ||
          requestIdentity !== identityKey
        ) {
          return { status: "stale" };
        }
        const knownIds = new Set(
          refreshedItems.map(({ membershipId }) => membershipId),
        );
        const additional = response.items.filter(
          ({ membershipId }) => !knownIds.has(membershipId),
        );
        if (response.page.hasMore && additional.length === 0) {
          throw new ClubMemberManagementError(
            "unknown",
            "회원 목록의 현재 범위를 복원하지 못했습니다. 다시 시도해 주세요.",
          );
        }
        refreshedItems = [...refreshedItems, ...additional];
        refreshedCursor = response.page.nextCursor;
        refreshedHasMore = response.page.hasMore;
      }

      if (
        !mounted.current ||
        generation !== requestGeneration.current ||
        requestIdentity !== identityKey
      ) {
        return { status: "stale" };
      }

      const paginationRestored = isClubMemberLoadedRangeRestored(
        requiredItemCount,
        refreshedItems.length,
        refreshedHasMore,
      );
      const targetPresent = Boolean(
        targetMembershipId &&
          refreshedItems.some(
            ({ membershipId }) => membershipId === targetMembershipId,
          ),
      );
      setItems(refreshedItems);
      setDataIdentityKey(requestIdentity);
      setCursor(refreshedCursor);
      setHasMore(refreshedHasMore);
      setInitialError(undefined);
      setLoadMoreError(undefined);
      setLiveMessage(`회원 ${refreshedItems.length}명을 불러왔습니다.`);
      const selectedId = selectedMembershipIdRef.current;
      const selectedFilteredOut = Boolean(
        selectedId &&
          !refreshedItems.some(
            ({ membershipId }) => membershipId === selectedId,
          ),
      );
      if (selectedFilteredOut && !deferSelectionClear) {
        clearDetailState(preserveStatusMutation);
      }
      if (!preserveStatusMutation) clearStatusRefreshState();
      return {
        status: "success",
        filterPresence:
          deriveFilterPresenceFromTarget && targetMembershipId
            ? targetPresent
              ? "still_in_filter"
              : "filtered_out"
            : filterPresence,
        pagePresence: targetMembershipId
          ? targetPresent
            ? "present_in_refreshed_results"
            : "not_present_in_refreshed_results"
          : "unknown",
        paginationRestored,
      };
    } catch (error) {
      if (
        !mounted.current ||
        generation !== requestGeneration.current ||
        requestIdentity !== identityKey
      ) {
        return { status: "stale" };
      }
      const mapped = toClubMemberManagementError(error);
      if (mapped.clearSensitiveData) {
        refreshAfterSensitiveFailure(mapped.userMessage);
        return { status: "stale" };
      }
      if (!backgroundRefresh) {
        setItems([]);
        setDataIdentityKey(requestIdentity);
        setCursor(null);
        setHasMore(false);
        clearDetailState(preserveStatusMutation);
        setInitialError(mapped.userMessage);
        setLiveMessage("회원 목록을 불러오지 못했습니다.");
      }
      return { status: "failed" };
    } finally {
      if (
        !backgroundRefresh &&
        mounted.current &&
        generation === requestGeneration.current
      ) {
        setInitialLoading(false);
      }
    }
  }, [
    cancelPendingStatusFocus,
    clearDetailState,
    clearStatusRefreshState,
    clubUuid,
    identityKey,
    query,
    refreshAfterSensitiveFailure,
    supabase,
  ]);

  useEffect(() => {
    if (sessionVerification.status !== "matched") return;
    const timeoutId = window.setTimeout(() => void loadFirstPage(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadFirstPage, queryRevision, sessionVerification.status]);

  const beginQueryTransition = useCallback(() => {
    requestGeneration.current += 1;
    queryGeneration.current += 1;
    clearDetailState();
    setItems([]);
    setDataIdentityKey(undefined);
    setCursor(null);
    setHasMore(false);
    setInitialLoading(true);
    setLoadingMore(false);
    setInitialError(undefined);
    setLoadMoreError(undefined);
    setLiveMessage("회원 목록을 갱신하고 있습니다.");
    setQueryRevision((current) => current + 1);
  }, [clearDetailState]);

  const setDraftSearch = useCallback((value: string) => {
    setDraftSearchState(value);
    setSearchError(undefined);
  }, []);

  const submitSearch = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const normalized = normalizeClubMemberSearch(draftSearch);
      setSearchError(undefined);
      beginQueryTransition();
      setAppliedSearch(normalized);
    } catch (error) {
      const mapped = error instanceof ClubMemberManagementError
        ? error
        : toClubMemberManagementError(error);
      setSearchError(mapped.userMessage);
    }
  }, [beginQueryTransition, draftSearch]);

  const setMembershipStatus = useCallback((value: ClubMembershipStatus | null) => {
    beginQueryTransition();
    setMembershipStatusState(value);
  }, [beginQueryTransition]);

  const setRoleKey = useCallback((value: ClubMemberRoleFilterKey | null) => {
    beginQueryTransition();
    setRoleKeyState(value);
  }, [beginQueryTransition]);

  const resetFilters = useCallback(() => {
    beginQueryTransition();
    setDraftSearchState("");
    setAppliedSearch(null);
    setSearchError(undefined);
    setMembershipStatusState(null);
    setRoleKeyState(null);
  }, [beginQueryTransition]);

  const retryInitial = useCallback(() => {
    beginQueryTransition();
  }, [beginQueryTransition]);

  const loadMore = useCallback(async () => {
    if (
      !sessionMatchesIdentity.current ||
      !hasMore ||
      !cursor ||
      loadingMore ||
      dataIdentityKey !== identityKey
    ) return;
    cancelPendingStatusFocus();
    const generation = requestGeneration.current;
    const requestCursor = cursor;
    const requestIdentity = identityKey;
    setLoadingMore(true);
    setLoadMoreError(undefined);
    try {
      const response = await listClubMembersForManagement(
        supabase,
        clubUuid,
        query,
        requestCursor,
      );
      if (!mounted.current || generation !== requestGeneration.current || requestIdentity !== identityKey) return;
      const knownIds = new Set(items.map(({ membershipId }) => membershipId));
      const additional = response.items.filter(({ membershipId }) => !knownIds.has(membershipId));
      if (response.page.hasMore && additional.length === 0) {
        throw new ClubMemberManagementError(
          "unknown",
          "회원 목록의 다음 페이지를 불러오지 못했습니다. 다시 시도해 주세요.",
        );
      }
      setItems([...items, ...additional]);
      setCursor(response.page.nextCursor);
      setHasMore(response.page.hasMore);
      setLiveMessage(`회원 ${additional.length}명을 추가로 불러왔습니다.`);
    } catch (error) {
      if (!mounted.current || generation !== requestGeneration.current) return;
      const mapped = toClubMemberManagementError(error);
      if (mapped.clearSensitiveData) {
        refreshAfterSensitiveFailure(mapped.userMessage);
        return;
      }
      setLoadMoreError(mapped.userMessage);
      setLiveMessage("추가 회원을 불러오지 못했습니다.");
    } finally {
      if (mounted.current && generation === requestGeneration.current) {
        setLoadingMore(false);
      }
    }
  }, [cancelPendingStatusFocus, clubUuid, cursor, dataIdentityKey, hasMore, identityKey, items, loadingMore, query, refreshAfterSensitiveFailure, supabase]);

  const selectMember = useCallback((
    membershipId: string,
    trigger: HTMLButtonElement,
    openMobileDetail: boolean,
  ) => {
    if (selectedMembershipIdRef.current !== membershipId) {
      clearStatusMutationState();
    }
    void loadDetail(membershipId, {
      mobileDetailBehavior: openMobileDetail ? "open" : "close",
      trigger,
    });
  }, [clearStatusMutationState, loadDetail]);

  const retryDetail = useCallback(() => {
    const membershipId = selectedMembershipIdRef.current;
    if (membershipId) {
      void loadDetail(membershipId, { mobileDetailBehavior: "preserve" });
    }
  }, [loadDetail]);

  const closeMobileDetail = useCallback(() => {
    cancelPendingStatusFocus();
    setMobileDetailVisibility(false);
    if (detailFocusFrameRef.current !== undefined) {
      window.cancelAnimationFrame(detailFocusFrameRef.current);
    }
    detailFocusFrameRef.current = window.requestAnimationFrame(() => {
      detailFocusFrameRef.current = undefined;
      const trigger = detailReturnFocusRef.current;
      if (trigger?.isConnected && !trigger.disabled) {
        trigger.focus({ preventScroll: true });
      }
    });
  }, [cancelPendingStatusFocus, setMobileDetailVisibility]);

  const finalizeStatusMutationUi = useCallback((
    result: ClubMembershipStatusMutationLifecycleResult,
  ) => {
    const focusTarget =
      resolveClubMemberStatusManagementFocusTarget(result);
    if (
      (result.status === "mutation_succeeded_but_refresh_failed" &&
        (result.filteredOut || !result.detailRefreshed)) ||
      (result.status === "mutation_succeeded_and_synced" && result.filteredOut)
    ) {
      clearDetailState(true);
    }
    if (focusTarget !== "none") {
      scheduleStatusManagementFocus(focusTarget);
    }
  }, [clearDetailState, scheduleStatusManagementFocus]);

  const retryStatusRefresh = useCallback(async () => {
    const recovery = statusRefreshRecovery.current;
    if (
      statusRefreshRetrying ||
      !recovery ||
      recovery.sessionGeneration !== sessionGeneration.current ||
      !sessionMatchesIdentity.current
    ) {
      return;
    }

    cancelPendingStatusFocus();
    const generation = mutationGeneration.current;
    const requestSessionGeneration = sessionGeneration.current;
    const mobileDetailSnapshot = {
      wasOpen: mobileDetailOpenRef.current,
      choiceGeneration: mobileDetailChoiceGeneration.current,
      sessionGeneration: requestSessionGeneration,
      identityKey,
      membershipId: recovery.membershipId,
      queryGeneration: queryGeneration.current,
    };
    setStatusRefreshRetrying(true);
    setStatusMutationError(undefined);

    const isIdentityCurrent = () =>
      mounted.current &&
      generation === mutationGeneration.current &&
      requestSessionGeneration === sessionGeneration.current &&
      sessionMatchesIdentity.current;
    const isCurrent = () =>
      isIdentityCurrent() && statusRefreshRecovery.current === recovery;

    try {
      const refreshResult = await refreshClubMembershipStatusView({
        refreshList: () => loadFirstPage({
          preserveStatusMutation: true,
          targetMembershipId: recovery.membershipId,
          filterPresence: resolveClubMembershipFilterPresence(
            membershipStatus,
            recovery.currentStatus,
          ),
          restoreLoadedItemCount: recovery.loadedItemCount,
          deferSelectionClear: true,
          backgroundRefresh: true,
        }),
        refreshDetail: () => loadDetail(recovery.membershipId, {
          mobileDetailBehavior: "preserve",
          backgroundRefresh: true,
        }),
        isCurrent: () => isCurrent(),
      });

      if (!isCurrent() || refreshResult.status === "stale_or_cancelled") {
        return;
      }
      const mobileDetailDecision =
        resolveClubMemberMobileDetailAfterStatusRefresh(
          mobileDetailSnapshot,
          {
            isMounted: mounted.current,
            sessionMatchesIdentity: sessionMatchesIdentity.current,
            mobileDetailOpen: mobileDetailOpenRef.current,
            choiceGeneration: mobileDetailChoiceGeneration.current,
            sessionGeneration: sessionGeneration.current,
            identityKey,
            membershipId: selectedMembershipIdRef.current,
            queryGeneration: queryGeneration.current,
            filteredOut: refreshResult.filteredOut,
            detailRefreshed:
              refreshResult.status === "synced"
                ? !refreshResult.filteredOut
                : refreshResult.detailRefreshed,
          },
        );
      if (mobileDetailDecision === "stale") return;

      if (refreshResult.status === "refresh_failed") {
        if (mobileDetailDecision === "close_due_to_filter_exit") {
          clearDetailState(true);
        }
        const warning =
          "최신 정보를 아직 불러오지 못했습니다. 잠시 후 다시 시도하거나 페이지를 새로고침해 주세요.";
        setStatusRefreshWarning(warning);
        return;
      }

      statusRefreshRecovery.current = undefined;
      setStatusRefreshWarning(undefined);
      setStatusMutationSuccess(undefined);
      if (mobileDetailDecision === "close_due_to_filter_exit") {
        clearDetailState(true);
      }
      const message = "최신 회원 정보를 다시 불러왔습니다.";
      setLiveMessage(message);
      scheduleStatusManagementFocus(
        refreshResult.filteredOut
          ? "member_list_heading"
          : "member_detail_heading",
      );
    } finally {
      if (isIdentityCurrent()) setStatusRefreshRetrying(false);
    }
  }, [
    cancelPendingStatusFocus,
    clearDetailState,
    scheduleStatusManagementFocus,
    identityKey,
    loadDetail,
    loadFirstPage,
    membershipStatus,
    statusRefreshRetrying,
  ]);

  const retryRoleMutationRefresh = useCallback(async (
    membershipId: string,
  ) => {
    if (!sessionMatchesIdentity.current) return;
    let candidateRecovery =
      membershipMutationStateRef.current.roleOperations.get(membershipId)
        ?.refreshRecovery;
    if (
      !candidateRecovery ||
      candidateRecovery.sessionGeneration !== sessionGeneration.current
    ) return;

    const currentQueryGeneration = queryGeneration.current;
    if (candidateRecovery.queryGeneration !== currentQueryGeneration) {
      const rebased = rebaseClubMemberRoleRefreshRecoveryForQuery(
        membershipMutationStateRef.current,
        membershipId,
        candidateRecovery,
        {
          queryGeneration: currentQueryGeneration,
          loadedItemCount: items.length,
          detailRequired:
            selectedMembershipIdRef.current === membershipId,
        },
      );
      commitMembershipMutationState(rebased.state);
      if (!rebased.recovery) return;
      candidateRecovery = rebased.recovery;
    }

    const started = beginClubMemberRoleRefreshRetry(
      membershipMutationStateRef.current,
      membershipId,
    );
    commitMembershipMutationState(started.state);
    const startedRecovery = started.recovery;
    if (!startedRecovery) return;
    let recovery = startedRecovery;

    const generation = roleMutationGeneration.current;
    const requestSessionGeneration = sessionGeneration.current;
    const requestQueryGeneration = recovery.queryGeneration;
    const isIdentityCurrent = () =>
      mounted.current &&
      generation === roleMutationGeneration.current &&
      requestSessionGeneration === sessionGeneration.current &&
      requestQueryGeneration === queryGeneration.current &&
      sessionMatchesIdentity.current;
    const isCurrent = () =>
      isIdentityCurrent() &&
      membershipMutationStateRef.current.roleOperations.get(membershipId)
        ?.refreshRecovery === recovery;

    try {
      const refreshResult = await refreshClubMembershipStatusView({
        refreshList: () => recovery.listRefreshed
          ? Promise.resolve({
              status: "success",
              filterPresence: recovery.filteredOut
                ? "filtered_out"
                : "still_in_filter",
              pagePresence: recovery.filteredOut
                ? "not_present_in_refreshed_results"
                : "present_in_refreshed_results",
              paginationRestored: true,
            })
          : loadFirstPage({
              preserveStatusMutation: true,
              targetMembershipId: recovery.membershipId,
              deriveFilterPresenceFromTarget: true,
              restoreLoadedItemCount: recovery.loadedItemCount,
              deferSelectionClear: true,
              backgroundRefresh: true,
            }),
        refreshDetail: () =>
          recovery.detailRefreshed ||
          selectedMembershipIdRef.current !== recovery.membershipId
            ? Promise.resolve("success")
            : loadDetail(recovery.membershipId, {
                mobileDetailBehavior: "preserve",
                backgroundRefresh: true,
              }),
        isCurrent,
      });

      if (!isCurrent() || refreshResult.status === "stale_or_cancelled") {
        return;
      }
      if (refreshResult.status === "refresh_failed") {
        const recorded = recordClubMemberRoleRefreshRetryProgress(
          membershipMutationStateRef.current,
          membershipId,
          recovery,
          {
            listRefreshed: refreshResult.listRefreshed,
            detailRefreshed: refreshResult.detailRefreshed,
            filteredOut: refreshResult.filteredOut,
          },
        );
        commitMembershipMutationState(recorded.state);
        if (!recorded.recovery) return;
        recovery = recorded.recovery;
        if (refreshResult.filteredOut) clearDetailState(true);
        return;
      }

      commitMembershipMutationState(
        completeClubMemberRoleRefreshRetry(
          membershipMutationStateRef.current,
          membershipId,
          recovery,
        ),
      );
      if (refreshResult.filteredOut) clearDetailState(true);
      setLiveMessage(
        "\ucd5c\uc2e0 \ud68c\uc6d0 \uc5ed\ud560 \uc815\ubcf4\ub97c \ub2e4\uc2dc \ubd88\ub7ec\uc654\uc2b5\ub2c8\ub2e4.",
      );
    } finally {
      commitMembershipMutationState(
        finishClubMemberRoleRefreshRetry(
          membershipMutationStateRef.current,
          membershipId,
          recovery,
        ),
      );
    }
  }, [
    clearDetailState,
    commitMembershipMutationState,
    items.length,
    loadDetail,
    loadFirstPage,
  ]);
  const runRoleMutation = useCallback(async (
    action: ClubMemberRoleMutationAction,
    membershipId: string,
    rawReason: string,
  ): Promise<ClubMemberRoleMutationRunResult> => {
    const serverCapabilityAvailable = canManageClubRoles === true;
    const browserSessionMatched =
      sessionVerification.status === "matched" &&
      sessionVerification.generation === currentSessionGeneration &&
      sessionMatchesIdentity.current;
    const capabilityAvailable =
      serverCapabilityAvailable && browserSessionMatched;
    const actorIdentityAvailable = trustedActorMembershipId !== null;

    if (!capabilityAvailable || !actorIdentityAvailable) {
      const error = new ClubMemberRoleMutationError(
        "permission",
        "\uc6b4\uc601\uc9c4 \uc5ed\ud560\uc744 \uad00\ub9ac\ud560 \uad8c\ud55c\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.",
      );
      const canonicalTargetMembershipId =
        parseCanonicalMembershipId(membershipId);
      if (browserSessionMatched && canonicalTargetMembershipId !== null) {
        setRolePreflightError(canonicalTargetMembershipId, error.userMessage);
      }
      return { status: "mutation_failed", error };
    }

    const canonicalTargetMembershipId = parseCanonicalMembershipId(membershipId);
    if (canonicalTargetMembershipId === null) {
      const error = new ClubMemberRoleMutationError(
        "validation",
        "\ud604\uc7ac \uc120\ud0dd\ud55c \ud68c\uc6d0\uc758 \uc5ed\ud560\uc744 \ubcc0\uacbd\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4. \ucd5c\uc2e0 \uc815\ubcf4\ub97c \ub2e4\uc2dc \ud655\uc778\ud574 \uc8fc\uc138\uc694.",
      );
      return { status: "mutation_failed", error };
    }

    if (canonicalTargetMembershipId === trustedActorMembershipId) {
      const error = new ClubMemberRoleMutationError(
        "validation",
        "\uc774 \ud68c\uc6d0\uc758 \uc5ed\ud560\uc740 \uc774 \ud654\uba74\uc5d0\uc11c \ubcc0\uacbd\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.",
      );
      setRolePreflightError(canonicalTargetMembershipId, error.userMessage);
      return { status: "mutation_failed", error };
    }

    const currentDetail = detail;
    const membershipIsLoaded =
      dataIdentityKey === identityKey &&
      items.some(({ membershipId: loadedId }) => loadedId === membershipId);
    const targetIsCurrent =
      currentDetail?.member.membershipId === membershipId &&
      selectedMembershipIdRef.current === membershipId &&
      currentDetail.historyScope === "limited_history" &&
      currentDetail.member.membershipStatus === "active" &&
      membershipIsLoaded;
    const blockedByStatusRecovery =
      statusRefreshRecovery.current?.membershipId === membershipId;
    const blockedByRoleRecovery = hasClubMemberRoleRefreshRecovery(
      membershipMutationStateRef.current,
      membershipId,
    );

    if (
      !targetIsCurrent ||
      blockedByStatusRecovery ||
      blockedByRoleRecovery
    ) {
      const error = new ClubMemberRoleMutationError(
        "validation",
        "\ud604\uc7ac \uc120\ud0dd\ud55c \ud68c\uc6d0\uc758 \uc5ed\ud560\uc744 \ubcc0\uacbd\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4. \ucd5c\uc2e0 \uc815\ubcf4\ub97c \ub2e4\uc2dc \ud655\uc778\ud574 \uc8fc\uc138\uc694.",
      );
      setRolePreflightError(membershipId, error.userMessage);
      return { status: "mutation_failed", error };
    }

    let reason: string;
    try {
      reason = normalizeClubMemberRoleReason(rawReason);
    } catch (error) {
      const mapped = toClubMemberRoleMutationError(error);
      setRolePreflightError(membershipId, mapped.userMessage);
      return { status: "mutation_failed", error: mapped };
    }

    const requestSessionGeneration = sessionGeneration.current;
    const generation = roleMutationGeneration.current;
    const claim = createClubMemberMutationClaim({
      membershipId,
      kind: "role",
      sessionGeneration: requestSessionGeneration,
      operationSequence: ++membershipMutationOperationSequence.current,
    });
    if (
      !claimRoleMembershipMutation(
        claim,
        action,
        statusRefreshRecovery.current?.membershipId === membershipId,
      )
    ) {
      const error = new ClubMemberRoleMutationError(
        "conflict",
        "\uc774 \ud68c\uc6d0\uc758 \ub2e4\ub978 \uad00\ub9ac \uc791\uc5c5\uc774 \uc9c4\ud589 \uc911\uc785\ub2c8\ub2e4. \uc644\ub8cc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.",
      );
      setRolePreflightError(membershipId, error.userMessage);
      return { status: "mutation_failed", error };
    }

    let requestSlot: ClubMemberRoleRequestSlot;
    try {
      requestSlot = resolveClubMemberRoleRequestSlot(
        roleMutationRequestSlots.current.get(membershipId),
        { action, clubId: clubUuid, membershipId, reason },
      );
      roleMutationRequestSlots.current.set(membershipId, requestSlot);
    } catch (error) {
      const mapped = toClubMemberRoleMutationError(error);
      commitMembershipMutationState(
        setClubMemberRoleOperationError(
          membershipMutationStateRef.current,
          membershipId,
          claim,
          mapped.userMessage,
        ),
      );
      releaseMembershipMutation(membershipId, claim);
      return { status: "mutation_failed", error: mapped };
    }

    const isCurrent = () =>
      mounted.current &&
      generation === roleMutationGeneration.current &&
      requestSessionGeneration === sessionGeneration.current &&
      sessionMatchesIdentity.current &&
      ownsClubMemberMutationClaim(
        membershipMutationStateRef.current,
        membershipId,
        claim,
      );

    try {
      let mutationResult;
      try {
        mutationResult = await mutateClubMemberRole(supabase, {
          action,
          clubId: clubUuid,
          membershipId,
          requestId: requestSlot.requestId,
          reason,
        });
      } catch (error) {
        if (!isCurrent()) return { status: "stale_or_cancelled" };
        const mapped = toClubMemberRoleMutationError(error);
        commitMembershipMutationState(
          setClubMemberRoleOperationError(
            membershipMutationStateRef.current,
            membershipId,
            claim,
            mapped.userMessage,
          ),
        );
        if (mapped.kind === "authentication") {
          refreshAfterSensitiveFailure(mapped.userMessage);
        }
        return { status: "mutation_failed", error: mapped };
      }

      if (!isCurrent()) return { status: "stale_or_cancelled" };

      const feedback: ClubMemberRoleMutationFeedback = {
        action,
        membershipId,
        changed: mutationResult.changed,
        replayed: mutationResult.replayed,
        outcome: mutationResult.outcome,
        mutationSucceeded: true,
        refreshSucceeded: false,
      };
      commitMembershipMutationState(
        setClubMemberRoleOperationResult(
          membershipMutationStateRef.current,
          membershipId,
          claim,
          feedback,
        ),
      );

      const refreshResult = await refreshClubMembershipStatusView({
        refreshList: () => loadFirstPage({
          preserveStatusMutation: true,
          targetMembershipId: membershipId,
          deriveFilterPresenceFromTarget: true,
          restoreLoadedItemCount: items.length,
          deferSelectionClear: true,
          backgroundRefresh: true,
        }),
        refreshDetail: () =>
          selectedMembershipIdRef.current === membershipId
            ? loadDetail(membershipId, {
                mobileDetailBehavior: "preserve",
                backgroundRefresh: true,
              })
            : Promise.resolve("success"),
        isCurrent,
      });

      if (refreshResult.status === "stale_or_cancelled" || !isCurrent()) {
        return { status: "stale_or_cancelled" };
      }
      if (refreshResult.status === "refresh_failed") {
        commitMembershipMutationState(
          setClubMemberRoleRefreshRecovery(
            membershipMutationStateRef.current,
            membershipId,
            claim,
            {
              membershipId,
              action,
              sessionGeneration: requestSessionGeneration,
              queryGeneration: queryGeneration.current,
              loadedItemCount: items.length,
              listRefreshed: refreshResult.listRefreshed,
              detailRefreshed: refreshResult.detailRefreshed,
              filteredOut: refreshResult.filteredOut,
            },
            "\uc6b4\uc601\uc9c4 \uc5ed\ud560 \ubcc0\uacbd\uc740 \uc644\ub8cc\ub410\uc9c0\ub9cc \ucd5c\uc2e0 \uc815\ubcf4\ub97c \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4. \ub2e4\uc2dc \ubd88\ub7ec\uc624\uae30\ub85c \ud604\uc7ac \uc5ed\ud560\uc744 \ud655\uc778\ud574 \uc8fc\uc138\uc694.",
          ),
        );
        if (refreshResult.filteredOut) clearDetailState(true);
        return {
          status: "mutation_succeeded_but_refresh_failed",
          listRefreshed: refreshResult.listRefreshed,
          detailRefreshed: refreshResult.detailRefreshed,
          filteredOut: refreshResult.filteredOut,
          result: feedback,
        };
      }

      const syncedFeedback = { ...feedback, refreshSucceeded: true };
      commitMembershipMutationState(
        setClubMemberRoleOperationResult(
          membershipMutationStateRef.current,
          membershipId,
          claim,
          syncedFeedback,
        ),
      );
      if (refreshResult.filteredOut) clearDetailState(true);
      setLiveMessage(
        mutationResult.replayed
          ? "\uc774\ubbf8 \uc644\ub8cc\ub41c \uc6b4\uc601\uc9c4 \uc5ed\ud560 \uc694\uccad \uacb0\uacfc\ub97c \ud655\uc778\ud588\uc2b5\ub2c8\ub2e4."
          : mutationResult.outcome === "noop"
            ? "\ud68c\uc6d0 \uc5ed\ud560\uc774 \uc774\ubbf8 \uc694\uccad\ud55c \uc0c1\ud0dc\uc785\ub2c8\ub2e4. \ucd5c\uc2e0 \uc815\ubcf4\ub97c \ub2e4\uc2dc \ubd88\ub7ec\uc654\uc2b5\ub2c8\ub2e4."
            : action === "grant"
              ? "\uc77c\ubc18 \uc6b4\uc601\uc9c4 \uc5ed\ud560\uc744 \ubd80\uc5ec\ud588\uc2b5\ub2c8\ub2e4."
              : "\uc77c\ubc18 \uc6b4\uc601\uc9c4 \uc5ed\ud560\uc744 \ud68c\uc218\ud588\uc2b5\ub2c8\ub2e4.",
      );
      return {
        status: "mutation_succeeded_and_synced",
        filteredOut: refreshResult.filteredOut,
        result: syncedFeedback,
      };
    } finally {
      releaseMembershipMutation(membershipId, claim);
    }
  }, [
    canManageClubRoles,
    claimRoleMembershipMutation,
    clearDetailState,
    clubUuid,
    commitMembershipMutationState,
    currentSessionGeneration,
    dataIdentityKey,
    detail,
    identityKey,
    items,
    loadDetail,
    loadFirstPage,
    refreshAfterSensitiveFailure,
    releaseMembershipMutation,
    setRolePreflightError,
    sessionVerification,
    supabase,
    trustedActorMembershipId,
  ]);
  const grantManagerRole = useCallback(
    (membershipId: string, reason: string) =>
      runRoleMutation("grant", membershipId, reason),
    [runRoleMutation],
  );
  const revokeManagerRole = useCallback(
    (membershipId: string, reason: string) =>
      runRoleMutation("revoke", membershipId, reason),
    [runRoleMutation],
  );

  const runStatusMutation = useCallback(async (
    action: ClubMembershipStatusMutationAction,
    rawReason: string,
  ): Promise<ClubMembershipStatusMutationLifecycleResult> => {
    const currentDetail = detail;
    const membershipId = currentDetail?.member.membershipId;
    const currentStatus = currentDetail?.member.membershipStatus;
    const loadedItemCount = items.length;
    const expectedStatus: ClubMembershipStatus =
      action === "suspend"
        ? "suspended"
        : action === "end"
          ? "left"
          : "active";
    const actionMatchesCurrentStatus =
      (action === "suspend" && currentStatus === "active") ||
      (action === "resume" && currentStatus === "suspended") ||
      (action === "end" &&
        (currentStatus === "active" || currentStatus === "suspended")) ||
      (action === "activate" && currentStatus === "left");
    const hasProtectedRole = Boolean(
      currentDetail?.member.currentRoles.some(({ roleKey: currentRoleKey }) =>
        currentRoleKey === "club_admin" || currentRoleKey === "club_vice_admin",
      ),
    );

    if (
      !sessionMatchesIdentity.current ||
      !canManageMembershipStatus ||
      currentDetail?.historyScope !== "limited_history" ||
      !membershipId ||
      selectedMembershipIdRef.current !== membershipId ||
      hasProtectedRole ||
      !actionMatchesCurrentStatus ||
      statusRefreshRecovery.current?.membershipId === membershipId ||
      hasClubMemberRoleRefreshRecovery(
        membershipMutationStateRef.current,
        membershipId,
      )
    ) {
      const error = new Error(
        "현재 선택한 회원의 상태를 변경할 수 없습니다. 최신 정보를 다시 확인해 주세요.",
      );
      setStatusMutationError(error.message);
      return { status: "mutation_failed", error };
    }

    let reason: string;
    try {
      reason = normalizeClubMembershipStatusReason(rawReason);
    } catch (error) {
      setStatusMutationError(
        toClubMembershipStatusMutationError(error).userMessage,
      );
      return { status: "mutation_failed", error };
    }

    const requestSessionGeneration = sessionGeneration.current;
    const generation = mutationGeneration.current + 1;
    const claim = createClubMemberMutationClaim({
      membershipId,
      kind: "status",
      sessionGeneration: requestSessionGeneration,
      operationSequence: ++membershipMutationOperationSequence.current,
    });
    if (!claimStatusMembershipMutation(claim, false)) {
      const error = new Error(
        "\uc774 \ud68c\uc6d0\uc758 \ub2e4\ub978 \uad00\ub9ac \uc791\uc5c5\uc774 \uc9c4\ud589 \uc911\uc785\ub2c8\ub2e4. \uc644\ub8cc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.",
      );
      setStatusMutationError(error.message);
      return { status: "mutation_failed", error };
    }

    let requestSlot: ClubMembershipStatusRequestSlot;
    try {
      const fingerprint =
        `${requestSessionGeneration}:${membershipId}:${action}:${reason}`;
      requestSlot = resolveClubMembershipStatusRequestSlot(
        statusMutationRequestSlot.current,
        fingerprint,
      );
      statusMutationRequestSlot.current = requestSlot;
    } catch (error) {
      releaseMembershipMutation(membershipId, claim);
      setStatusMutationError(
        toClubMembershipStatusMutationError(error).userMessage,
      );
      return { status: "mutation_failed", error };
    }

    mutationGeneration.current = generation;
    setStatusMutationAction(action);
    setStatusMutationError(undefined);
    setStatusMutationSuccess(undefined);

    const isCurrent = () =>
      mounted.current &&
      generation === mutationGeneration.current &&
      requestSessionGeneration === sessionGeneration.current &&
      sessionMatchesIdentity.current &&
      selectedMembershipIdRef.current === membershipId &&
      ownsClubMemberMutationClaim(
        membershipMutationStateRef.current,
        membershipId,
        claim,
      );

    try {
      let completedMutationResult:
        | ClubMembershipStatusMutationResult
        | undefined;
      const lifecycleResult = await runClubMembershipStatusMutationLifecycle({
        mutate: async () => {
          const result = await mutateClubMembershipStatus(supabase, {
            action,
            clubId: clubUuid,
            membershipId,
            requestId: requestSlot.requestId,
            reason,
          });
          completedMutationResult = result;
          statusMutationRequestSlot.current = undefined;
          return result;
        },
        refreshList: () => {
          if (!completedMutationResult) {
            return Promise.resolve({ status: "failed" });
          }
          return loadFirstPage({
            preserveStatusMutation: true,
            targetMembershipId: membershipId,
            filterPresence: resolveClubMembershipFilterPresence(
              membershipStatus,
              completedMutationResult.currentStatus,
            ),
            restoreLoadedItemCount: loadedItemCount,
            deferSelectionClear: true,
            backgroundRefresh: true,
          });
        },
        refreshDetail: () => loadDetail(membershipId, {
          mobileDetailBehavior: "preserve",
          backgroundRefresh: true,
        }),
        isCurrent: () => isCurrent(),
      });

      if (lifecycleResult.status === "stale_or_cancelled") {
        return lifecycleResult;
      }
      if (lifecycleResult.status === "mutation_failed") {
        const mapped = toClubMembershipStatusMutationError(
          lifecycleResult.error,
        );
        if (!mapped.preserveRequestId) {
          statusMutationRequestSlot.current = undefined;
        }
        if (mapped.clearSensitiveData) {
          refreshAfterSensitiveFailure(mapped.userMessage);
          return lifecycleResult;
        }
        if (mapped.shouldRefresh && isCurrent()) {
          const refreshResult = await refreshClubMembershipStatusView({
            refreshList: () => loadFirstPage({
              preserveStatusMutation: true,
              targetMembershipId: membershipId,
              filterPresence: resolveClubMembershipFilterPresence(
                membershipStatus,
                expectedStatus,
              ),
              restoreLoadedItemCount: loadedItemCount,
              deferSelectionClear: true,
              backgroundRefresh: true,
            }),
            refreshDetail: () => loadDetail(membershipId, {
              mobileDetailBehavior: "preserve",
              backgroundRefresh: true,
            }),
            isCurrent: () => isCurrent(),
          });
          if (
            refreshResult.status === "synced" &&
            refreshResult.filteredOut
          ) {
            clearDetailState(true);
          }
        }
        if (isCurrent()) setStatusMutationError(mapped.userMessage);
        return lifecycleResult;
      }

      if (lifecycleResult.status === "mutation_succeeded_but_refresh_failed") {
        statusRefreshRecovery.current = {
          sessionGeneration: requestSessionGeneration,
          membershipId,
          currentStatus: lifecycleResult.mutationResult.currentStatus,
          loadedItemCount,
        };
        const warning =
          "회원 상태 변경은 완료됐지만 최신 정보를 불러오지 못했습니다. 다시 불러오기를 눌러 현재 상태를 확인해 주세요.";
        setStatusMutationSuccess(undefined);
        setStatusRefreshWarning(warning);
        return lifecycleResult;
      }

      const result = lifecycleResult.mutationResult;
      const successMessage = result.replayed
        ? "이미 완료된 요청 결과를 확인했습니다."
        : result.outcome === "noop"
          ? action === "end"
            ? "이미 탈퇴 처리된 회원입니다."
            : action === "activate"
              ? "이미 활동 중인 회원입니다."
              : "회원 상태가 이미 요청한 상태입니다. 최신 정보를 다시 불러왔습니다."
          : action === "suspend"
            ? "회원 활동을 정지했습니다."
            : action === "resume"
              ? "회원 정지를 해제했습니다."
              : action === "end"
                ? "회원이 강제 탈퇴 처리되었습니다."
                : "회원이 재가입 처리되었습니다.";
      setStatusMutationSuccess(successMessage);
      setLiveMessage(successMessage);
      return lifecycleResult;
    } finally {
      releaseMembershipMutation(membershipId, claim);
      if (mounted.current && generation === mutationGeneration.current) {
        setStatusMutationAction(undefined);
      }
    }
  }, [
    canManageMembershipStatus,
    claimStatusMembershipMutation,
    clearDetailState,
    clubUuid,
    detail,
    items.length,
    loadDetail,
    loadFirstPage,
    membershipStatus,
    refreshAfterSensitiveFailure,
    releaseMembershipMutation,
    supabase,
  ]);

  const roleCapabilityAvailable =
    canManageClubRoles === true &&
    trustedActorMembershipId !== null &&
    sessionVerification.status === "matched" &&
    sessionVerification.generation === currentSessionGeneration;

  const isSelfTarget = useCallback(
    (membershipId: string) =>
      roleCapabilityAvailable &&
      parseCanonicalMembershipId(membershipId) === trustedActorMembershipId,
    [roleCapabilityAvailable, trustedActorMembershipId],
  );

  const readValue = useMemo<ClubMemberManagementReadContextValue>(() => ({
    canManageMembershipStatus,
    canManageClubRoles: roleCapabilityAvailable,
    draftSearch,
    appliedSearch,
    searchError,
    membershipStatus,
    roleKey,
    items: dataIdentityKey === identityKey ? items : [],
    initialLoading,
    loadingMore,
    initialError,
    loadMoreError,
    hasMore: dataIdentityKey === identityKey && hasMore,
    liveMessage,
    hasActiveFilters: Boolean(appliedSearch || membershipStatus || roleKey),
    selectedMembershipId,
    detail,
    detailLoading,
    detailError,
    detailLiveMessage,
    mobileDetailOpen,

    setDraftSearch,
    submitSearch,
    setMembershipStatus,
    setRoleKey,
    resetFilters,
    retryInitial,
    loadMore,
    selectMember,
    retryDetail,
    closeMobileDetail,
  }), [
    appliedSearch,
    closeMobileDetail,
    canManageMembershipStatus,
    roleCapabilityAvailable,
    dataIdentityKey,
    detail,
    detailError,
    detailLiveMessage,
    detailLoading,
    draftSearch,
    hasMore,
    identityKey,
    initialError,
    initialLoading,
    liveMessage,
    loadMore,
    loadMoreError,
    loadingMore,
    membershipStatus,
    mobileDetailOpen,
    resetFilters,
    retryDetail,
    retryInitial,
    roleKey,
    searchError,
    selectMember,
    selectedMembershipId,

    setDraftSearch,
    setMembershipStatus,
    setRoleKey,
    submitSearch,
    items,
  ]);

  const mutationValue = useMemo<ClubMemberStatusMutationContextValue>(() => ({
    statusMutationAction,
    statusMutationError,
    statusMutationSuccess,
    statusRefreshWarning,
    statusRefreshRetrying,
    statusActionsBlockedUntilRefresh:
      shouldBlockClubMemberStatusActions(statusRefreshWarning),
    runStatusMutation,
    finalizeStatusMutationUi,
    retryStatusRefresh,
    clearStatusMutationState,
    isMembershipMutationPending: isMembershipMutationPendingForId,
  }), [
    clearStatusMutationState,
    isMembershipMutationPendingForId,
    finalizeStatusMutationUi,
    retryStatusRefresh,
    runStatusMutation,
    statusMutationAction,
    statusMutationError,
    statusMutationSuccess,
    statusRefreshRetrying,
    statusRefreshWarning,
  ]);

  const roleMutationValue = useMemo<ClubMemberRoleMutationContextValue>(() => ({
    canManageClubRoles: roleCapabilityAvailable,
    isSelfTarget,
    grantManagerRole,
    revokeManagerRole,
    isRoleMutationPending: isRoleMutationPendingForId,
    isMembershipMutationPending: isMembershipMutationPendingForId,
    getRoleMutationState,
    clearRoleMutationFeedback: clearRoleMutationFeedbackForId,
    retryRoleMutationRefresh,
  }), [
    clearRoleMutationFeedbackForId,
    getRoleMutationState,
    grantManagerRole,
    isSelfTarget,
    isMembershipMutationPendingForId,
    isRoleMutationPendingForId,
    retryRoleMutationRefresh,
    revokeManagerRole,
    roleCapabilityAvailable,
  ]);
  const provideMutationContext =
    shouldProvideClubMemberStatusMutationContext(
      canManageMembershipStatus,
      sessionVerification,
      currentSessionGeneration,
    );

  return (
    <ClubMemberManagementReadContext.Provider value={readValue}>
      <ClubMemberRoleMutationContext.Provider value={roleMutationValue}>
        {provideMutationContext ? (
          <ClubMemberStatusMutationContext.Provider value={mutationValue}>
            {children}
          </ClubMemberStatusMutationContext.Provider>
        ) : children}
      </ClubMemberRoleMutationContext.Provider>
    </ClubMemberManagementReadContext.Provider>
  );
}
