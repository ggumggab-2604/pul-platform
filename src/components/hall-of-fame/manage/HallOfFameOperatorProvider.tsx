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
  type ReactNode,
} from "react";

import {
  addHallOfFameDisputeInternalNoteAction,
  resolveHallOfFameDisputeAction,
  resolveHallOfFameDisputeWithCorrectionAction,
  resolveHallOfFameDisputeWithRevokeAction,
  startHallOfFameDisputeReviewAction,
} from "@/app/hall-of-fame/manage/actions";
import {
  getHallOfFameDisputeForReview,
  getHallOfFameDisputeResolutionContext,
  listHallOfFameDisputeInternalNotes,
  listHallOfFameDisputeReviewQueue,
  toHallOfFameOperatorError,
  type HallOfFameCorrectionInput,
  type HallOfFameDisputeInternalNote,
  type HallOfFameDisputeQueueItem,
  type HallOfFameDisputeResolutionContext,
  type HallOfFameDisputeReviewDetail,
  type HallOfFameNoActionInput,
  type HallOfFameOperatorPermissions,
  type HallOfFameRevokeInput,
} from "@/lib/hall-of-fame/hallOfFameOperatorUi";
import type {
  HallOfFameDisputeStatus,
  HallOfFameDisputeType,
} from "@/lib/hall-of-fame/hallOfFameMemberUi";
import { createClient } from "@/lib/supabase/client";

type OperatorContextValue = {
  permissions: HallOfFameOperatorPermissions;
  statusFilter: HallOfFameDisputeStatus | null;
  typeFilter: HallOfFameDisputeType | null;
  setStatusFilter: (value: HallOfFameDisputeStatus | null) => void;
  setTypeFilter: (value: HallOfFameDisputeType | null) => void;
  items: HallOfFameDisputeQueueItem[];
  listLoading: boolean;
  listLoadingMore: boolean;
  listError?: string;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  selectedDisputeId?: string;
  selectDispute: (disputeId: string) => void;
  mobileDetailOpen: boolean;
  closeMobileDetail: () => void;
  detail?: HallOfFameDisputeReviewDetail;
  notes: HallOfFameDisputeInternalNote[];
  detailLoading: boolean;
  detailError?: string;
  mutationKey?: string;
  successMessage?: string;
  mutationError?: string;
  refresh: () => Promise<void>;
  startReview: () => Promise<boolean>;
  addInternalNote: (note: string) => Promise<boolean>;
  resolveNoAction: (input: Omit<HallOfFameNoActionInput, "disputeId" | "expectedVersion">) => Promise<boolean>;
  resolveCorrection: (input: HallOfFameCorrectionInput) => Promise<boolean>;
  resolveRevoke: (input: HallOfFameRevokeInput) => Promise<boolean>;
  loadResolutionContext: () => Promise<HallOfFameDisputeResolutionContext | undefined>;
};

const OperatorContext = createContext<OperatorContextValue | null>(null);

export function useHallOfFameOperatorManagement() {
  const value = useContext(OperatorContext);
  if (!value) throw new Error("HallOfFameOperatorProvider is required.");
  return value;
}

