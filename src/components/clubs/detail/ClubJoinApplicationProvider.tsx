"use client";

import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  clubDetailRecruitStatusLabels,
  clubJoinApplicationStatusLabels,
  clubJoinInquiryAvailableDayOptions,
  clubJoinInquiryExperienceOptions,
  clubJoinInquiryInterestOptions,
} from "@/data/clubData";
import type {
  ClubJoinApplicationContext,
  ClubJoinInquiryAvailableDay,
  ClubJoinInquiryExperience,
  ClubJoinInquiryInterest,
  ParkGolfClub,
} from "@/types";
import { Flag, MapPin, ShieldCheck, UserRoundCheck } from "lucide-react";
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

type ClubJoinApplicationController = {
  openApplication: (trigger: HTMLButtonElement) => void;
};

type ClubJoinApplicationProviderProps = {
  club: ParkGolfClub;
  applicationContext: ClubJoinApplicationContext;
  children: ReactNode;
};

const ClubJoinApplicationControllerContext =
  createContext<ClubJoinApplicationController | null>(null);

const historyStateKey = "pulClubJoinApplication";

export function useClubJoinApplication() {
  const controller = useContext(ClubJoinApplicationControllerContext);
  if (!controller) {
    throw new Error(
      "useClubJoinApplication must be used within ClubJoinApplicationProvider",
    );
  }
  return controller;
}

