"use client";

import { useBodyScrollLock } from "@/components/ui/InfoModal";
import type {
  ClubInformationCorrectionTarget,
  ClubOperatorVerificationRole,
  ClubParticipationRequestContext,
  ClubParticipationRequestType,
  ClubPhotoConsentStatus,
  ClubPhotoCopyrightStatus,
  ClubRepresentativePhotoType,
  ParkGolfClub,
} from "@/types";
import { BadgeCheck, ImageIcon, MapPin, PencilLine, ShieldCheck } from "lucide-react";
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

type ClubParticipationRequestController = {
  openRequest: (
    requestType: ClubParticipationRequestType,
    trigger: HTMLButtonElement,
  ) => void;
};

type ClubParticipationRequestProviderProps = {
  club: ParkGolfClub;
  requestContext: ClubParticipationRequestContext;
  children: ReactNode;
};

const ClubParticipationRequestControllerContext =
  createContext<ClubParticipationRequestController | null>(null);

const historyStateKey = "pulClubParticipationRequest";

const requestConfigs = {
  informationCorrection: {
    label: "정보 수정 제보",
    title: "동호회 정보 수정 제보",
    description:
      "잘못되었거나 변경된 정보를 알려주세요. 확인 후 반영 여부를 검토합니다.",
    icon: PencilLine,
  },
  representativePhoto: {
    label: "대표사진 등록 안내",
    title: "동호회 대표사진 등록 안내",
    description:
      "동호회를 대표하는 사진은 운영진 확인과 사진 사용 권한 확인 후 등록할 수 있습니다.",
    icon: ImageIcon,
  },
  operatorVerification: {
    label: "운영자 인증 안내",
    title: "동호회 운영자 인증 안내",
    description:
      "동호회 대표·회장·총무 등 실제 운영진임을 확인한 뒤 동호회 관리 권한을 부여합니다.",
    icon: BadgeCheck,
  },
} satisfies Record<
  ClubParticipationRequestType,
  {
    label: string;
    title: string;
    description: string;
    icon: typeof PencilLine;
  }
>;

const correctionTargetOptions: Array<{
  value: ClubInformationCorrectionTarget;
  label: string;
}> = [
  { value: "clubName", label: "동호회명" },
  { value: "region", label: "활동 지역" },
  { value: "homeCourse", label: "주 활동 골프장" },
  { value: "schedule", label: "정기 활동 시간" },
  { value: "recruitStatus", label: "회원 모집 상태" },
  { value: "joinConditions", label: "가입 조건" },
  { value: "contact", label: "운영진·문의 정보" },
  { value: "introduction", label: "소개·주요 활동" },
  { value: "other", label: "기타" },
];

const representativePhotoTypeOptions: Array<{
  value: ClubRepresentativePhotoType;
  label: string;
}> = [
  { value: "groupPhoto", label: "동호회 단체사진" },
  { value: "activityPhoto", label: "활동 현장사진" },
  { value: "eventPhoto", label: "공식 행사사진" },
  { value: "other", label: "기타 대표사진" },
];

const operatorRoleOptions: Array<{
  value: ClubOperatorVerificationRole;
  label: string;
}> = [
  { value: "representative", label: "대표" },
  { value: "president", label: "회장" },
  { value: "secretary", label: "총무" },
  { value: "committeeMember", label: "운영위원" },
  { value: "otherOperator", label: "기타 운영진" },
];

const fieldClass =
  "mt-2 min-h-12 w-full rounded-lg border border-pul-border bg-white px-3 text-base text-foreground outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-light";
const textareaClass =
  "mt-2 w-full resize-y rounded-lg border border-pul-border bg-white px-3 py-3 text-base leading-relaxed text-foreground outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-light";

export function useClubParticipationRequest() {
  const controller = useContext(ClubParticipationRequestControllerContext);
  if (!controller) {
    throw new Error(
      "useClubParticipationRequest must be used within ClubParticipationRequestProvider",
    );
  }
  return controller;
}

