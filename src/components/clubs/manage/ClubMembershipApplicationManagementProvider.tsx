"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  addMembershipApplicationInternalNote,
  approveMembershipApplication,
  createManagementRequestId,
  getMembershipApplicationDetailBundle,
  listMembershipApplications,
  manageMembershipApplication,
  rejectMembershipApplication,
  toMembershipApplicationManagementError,
  validateManagementBody,
  type ClubMembershipApplicationManagementPermissions,
  type ClubMembershipApplicationStatus,
  type ManagementOperation,
  type MembershipApplicationDetailBundle,
  type MembershipApplicationListItem,
} from "@/lib/clubs/membershipApplicationManagement";
import { createClient } from "@/lib/supabase/client";

type RequestSlot = { fingerprint: string; requestId: string };

type ManagementContextValue = {
  permissions: ClubMembershipApplicationManagementPermissions;
  filter: ClubMembershipApplicationStatus | null;
  setFilter: (filter: ClubMembershipApplicationStatus | null) => void;
  items: MembershipApplicationListItem[];
  listLoading: boolean;
  listLoadingMore: boolean;
  listError?: string;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  selectedApplicationId?: string;
  selectApplication: (applicationId: string) => void;
  closeMobileDetail: () => void;
  mobileDetailOpen: boolean;
  detailBundle?: MembershipApplicationDetailBundle;
  detailLoading: boolean;
  detailError?: string;
  mutationKey?: string;
  successMessage?: string;
  mutationError?: string;
  runOperation: (operation: ManagementOperation, body?: string) => Promise<boolean>;
  addInternalNote: (body: string) => Promise<boolean>;
  approve: () => Promise<boolean>;
  reject: () => Promise<boolean>;
  refreshSelected: () => Promise<void>;
};

const ManagementContext = createContext<ManagementContextValue | null>(null);

export function useClubMembershipApplicationManagement() {
  const value = useContext(ManagementContext);
  if (!value) throw new Error("ClubMembershipApplicationManagementProvider is required.");
  return value;
}

type ProviderProps = {
  authenticatedUserId: string;
  clubUuid: string;
  permissions: ClubMembershipApplicationManagementPermissions;
  children: React.ReactNode;
};

