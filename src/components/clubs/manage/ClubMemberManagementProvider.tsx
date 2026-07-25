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
import { createClient } from "@/lib/supabase/client";

type ClubMemberManagementReadContextValue = {
  canManageMembershipStatus: boolean;
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
};

const ClubMemberManagementReadContext =
  createContext<ClubMemberManagementReadContextValue | null>(null);
const ClubMemberStatusMutationContext =
  createContext<ClubMemberStatusMutationContextValue | null>(null);

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
  children: ReactNode;
  canManageMembershipStatus: boolean;
};

type LoadClubMemberDetailOptions = {
  mobileDetailBehavior?: "open" | "close" | "preserve";
  trigger?: HTMLButtonElement;
  backgroundRefresh?: boolean;
};

export function ClubMemberManagementProvider({
  authenticatedUserId,
  clubUuid,
  children,
  canManageMembershipStatus,
}: ProviderProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const identityKey = `${authenticatedUserId}:${clubUuid}`;
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
  }, [clearDetailState]);

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
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
      detailRequestGeneration.current += 1;
      mutationGeneration.current += 1;
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
    restoreLoadedItemCount = 0,
    deferSelectionClear = false,
    backgroundRefresh = false,
  }: {
    preserveStatusMutation?: boolean;
    targetMembershipId?: string;
    filterPresence?: ClubMembershipFilterPresence;
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
        filterPresence,
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
      statusMutationAction ||
      statusRefreshWarning ||
      !sessionMatchesIdentity.current ||
      !canManageMembershipStatus ||
      currentDetail?.historyScope !== "limited_history" ||
      !membershipId ||
      selectedMembershipIdRef.current !== membershipId ||
      hasProtectedRole ||
      !actionMatchesCurrentStatus
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
    const fingerprint =
      `${requestSessionGeneration}:${membershipId}:${action}:${reason}`;
    const requestSlot = resolveClubMembershipStatusRequestSlot(
      statusMutationRequestSlot.current,
      fingerprint,
    );
    statusMutationRequestSlot.current = requestSlot;

    const generation = ++mutationGeneration.current;
    setStatusMutationAction(action);
    setStatusMutationError(undefined);
    setStatusMutationSuccess(undefined);
    clearStatusRefreshState();

    const isCurrent = () =>
      mounted.current &&
      generation === mutationGeneration.current &&
      requestSessionGeneration === sessionGeneration.current &&
      sessionMatchesIdentity.current &&
      selectedMembershipIdRef.current === membershipId;

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
      if (mounted.current && generation === mutationGeneration.current) {
        setStatusMutationAction(undefined);
      }
    }
  }, [
    canManageMembershipStatus,
    clearDetailState,
    clearStatusRefreshState,
    clubUuid,
    detail,
    items.length,
    loadDetail,
    loadFirstPage,
    membershipStatus,
    refreshAfterSensitiveFailure,
    statusMutationAction,
    statusRefreshWarning,
    supabase,
  ]);

  const readValue = useMemo<ClubMemberManagementReadContextValue>(() => ({
    canManageMembershipStatus,
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
  }), [
    clearStatusMutationState,
    finalizeStatusMutationUi,
    retryStatusRefresh,
    runStatusMutation,
    statusMutationAction,
    statusMutationError,
    statusMutationSuccess,
    statusRefreshRetrying,
    statusRefreshWarning,
  ]);

  const provideMutationContext =
    shouldProvideClubMemberStatusMutationContext(
      canManageMembershipStatus,
      sessionVerification,
      currentSessionGeneration,
    );

  return (
    <ClubMemberManagementReadContext.Provider value={readValue}>
      {provideMutationContext ? (
        <ClubMemberStatusMutationContext.Provider value={mutationValue}>
          {children}
        </ClubMemberStatusMutationContext.Provider>
      ) : children}
    </ClubMemberManagementReadContext.Provider>
  );
}
