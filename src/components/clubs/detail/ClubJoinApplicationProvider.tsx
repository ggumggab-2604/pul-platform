"use client";

import { MessagingSessionBoundary as ClubViewerBoundary } from "@/components/messaging/MessagingSessionBoundary";
import { ClubApplicationExtraFields, ClubApplicationPrivateDetails } from "./ClubApplicationExtraFields";
import { emptyClubApplicationDetails } from "@/lib/clubs/clubApplicationDetails";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  clubDetailRecruitStatusLabels,
  clubJoinApplicationStatusLabels,
} from "@/data/clubData";
import {
  useAuthSessionStatus,
  type AuthSessionStatus,
} from "@/hooks/useAuthSessionStatus";
import {
  MembershipApplicationClientError,
  canWithdrawApplication,
  createMutationRequestId,
  fetchActiveMembershipApplication,
  fetchClubRecruitmentStatus,
  fetchLatestMembershipApplication,
  fetchMembershipApplicationDetail,
  fetchMembershipApplicationHistory,
  fetchMembershipApplicationSupplements,
  fetchOwnClubMembershipState,
  isProcessingApplicationStatus,
  submitMembershipApplication,
  submitMembershipApplicationSupplement,
  toMembershipApplicationError,
  toUiApplicationStatus,
  validateMembershipApplicationForm,
  validateSupplementBody,
  withdrawMembershipApplication,
  type ClubMembershipApplicationDetail,
  type ClubMembershipApplicationHistoryEntry,
  type ClubMembershipApplicationSupplement,
  type ClubMembershipState,
} from "@/lib/clubs/membershipApplication";
import { createClient } from "@/lib/supabase/client";
import type {
  ClubJoinApplicationRuntimeIdentity,
  ClubJoinInquiryExperience,
  ClubJoinInquiryInterest,
  ClubRecruitStatus,
  ParkGolfClub,
} from "@/types";
import { UserRoundCheck } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

type Controller = { openApplication: (trigger: HTMLButtonElement) => void };
type ProviderProps = {
  viewerId?: string;
  club: ParkGolfClub;
  rules: string;
  applicationIdentity: ClubJoinApplicationRuntimeIdentity;
  children: ReactNode;
};
type Operation = "submit" | "withdraw" | "supplement";

const ControllerContext = createContext<Controller | null>(null);
const historyStateKey = "pulClubJoinApplication";

export function useClubJoinApplication() {
  const controller = useContext(ControllerContext);
  if (!controller) {
    throw new Error("useClubJoinApplication must be used within ClubJoinApplicationProvider");
  }
  return controller;
}