export function ClubParticipationRequestProvider({
  club,
  requestContext,
  children,
}: ClubParticipationRequestProviderProps) {
  const [requestType, setRequestType] =
    useState<ClubParticipationRequestType | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const finishClose = useCallback(() => {
    setRequestType(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const closeRequest = useCallback(() => {
    if (window.history.state?.[historyStateKey]) {
      window.history.back();
      return;
    }
    finishClose();
  }, [finishClose]);

  const openRequest = useCallback(
    (
      nextRequestType: ClubParticipationRequestType,
      trigger: HTMLButtonElement,
    ) => {
      triggerRef.current = trigger;
      setRequestType(nextRequestType);
      window.history.pushState(
        { ...window.history.state, [historyStateKey]: true },
        "",
      );
    },
    [],
  );

  useEffect(() => {
    if (!requestType) return;
    const onPopState = () => finishClose();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [finishClose, requestType]);

  return (
    <ClubParticipationRequestControllerContext.Provider value={{ openRequest }}>
      {children}
      {requestType ? (
        <ClubParticipationRequestDialog
          key={requestType}
          club={club}
          requestContext={requestContext}
          requestType={requestType}
          onClose={closeRequest}
        />
      ) : null}
    </ClubParticipationRequestControllerContext.Provider>
  );
}

type ClubParticipationRequestDialogProps = {
  club: ParkGolfClub;
  requestContext: ClubParticipationRequestContext;
  requestType: ClubParticipationRequestType;
  onClose: () => void;
};

function ClubParticipationRequestDialog({
  club,
  requestContext,
  requestType,
  onClose,
}: ClubParticipationRequestDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const config = requestConfigs[requestType];
  const RequestIcon = config.icon;

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
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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

  const activeRequest = requestContext.activeRequests?.find(
    (request) => request.requestType === requestType,
  );

  const handleUnavailableSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 px-0 pt-8 sm:items-center sm:p-5">
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
              <RequestIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-pul-point">동호회 참여 요청</p>
              <h2
                id={titleId}
                className="mt-0.5 break-words text-xl font-bold leading-snug text-foreground sm:text-2xl"
              >
                {config.title}
              </h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-pul-page text-2xl font-bold leading-none text-pul-muted hover:bg-pul-light hover:text-pul-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point"
            aria-label={`${config.title} 닫기`}
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
              aria-label="참여 요청 대상 동호회"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-lg font-bold leading-snug text-pul-deep">
                  {club.name}
                </h3>
                <span className="rounded-full bg-white px-2.5 py-1 text-sm font-bold text-pul-deep shadow-sm">
                  {config.label}
                </span>
              </div>
              <p className="mt-3 flex items-start gap-2 text-[15px] text-pul-muted">
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0 text-pul-point"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold text-foreground">활동 지역</span>
                  {` · ${club.regionLabel}`}
                </span>
              </p>
            </section>

            <div
              id={descriptionId}
              className="mt-4 space-y-2 text-[15px] leading-relaxed text-pul-muted"
            >
              <p className="font-semibold text-foreground">{config.description}</p>
              <p>
                제출된 내용은 동호회 운영진 또는 PUL 관리자가 확인한 후 반영
                여부를 결정합니다.
              </p>
            </div>

            {activeRequest ? (
              <section
                className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"
                aria-label="현재 참여 요청 상태"
              >
                <p className="font-bold text-amber-900">
                  현재 확인 중인 요청이 있습니다.
                </p>
                <p className="mt-1 text-sm leading-relaxed text-amber-900">
                  실제 저장 기반 연결 후 신청자 본인에게만 상세 상태를 표시합니다.
                </p>
              </section>
            ) : null}

            <div className="mt-5">
              {requestType === "informationCorrection" ? (
                <InformationCorrectionFields club={club} />
              ) : null}
              {requestType === "representativePhoto" ? (
                <RepresentativePhotoFields />
              ) : null}
              {requestType === "operatorVerification" ? (
                <OperatorVerificationFields />
              ) : null}
            </div>

            <section
              className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4"
              aria-label="참여 요청 이용 상태"
            >
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="mt-0.5 h-5 w-5 shrink-0 text-sky-700"
                  aria-hidden="true"
                />
                <div className="text-[15px] leading-relaxed text-sky-950">
                  <p className="font-bold">로그인 및 요청 저장 기능 준비 중</p>
                  <p className="mt-1">
                    현재 요청 접수 기능을 준비 중이며 입력 내용은 저장되거나
                    전송되지 않습니다.
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
              disabled={!requestContext.canSubmit}
              className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-lg bg-pul-deep px-3 text-center text-[15px] font-bold text-white opacity-60"
              aria-describedby={descriptionId}
            >
              요청 접수 기능 준비 중
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function InformationCorrectionFields({ club }: { club: ParkGolfClub }) {
  const [target, setTarget] = useState<ClubInformationCorrectionTarget | "">(
    "",
  );
  const [otherDisplayedValue, setOtherDisplayedValue] = useState("");
  const [requestedValue, setRequestedValue] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const knownDisplayedValues: Partial<
    Record<ClubInformationCorrectionTarget, string>
  > = {
    clubName: club.name,
    region: club.regionLabel,
    homeCourse: club.homeCourse,
    schedule: `${club.scheduleLabel} · ${club.time}`,
    recruitStatus:
      club.recruitStatus === "recruiting"
        ? "회원 모집 중"
        : club.recruitStatus === "waiting"
          ? "대기 접수"
          : "모집 마감",
    joinConditions: club.joinConditions,
    contact: club.contactMethod,
    introduction: [
      club.detailSummary ?? club.description,
      ...(club.mainActivities ?? []),
    ]
      .filter(Boolean)
      .join(" · "),
  };
  const displayedValue =
    target === "other"
      ? otherDisplayedValue
      : target
        ? knownDisplayedValues[target]
        : undefined;

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="club-correction-target"
          className="text-base font-bold text-foreground"
        >
          수정 대상
        </label>
        <select
          id="club-correction-target"
          value={target}
          onChange={(event) =>
            setTarget(event.target.value as ClubInformationCorrectionTarget | "")
          }
          className={fieldClass}
        >
          <option value="">수정할 정보를 선택해 주세요</option>
          {correctionTargetOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p id="club-current-value-label" className="text-base font-bold text-foreground">
          현재 표시된 내용
        </p>
        {target === "other" ? (
          <textarea
            value={otherDisplayedValue}
            onChange={(event) => setOtherDisplayedValue(event.target.value)}
            maxLength={500}
            rows={3}
            aria-labelledby="club-current-value-label"
            className={textareaClass}
            placeholder="현재 화면에 표시된 내용을 적어 주세요."
          />
        ) : (
          <div
            className="mt-2 min-h-12 rounded-lg border border-pul-border bg-pul-page px-3 py-3 text-[15px] leading-relaxed text-pul-muted"
            aria-live="polite"
          >
            {displayedValue ||
              "수정 대상을 선택하면 확인 가능한 현재 정보가 표시됩니다."}
          </div>
        )}
      </div>

      <LabeledTextarea
        id="club-requested-value"
        label="변경이 필요한 내용"
        value={requestedValue}
        onChange={setRequestedValue}
        help="정확한 변경 내용을 500자 이내로 작성해 주세요."
      />
      <LabeledTextarea
        id="club-correction-reason"
        label="변경 사유 또는 확인 근거"
        value={reason}
        onChange={setReason}
        help="공개 가능한 확인 근거만 작성해 주세요."
      />
      <LabeledTextarea
        id="club-correction-note"
        label="운영자에게 전할 참고사항"
        value={note}
        onChange={setNote}
        help="전화번호, 이메일 등 민감정보는 입력하지 마세요."
        rows={3}
      />
    </div>
  );
}

function RepresentativePhotoFields() {
  const [photoType, setPhotoType] = useState<ClubRepresentativePhotoType | "">(
    "",
  );
  const [photographedAtLabel, setPhotographedAtLabel] = useState("");
  const [description, setDescription] = useState("");
  const [providerRelationship, setProviderRelationship] = useState("");
  const [copyrightStatus, setCopyrightStatus] =
    useState<ClubPhotoCopyrightStatus>("notChecked");
  const [consentStatus, setConsentStatus] =
    useState<ClubPhotoConsentStatus>("notChecked");

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-pul-border bg-pul-light/20 p-4">
        <h3 className="font-bold text-pul-deep">대표사진 등록 기준</h3>
        <ul className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-pul-muted">
          <li>• 동호회 단체사진 또는 활동 현장사진</li>
          <li>• 가급적 가로형 고화질 사진</li>
          <li>• 동호회와 관련 없는 홍보 이미지 제외</li>
          <li>• 전화번호·주소 등 개인정보가 보이는 사진 제외</li>
          <li>• 촬영자 또는 사진 사용 권한 확인 필요</li>
          <li>• 사진 속 인물의 공개 동의 확인 필요</li>
          <li>• 운영진 확인 후 대표사진으로 반영 가능</li>
        </ul>
      </section>

      <div>
        <label
          htmlFor="club-photo-type"
          className="text-base font-bold text-foreground"
        >
          사진 유형
        </label>
        <select
          id="club-photo-type"
          value={photoType}
          onChange={(event) =>
            setPhotoType(event.target.value as ClubRepresentativePhotoType | "")
          }
          className={fieldClass}
        >
          <option value="">사진 유형을 선택해 주세요</option>
          {representativePhotoTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="club-photo-period"
          className="text-base font-bold text-foreground"
        >
          촬영 시기
        </label>
        <input
          id="club-photo-period"
          value={photographedAtLabel}
          onChange={(event) => setPhotographedAtLabel(event.target.value)}
          maxLength={100}
          className={fieldClass}
          placeholder="확인된 촬영 시기만 작성해 주세요."
        />
      </div>

      <LabeledTextarea
        id="club-photo-description"
        label="사진 설명"
        value={description}
        onChange={setDescription}
        help="사진 속 인물의 이름이나 민감정보를 작성하지 마세요."
      />

      <div>
        <label
          htmlFor="club-photo-provider"
          className="text-base font-bold text-foreground"
        >
          촬영자 또는 제공자 관계
        </label>
        <select
          id="club-photo-provider"
          value={providerRelationship}
          onChange={(event) => setProviderRelationship(event.target.value)}
          className={fieldClass}
        >
          <option value="">관계를 선택해 주세요</option>
          <option value="photographer">촬영자 본인</option>
          <option value="clubOperator">동호회 운영진</option>
          <option value="clubMember">동호회 회원</option>
          <option value="authorizedProvider">사용 허락을 받은 제공자</option>
          <option value="other">기타 관계</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="club-photo-copyright"
            className="text-base font-bold text-foreground"
          >
            사진 사용 권한 확인 여부
          </label>
          <select
            id="club-photo-copyright"
            value={copyrightStatus}
            onChange={(event) =>
              setCopyrightStatus(event.target.value as ClubPhotoCopyrightStatus)
            }
            className={fieldClass}
          >
            <option value="notChecked">확인 전</option>
            <option value="submitterOwned">신청자가 촬영함</option>
            <option value="permissionGranted">사용 허락 확인</option>
            <option value="needsReview">추가 확인 필요</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="club-photo-consent"
            className="text-base font-bold text-foreground"
          >
            인물 공개 동의 확인 여부
          </label>
          <select
            id="club-photo-consent"
            value={consentStatus}
            onChange={(event) =>
              setConsentStatus(event.target.value as ClubPhotoConsentStatus)
            }
            className={fieldClass}
          >
            <option value="notChecked">확인 전</option>
            <option value="confirmed">공개 동의 확인</option>
            <option value="needsReview">추가 확인 필요</option>
          </select>
        </div>
      </div>

      <p className="rounded-lg bg-pul-page px-3 py-3 text-sm leading-relaxed text-pul-muted">
        현재 파일 업로드와 전자 동의·증빙 제출 기능은 제공하지 않습니다.
      </p>
    </div>
  );
}

function OperatorVerificationFields() {
  const [requestedRole, setRequestedRole] =
    useState<ClubOperatorVerificationRole | "">("");
  const [clubRelationship, setClubRelationship] = useState("");
  const [operationPeriod, setOperationPeriod] = useState("");
  const [existingOperatorConfirmation, setExistingOperatorConfirmation] =
    useState("unknown");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-pul-border bg-pul-light/20 p-4">
        <h3 className="font-bold text-pul-deep">운영자 인증 절차 안내</h3>
        <ul className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-pul-muted">
          <li>• 운영자 인증은 동호회 관리 권한과 연결됩니다.</li>
          <li>• 허위 신청은 승인되지 않습니다.</li>
          <li>• 기존 운영자가 있으면 추가 확인이 필요할 수 있습니다.</li>
          <li>• 개인정보와 회원정보는 권한 범위 내에서만 확인합니다.</li>
          <li>• 운영자 변경·탈퇴 시 권한을 회수할 수 있습니다.</li>
          <li>• PUL 관리자의 최종 확인 후 권한을 부여합니다.</li>
        </ul>
      </section>

      <div>
        <label
          htmlFor="club-operator-role"
          className="text-base font-bold text-foreground"
        >
          신청 역할
        </label>
        <select
          id="club-operator-role"
          value={requestedRole}
          onChange={(event) =>
            setRequestedRole(event.target.value as ClubOperatorVerificationRole | "")
          }
          className={fieldClass}
        >
          <option value="">역할을 선택해 주세요</option>
          {operatorRoleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="club-operator-relationship"
            className="text-base font-bold text-foreground"
          >
            동호회와의 관계
          </label>
          <input
            id="club-operator-relationship"
            value={clubRelationship}
            onChange={(event) => setClubRelationship(event.target.value)}
            maxLength={100}
            className={fieldClass}
            placeholder="공개 가능한 범위에서 작성"
          />
        </div>
        <div>
          <label
            htmlFor="club-operator-period"
            className="text-base font-bold text-foreground"
          >
            운영 또는 활동 기간
          </label>
          <input
            id="club-operator-period"
            value={operationPeriod}
            onChange={(event) => setOperationPeriod(event.target.value)}
            maxLength={100}
            className={fieldClass}
            placeholder="확인 가능한 기간만 작성"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="club-existing-operator"
          className="text-base font-bold text-foreground"
        >
          기존 운영자 확인 가능 여부
        </label>
        <select
          id="club-existing-operator"
          value={existingOperatorConfirmation}
          onChange={(event) => setExistingOperatorConfirmation(event.target.value)}
          className={fieldClass}
        >
          <option value="unknown">확인 전</option>
          <option value="available">기존 운영자 확인 가능</option>
          <option value="unavailable">기존 운영자 확인 어려움</option>
        </select>
      </div>

      <LabeledTextarea
        id="club-operator-reason"
        label="인증 사유"
        value={reason}
        onChange={setReason}
        help="운영 권한이 필요한 이유를 500자 이내로 작성해 주세요."
      />
      <LabeledTextarea
        id="club-operator-note"
        label="운영자에게 전할 내용"
        value={note}
        onChange={setNote}
        help="주민등록번호, 전화번호, 상세 주소 등 민감정보는 입력하지 마세요."
        rows={3}
      />

      <div className="rounded-lg border border-dashed border-pul-border bg-pul-page px-3 py-3 text-[15px] leading-relaxed text-pul-muted">
        <p className="font-bold text-foreground">증빙 상태 · 제출 절차 준비 중</p>
        <p className="mt-1">
          신분증·전화번호·증빙 문서는 공개 상세 화면에서 수집하지 않습니다.
          향후 별도의 안전한 비공개 절차에서 확인합니다.
        </p>
      </div>
    </div>
  );
}

type LabeledTextareaProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  help: string;
  rows?: number;
};

function LabeledTextarea({
  id,
  label,
  value,
  onChange,
  help,
  rows = 4,
}: LabeledTextareaProps) {
  const helpId = `${id}-help`;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-base font-bold text-foreground">
          {label}
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
        aria-describedby={helpId}
        className={textareaClass}
      />
    </div>
  );
}