export function HallOfFameOperatorProvider({
  authenticatedUserId,
  permissions,
  children,
}: {
  authenticatedUserId: string;
  permissions: HallOfFameOperatorPermissions;
  children: ReactNode;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [statusFilter, setStatusFilterState] = useState<HallOfFameDisputeStatus | null>(null);
  const [typeFilter, setTypeFilterState] = useState<HallOfFameDisputeType | null>(null);
  const [items, setItems] = useState<HallOfFameDisputeQueueItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listError, setListError] = useState<string>();
  const [hasMore, setHasMore] = useState(false);
  const [selectedDisputeId, setSelectedDisputeId] = useState<string>();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [detail, setDetail] = useState<HallOfFameDisputeReviewDetail>();
  const [notes, setNotes] = useState<HallOfFameDisputeInternalNote[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [mutationKey, setMutationKey] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const selectedDisputeIdRef = useRef<string | undefined>(undefined);
  const itemsRef = useRef<HallOfFameDisputeQueueItem[]>([]);
  const authRefreshStarted = useRef(false);

  const clearSensitiveState = useCallback(() => {
    listSequence.current += 1;
    detailSequence.current += 1;
    itemsRef.current = [];
    setItems([]);
    setListLoading(false);
    setListLoadingMore(false);
    setListError(undefined);
    setHasMore(false);
    selectedDisputeIdRef.current = undefined;
    setSelectedDisputeId(undefined);
    setMobileDetailOpen(false);
    setDetail(undefined);
    setNotes([]);
    setDetailLoading(false);
    setDetailError(undefined);
    setMutationKey(undefined);
    setSuccessMessage(undefined);
    setMutationError(undefined);
  }, []);

  useEffect(() => {
    let active = true;
    const handleSession = (userId?: string) => {
      if (!active) return;
      if (userId === authenticatedUserId) {
        authRefreshStarted.current = false;
        return;
      }
      clearSensitiveState();
      if (!authRefreshStarted.current) {
        authRefreshStarted.current = true;
        router.refresh();
      }
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => handleSession(data.session?.user.id))
      .catch(() => handleSession(undefined));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session?.user.id);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [authenticatedUserId, clearSensitiveState, router, supabase]);

  const loadList = useCallback(async (append = false) => {
    const sequence = ++listSequence.current;
    if (append) setListLoadingMore(true);
    else setListLoading(true);
    setListError(undefined);
    try {
      const page = await listHallOfFameDisputeReviewQueue(
        supabase,
        statusFilter,
        typeFilter,
        50,
        append ? itemsRef.current.length : 0,
      );
      if (sequence !== listSequence.current) return;
      const nextItems = append
        ? [
            ...itemsRef.current,
            ...page.filter(
              (item) => !itemsRef.current.some((known) => known.disputeId === item.disputeId),
            ),
          ]
        : page;
      itemsRef.current = nextItems;
      setItems(nextItems);
      setHasMore(page.length === 50);
      const selected = selectedDisputeIdRef.current;
      if (selected && !nextItems.some((item) => item.disputeId === selected)) {
        detailSequence.current += 1;
        selectedDisputeIdRef.current = undefined;
        setSelectedDisputeId(undefined);
        setMobileDetailOpen(false);
        setDetail(undefined);
        setNotes([]);
      }
    } catch (error) {
      if (sequence !== listSequence.current) return;
      if (!append) {
        itemsRef.current = [];
        setItems([]);
        setHasMore(false);
      }
      setListError(toHallOfFameOperatorError(error).userMessage);
    } finally {
      if (sequence === listSequence.current) {
        setListLoading(false);
        setListLoadingMore(false);
      }
    }
  }, [statusFilter, supabase, typeFilter]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadList());
    return () => window.cancelAnimationFrame(frame);
  }, [loadList]);

  const loadDetail = useCallback(
    async (disputeId: string) => {
      const sequence = ++detailSequence.current;
      setDetailLoading(true);
      setDetailError(undefined);
      try {
        const [nextDetail, nextNotes] = await Promise.all([
          getHallOfFameDisputeForReview(supabase, disputeId),
          listHallOfFameDisputeInternalNotes(supabase, disputeId),
        ]);
        if (sequence !== detailSequence.current) return;
        if (nextDetail.disputeId !== disputeId) {
          throw new Error("HOF_OPERATOR_DETAIL_ID_MISMATCH");
        }
        setDetail(nextDetail);
        setNotes(nextNotes);
      } catch (error) {
        if (sequence !== detailSequence.current) return;
        setDetail(undefined);
        setNotes([]);
        setDetailError(toHallOfFameOperatorError(error).userMessage);
      } finally {
        if (sequence === detailSequence.current) setDetailLoading(false);
      }
    },
    [supabase],
  );

  const selectDispute = useCallback(
    (disputeId: string) => {
      selectedDisputeIdRef.current = disputeId;
      setSelectedDisputeId(disputeId);
      setMobileDetailOpen(true);
      setSuccessMessage(undefined);
      setMutationError(undefined);
      setDetail(undefined);
      setNotes([]);
      void loadDetail(disputeId);
    },
    [loadDetail],
  );

  const setStatusFilter = useCallback((value: HallOfFameDisputeStatus | null) => {
    listSequence.current += 1;
    detailSequence.current += 1;
    selectedDisputeIdRef.current = undefined;
    setStatusFilterState(value);
    itemsRef.current = [];
    setItems([]);
    setHasMore(false);
    setSelectedDisputeId(undefined);
    setMobileDetailOpen(false);
    setDetail(undefined);
    setNotes([]);
  }, []);

  const setTypeFilter = useCallback((value: HallOfFameDisputeType | null) => {
    listSequence.current += 1;
    detailSequence.current += 1;
    selectedDisputeIdRef.current = undefined;
    setTypeFilterState(value);
    itemsRef.current = [];
    setItems([]);
    setHasMore(false);
    setSelectedDisputeId(undefined);
    setMobileDetailOpen(false);
    setDetail(undefined);
    setNotes([]);
  }, []);

  const refresh = useCallback(async () => {
    const disputeId = selectedDisputeId;
    await Promise.all([
      loadList(false),
      disputeId ? loadDetail(disputeId) : Promise.resolve(),
    ]);
  }, [loadDetail, loadList, selectedDisputeId]);

  const runAction = useCallback(
    async (
      key: string,
      action: () => Promise<{ ok: true; message: string } | { ok: false; message: string; shouldRefresh: boolean }>,
    ) => {
      if (mutationKey) return false;
      setMutationKey(key);
      setSuccessMessage(undefined);
      setMutationError(undefined);
      try {
        const result = await action();
        if (!result.ok) {
          setMutationError(result.message);
          if (result.shouldRefresh) await refresh();
          return false;
        }
        setSuccessMessage(result.message);
        await refresh();
        return true;
      } catch (error) {
        const mapped = toHallOfFameOperatorError(error);
        setMutationError(mapped.userMessage);
        if (mapped.shouldRefresh) await refresh();
        return false;
      } finally {
        setMutationKey(undefined);
      }
    },
    [mutationKey, refresh],
  );

  const startReview = useCallback(async () => {
    if (!permissions.canReview || !detail || detail.status !== "open") return false;
    return runAction("review", () =>
      startHallOfFameDisputeReviewAction({
        disputeId: detail.disputeId,
        expectedVersion: detail.version,
      }),
    );
  }, [detail, permissions.canReview, runAction]);

  const addInternalNote = useCallback(
    async (note: string) => {
      if (!permissions.canReview || !detail || detail.status !== "under_review") return false;
      return runAction("note", () =>
        addHallOfFameDisputeInternalNoteAction({
          disputeId: detail.disputeId,
          expectedVersion: detail.version,
          note,
        }),
      );
    },
    [detail, permissions.canReview, runAction],
  );

  const resolveNoAction = useCallback(
    async (input: Omit<HallOfFameNoActionInput, "disputeId" | "expectedVersion">) => {
      if (!permissions.canResolve || !detail || detail.status !== "under_review") return false;
      return runAction("resolve", () =>
        resolveHallOfFameDisputeAction({
          ...input,
          disputeId: detail.disputeId,
          expectedVersion: detail.version,
        }),
      );
    },
    [detail, permissions.canResolve, runAction],
  );

  const resolveCorrection = useCallback(
    async (input: HallOfFameCorrectionInput) => {
      if (!permissions.canResolve || !permissions.canCorrect || input.disputeId !== detail?.disputeId) {
        return false;
      }
      return runAction("correction", () =>
        resolveHallOfFameDisputeWithCorrectionAction(input),
      );
    },
    [detail?.disputeId, permissions.canCorrect, permissions.canResolve, runAction],
  );

  const resolveRevoke = useCallback(
    async (input: HallOfFameRevokeInput) => {
      if (!permissions.canResolve || !permissions.canRevoke || input.disputeId !== detail?.disputeId) {
        return false;
      }
      return runAction("revoke", () => resolveHallOfFameDisputeWithRevokeAction(input));
    },
    [detail?.disputeId, permissions.canResolve, permissions.canRevoke, runAction],
  );

  const loadResolutionContext = useCallback(async () => {
    if (!permissions.canResolve || !detail || detail.status !== "under_review") return undefined;
    try {
      const context = await getHallOfFameDisputeResolutionContext(supabase, detail.disputeId);
      if (context.disputeId !== detail.disputeId || context.disputeVersion !== detail.version) {
        setMutationError("요청 정보가 변경되었습니다. 최신 내용을 다시 확인해 주세요.");
        await refresh();
        return undefined;
      }
      return context;
    } catch (error) {
      const mapped = toHallOfFameOperatorError(error);
      setMutationError(mapped.userMessage);
      if (mapped.shouldRefresh) await refresh();
      return undefined;
    }
  }, [detail, permissions.canResolve, refresh, supabase]);

  const value = useMemo<OperatorContextValue>(
    () => ({
      permissions,
      statusFilter,
      typeFilter,
      setStatusFilter,
      setTypeFilter,
      items,
      listLoading,
      listLoadingMore,
      listError,
      hasMore,
      loadMore: () => loadList(true),
      selectedDisputeId,
      selectDispute,
      mobileDetailOpen,
      closeMobileDetail: () => setMobileDetailOpen(false),
      detail,
      notes,
      detailLoading,
      detailError,
      mutationKey,
      successMessage,
      mutationError,
      refresh,
      startReview,
      addInternalNote,
      resolveNoAction,
      resolveCorrection,
      resolveRevoke,
      loadResolutionContext,
    }),
    [
      addInternalNote,
      detail,
      detailError,
      detailLoading,
      items,
      hasMore,
      listError,
      listLoading,
      listLoadingMore,
      loadList,
      loadResolutionContext,
      mobileDetailOpen,
      mutationError,
      mutationKey,
      notes,
      permissions,
      refresh,
      resolveCorrection,
      resolveNoAction,
      resolveRevoke,
      selectDispute,
      selectedDisputeId,
      setStatusFilter,
      setTypeFilter,
      startReview,
      statusFilter,
      successMessage,
      typeFilter,
    ],
  );

  return <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>;
}
