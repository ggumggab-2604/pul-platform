"use client";

import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  clubDetailRecruitStatusLabels,
  clubJoinInquiryAvailableDayOptions,
  clubJoinInquiryExperienceOptions,
  clubJoinInquiryInterestOptions,
} from "@/data/clubData";
import { useAuthSessionStatus, type AuthSessionStatus } from "@/hooks/useAuthSessionStatus";
import {
  ClubJoinInquiryClientError,
  clubJoinInquiryHistoryLabels,
  clubJoinInquiryStatusLabels,
  createClubJoinInquiryRequestId,
  isActiveClubJoinInquiryStatus,
  loadMyClubJoinInquirySnapshot,
  submitClubJoinInquiry,
  toClubJoinInquiryError,
  validateClubJoinInquiryForm,
  withdrawClubJoinInquiry,
  type ClubJoinInquiryDetail,
  type ClubJoinInquiryHistoryEntry,
} from "@/lib/clubs/clubJoinInquiry";
import { createClient } from "@/lib/supabase/client";
import type {
  ClubJoinApplicationRuntimeIdentity,
  ClubJoinInquiryAvailableDay,
  ClubJoinInquiryExperience,
  ClubJoinInquiryInterest,
  ParkGolfClub,
} from "@/types";
import { Flag, MapPin, ShieldCheck } from "lucide-react";
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

type ClubJoinInquiryController = {
  openInquiry: (trigger: HTMLButtonElement) => void;
};

type ClubJoinInquiryProviderProps = {
  club: ParkGolfClub;
  identity: ClubJoinApplicationRuntimeIdentity;
  children: ReactNode;
};

type Operation = "submit" | "withdraw";

const ClubJoinInquiryControllerContext =
  createContext<ClubJoinInquiryController | null>(null);

const historyStateKey = "pulClubJoinInquiry";

export function useClubJoinInquiry() {
  const controller = useContext(ClubJoinInquiryControllerContext);
  if (!controller) {
    throw new Error("useClubJoinInquiry must be used within ClubJoinInquiryProvider");
  }
  return controller;
}