export function ClubJoinApplicationProvider({
  club,
  applicationContext,
  children,
}: ClubJoinApplicationProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const finishClose = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const closeApplication = useCallback(() => {
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
    const onPopState = () => finishClose();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [finishClose, isOpen]);

  return (
    <ClubJoinApplicationControllerContext.Provider value={{ openApplication }}>
      {children}
      {isOpen ? (
        <ClubJoinApplicationDialog
          club={club}
          applicationContext={applicationContext}
          onClose={closeApplication}
        />
      ) : null}
    </ClubJoinApplicationControllerContext.Provider>
  );
}

type ClubJoinApplicationDialogProps = {
  club: ParkGolfClub;
  applicationContext: ClubJoinApplicationContext;
  onClose: () => void;
};

function ClubJoinApplicationDialog({
  club,
  applicationContext,
  onClose,
}: ClubJoinApplicationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [experience, setExperience] = useState<ClubJoinInquiryExperience>();
  const [availableDay, setAvailableDay] =
    useState<ClubJoinInquiryAvailableDay>();
  const [interests, setInterests] = useState<ClubJoinInquiryInterest[]>([]);
  const [motivation, setMotivation] = useState("");
  const [message, setMessage] = useState("");
  const [rulesConfirmed, setRulesConfirmed] = useState(false);
  const [courtesyConfirmed, setCourtesyConfirmed] = useState(false);
  const [scheduleGuidanceConfirmed, setScheduleGuidanceConfirmed] =
    useState(false);
  const [contactGuidanceConfirmed, setContactGuidanceConfirmed] =
    useState(false);

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

  const activeApplication = applicationContext.activeApplication;
  const hasProcessingApplication =
    activeApplication &&
    [
      "submitted",
      "reviewing",
      "additionalInfoRequired",
      "interviewRequested",
      "waitlisted",
    ].includes(activeApplication.status);
  const isRecruiting = club.recruitStatus === "recruiting";
  const isWaiting = club.recruitStatus === "waiting";

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
              <h2
                id={titleId}
                className="mt-0.5 text-xl font-bold text-foreground sm:text-2xl"
              >
                동호회 가입 신청
              </h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-pul-page text-2xl font-bold leading-none text-pul-muted hover:bg-pul-light hover:text-pul-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point"
            aria-label="동호회 가입 신청 닫기"
          >
            ×
          </button>
        </header>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleUnavailableSubmit}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            <section
              className="rounded-xl border border-pul-border bg-pul-light/25 p-4"
              aria-label="가입 신청 대상 동호회"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-lg font-bold leading-snug text-pul-deep">
                  {club.name}
                </h3>
                <span className="rounded-full bg-white px-2.5 py-1 text-sm font-bold text-pul-deep shadow-sm">
                  {clubDetailRecruitStatusLabels[club.recruitStatus]}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-[15px] text-pul-muted sm:grid-cols-2">
                <p className="flex items-start gap-2">
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-pul-point"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-semibold text-foreground">활동 지역</span>
                    {` · ${club.regionLabel}`}
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <Flag
                    className="mt-0.5 h-4 w-4 shrink-0 text-pul-point"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-semibold text-foreground">
                      주 활동 골프장
                    </span>
                    {` · ${club.homeCourse}`}
                  </span>
                </p>
              </div>
              <dl className="mt-3 grid gap-2 border-t border-pul-border/70 pt-3 text-[15px] sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-pul-muted">회원 모집 상태</dt>
                  <dd className="mt-0.5 font-bold text-foreground">
                    {clubDetailRecruitStatusLabels[club.recruitStatus]}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-pul-muted">가입 조건</dt>
                  <dd className="mt-0.5 break-words font-bold text-foreground">
                    {club.joinConditions || "동호회에 문의"}
                  </dd>
                </div>
              </dl>
            </section>

            <div
              id={descriptionId}
              className="mt-4 space-y-2 text-[15px] leading-relaxed text-pul-muted"
            >
              <p className="font-semibold text-foreground">
                가입 신청서를 제출하면 동호회 운영진이 확인 후 가입 여부와 다음
                절차를 안내합니다.
              </p>
              <p>
                가입 신청만으로 회원 가입이 확정되지는 않으며, 동호회 운영 기준에
                따라 추가 확인이 필요할 수 있습니다.
              </p>
              <p className="rounded-lg bg-pul-page px-3 py-2.5">
                가입 전 궁금한 내용은 별도의 <strong>가입 문의</strong>를 이용해
                주세요. 가입 문의 내용은 가입 신청서로 자동 전환되지 않습니다.
              </p>
            </div>

            {isWaiting ? (
              <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-bold text-amber-900">현재 가입 신청은 대기 접수 상태입니다.</p>
                <p className="mt-1 text-sm leading-relaxed text-amber-900">
                  운영 상황에 따라 확인과 가입 안내까지 시간이 걸릴 수 있습니다.
                </p>
              </section>
            ) : null}
            {!isRecruiting && !isWaiting ? (
              <section className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="font-bold text-foreground">현재 회원 모집이 마감되었습니다.</p>
                <p className="mt-1 text-sm leading-relaxed text-pul-muted">
                  모집 재개 여부는 가입 문의를 통해 확인해 주세요.
                </p>
              </section>
            ) : null}

            <section
              className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4"
              aria-label="신청 회원 기본정보 상태"
            >
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="mt-0.5 h-5 w-5 shrink-0 text-sky-700"
                  aria-hidden="true"
                />
                <div className="text-[15px] leading-relaxed text-sky-950">
                  <p className="font-bold">로그인 및 회원정보 연동 기능 준비 중</p>
                  <p className="mt-1">
                    가짜 회원 ID나 이름을 표시하지 않습니다. 향후 로그인 회원의
                    공개 이름과 인증 정보를 서버에서 다시 확인합니다.
                  </p>
                  <p className="mt-1 font-semibold">
                    회원정보에 등록된 인증 휴대전화 사용 예정
                  </p>
                </div>
              </div>
            </section>

            {hasProcessingApplication && activeApplication ? (
              <section
                className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"
                aria-label="현재 가입 신청 상태"
              >
                <p className="font-bold text-amber-900">
                  현재 운영진이 확인 중인 가입 신청이 있습니다.
                </p>
                <dl className="mt-2 grid gap-1 text-sm text-amber-900 sm:grid-cols-2">
                  <div>
                    <dt className="inline font-semibold">신청일</dt>
                    <dd className="inline"> · {activeApplication.submittedAt}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">처리 상태</dt>
                    <dd className="inline">
                      {` · ${clubJoinApplicationStatusLabels[activeApplication.status]}`}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : (
              <div className="mt-5 space-y-5">
                <fieldset>
                  <legend className="text-base font-bold text-foreground">
                    파크골프 경력 <span className="text-pul-point">필수·1개 선택</span>
                  </legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {clubJoinInquiryExperienceOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-pul-border px-3 text-[15px] font-medium text-foreground has-checked:border-pul-point has-checked:bg-pul-light/55"
                      >
                        <input
                          type="radio"
                          name="club-application-experience"
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
                  <legend className="text-base font-bold text-foreground">
                    활동 가능한 요일 <span className="text-pul-point">필수·1개 선택</span>
                  </legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {clubJoinInquiryAvailableDayOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-pul-border px-3 text-[15px] font-medium text-foreground has-checked:border-pul-point has-checked:bg-pul-light/55"
                      >
                        <input
                          type="radio"
                          name="club-application-available-day"
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
                  <legend className="text-base font-bold text-foreground">
                    희망 활동 <span className="text-pul-point">필수·복수 선택</span>
                  </legend>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {clubJoinInquiryInterestOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-pul-border px-3 text-[15px] font-medium text-foreground has-checked:border-pul-point has-checked:bg-pul-light/55"
                      >
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

                <ApplicationTextarea
                  id="club-application-motivation"
                  label="가입을 희망하는 이유"
                  value={motivation}
                  onChange={setMotivation}
                  help="동호회 활동에 관심을 갖게 된 이유를 간단히 작성해 주세요."
                  required
                />
                <ApplicationTextarea
                  id="club-application-message"
                  label="운영진에게 전할 내용"
                  value={message}
                  onChange={setMessage}
                  help="활동 가능 시간이나 미리 알려야 할 내용을 작성해 주세요."
                  rows={3}
                />

                <fieldset>
                  <legend className="text-base font-bold text-foreground">
                    동호회 운영 기준 확인 <span className="text-pul-point">필수</span>
                  </legend>
                  <div className="mt-2 space-y-2">
                    <ApplicationCheckbox
                      checked={rulesConfirmed}
                      onChange={setRulesConfirmed}
                      label="동호회 운영 규칙을 확인했습니다."
                    />
                    <ApplicationCheckbox
                      checked={courtesyConfirmed}
                      onChange={setCourtesyConfirmed}
                      label="회원 간 배려와 기본 예절을 지키겠습니다."
                    />
                    <ApplicationCheckbox
                      checked={scheduleGuidanceConfirmed}
                      onChange={setScheduleGuidanceConfirmed}
                      label="공식 일정과 공지는 동호회 안내에 따르겠습니다."
                    />
                  </div>
                </fieldset>

                <fieldset className="rounded-xl border border-pul-border bg-pul-page p-4">
                  <legend className="px-1 text-base font-bold text-foreground">
                    가입 상담 연락처 제공 안내
                  </legend>
                  <dl className="mt-1 grid gap-2 text-sm leading-relaxed text-pul-muted sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-foreground">제공 대상</dt>
                      <dd>해당 동호회의 인증된 운영자</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-foreground">제공 목적</dt>
                      <dd>가입 상담 및 가입 절차 안내</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-foreground">제공 항목</dt>
                      <dd>공개 이름·인증 휴대전화·가입 신청 내용</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-foreground">보유·파기</dt>
                      <dd>가입 처리 완료 후 운영 정책에 따른 보유·파기</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-sm leading-relaxed text-pul-muted">
                    실제 연락처 제공 동의와 철회는 인증·저장 기반 연결 후 별도로
                    처리합니다. 마케팅 수신 동의와 혼합하지 않습니다.
                  </p>
                  <div className="mt-3">
                    <ApplicationCheckbox
                      checked={contactGuidanceConfirmed}
                      onChange={setContactGuidanceConfirmed}
                      label="연락처 제공 안내를 확인했습니다. (현재 저장되지 않음)"
                    />
                  </div>
                </fieldset>
              </div>
            )}

            <section
              className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4"
              aria-label="가입 신청 이용 상태"
            >
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="mt-0.5 h-5 w-5 shrink-0 text-sky-700"
                  aria-hidden="true"
                />
                <div className="text-[15px] leading-relaxed text-sky-950">
                  <p className="font-bold">가입 신청 기능 준비 중</p>
                  <p className="mt-1">
                    현재 로그인·회원 및 서버 저장 기반을 준비 중입니다. 입력한
                    내용은 저장되거나 전송되지 않으며 가입 신청이 접수되지 않습니다.
                  </p>
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
              disabled={!applicationContext.canSubmit || !isRecruiting}
              className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-lg bg-pul-deep px-3 text-center text-[15px] font-bold text-white opacity-60"
              aria-describedby={descriptionId}
            >
              가입 신청 기능 준비 중
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

type ApplicationTextareaProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  help: string;
  rows?: number;
  required?: boolean;
};

function ApplicationTextarea({
  id,
  label,
  value,
  onChange,
  help,
  rows = 4,
  required = false,
}: ApplicationTextareaProps) {
  const helpId = `${id}-help`;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-base font-bold text-foreground">
          {label} {required ? <span className="text-pul-point">필수</span> : <span className="text-pul-muted">선택</span>}
        </label>
        <span className="text-sm font-medium text-pul-muted" aria-live="polite">
          {value.length}/500자
        </span>
      </div>
      <p id={helpId} className="mt-1 text-sm leading-relaxed text-pul-muted">
        {help}
      </p>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={500}
        rows={rows}
        required={required}
        aria-describedby={helpId}
        className="mt-2 w-full resize-y rounded-lg border border-pul-border bg-white px-3 py-3 text-base leading-relaxed text-foreground outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-light"
      />
    </div>
  );
}

type ApplicationCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
};

function ApplicationCheckbox({
  checked,
  onChange,
  label,
}: ApplicationCheckboxProps) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-pul-border bg-white px-3 py-3 text-[15px] font-medium leading-relaxed text-foreground has-checked:border-pul-point has-checked:bg-pul-light/55">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded accent-pul-point"
      />
      <span>{label}</span>
    </label>
  );
}