export function ClubJoinApplicationProvider({ viewerId,
  club,
  rules,
  applicationIdentity,
  children,
}: ProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef(false);
  const authStatus = useAuthSessionStatus();

  const finishClose = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const closeApplication = useCallback(() => {
    if (busyRef.current) return;
    if (window.history.state?.[historyStateKey]) {
      window.history.back();
      return;
    }
    finishClose();
  }, [finishClose]);

  const openApplication = useCallback((trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setIsOpen(true);
    window.history.pushState(
      { ...window.history.state, [historyStateKey]: true },
      "",
    );
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onPopState = () => {
      if (busyRef.current) {
        window.history.pushState(
          { ...window.history.state, [historyStateKey]: true },
          "",
        );
      } else {
        finishClose();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [finishClose, isOpen]);

  return (
    <ControllerContext.Provider value={{ openApplication }}>
      {children}
      {isOpen ? (
        <ClubViewerBoundary viewerId={viewerId??""}><ApplicationDialog
          viewerId={viewerId??""}
          key={viewerId+":"+authStatus+":"+rules}
          authStatus={authStatus}
          club={club}
          rules={rules}
          identity={applicationIdentity}
          onClose={closeApplication}
          onBusyChange={(busy) => {
            busyRef.current = busy;
          }}
        /></ClubViewerBoundary>
      ) : null}
    </ControllerContext.Provider>
  );
}

function ApplicationDialog({
  viewerId, authStatus,
  club,
  rules,
  identity,
  onClose,
  onBusyChange,
}: {
  viewerId: string;
  authStatus: AuthSessionStatus;
  club: ParkGolfClub;
  rules: string;
  identity: ClubJoinApplicationRuntimeIdentity;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const loadSequenceRef = useRef(0);
  const submitRequestRef = useRef<string | null>(null);
  const withdrawRequestRef = useRef<string | null>(null);
  const supplementRequestRef = useRef<string | null>(null);
  const [supabase] = useState(() => createClient());

  const [experience, setExperience] = useState<ClubJoinInquiryExperience>();
  const [interests, setInterests] = useState<ClubJoinInquiryInterest[]>([]);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState(emptyClubApplicationDetails);
  const [rulesConfirmed, setRulesConfirmed] = useState(false);
  const [courtesyConfirmed, setCourtesyConfirmed] = useState(false);
  const [supplementBody, setSupplementBody] = useState("");

  const [recruitmentStatus, setRecruitmentStatus] = useState<ClubRecruitStatus>(
    identity.recruitmentStatus ?? club.recruitStatus,
  );
  const [membershipState, setMembershipState] =
    useState<ClubMembershipState>("none");
  const [application, setApplication] =
    useState<ClubMembershipApplicationDetail | null>(null);
  const [history, setHistory] =
    useState<ClubMembershipApplicationHistoryEntry[]>([]);
  const [supplements, setSupplements] =
    useState<ClubMembershipApplicationSupplement[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [withdrawConfirming, setWithdrawConfirming] = useState(false);

  const busy = operation !== null;
  const clubUuid = identity.clubUuid;
  const featureAvailable =
    identity.featureAvailability === "available" && Boolean(clubUuid);

  useBodyScrollLock(true);

  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(element => element.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const loadState = useCallback(
    async (refresh = false) => {
      if (!clubUuid || authStatus !== "signedIn") return false;
      const sequence = ++loadSequenceRef.current;
      if (refresh) setRefreshing(true);
      else {
        setStateLoaded(false);
        setInitialLoading(true);
      }
      setErrorMessage(undefined);
      try {
        const [nextRecruitment, nextMembership, active] = await Promise.all([
          fetchClubRecruitmentStatus(supabase, clubUuid),
          fetchOwnClubMembershipState(supabase, clubUuid),
          fetchActiveMembershipApplication(supabase, clubUuid),
        ]);
        const latest =
          active ?? (await fetchLatestMembershipApplication(supabase, clubUuid));
        let detail: ClubMembershipApplicationDetail | null = null;
        let nextHistory: ClubMembershipApplicationHistoryEntry[] = [];
        let nextSupplements: ClubMembershipApplicationSupplement[] = [];
        if (latest) {
          [detail, nextHistory, nextSupplements] = await Promise.all([
            fetchMembershipApplicationDetail(supabase, latest.applicationId),
            fetchMembershipApplicationHistory(supabase, latest.applicationId),
            fetchMembershipApplicationSupplements(supabase, latest.applicationId),
          ]);
        }
        if (loadSequenceRef.current !== sequence) return false;
        setRecruitmentStatus(nextRecruitment);
        setMembershipState(nextMembership);
        setApplication(detail);
        setHistory(nextHistory);
        setSupplements(nextSupplements);
        setStateLoaded(true);
        return true;
      } catch (error) {
        if (loadSequenceRef.current !== sequence) return false;
        setErrorMessage(toMembershipApplicationError(error).userMessage);
        return false;
      } finally {
        if (loadSequenceRef.current === sequence) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [authStatus, clubUuid, supabase],
  );

  useEffect(() => {
    if (!featureAvailable || authStatus !== "signedIn") return;
    const timeoutId = window.setTimeout(() => {
      void loadState();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      loadSequenceRef.current += 1;
    };
  }, [authStatus, featureAvailable, loadState]);

  const resetSubmitRequest = () => {
    submitRequestRef.current = null;
    setSuccessMessage(undefined);
  };

  const clearForm = () => {
    setExperience(undefined);
    setDetails(emptyClubApplicationDetails);
    setInterests([]);
    setMessage("");
    setRulesConfirmed(false);
    setCourtesyConfirmed(false);
    submitRequestRef.current = null;
  };

  const handleError = async (error: unknown) => {
    const safeError = toMembershipApplicationError(error);
    setErrorMessage(safeError.userMessage);
    if (safeError.shouldRefresh) await loadState(true);
    return safeError;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clubUuid || busy) return;
    const validation = validateMembershipApplicationForm({
      details,
      rules,
      experience,
      interests,
      applicationReason: "",
      message,
      rulesConfirmed,
      courtesyConfirmed,
      scheduleConfirmed: false,
    });
    if (!validation.ok) {
      setErrorMessage(validation.message);
      window.requestAnimationFrame(() =>
        document.getElementById(validation.fieldId)?.focus(),
      );
      return;
    }

    setOperation("submit");
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const requestId = submitRequestRef.current ?? createMutationRequestId();
      submitRequestRef.current = requestId;
      const result = await submitMembershipApplication(
        supabase,
        clubUuid,
        validation.value,
        requestId,
      );
      if (
        result.currentStatus !== "submitted" &&
        result.currentStatus !== "waitlisted"
      ) {
        throw new MembershipApplicationClientError(
          "unknown",
          "접수 결과를 안전하게 확인할 수 없습니다. 최신 상태를 다시 확인해 주세요.",
          true,
        );
      }
      submitRequestRef.current = null;
      if (await loadState(true)) {
        clearForm();
        setSuccessMessage(
          result.currentStatus === "waitlisted"
            ? "가입 대기 신청이 접수되었습니다."
            : "가입 신청이 접수되었습니다.",
        );
      }
    } catch (error) {
      const safeError = await handleError(error);
      if (!safeError.preserveRequestId) submitRequestRef.current = null;
    } finally {
      setOperation(null);
    }
  };

  const handleWithdraw = async () => {
    if (!application || busy) return;
    setOperation("withdraw");
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const requestId = withdrawRequestRef.current ?? createMutationRequestId();
      withdrawRequestRef.current = requestId;
      const result = await withdrawMembershipApplication(
        supabase,
        application.applicationId,
        application.applicationVersion,
        requestId,
      );
      if (result.currentStatus !== "withdrawn") {
        throw new MembershipApplicationClientError(
          "unknown",
          "취소 결과를 안전하게 확인할 수 없습니다. 최신 상태를 다시 확인해 주세요.",
          true,
        );
      }
      withdrawRequestRef.current = null;
      setWithdrawConfirming(false);
      if (await loadState(true)) setSuccessMessage("가입 신청을 취소했습니다.");
    } catch (error) {
      const safeError = await handleError(error);
      if (!safeError.preserveRequestId) withdrawRequestRef.current = null;
    } finally {
      setOperation(null);
    }
  };

  const handleSupplement = async () => {
    if (!application || busy) return;
    let body: string;
    try {
      body = validateSupplementBody(supplementBody);
    } catch (error) {
      setErrorMessage(toMembershipApplicationError(error).userMessage);
      document.getElementById("club-application-supplement")?.focus();
      return;
    }

    setOperation("supplement");
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const requestId =
        supplementRequestRef.current ?? createMutationRequestId();
      supplementRequestRef.current = requestId;
      await submitMembershipApplicationSupplement(
        supabase,
        application.applicationId,
        application.applicationVersion,
        body,
        requestId,
      );
      supplementRequestRef.current = null;
      if (await loadState(true)) {
        setSupplementBody("");
        setSuccessMessage("추가 답변을 제출했습니다.");
      }
    } catch (error) {
      const safeError = await handleError(error);
      if (!safeError.preserveRequestId) supplementRequestRef.current = null;
    } finally {
      setOperation(null);
    }
  };

  const processing =
    application && isProcessingApplicationStatus(application.status);
  const membershipBlocks =
    membershipState === "active" || membershipState === "suspended";
  const inconsistentApproval =
    application?.status === "approved" && membershipState === "none";
  const showForm =
    authStatus === "signedIn" &&
    featureAvailable &&
    !initialLoading &&
    stateLoaded &&
    !processing &&
    !membershipBlocks &&
    !inconsistentApproval;
  const canSubmit =
    showForm && recruitmentStatus !== "closed" && !refreshing && !busy;
  const loginHref =
    "/login?next=" +
    encodeURIComponent("/clubs/" + identity.clubLegacyId);
  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/40 px-0 pt-8 sm:items-center sm:p-5">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-pul-border bg-white shadow-[0_18px_50px_rgba(6,78,59,0.22)] sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-3xl sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-pul-border/70 bg-white px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pul-light text-pul-deep sm:inline-flex">
              <UserRoundCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-pul-point">동호회 회원 가입</p>
              <h2 id={titleId} className="mt-0.5 text-xl font-bold text-foreground sm:text-2xl">
                동호회 가입 신청
              </h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-pul-page text-2xl font-bold leading-none text-pul-muted hover:bg-pul-light hover:text-pul-deep disabled:cursor-wait disabled:opacity-50"
            aria-label="동호회 가입 신청 닫기"
          >
            ×
          </button>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            <TargetClub club={club} recruitmentStatus={recruitmentStatus} />

            <div
              id={descriptionId}
              className="mt-3 text-sm leading-relaxed text-pul-muted"
            >
              운영진 심사 후 가입이 확정됩니다. 궁금한 점은 별도 가입 문의로 보내 주세요.
            </div>

            {!featureAvailable ? (
              <Notice
                tone="error"
                title="가입 신청 정보를 불러오지 못했습니다."
                body={
                  identity.featureError === "clubNotFound"
                    ? "현재 상세 경로와 실제 동호회 정보를 연결할 수 없습니다."
                    : "잠시 후 페이지를 새로고침한 뒤 다시 시도해 주세요."
                }
              />
            ) : null}
            {featureAvailable && authStatus === "loading" ? (
              <Notice
                title="로그인 상태를 확인하고 있습니다."
                body="잠시만 기다려 주세요."
              />
            ) : null}
            {featureAvailable && authStatus === "signedOut" ? (
              <Notice
                title="로그인 후 가입 신청할 수 있습니다."
                body="로그인하면 현재 회원 관계와 기존 신청 상태를 안전하게 확인합니다."
              />
            ) : null}
            {featureAvailable &&
            authStatus === "signedIn" &&
            (!stateLoaded || initialLoading) ? (
              <Notice
                title="가입 신청 상태를 확인하고 있습니다."
                body="모집 상태와 기존 신청 내역을 불러오는 중입니다."
              />
            ) : null}

            {errorMessage ? (
              <section
                className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-900"
                role="alert"
              >
                <p className="font-bold">요청을 확인해 주세요.</p>
                <p className="mt-1">{errorMessage}</p>
              </section>
            ) : null}
            {successMessage ? (
              <section
                className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900"
                role="status"
              >
                <p className="font-bold">{successMessage}</p>
              </section>
            ) : null}

            {featureAvailable &&
            authStatus === "signedIn" &&
            stateLoaded &&
            !initialLoading ? (
              <>
                {recruitmentStatus === "waiting" ? (
                  <Notice
                    tone="waiting"
                    title="현재 가입 신청은 대기 접수 상태입니다."
                    body="운영 상황에 따라 확인과 가입 안내까지 시간이 걸릴 수 있습니다."
                  />
                ) : null}
                {recruitmentStatus === "closed" ? (
                  <Notice
                    title="현재 회원 모집이 마감되었습니다."
                    body="기존 신청 상태는 계속 확인할 수 있으며, 새 신청은 모집 재개 후 제출할 수 있습니다."
                  />
                ) : null}
                {membershipState === "active" ? (
                  <Notice
                    tone="success"
                    title="이미 이 동호회의 활동 회원입니다."
                    body="가입 신청서 대신 동호회 일정과 게시판을 이용해 주세요."
                  />
                ) : null}
                {membershipState === "suspended" ? (
                  <Notice
                    tone="error"
                    title="활동 정지 상태에서는 가입 신청할 수 없습니다."
                    body="회원 관계 상태는 동호회 운영진에게 확인해 주세요."
                  />
                ) : null}
                {inconsistentApproval ? (
                  <Notice
                    tone="waiting"
                    title="승인된 신청과 회원 상태를 확인 중입니다."
                    body="회원 반영이 확인되기 전에는 새 신청을 제출하지 않습니다."
                  />
                ) : null}

                {application ? (
                  <ApplicationStatus
                    application={application}
                    history={history}
                    supplements={supplements}
                    supplementBody={supplementBody}
                    operation={operation}
                    withdrawConfirming={withdrawConfirming}
                    onSupplementChange={(value) => {
                      supplementRequestRef.current = null;
                      setSupplementBody(value);
                    }}
                    onSupplement={handleSupplement}
                    onOpenWithdraw={() => {
                      withdrawRequestRef.current = null;
                      setWithdrawConfirming(true);
                    }}
                    onCancelWithdraw={() => {
                      withdrawRequestRef.current = null;
                      setWithdrawConfirming(false);
                    }}
                    onWithdraw={handleWithdraw}
                  />
                ) : null}

                {application ? <ClubApplicationPrivateDetails viewerId={viewerId} applicationId={application.applicationId} /> : null}
                {showForm ? (
                  <ApplicationFields
                    detailsFields={<ClubApplicationExtraFields
                      value={details}
                      onChange={value=>{resetSubmitRequest();setDetails(value);}}
                      experience={experience}
                      onExperience={value=>{resetSubmitRequest();setExperience(value);}}
                      interests={interests}
                      onInterest={value=>{resetSubmitRequest();setInterests(current=>current.includes(value)?current.filter(item=>item!==value):[...current,value]);}}
                      message={message}
                      onMessage={value=>{resetSubmitRequest();setMessage(value);}}
                    />}
                    rules={rules}
                    rulesConfirmed={rulesConfirmed}
                    courtesyConfirmed={courtesyConfirmed}
                    onRules={value=>{resetSubmitRequest();setRulesConfirmed(value);}}
                    onCourtesy={value=>{resetSubmitRequest();setCourtesyConfirmed(value);}}
                  />
                ) : null}
              </>
            ) : null}
          </div>

          <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-pul-border/70 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light disabled:cursor-wait disabled:opacity-50"
            >
              닫기
            </button>
            {authStatus === "signedOut" && featureAvailable ? (
              <Link
                href={loginHref}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-pul-deep px-3 text-center text-[15px] font-bold text-white hover:bg-pul-point"
              >
                로그인
              </Link>
            ) : showForm ? (
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-pul-deep px-3 text-center text-[15px] font-bold text-white hover:bg-pul-point disabled:cursor-not-allowed disabled:opacity-55"
                aria-describedby={descriptionId}
              >
                {operation === "submit"
                  ? "제출 중..."
                  : recruitmentStatus === "waiting"
                    ? "대기 신청 제출"
                    : recruitmentStatus === "closed"
                      ? "모집 마감"
                      : "가입 신청 제출"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void loadState(true)}
                disabled={
                  authStatus !== "signedIn" ||
                  !featureAvailable ||
                  refreshing ||
                  busy
                }
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-pul-deep px-3 text-center text-[15px] font-bold text-white hover:bg-pul-point disabled:cursor-not-allowed disabled:opacity-55"
              >
                {refreshing ? "새로고침 중..." : "상태 새로고침"}
              </button>
            )}
          </footer>
        </form>
      </div>
    </div>
  );
}

function TargetClub({
  club,
  recruitmentStatus,
}: {
  club: ParkGolfClub;
  recruitmentStatus: ClubRecruitStatus;
}) {
  return (
    <section
      className="rounded-xl border border-pul-border bg-pul-light/25 p-3"
      aria-label="가입 신청 대상 동호회"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-bold leading-snug text-pul-deep">{club.name}</h3>
        <span className="rounded-full bg-white px-2.5 py-1 text-sm font-bold text-pul-deep shadow-sm">
          {clubDetailRecruitStatusLabels[recruitmentStatus]}
        </span>
      </div>
      <p className="mt-2 break-words text-sm text-pul-muted">{club.regionLabel}{club.joinConditions?" · 가입 조건: "+club.joinConditions:""}</p>
    </section>
  );
}

function Notice({
  title,
  body,
  tone = "default",
}: {
  title: string;
  body: string;
  tone?: "default" | "waiting" | "success" | "error";
}) {
  const color =
    tone === "waiting"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : tone === "error"
          ? "border-red-200 bg-red-50 text-red-900"
          : "border-sky-200 bg-sky-50 text-sky-950";
  return (
    <section className={"mt-5 rounded-xl border p-4 " + color}>
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed">{body}</p>
    </section>
  );
}
function ApplicationStatus({
  application,
  history,
  supplements,
  supplementBody,
  operation,
  withdrawConfirming,
  onSupplementChange,
  onSupplement,
  onOpenWithdraw,
  onCancelWithdraw,
  onWithdraw,
}: {
  application: ClubMembershipApplicationDetail;
  history: ClubMembershipApplicationHistoryEntry[];
  supplements: ClubMembershipApplicationSupplement[];
  supplementBody: string;
  operation: Operation | null;
  withdrawConfirming: boolean;
  onSupplementChange: (value: string) => void;
  onSupplement: () => void;
  onOpenWithdraw: () => void;
  onCancelWithdraw: () => void;
  onWithdraw: () => void;
}) {
  const processing = isProcessingApplicationStatus(application.status);
  const latestRequest = [...supplements]
    .reverse()
    .find((item) => item.entryType === "additional_info_request");

  return (
    <section
      className="mt-5 rounded-xl border border-pul-border bg-white p-4"
      aria-label="현재 가입 신청 상태"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-pul-point">내 가입 신청</p>
          <h3 className="mt-1 text-lg font-bold text-foreground">
            {clubJoinApplicationStatusLabels[
              toUiApplicationStatus(application.status)
            ]}
          </h3>
        </div>
        <span className="rounded-full bg-pul-light px-2.5 py-1 text-sm font-bold text-pul-deep">
          {"버전 " + application.applicationVersion}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-sm text-pul-muted sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-foreground">신청일</dt>
          <dd className="mt-0.5">{formatDate(application.submittedAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">최근 상태 변경</dt>
          <dd className="mt-0.5">{formatDate(application.statusChangedAt)}</dd>
        </div>
      </dl>

      {history.length > 0 ? (
        <div className="mt-4 border-t border-pul-border/70 pt-4">
          <h4 className="font-bold text-foreground">처리 이력</h4>
          <ol className="mt-2 space-y-2">
            {history.map((item) => (
              <li
                key={item.historyId}
                className="rounded-lg bg-pul-page px-3 py-2.5 text-sm text-pul-muted"
              >
                <strong className="text-foreground">
                  {clubJoinApplicationStatusLabels[
                    toUiApplicationStatus(item.toStatus)
                  ]}
                </strong>
                {" · " + formatDate(item.createdAt)}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {supplements.length > 0 ? (
        <div className="mt-4 border-t border-pul-border/70 pt-4">
          <h4 className="font-bold text-foreground">추가 확인 내용</h4>
          <ol className="mt-2 space-y-2">
            {supplements.map((item) => (
              <li
                key={item.supplementId}
                className="rounded-lg border border-pul-border px-3 py-2.5 text-sm leading-relaxed text-pul-muted"
              >
                <p className="font-bold text-foreground">
                  {item.isApplicantEntry ? "내 추가 답변" : "운영진 추가 확인 요청"}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">{item.body}</p>
                <p className="mt-1 text-xs">{formatDate(item.createdAt)}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {application.status === "additional_info_required" ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="font-bold text-amber-950">추가 답변 제출</h4>
          {latestRequest ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-amber-950">
              {latestRequest.body}
            </p>
          ) : null}
          <textarea
            id="club-application-supplement"
            value={supplementBody}
            onChange={(event) => onSupplementChange(event.target.value)}
            maxLength={500}
            rows={4}
            disabled={operation !== null}
            className="mt-3 w-full resize-y rounded-lg border border-amber-200 bg-white px-3 py-3 text-base leading-relaxed text-foreground outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-light"
            aria-label="가입 신청 추가 답변"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-sm text-amber-900">
              {supplementBody.length}/500자
            </span>
            <button
              type="button"
              onClick={onSupplement}
              disabled={operation !== null}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-deep px-4 text-sm font-bold text-white hover:bg-pul-point disabled:cursor-wait disabled:opacity-55"
            >
              {operation === "supplement" ? "제출 중..." : "추가 답변 제출"}
            </button>
          </div>
        </div>
      ) : null}

      {processing && canWithdrawApplication(application.status) ? (
        <div className="mt-4 border-t border-pul-border/70 pt-4">
          {withdrawConfirming ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="font-bold text-red-900">
                이 가입 신청을 취소하시겠습니까?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-red-900">
                취소 후 다시 신청하려면 현재 모집 상태에 따라 새 신청서를
                제출해야 합니다.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onCancelWithdraw}
                  disabled={operation !== null}
                  className="min-h-11 rounded-lg border border-pul-border bg-white px-3 text-sm font-bold text-pul-deep"
                >
                  계속 유지
                </button>
                <button
                  type="button"
                  onClick={onWithdraw}
                  disabled={operation !== null}
                  className="min-h-11 rounded-lg bg-red-700 px-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-55"
                >
                  {operation === "withdraw" ? "취소 처리 중..." : "신청 취소"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenWithdraw}
              disabled={operation !== null}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-red-200 bg-white px-4 text-sm font-bold text-red-700 hover:bg-red-50"
            >
              가입 신청 취소
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
function ApplicationFields({detailsFields,rules,rulesConfirmed,courtesyConfirmed,onRules,onCourtesy}:{detailsFields:ReactNode;rules:string;rulesConfirmed:boolean;courtesyConfirmed:boolean;onRules:(v:boolean)=>void;onCourtesy:(v:boolean)=>void}){
 const [rulesViewed,setRulesViewed]=useState(false);
 const hasRules=rules.trim().length>0;
 return <div className="mt-5 space-y-5">
  {detailsFields}
  <fieldset id="club-application-rules" tabIndex={-1} className="space-y-3 rounded-xl border border-pul-border p-4">
   <legend className="px-1 font-bold">운영 기준 확인</legend>
   {hasRules?<details onToggle={event=>{if(event.currentTarget.open)setRulesViewed(true);}}><summary className="min-h-11 cursor-pointer font-semibold text-pul-point">회칙 보기</summary><p className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-pul-page p-3 text-sm leading-relaxed">{rules}</p></details>:<p className="text-sm text-pul-muted">등록된 회칙이 없습니다.</p>}
   <ApplicationCheckbox checked={courtesyConfirmed&&(!hasRules||rulesConfirmed)} disabled={hasRules&&!rulesViewed} onChange={checked=>{onRules(hasRules?checked:false);onCourtesy(checked);}} label={hasRules?"회칙을 확인했으며, 회원 간 배려와 기본 예절을 지키겠습니다.":"회원 간 배려와 기본 예절을 지키겠습니다."} required/>
   {hasRules&&!rulesViewed?<p className="text-sm text-pul-muted">회칙을 열어 읽은 뒤 확인해 주세요.</p>:null}
  </fieldset>
 </div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 중";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ApplicationCheckbox({
  checked,
  onChange,
  label,
  required = false,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-pul-border bg-white px-3 py-3 text-[15px] font-medium leading-relaxed text-foreground has-checked:border-pul-point has-checked:bg-pul-light/55">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        required={required}
        className="mt-0.5 h-5 w-5 shrink-0 rounded accent-pul-point"
      />
      <span>{label}</span>
    </label>
  );
}