export function ClubJoinInquiryProvider({
  club,
  identity,
  children,
}: ClubJoinInquiryProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef(false);

  const finishClose = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const closeInquiry = useCallback(() => {
    if (busyRef.current) return;
    if (window.history.state?.[historyStateKey]) {
      window.history.back();
      return;
    }
    finishClose();
  }, [finishClose]);

  const openInquiry = useCallback((trigger: HTMLButtonElement) => {
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
    <ClubJoinInquiryControllerContext.Provider value={{ openInquiry }}>
      {children}
      {isOpen ? (
        <ClubJoinInquirySessionDialog
          club={club}
          identity={identity}
          onClose={closeInquiry}
          onBusyChange={(busy) => {
            busyRef.current = busy;
          }}
        />
      ) : null}
    </ClubJoinInquiryControllerContext.Provider>
  );
}

function ClubJoinInquirySessionDialog(
  props: Omit<ClubJoinInquiryDialogProps, "authStatus">,
) {
  const authStatus = useAuthSessionStatus();
  return (
    <ClubJoinInquiryDialog
      key={authStatus}
      {...props}
      authStatus={authStatus}
    />
  );
}

type ClubJoinInquiryDialogProps = {
  authStatus: AuthSessionStatus;
  club: ParkGolfClub;
  identity: ClubJoinApplicationRuntimeIdentity;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
};

function ClubJoinInquiryDialog({
  authStatus,
  club,
  identity,
  onClose,
  onBusyChange,
}: ClubJoinInquiryDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const stateHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const loadSequenceRef = useRef(0);
  const submitRequestRef = useRef<string | null>(null);
  const withdrawRequestRef = useRef<string | null>(null);
  const [supabase] = useState(() => createClient());

  const [experience, setExperience] = useState<ClubJoinInquiryExperience>();
  const [availableDay, setAvailableDay] = useState<ClubJoinInquiryAvailableDay>();
  const [interests, setInterests] = useState<ClubJoinInquiryInterest[]>([]);
  const [message, setMessage] = useState("");
  const [inquiry, setInquiry] = useState<ClubJoinInquiryDetail | null>(null);
  const [history, setHistory] = useState<ClubJoinInquiryHistoryEntry[]>([]);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [withdrawConfirming, setWithdrawConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();

  const busy = operation !== null;
  const clubUuid = identity.clubUuid;
  const featureAvailable =
    identity.featureAvailability === "available" && Boolean(clubUuid);
  const activeInquiry = inquiry
    ? isActiveClubJoinInquiryStatus(inquiry.status)
    : false;
  const showForm =
    featureAvailable &&
    authStatus === "signedIn" &&
    stateLoaded &&
    !loading &&
    !activeInquiry;
  const loginHref =
    "/login?next=" + encodeURIComponent(`/clubs/${identity.clubLegacyId}`);

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
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
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

  const loadState = useCallback(async () => {
    if (!clubUuid || authStatus !== "signedIn") return false;
    const sequence = ++loadSequenceRef.current;
    setLoading(true);
    setStateLoaded(false);
    setErrorMessage(undefined);
    try {
      const snapshot = await loadMyClubJoinInquirySnapshot(supabase, clubUuid);
      if (loadSequenceRef.current !== sequence) return false;
      setInquiry(snapshot.inquiry);
      setHistory(snapshot.history);
      setStateLoaded(true);
      return true;
    } catch (error) {
      if (loadSequenceRef.current !== sequence) return false;
      setInquiry(null);
      setHistory([]);
      setErrorMessage(toClubJoinInquiryError(error).userMessage);
      return false;
    } finally {
      if (loadSequenceRef.current === sequence) setLoading(false);
    }
  }, [authStatus, clubUuid, supabase]);

  useEffect(() => {
    if (!featureAvailable || authStatus !== "signedIn") {
      loadSequenceRef.current += 1;
      submitRequestRef.current = null;
      withdrawRequestRef.current = null;
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      void loadState();
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      loadSequenceRef.current += 1;
    };
  }, [authStatus, featureAvailable, loadState]);

  const clearSubmitRequest = () => {
    submitRequestRef.current = null;
    setSuccessMessage(undefined);
  };

  const clearForm = () => {
    setExperience(undefined);
    setAvailableDay(undefined);
    setInterests([]);
    setMessage("");
  };

  const focusField = (fieldId: string) => {
    window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(`#${fieldId}`)?.focus();
    });
  };

  const focusState = () => {
    window.requestAnimationFrame(() => {
      stateHeadingRef.current?.focus({ preventScroll: true });
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clubUuid || busy || !showForm) return;
    const validation = validateClubJoinInquiryForm({
      experience,
      availableDay,
      interests,
      message,
    });
    if (!validation.ok) {
      setErrorMessage(validation.message);
      focusField(validation.fieldId);
      return;
    }

    setOperation("submit");
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const requestId =
        submitRequestRef.current ?? createClubJoinInquiryRequestId();
      submitRequestRef.current = requestId;
      const result = await submitClubJoinInquiry(
        supabase,
        clubUuid,
        validation.value,
        requestId,
      );
      if (result.status !== "received") {
        throw new ClubJoinInquiryClientError(
          "malformedResponse",
          "가입 문의 접수 결과를 안전하게 확인할 수 없습니다.",
          true,
        );
      }
      submitRequestRef.current = null;
      clearForm();
      setSuccessMessage(
        result.replayed
          ? "이미 접수된 가입 문의를 확인했습니다."
          : "가입 문의가 접수되었습니다.",
      );
      if (await loadState()) focusState();
    } catch (error) {
      const safeError = toClubJoinInquiryError(error);
      setErrorMessage(safeError.userMessage);
      if (!safeError.preserveRequestId) submitRequestRef.current = null;
      if (safeError.shouldRefresh) await loadState();
    } finally {
      setOperation(null);
    }
  };

  const handleWithdraw = async () => {
    if (!clubUuid || !inquiry || busy || !activeInquiry) return;
    setOperation("withdraw");
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      const requestId =
        withdrawRequestRef.current ?? createClubJoinInquiryRequestId();
      withdrawRequestRef.current = requestId;
      const result = await withdrawClubJoinInquiry(
        supabase,
        clubUuid,
        inquiry.inquiryId,
        requestId,
      );
      if (result.status !== "withdrawn") {
        throw new ClubJoinInquiryClientError(
          "malformedResponse",
          "가입 문의 철회 결과를 안전하게 확인할 수 없습니다.",
          true,
        );
      }
      withdrawRequestRef.current = null;
      setWithdrawConfirming(false);
      setSuccessMessage(
        result.replayed
          ? "이미 철회된 가입 문의를 확인했습니다."
          : "가입 문의를 철회했습니다.",
      );
      if (await loadState()) focusState();
    } catch (error) {
      const safeError = toClubJoinInquiryError(error);
      setErrorMessage(safeError.userMessage);
      if (!safeError.preserveRequestId) withdrawRequestRef.current = null;
      if (safeError.shouldRefresh) await loadState();
    } finally {
      setOperation(null);
    }
  };

  const toggleInterest = (value: ClubJoinInquiryInterest) => {
    clearSubmitRequest();
    setInterests((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 px-0 pt-8 sm:items-center sm:p-5">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-pul-border bg-white shadow-[0_18px_50px_rgba(6,78,59,0.22)] sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-2xl sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-pul-border/70 bg-white px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-pul-point">PUL 내부 문의</p>
            <h2 id={titleId} className="mt-0.5 text-xl font-bold text-foreground sm:text-2xl">
              동호회 가입 문의
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-pul-page text-2xl font-bold leading-none text-pul-muted hover:bg-pul-light hover:text-pul-deep disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point"
            aria-label="동호회 가입 문의 닫기"
          >
            ×
          </button>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            <TargetClub club={club} />

            <div id={descriptionId} className="mt-4 space-y-1 text-[15px] leading-relaxed text-pul-muted">
              <p className="font-semibold text-foreground">가입 문의를 남기면 동호회 운영자가 확인 후 안내합니다.</p>
              <p>가입 문의는 가입 신청이나 회원 승인으로 자동 전환되지 않습니다.</p>
            </div>

            {!featureAvailable ? (
              <Notice
                tone="error"
                title="가입 문의 대상 동호회를 확인할 수 없습니다."
                body="잠시 후 페이지를 새로고침한 뒤 다시 시도해 주세요."
              />
            ) : null}
            {featureAvailable && authStatus === "loading" ? (
              <Notice title="로그인 상태를 확인하고 있습니다." body="잠시만 기다려 주세요." />
            ) : null}
            {featureAvailable && authStatus === "signedOut" ? (
              <Notice
                title="로그인 후 가입 문의를 이용할 수 있습니다."
                body="로그인하면 내 기존 문의와 운영자 답변도 함께 확인할 수 있습니다."
              />
            ) : null}
            {featureAvailable && authStatus === "signedIn" && loading ? (
              <Notice title="가입 문의 상태를 불러오고 있습니다." body="잠시만 기다려 주세요." />
            ) : null}

            {errorMessage ? (
              <section className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-900" role="alert">
                <p className="font-bold">요청을 확인해 주세요.</p>
                <p className="mt-1">{errorMessage}</p>
                {!stateLoaded && authStatus === "signedIn" && !loading ? (
                  <button
                    type="button"
                    onClick={() => void loadState()}
                    className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-red-300 bg-white px-4 font-bold"
                  >
                    다시 불러오기
                  </button>
                ) : null}
              </section>
            ) : null}
            {successMessage ? (
              <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900" role="status">
                <p className="font-bold">{successMessage}</p>
              </section>
            ) : null}

            {stateLoaded && inquiry ? (
              <InquiryState
                inquiry={inquiry}
                history={history}
                headingRef={stateHeadingRef}
              />
            ) : null}

            {withdrawConfirming && activeInquiry ? (
              <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950" role="alert">
                <p className="font-bold">이 가입 문의를 철회할까요?</p>
                <p className="mt-1">철회한 문의는 다시 진행 중 상태로 되돌릴 수 없습니다.</p>
              </section>
            ) : null}

            {showForm ? (
              <InquiryForm
                inquiryExists={Boolean(inquiry)}
                experience={experience}
                availableDay={availableDay}
                interests={interests}
                message={message}
                onExperience={(value) => {
                  clearSubmitRequest();
                  setExperience(value);
                }}
                onAvailableDay={(value) => {
                  clearSubmitRequest();
                  setAvailableDay(value);
                }}
                onInterest={toggleInterest}
                onMessage={(value) => {
                  clearSubmitRequest();
                  setMessage(value);
                }}
              />
            ) : null}

            <section className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="가입 문의 개인정보 안내">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
                <div className="text-[15px] leading-relaxed text-sky-950">
                  <p className="font-bold">문의 내용은 신청자와 해당 동호회 운영진만 확인합니다.</p>
                  <p className="mt-1">전화번호·주소·계좌번호 등 민감한 개인정보는 작성하지 마세요.</p>
                </div>
              </div>
            </section>
          </div>

          <InquiryFooter
            activeInquiry={activeInquiry}
            authStatus={authStatus}
            busy={busy}
            featureAvailable={featureAvailable}
            loading={loading}
            loginHref={loginHref}
            operation={operation}
            showForm={showForm}
            stateLoaded={stateLoaded}
            withdrawConfirming={withdrawConfirming}
            onClose={onClose}
            onCancelWithdraw={() => setWithdrawConfirming(false)}
            onConfirmWithdraw={() => void handleWithdraw()}
            onStartWithdraw={() => setWithdrawConfirming(true)}
            descriptionId={descriptionId}
          />
        </form>
      </div>
    </div>
  );
}

function TargetClub({ club }: { club: ParkGolfClub }) {
  return (
    <section className="rounded-xl border border-pul-border bg-pul-light/25 p-4" aria-label="가입 문의 대상 동호회">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-bold leading-snug text-pul-deep">{club.name}</h3>
        <span className="rounded-full bg-white px-2.5 py-1 text-sm font-bold text-pul-deep shadow-sm">
          {clubDetailRecruitStatusLabels[club.recruitStatus]}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-[15px] text-pul-muted sm:grid-cols-2">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pul-point" aria-hidden="true" />
          <span><span className="font-semibold text-foreground">활동 지역</span> · {club.regionLabel}</span>
        </p>
        <p className="flex items-start gap-2">
          <Flag className="mt-0.5 h-4 w-4 shrink-0 text-pul-point" aria-hidden="true" />
          <span><span className="font-semibold text-foreground">주 활동 골프장</span> · {club.homeCourse}</span>
        </p>
      </div>
    </section>
  );
}

function InquiryForm({
  inquiryExists,
  experience,
  availableDay,
  interests,
  message,
  onExperience,
  onAvailableDay,
  onInterest,
  onMessage,
}: {
  inquiryExists: boolean;
  experience?: ClubJoinInquiryExperience;
  availableDay?: ClubJoinInquiryAvailableDay;
  interests: ClubJoinInquiryInterest[];
  message: string;
  onExperience: (value: ClubJoinInquiryExperience) => void;
  onAvailableDay: (value: ClubJoinInquiryAvailableDay) => void;
  onInterest: (value: ClubJoinInquiryInterest) => void;
  onMessage: (value: string) => void;
}) {
  return (
    <div className="mt-5 space-y-5">
      {inquiryExists ? (
        <p className="rounded-lg bg-pul-page px-3 py-2.5 text-sm font-semibold text-pul-deep">
          이전 문의가 종료되어 새 가입 문의를 작성할 수 있습니다.
        </p>
      ) : null}
      <fieldset>
        <legend className="text-base font-bold text-foreground">파크골프 경력 <span className="text-pul-point">필수</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {clubJoinInquiryExperienceOptions.map((option) => (
            <label key={option.value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-pul-border px-3 text-[15px] font-medium text-foreground has-checked:border-pul-point has-checked:bg-pul-light/55">
              <input id={`club-join-experience-${option.value}`} type="radio" name="club-join-experience" value={option.value} checked={experience === option.value} onChange={() => onExperience(option.value)} className="h-5 w-5 accent-pul-point" required />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-base font-bold text-foreground">활동 가능한 요일 <span className="text-pul-point">필수·1개 선택</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {clubJoinInquiryAvailableDayOptions.map((option) => (
            <label key={option.value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-pul-border px-3 text-[15px] font-medium text-foreground has-checked:border-pul-point has-checked:bg-pul-light/55">
              <input id={`club-join-available-${option.value}`} type="radio" name="club-join-available-day" value={option.value} checked={availableDay === option.value} onChange={() => onAvailableDay(option.value)} className="h-5 w-5 accent-pul-point" required />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-base font-bold text-foreground">희망 활동 <span className="text-pul-point">필수·복수 선택</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {clubJoinInquiryInterestOptions.map((option) => (
            <label key={option.value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-pul-border px-3 text-[15px] font-medium text-foreground has-checked:border-pul-point has-checked:bg-pul-light/55">
              <input id={`club-join-interest-${option.value}`} type="checkbox" value={option.value} checked={interests.includes(option.value)} onChange={() => onInterest(option.value)} className="h-5 w-5 rounded accent-pul-point" />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <div className="flex items-end justify-between gap-3">
          <label htmlFor="club-join-message" className="text-base font-bold text-foreground">운영자에게 전할 내용</label>
          <span className="text-sm font-medium text-pul-muted" aria-live="polite">{Array.from(message).length}/500자</span>
        </div>
        <p id="club-join-message-help" className="mt-1 text-sm leading-relaxed text-pul-muted">가입 목적, 활동 가능 시간, 궁금한 내용을 간단히 작성해 주세요.</p>
        <textarea id="club-join-message" value={message} onChange={(event) => onMessage(event.target.value)} maxLength={500} rows={4} aria-describedby="club-join-message-help" className="mt-2 w-full resize-y rounded-lg border border-pul-border bg-white px-3 py-3 text-base leading-relaxed text-foreground outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-light" />
      </div>
    </div>
  );
}

function InquiryState({
  inquiry,
  history,
  headingRef,
}: {
  inquiry: ClubJoinInquiryDetail;
  history: ClubJoinInquiryHistoryEntry[];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="내 가입 문의 상태">
      <h3 ref={headingRef} tabIndex={-1} className="font-bold text-amber-950 outline-none">
        내 가입 문의 · {clubJoinInquiryStatusLabels[inquiry.status]}
      </h3>
      <dl className="mt-2 grid gap-1 text-sm text-amber-950 sm:grid-cols-2">
        <div><dt className="inline font-semibold">접수일</dt><dd className="inline"> · {formatDate(inquiry.submittedAt)}</dd></div>
        <div><dt className="inline font-semibold">최근 변경</dt><dd className="inline"> · {formatDate(inquiry.updatedAt)}</dd></div>
      </dl>
      {inquiry.message ? (
        <div className="mt-3 rounded-lg bg-white/80 px-3 py-2.5 text-sm leading-relaxed text-amber-950">
          <p className="font-bold">내가 전한 내용</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{inquiry.message}</p>
        </div>
      ) : null}
      {inquiry.publicReply ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm leading-relaxed text-emerald-950">
          <p className="font-bold">동호회 운영자 답변</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{inquiry.publicReply}</p>
        </div>
      ) : null}
      {history.length > 0 ? (
        <div className="mt-3 border-t border-amber-200 pt-3">
          <p className="text-sm font-bold text-amber-950">처리 이력</p>
          <ol className="mt-2 space-y-1.5 text-sm text-amber-950">
            {history.map((entry, index) => (
              <li key={`${entry.eventCode}-${entry.createdAt}-${index}`} className="flex flex-wrap justify-between gap-x-3">
                <span>{clubJoinInquiryHistoryLabels[entry.eventCode]}</span>
                <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function InquiryFooter({
  activeInquiry,
  authStatus,
  busy,
  featureAvailable,
  loading,
  loginHref,
  operation,
  showForm,
  stateLoaded,
  withdrawConfirming,
  onClose,
  onCancelWithdraw,
  onConfirmWithdraw,
  onStartWithdraw,
  descriptionId,
}: {
  activeInquiry: boolean;
  authStatus: AuthSessionStatus;
  busy: boolean;
  featureAvailable: boolean;
  loading: boolean;
  loginHref: string;
  operation: Operation | null;
  showForm: boolean;
  stateLoaded: boolean;
  withdrawConfirming: boolean;
  onClose: () => void;
  onCancelWithdraw: () => void;
  onConfirmWithdraw: () => void;
  onStartWithdraw: () => void;
  descriptionId: string;
}) {
  return (
    <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-pul-border/70 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      {withdrawConfirming && activeInquiry ? (
        <>
          <button type="button" onClick={onCancelWithdraw} disabled={busy} className="inline-flex min-h-12 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-base font-bold text-pul-deep disabled:cursor-wait disabled:opacity-50">계속 유지</button>
          <button type="button" onClick={onConfirmWithdraw} disabled={busy} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-red-700 px-4 text-base font-bold text-white disabled:cursor-wait disabled:opacity-50">{operation === "withdraw" ? "철회 중…" : "문의 철회 확인"}</button>
        </>
      ) : (
        <>
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex min-h-12 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light disabled:cursor-wait disabled:opacity-50">닫기</button>
          {!featureAvailable || authStatus === "loading" ? (
            <button type="button" disabled className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-lg bg-pul-deep px-3 text-[15px] font-bold text-white opacity-60">이용 상태 확인 중</button>
          ) : authStatus === "signedOut" ? (
            <Link href={loginHref} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-pul-deep px-3 text-[15px] font-bold text-white hover:bg-pul-point">로그인하고 문의하기</Link>
          ) : loading || !stateLoaded ? (
            <button type="button" disabled className="inline-flex min-h-12 cursor-wait items-center justify-center rounded-lg bg-pul-deep px-3 text-[15px] font-bold text-white opacity-60">문의 상태 확인 중</button>
          ) : activeInquiry ? (
            <button type="button" onClick={onStartWithdraw} disabled={busy} className="inline-flex min-h-12 items-center justify-center rounded-lg border border-red-300 bg-white px-3 text-[15px] font-bold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-50">가입 문의 철회</button>
          ) : (
            <button type="submit" disabled={busy || !showForm} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-pul-deep px-3 text-[15px] font-bold text-white hover:bg-pul-point disabled:cursor-wait disabled:opacity-60" aria-describedby={descriptionId}>{operation === "submit" ? "접수 중…" : "가입 문의 보내기"}</button>
          )}
        </>
      )}
    </footer>
  );
}

function Notice({
  title,
  body,
  tone = "info",
}: {
  title: string;
  body: string;
  tone?: "info" | "error";
}) {
  return (
    <section className={`mt-5 rounded-xl border p-4 text-sm leading-relaxed ${tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-sky-200 bg-sky-50 text-sky-950"}`}>
      <p className="font-bold">{title}</p>
      <p className="mt-1">{body}</p>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
