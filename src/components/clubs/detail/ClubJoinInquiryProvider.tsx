"use client";

import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  clubDetailRecruitStatusLabels,
  clubJoinInquiryAvailableDayOptions,
  clubJoinInquiryExperienceOptions,
  clubJoinInquiryInterestOptions,
  clubJoinInquiryStatusLabels,
} from "@/data/clubData";
import type {
  ClubJoinInquiryAvailableDay,
  ClubJoinInquiryContext,
  ClubJoinInquiryExperience,
  ClubJoinInquiryInterest,
  ParkGolfClub,
} from "@/types";
import { Flag, MapPin, ShieldCheck } from "lucide-react";
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
  inquiryContext: ClubJoinInquiryContext;
  children: ReactNode;
};

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
  inquiryContext,
  children,
}: ClubJoinInquiryProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const finishClose = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const closeInquiry = useCallback(() => {
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
    const onPopState = () => finishClose();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [finishClose, isOpen]);

  return (
    <ClubJoinInquiryControllerContext.Provider value={{ openInquiry }}>
      {children}
      {isOpen ? (
        <ClubJoinInquiryDialog
          club={club}
          inquiryContext={inquiryContext}
          onClose={closeInquiry}
        />
      ) : null}
    </ClubJoinInquiryControllerContext.Provider>
  );
}

type ClubJoinInquiryDialogProps = {
  club: ParkGolfClub;
  inquiryContext: ClubJoinInquiryContext;
  onClose: () => void;
};

function ClubJoinInquiryDialog({
  club,
  inquiryContext,
  onClose,
}: ClubJoinInquiryDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [experience, setExperience] = useState<ClubJoinInquiryExperience>();
  const [availableDay, setAvailableDay] = useState<ClubJoinInquiryAvailableDay>();
  const [interests, setInterests] = useState<ClubJoinInquiryInterest[]>([]);
  const [message, setMessage] = useState("");

  useBodyScrollLock(true);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
  }, [onClose]);

  const toggleInterest = (value: ClubJoinInquiryInterest) => {
    setInterests((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const handleUnavailableSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  const activeInquiry = inquiryContext.activeInquiry;
  const hasProcessingInquiry =
    activeInquiry &&
    ["received", "reviewing", "replied", "onHold"].includes(
      activeInquiry.status,
    );

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
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-pul-page text-2xl font-bold leading-none text-pul-muted hover:bg-pul-light hover:text-pul-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point"
            aria-label="동호회 가입 문의 닫기"
          >
            ×
          </button>
        </header>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleUnavailableSubmit}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
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

            <div id={descriptionId} className="mt-4 space-y-1 text-[15px] leading-relaxed text-pul-muted">
              <p className="font-semibold text-foreground">가입 문의를 남기면 동호회 운영자가 확인 후 개별 안내합니다.</p>
              <p>가입 승인이나 연락 시점은 동호회 운영 상황에 따라 달라질 수 있습니다.</p>
            </div>

            {hasProcessingInquiry && activeInquiry ? (
              <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="현재 가입 문의 상태">
                <p className="font-bold text-amber-900">현재 운영자가 확인 중인 가입 문의가 있습니다.</p>
                <dl className="mt-2 grid gap-1 text-sm text-amber-900 sm:grid-cols-2">
                  <div><dt className="inline font-semibold">접수일</dt><dd className="inline"> · {activeInquiry.submittedAt}</dd></div>
                  <div><dt className="inline font-semibold">처리 상태</dt><dd className="inline"> · {clubJoinInquiryStatusLabels[activeInquiry.status]}</dd></div>
                </dl>
              </section>
            ) : (
              <div className="mt-5 space-y-5">
                <fieldset>
                  <legend className="text-base font-bold text-foreground">파크골프 경력 <span className="text-pul-point">필수</span></legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {clubJoinInquiryExperienceOptions.map((option) => (
                      <label key={option.value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-pul-border px-3 text-[15px] font-medium text-foreground has-checked:border-pul-point has-checked:bg-pul-light/55">
                        <input
                          type="radio"
                          name="club-join-experience"
                          value={option.value}
                          checked={experience === option.value}
                          onChange={() => setExperience(option.value)}
                          className="h-5 w-5 accent-pul-point"
                          required
                        />
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
                        <input
                          type="radio"
                          name="club-join-available-day"
                          value={option.value}
                          checked={availableDay === option.value}
                          onChange={() => setAvailableDay(option.value)}
                          className="h-5 w-5 accent-pul-point"
                          required
                        />
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
                        <input
                          type="checkbox"
                          value={option.value}
                          checked={interests.includes(option.value)}
                          onChange={() => toggleInterest(option.value)}
                          className="h-5 w-5 rounded accent-pul-point"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <div className="flex items-end justify-between gap-3">
                    <label htmlFor="club-join-message" className="text-base font-bold text-foreground">운영자에게 전할 내용</label>
                    <span className="text-sm font-medium text-pul-muted" aria-live="polite">{message.length}/500자</span>
                  </div>
                  <p id="club-join-message-help" className="mt-1 text-sm leading-relaxed text-pul-muted">가입 목적, 활동 가능 시간, 궁금한 내용을 간단히 작성해 주세요.</p>
                  <textarea
                    id="club-join-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    maxLength={500}
                    rows={4}
                    aria-describedby="club-join-message-help"
                    className="mt-2 w-full resize-y rounded-lg border border-pul-border bg-white px-3 py-3 text-base leading-relaxed text-foreground outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-light"
                  />
                </div>
              </div>
            )}

            <section className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="가입 문의 이용 상태">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
                <div className="text-[15px] leading-relaxed text-sky-950">
                  <p className="font-bold">로그인 후 가입 문의를 신청할 수 있습니다.</p>
                  <p className="mt-1">현재 로그인·회원 및 서버 저장 기반을 준비 중입니다. 입력한 내용은 저장되거나 전송되지 않습니다.</p>
                </div>
              </div>
            </section>
          </div>

          <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-pul-border/70 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light"
            >
              닫기
            </button>
            <button
              type="submit"
              disabled={!inquiryContext.canSubmit}
              className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-lg bg-pul-deep px-3 text-center text-[15px] font-bold text-white opacity-60"
              aria-describedby={descriptionId}
            >
              가입 문의 기능 준비 중
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