export function ClubMembershipApplicationManagementProvider({
  authenticatedUserId,
  clubUuid,
  permissions,
  children,
}: ProviderProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [filter, setFilterState] = useState<ClubMembershipApplicationStatus | null>(null);
  const [items, setItems] = useState<MembershipApplicationListItem[]>([]);
  const [cursor, setCursor] = useState<{ submittedAt: string; applicationId: string }>();
  const [listLoading, setListLoading] = useState(true);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listError, setListError] = useState<string>();
  const [selectedApplicationId, setSelectedApplicationId] = useState<string>();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [detailBundle, setDetailBundle] = useState<MembershipApplicationDetailBundle>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [mutationKey, setMutationKey] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const requestSlots = useRef<Record<string, RequestSlot>>({});
  const authRefreshStarted = useRef(false);

  const clearSensitiveState = useCallback(() => {
    listSequence.current += 1;
    detailSequence.current += 1;
    requestSlots.current = {};
    setFilterState(null);
    setItems([]);
    setCursor(undefined);
    setListLoading(false);
    setListLoadingMore(false);
    setListError(undefined);
    setSelectedApplicationId(undefined);
    setMobileDetailOpen(false);
    setDetailBundle(undefined);
    setDetailLoading(false);
    setDetailError(undefined);
    setMutationKey(undefined);
    setSuccessMessage(undefined);
    setMutationError(undefined);
  }, []);

  useEffect(() => {
    let active = true;

    const handleSessionUser = (sessionUserId?: string) => {
      if (!active) return;
      if (sessionUserId === authenticatedUserId) {
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

  const loadList = useCallback(async (append: boolean) => {
    if (!permissions.canRead) return;
    const sequence = ++listSequence.current;
    if (append) setListLoadingMore(true);
    else setListLoading(true);
    setListError(undefined);
    try {
      const page = await listMembershipApplications(supabase, clubUuid, filter, append ? cursor : undefined);
      if (sequence !== listSequence.current) return;
      setItems((current) => {
        if (!append) return page.items;
        const knownIds = new Set(current.map((item) => item.applicationId));
        return [...current, ...page.items.filter((item) => !knownIds.has(item.applicationId))];
      });
      setCursor(page.nextCursor);
      if (!append && selectedApplicationId && !page.items.some((item) => item.applicationId === selectedApplicationId)) {
        setSelectedApplicationId(undefined);
        setDetailBundle(undefined);
        setMobileDetailOpen(false);
      }
    } catch (error) {
      if (sequence !== listSequence.current) return;
      setListError(toMembershipApplicationManagementError(error).userMessage);
      if (!append) setItems([]);
    } finally {
      if (sequence === listSequence.current) {
        setListLoading(false);
        setListLoadingMore(false);
      }
    }
  }, [clubUuid, cursor, filter, permissions.canRead, selectedApplicationId, supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadList(false), 0);
    return () => window.clearTimeout(timeoutId);
  // Cursor and selection are intentionally excluded: changing them must not restart the first page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubUuid, filter, permissions.canRead, supabase]);

  const loadDetail = useCallback(async (applicationId: string) => {
    const sequence = ++detailSequence.current;
    setDetailLoading(true);
    setDetailError(undefined);
    try {
      const bundle = await getMembershipApplicationDetailBundle(supabase, applicationId);
      if (sequence === detailSequence.current) setDetailBundle(bundle);
    } catch (error) {
      if (sequence === detailSequence.current) {
        setDetailBundle(undefined);
        setDetailError(toMembershipApplicationManagementError(error).userMessage);
      }
    } finally {
      if (sequence === detailSequence.current) setDetailLoading(false);
    }
  }, [supabase]);

  const selectApplication = useCallback((applicationId: string) => {
    setSelectedApplicationId(applicationId);
    setMobileDetailOpen(true);
    setSuccessMessage(undefined);
    setMutationError(undefined);
    setDetailBundle(undefined);
    void loadDetail(applicationId);
  }, [loadDetail]);

  const setFilter = useCallback((nextFilter: ClubMembershipApplicationStatus | null) => {
    listSequence.current += 1;
    detailSequence.current += 1;
    setFilterState(nextFilter);
    setCursor(undefined);
    setItems([]);
    setSelectedApplicationId(undefined);
    setDetailBundle(undefined);
    setMobileDetailOpen(false);
    setListError(undefined);
    setDetailError(undefined);
  }, []);

  const refreshSelected = useCallback(async () => {
    const applicationId = selectedApplicationId;
    await Promise.all([
      loadList(false),
      applicationId ? loadDetail(applicationId) : Promise.resolve(),
    ]);
  }, [loadDetail, loadList, selectedApplicationId]);

  const requestIdFor = useCallback((key: string, fingerprint: string) => {
    const existing = requestSlots.current[key];
    if (existing?.fingerprint === fingerprint) return existing.requestId;
    const requestId = createManagementRequestId();
    requestSlots.current[key] = { fingerprint, requestId };
    return requestId;
  }, []);

  const handleMutationError = useCallback(async (key: string, error: unknown) => {
    const mapped = toMembershipApplicationManagementError(error);
    if (!mapped.preserveRequestId) delete requestSlots.current[key];
    if (mapped.shouldRefresh) await refreshSelected();
    setMutationError(mapped.userMessage);
  }, [refreshSelected]);

  const runOperation = useCallback(async (operation: ManagementOperation, rawBody?: string) => {
    if (!permissions.canManage) {
      setMutationError("이 작업을 처리할 권한이 없습니다.");
      return false;
    }
    const detail = detailBundle?.detail;
    if (!detail) return false;
    const allowedStatuses: Record<ManagementOperation, ClubMembershipApplicationStatus[]> = {
      review: ["submitted"],
      request_additional_info: ["reviewing"],
      request_interview: ["reviewing"],
      waitlist: ["reviewing"],
      resume_review: ["additional_info_required", "interview_requested", "waitlisted"],
    };
    if (!allowedStatuses[operation].includes(detail.status)) {
      setMutationError("현재 신청 상태에서는 이 작업을 처리할 수 없습니다.");
      return false;
    }
    if (mutationKey) return false;
    let body: string | null = null;
    try {
      if (operation === "request_additional_info") {
        body = validateManagementBody(rawBody ?? "", "추가 정보 요청 내용");
      }
    } catch (error) {
      setMutationError(toMembershipApplicationManagementError(error).userMessage);
      return false;
    }
    const key = operation;
    const fingerprint = `${detail.applicationId}:${detail.applicationVersion}:${body ?? ""}`;
    const requestId = requestIdFor(key, fingerprint);
    setMutationKey(key);
    setSuccessMessage(undefined);
    setMutationError(undefined);
    try {
      await manageMembershipApplication(supabase, {
        applicationId: detail.applicationId,
        operation,
        expectedVersion: detail.applicationVersion,
        publicRequestBody: body,
        requestId,
      });
      delete requestSlots.current[key];
      setSuccessMessage(operation === "request_additional_info" ? "신청자에게 추가 정보 요청을 남겼습니다." : "가입 신청 상태를 변경했습니다.");
      await refreshSelected();
      return true;
    } catch (error) {
      await handleMutationError(key, error);
      return false;
    } finally {
      setMutationKey(undefined);
    }
  }, [detailBundle?.detail, handleMutationError, mutationKey, permissions.canManage, refreshSelected, requestIdFor, supabase]);

  const addInternalNote = useCallback(async (rawBody: string) => {
    if (!permissions.canManage) {
      setMutationError("이 작업을 처리할 권한이 없습니다.");
      return false;
    }
    const detail = detailBundle?.detail;
    if (!detail) return false;
    if (mutationKey) return false;
    let body: string;
    try {
      body = validateManagementBody(rawBody, "내부 메모");
    } catch (error) {
      setMutationError(toMembershipApplicationManagementError(error).userMessage);
      return false;
    }
    const key = "internalNote";
    const requestId = requestIdFor(key, `${detail.applicationId}:${body}`);
    setMutationKey(key);
    setSuccessMessage(undefined);
    setMutationError(undefined);
    try {
      await addMembershipApplicationInternalNote(
        supabase,
        detail.applicationId,
        body,
        requestId,
        detail.status,
        detail.applicationVersion,
      );
      delete requestSlots.current[key];
      setSuccessMessage("운영진 내부 메모를 저장했습니다.");
      await loadDetail(detail.applicationId);
      return true;
    } catch (error) {
      await handleMutationError(key, error);
      return false;
    } finally {
      setMutationKey(undefined);
    }
  }, [detailBundle?.detail, handleMutationError, loadDetail, mutationKey, permissions.canManage, requestIdFor, supabase]);

  const approve = useCallback(async () => {
    if (!permissions.canDecide) {
      setMutationError("이 작업을 처리할 권한이 없습니다.");
      return false;
    }
    const detail = detailBundle?.detail;
    if (!detail) return false;
    if (!["reviewing", "interview_requested", "waitlisted"].includes(detail.status)) {
      setMutationError("현재 신청 상태에서는 승인할 수 없습니다.");
      return false;
    }
    if (mutationKey) return false;
    const key = "approve";
    const requestId = requestIdFor(key, `${detail.applicationId}:${detail.applicationVersion}`);
    setMutationKey(key);
    setSuccessMessage(undefined);
    setMutationError(undefined);
    try {
      await approveMembershipApplication(supabase, detail.applicationId, detail.applicationVersion, requestId);
      delete requestSlots.current[key];
      setSuccessMessage("가입 신청이 승인되었습니다. 회원 상태: 활동 회원 · 기본 역할: 동호회 회원");
      await refreshSelected();
      return true;
    } catch (error) {
      await handleMutationError(key, error);
      return false;
    } finally {
      setMutationKey(undefined);
    }
  }, [detailBundle?.detail, handleMutationError, mutationKey, permissions.canDecide, refreshSelected, requestIdFor, supabase]);

  const reject = useCallback(async () => {
    if (!permissions.canDecide) {
      setMutationError("이 작업을 처리할 권한이 없습니다.");
      return false;
    }
    const detail = detailBundle?.detail;
    if (!detail) return false;
    if (!["submitted", "reviewing", "additional_info_required", "interview_requested", "waitlisted"].includes(detail.status)) {
      setMutationError("현재 신청 상태에서는 거절할 수 없습니다.");
      return false;
    }
    if (mutationKey) return false;
    const key = "reject";
    const requestId = requestIdFor(key, `${detail.applicationId}:${detail.applicationVersion}`);
    setMutationKey(key);
    setSuccessMessage(undefined);
    setMutationError(undefined);
    try {
      await rejectMembershipApplication(supabase, detail.applicationId, detail.applicationVersion, requestId);
      delete requestSlots.current[key];
      setSuccessMessage("가입 신청을 최종 거절했습니다.");
      await refreshSelected();
      return true;
    } catch (error) {
      await handleMutationError(key, error);
      return false;
    } finally {
      setMutationKey(undefined);
    }
  }, [detailBundle?.detail, handleMutationError, mutationKey, permissions.canDecide, refreshSelected, requestIdFor, supabase]);

  const value: ManagementContextValue = {
    permissions,
    filter,
    setFilter,
    items,
    listLoading,
    listLoadingMore,
    listError,
    hasMore: Boolean(cursor),
    loadMore: () => loadList(true),
    selectedApplicationId,
    selectApplication,
    closeMobileDetail: () => setMobileDetailOpen(false),
    mobileDetailOpen,
    detailBundle,
    detailLoading,
    detailError,
    mutationKey,
    successMessage,
    mutationError,
    runOperation,
    addInternalNote,
    approve,
    reject,
    refreshSelected,
  };

  return <ManagementContext.Provider value={value}>{children}</ManagementContext.Provider>;
}
