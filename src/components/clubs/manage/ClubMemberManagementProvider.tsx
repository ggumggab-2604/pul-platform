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
import { createClient } from "@/lib/supabase/client";

type ClubMemberManagementContextValue = {
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
  setDraftSearch: (value: string) => void;
  submitSearch: (event: FormEvent<HTMLFormElement>) => void;
  setMembershipStatus: (value: ClubMembershipStatus | null) => void;
  setRoleKey: (value: ClubMemberRoleFilterKey | null) => void;
  resetFilters: () => void;
  retryInitial: () => void;
  loadMore: () => Promise<void>;
};

const ClubMemberManagementContext = createContext<ClubMemberManagementContextValue | null>(null);

export function useClubMemberManagement() {
  const value = useContext(ClubMemberManagementContext);
  if (!value) throw new Error("ClubMemberManagementProvider is required.");
  return value;
}

type ProviderProps = {
  authenticatedUserId: string;
  clubUuid: string;
  children: ReactNode;
};

export function ClubMemberManagementProvider({
  authenticatedUserId,
  clubUuid,
  children,
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
  const requestGeneration = useRef(0);
  const mounted = useRef(true);
  const authRefreshStarted = useRef(false);
  const sessionMatchesIdentity = useRef(true);

  const query = useMemo<ClubMemberListQuery>(
    () => ({ search: appliedSearch, membershipStatus, roleKey }),
    [appliedSearch, membershipStatus, roleKey],
  );

  const clearSensitiveState = useCallback(() => {
    requestGeneration.current += 1;
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
  }, []);

  const refreshAfterSensitiveFailure = useCallback((message: string) => {
    sessionMatchesIdentity.current = false;
    clearSensitiveState();
    setInitialError(message);
    if (!authRefreshStarted.current) {
      authRefreshStarted.current = true;
      router.refresh();
    }
  }, [clearSensitiveState, router]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const handleSessionUser = (sessionUserId?: string) => {
      if (!active) return;
      if (sessionUserId === authenticatedUserId) {
        sessionMatchesIdentity.current = true;
        authRefreshStarted.current = false;
        return;
      }
      sessionMatchesIdentity.current = false;
      clearSensitiveState();
      if (!authRefreshStarted.current) {
        authRefreshStarted.current = true;
        router.refresh();
      }
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => handleSessionUser(data.session?.user.id))
      .catch(() => handleSessionUser(undefined));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSessionUser(session?.user.id);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [authenticatedUserId, clearSensitiveState, router, supabase]);

  const loadFirstPage = useCallback(async () => {
    if (!sessionMatchesIdentity.current) return;
    const generation = ++requestGeneration.current;
    const requestIdentity = identityKey;
    setInitialLoading(true);
    setInitialError(undefined);
    setLoadMoreError(undefined);
    try {
      const response = await listClubMembersForManagement(supabase, clubUuid, query);
      if (!mounted.current || generation !== requestGeneration.current || requestIdentity !== identityKey) return;
      setItems(response.items);
      setDataIdentityKey(requestIdentity);
      setCursor(response.page.nextCursor);
      setHasMore(response.page.hasMore);
      setLiveMessage(`회원 ${response.items.length}명을 불러왔습니다.`);
    } catch (error) {
      if (!mounted.current || generation !== requestGeneration.current) return;
      const mapped = toClubMemberManagementError(error);
      if (mapped.clearSensitiveData) {
        refreshAfterSensitiveFailure(mapped.userMessage);
        return;
      }
      setItems([]);
      setDataIdentityKey(requestIdentity);
      setCursor(null);
      setHasMore(false);
      setInitialError(mapped.userMessage);
      setLiveMessage("회원 목록을 불러오지 못했습니다.");
    } finally {
      if (mounted.current && generation === requestGeneration.current) {
        setInitialLoading(false);
      }
    }
  }, [clubUuid, identityKey, query, refreshAfterSensitiveFailure, supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadFirstPage(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadFirstPage, queryRevision]);

  const beginQueryTransition = useCallback(() => {
    requestGeneration.current += 1;
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
  }, []);

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
  }, [clubUuid, cursor, dataIdentityKey, hasMore, identityKey, items, loadingMore, query, refreshAfterSensitiveFailure, supabase]);

  const value = useMemo<ClubMemberManagementContextValue>(() => ({
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
    setDraftSearch,
    submitSearch,
    setMembershipStatus,
    setRoleKey,
    resetFilters,
    retryInitial,
    loadMore,
  }), [
    appliedSearch,
    dataIdentityKey,
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
    resetFilters,
    retryInitial,
    roleKey,
    searchError,
    setDraftSearch,
    setMembershipStatus,
    setRoleKey,
    submitSearch,
    items,
  ]);

  return (
    <ClubMemberManagementContext.Provider value={value}>
      {children}
    </ClubMemberManagementContext.Provider>
  );
}
