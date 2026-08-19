"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { HallOfFameDialog } from "@/components/hall-of-fame/HallOfFameDialog";
import { useHallOfFameOperatorManagement } from "@/components/hall-of-fame/manage/HallOfFameOperatorProvider";
import {
  HALL_OF_FAME_NO_ACTION_OUTCOMES,
  HALL_OF_FAME_OPERATOR_OUTCOME_LABELS,
  type HallOfFameCorrectionInput,
  type HallOfFameDisputeResolutionContext,
  type HallOfFameRevokeInput,
} from "@/lib/hall-of-fame/hallOfFameOperatorUi";

type DialogKind = "review" | "resolution";
type ResolutionMode = "no_action" | "correction" | "revoke";

const correctionReasonOptions = [
  { value: "factual_error", label: "사실 정보 오류" },
  { value: "wrong_record_type", label: "기록 유형 오류" },
  { value: "administrative_error", label: "운영 처리 오류" },
  { value: "evidence_clarification", label: "증빙 확인 결과" },
] as const;

const revokeReasonOptions = [
  { value: "factual_error", label: "사실 정보 오류" },
  { value: "insufficient_or_invalid_evidence", label: "증빙 부족·무효" },
  { value: "duplicate_record", label: "중복 기록" },
  { value: "wrong_subject", label: "대상 회원 오류" },
  { value: "wrong_record_type", label: "기록 유형 오류" },
  { value: "administrative_error", label: "운영 처리 오류" },
  { value: "fraud_confirmed", label: "허위·부정 확인" },
] as const;

const inputClassName =
  "mt-1 min-h-12 w-full rounded-xl border border-pul-border bg-white px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20 disabled:bg-pul-page disabled:text-pul-muted";
const textareaClassName =
  "mt-1 min-h-28 w-full rounded-xl border border-pul-border bg-white px-3 py-3 text-base leading-7 outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20";

function CommonMessages({
  resolutionMessage,
  setResolutionMessage,
  internalNote,
  setInternalNote,
}: {
  resolutionMessage: string;
  setResolutionMessage: (value: string) => void;
  internalNote: string;
  setInternalNote: (value: string) => void;
}) {
  return (
    <>
      <label className="block text-sm font-bold text-foreground">
        회원에게 보이는 처리 안내
        <textarea
          required
          minLength={2}
          maxLength={2000}
          value={resolutionMessage}
          onChange={(event) => setResolutionMessage(event.target.value)}
          className={textareaClassName}
          placeholder="처리 결과와 이유를 이해하기 쉽게 작성해 주세요."
        />
        <span className="mt-1 block text-xs font-medium text-pul-muted">
          이 내용은 요청 회원에게 표시됩니다.
        </span>
      </label>
      <label className="block text-sm font-bold text-foreground">
        운영자 내부 메모
        <textarea
          required
          minLength={2}
          maxLength={2000}
          value={internalNote}
          onChange={(event) => setInternalNote(event.target.value)}
          className={textareaClassName}
          placeholder="판단 근거와 확인 사항을 남겨 주세요."
        />
        <span className="mt-1 block text-xs font-medium text-pul-muted">
          회원에게 공개되지 않는 운영 기록입니다.
        </span>
      </label>
    </>
  );
}

function ResolutionDialog({
  trigger,
  onClose,
}: {
  trigger: HTMLElement | null;
  onClose: () => void;
}) {
  const {
    detail,
    permissions,
    mutationKey,
    resolveNoAction,
    resolveCorrection,
    resolveRevoke,
    loadResolutionContext,
  } = useHallOfFameOperatorManagement();
  const initialFocusRef = useRef<HTMLSelectElement>(null);
  const requestGeneration = useRef(0);
  const [mode, setMode] = useState<ResolutionMode>("no_action");
  const [context, setContext] = useState<HallOfFameDisputeResolutionContext>();
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string>();
  const [resolutionMessage, setResolutionMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [outcome, setOutcome] = useState(
    detail ? HALL_OF_FAME_NO_ACTION_OUTCOMES[detail.disputeType][0] : "already_remediated",
  );
  const [correctionReasonCode, setCorrectionReasonCode] = useState<
    HallOfFameCorrectionInput["correctionReasonCode"]
  >("factual_error");
  const [correctionReason, setCorrectionReason] = useState("");
  const [recordTypeCode, setRecordTypeCode] = useState<HallOfFameCorrectionInput["recordTypeCode"]>("hole_in_one");
  const [playedOn, setPlayedOn] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseRegion, setCourseRegion] = useState("");
  const [courseEnvironment, setCourseEnvironment] = useState<HallOfFameCorrectionInput["courseEnvironment"]>("outdoor");
  const [courseLayout, setCourseLayout] = useState("");
  const [courseSegment, setCourseSegment] = useState("");
  const [holeNumber, setHoleNumber] = useState("1");
  const [holePar, setHolePar] = useState("");
  const [strokes, setStrokes] = useState("");
  const [revocationReasonCode, setRevocationReasonCode] = useState<
    HallOfFameRevokeInput["revocationReasonCode"]
  >("factual_error");
  const [revocationReason, setRevocationReason] = useState("");
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const busy = mutationKey !== undefined;

  const correctionAllowed =
    Boolean(detail?.targetKind === "canonical_record") &&
    detail?.disputeType !== "decision_appeal" &&
    permissions.canCorrect;
  const revokeAllowed =
    Boolean(detail?.targetKind === "canonical_record") &&
    (detail?.disputeType === "subject_objection" || detail?.disputeType === "fraud_report") &&
    permissions.canRevoke;

  useEffect(() => () => {
    requestGeneration.current += 1;
  }, []);

  const applyContext = (next: HallOfFameDisputeResolutionContext) => {
    setContext(next);
    setRecordTypeCode(next.recordTypeCode);
    setPlayedOn(next.playedOn);
    setCourseName(next.courseName);
    setCourseRegion(next.courseRegion);
    setCourseEnvironment(next.courseEnvironment);
    setCourseLayout(next.courseLayout ?? "");
    setCourseSegment(next.courseSegment);
    setHoleNumber(String(next.holeNumber));
    setHolePar(next.holePar === undefined ? "" : String(next.holePar));
    setStrokes(next.strokes === undefined ? "" : String(next.strokes));
  };

  const changeMode = async (nextMode: ResolutionMode) => {
    setMode(nextMode);
    setContextError(undefined);
    if (nextMode === "no_action" || context) return;
    const generation = ++requestGeneration.current;
    setContextLoading(true);
    const nextContext = await loadResolutionContext();
    if (generation !== requestGeneration.current) return;
    setContextLoading(false);
    if (!nextContext) {
      setContextError("처리에 필요한 최신 기록 정보를 불러오지 못했습니다.");
      return;
    }
    applyContext(nextContext);
  };

  if (!detail) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let succeeded = false;
    if (mode === "no_action") {
      succeeded = await resolveNoAction({
        resolutionOutcome: outcome,
        resolutionMessage,
        internalNote,
      });
    } else if (mode === "correction" && context) {
      succeeded = await resolveCorrection({
        disputeId: context.disputeId,
        expectedDisputeVersion: context.disputeVersion,
        canonicalRecordId: context.canonicalRecordId,
        expectedRecordVersion: context.canonicalRecordVersion,
        recordTypeCode,
        playedOn,
        courseName,
        courseRegion,
        courseEnvironment,
        courseLayout: courseLayout.trim() || undefined,
        courseSegment,
        holeNumber: Number(holeNumber),
        holePar: holePar === "" ? undefined : Number(holePar),
        strokes: strokes === "" ? undefined : Number(strokes),
        nominatingClubId: context.nominatingClubId,
        correctionReasonCode,
        correctionReason,
        resolutionMessage,
        internalNote,
      });
    } else if (mode === "revoke" && context && revokeConfirmed) {
      succeeded = await resolveRevoke({
        disputeId: context.disputeId,
        expectedDisputeVersion: context.disputeVersion,
        canonicalRecordId: context.canonicalRecordId,
        expectedRecordVersion: context.canonicalRecordVersion,
        revocationReasonCode,
        revocationReason,
        resolutionMessage,
        internalNote,
      });
    }
    if (succeeded) onClose();
  };

  return (
    <HallOfFameDialog
      title="요청 최종 처리"
      description="처리 방식과 회원 안내, 운영 근거를 확인한 뒤 완료하세요."
      busy={busy}
      onClose={onClose}
      returnFocus={trigger}
      initialFocusRef={initialFocusRef}
    >
      <form onSubmit={submit} className="space-y-5">
        <label className="block text-sm font-bold text-foreground">
          처리 방식
          <select
            ref={initialFocusRef}
            value={mode}
            disabled={busy}
            onChange={(event) => void changeMode(event.target.value as ResolutionMode)}
            className={inputClassName}
          >
            <option value="no_action">요청 종결(기록 변경 없음)</option>
            {correctionAllowed ? <option value="correction">기록 정정 후 종결</option> : null}
            {revokeAllowed ? <option value="revoke">기록 무효화 후 종결</option> : null}
          </select>
        </label>

        {mode === "no_action" ? (
          <label className="block text-sm font-bold text-foreground">
            처리 결과
            <select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as typeof outcome)}
              className={inputClassName}
            >
              {HALL_OF_FAME_NO_ACTION_OUTCOMES[detail.disputeType].map((value) => (
                <option key={value} value={value}>
                  {HALL_OF_FAME_OPERATOR_OUTCOME_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        ) : contextLoading ? (
          <p role="status" className="rounded-xl bg-pul-page p-4 font-bold text-pul-muted">
            최신 기록 정보를 확인하는 중입니다.
          </p>
        ) : contextError ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">
            {contextError}
          </p>
        ) : context && mode === "correction" ? (
          <div className="space-y-4 rounded-xl border border-pul-border bg-pul-page/40 p-4">
            <h3 className="font-bold text-foreground">정정할 기록 정보</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold text-foreground">기록 유형
                <select value={recordTypeCode} onChange={(event) => setRecordTypeCode(event.target.value as typeof recordTypeCode)} className={inputClassName}>
                  <option value="hole_in_one">홀인원</option><option value="albatross">알바트로스</option><option value="condor">콘도르</option>
                </select>
              </label>
              <label className="text-sm font-bold text-foreground">경기일
                <input required type="date" value={playedOn} onChange={(event) => setPlayedOn(event.target.value)} className={inputClassName} />
              </label>
              <label className="text-sm font-bold text-foreground">코스명
                <input required maxLength={200} value={courseName} onChange={(event) => setCourseName(event.target.value)} className={inputClassName} />
              </label>
              <label className="text-sm font-bold text-foreground">지역
                <input required maxLength={100} value={courseRegion} onChange={(event) => setCourseRegion(event.target.value)} className={inputClassName} />
              </label>
              <label className="text-sm font-bold text-foreground">환경
                <select value={courseEnvironment} onChange={(event) => setCourseEnvironment(event.target.value as typeof courseEnvironment)} className={inputClassName}>
                  <option value="outdoor">야외</option><option value="screen">스크린</option>
                </select>
              </label>
              <label className="text-sm font-bold text-foreground">코스 구분(선택)
                <input maxLength={200} value={courseLayout} onChange={(event) => setCourseLayout(event.target.value)} className={inputClassName} />
              </label>
              <label className="text-sm font-bold text-foreground">세부 코스
                <input required maxLength={100} value={courseSegment} onChange={(event) => setCourseSegment(event.target.value)} className={inputClassName} />
              </label>
              <label className="text-sm font-bold text-foreground">홀 번호
                <input required type="number" min="1" value={holeNumber} onChange={(event) => setHoleNumber(event.target.value)} className={inputClassName} />
              </label>
              <label className="text-sm font-bold text-foreground">파(선택)
                <input type="number" min="1" value={holePar} onChange={(event) => setHolePar(event.target.value)} className={inputClassName} />
              </label>
              <label className="text-sm font-bold text-foreground">타수(선택)
                <input type="number" min="1" value={strokes} onChange={(event) => setStrokes(event.target.value)} className={inputClassName} />
              </label>
            </div>
            <label className="block text-sm font-bold text-foreground">정정 사유 유형
              <select value={correctionReasonCode} onChange={(event) => setCorrectionReasonCode(event.target.value as typeof correctionReasonCode)} className={inputClassName}>
                {correctionReasonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-bold text-foreground">정정 사유
              <textarea required minLength={2} maxLength={1000} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} className={textareaClassName} />
            </label>
          </div>
        ) : context && mode === "revoke" ? (
          <div className="space-y-4 rounded-xl border border-red-200 bg-red-50/60 p-4">
            <h3 className="font-bold text-red-900">기록 무효화 확인</h3>
            <p className="text-sm leading-6 text-red-800">무효화된 기록은 공개 목록과 활성 배지 근거에서 제외됩니다.</p>
            <label className="block text-sm font-bold text-foreground">무효화 사유 유형
              <select value={revocationReasonCode} onChange={(event) => setRevocationReasonCode(event.target.value as typeof revocationReasonCode)} className={inputClassName}>
                {revokeReasonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-bold text-foreground">무효화 사유
              <textarea required minLength={2} maxLength={1000} value={revocationReason} onChange={(event) => setRevocationReason(event.target.value)} className={textareaClassName} />
            </label>
            <label className="flex min-h-12 items-start gap-3 rounded-xl border border-red-200 bg-white p-3 font-bold text-red-900">
              <input type="checkbox" required checked={revokeConfirmed} onChange={(event) => setRevokeConfirmed(event.target.checked)} className="mt-1 h-5 w-5 accent-red-700" />
              기록 무효화의 영향과 복구 절차가 별도임을 확인했습니다.
            </label>
          </div>
        ) : null}

        <CommonMessages
          resolutionMessage={resolutionMessage}
          setResolutionMessage={setResolutionMessage}
          internalNote={internalNote}
          setInternalNote={setInternalNote}
        />

        <div className="flex flex-col-reverse gap-3 border-t border-pul-border pt-4 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-12 rounded-xl border border-pul-border bg-white px-5 font-bold text-pul-deep hover:bg-pul-light disabled:opacity-50">취소</button>
          <button
            type="submit"
            disabled={busy || contextLoading || (mode !== "no_action" && !context)}
            className={`min-h-12 rounded-xl px-5 font-bold text-white disabled:opacity-50 ${mode === "revoke" ? "bg-red-700 hover:bg-red-800" : "bg-pul-point hover:bg-pul-deep"}`}
          >
            {busy ? "처리 중…" : mode === "revoke" ? "기록 무효화 및 처리 완료" : "처리 완료"}
          </button>
        </div>
      </form>
    </HallOfFameDialog>
  );
}

export function HallOfFameOperatorActions() {
  const {
    detail,
    permissions,
    mutationKey,
    startReview,
    addInternalNote,
  } = useHallOfFameOperatorManagement();
  const [dialog, setDialog] = useState<DialogKind>();
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const [note, setNote] = useState("");
  const reviewConfirmRef = useRef<HTMLButtonElement>(null);
  const busy = mutationKey !== undefined;

  if (!detail) return null;

  const openDialog = (kind: DialogKind, trigger: HTMLElement) => {
    setReturnFocus(trigger);
    setDialog(kind);
  };

  const submitNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await addInternalNote(note)) setNote("");
  };

  return (
    <div className="space-y-4">
      {detail.status === "open" && permissions.canReview ? (
        <button
          type="button"
          disabled={busy}
          onClick={(event) => openDialog("review", event.currentTarget)}
          className="min-h-12 w-full rounded-xl bg-pul-point px-5 font-bold text-white hover:bg-pul-deep disabled:opacity-50 sm:w-auto"
        >
          검토 시작
        </button>
      ) : null}

      {detail.status === "under_review" && permissions.canReview ? (
        <form onSubmit={submitNote} className="rounded-xl border border-pul-border bg-pul-page/40 p-4">
          <label className="block text-sm font-bold text-foreground">
            운영자 내부 메모 추가
            <textarea
              required
              minLength={2}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={textareaClassName}
              placeholder="회원에게 공개되지 않는 검토 메모"
            />
          </label>
          <button type="submit" disabled={busy} className="mt-3 min-h-12 rounded-xl border border-pul-border bg-white px-5 font-bold text-pul-deep hover:bg-pul-light disabled:opacity-50">
            내부 메모 저장
          </button>
        </form>
      ) : null}

      {detail.status === "under_review" && permissions.canResolve ? (
        <button
          type="button"
          disabled={busy}
          onClick={(event) => openDialog("resolution", event.currentTarget)}
          className="min-h-12 w-full rounded-xl bg-pul-deep px-5 font-bold text-white hover:bg-pul-point disabled:opacity-50 sm:w-auto"
        >
          최종 처리
        </button>
      ) : null}

      {dialog === "review" ? (
        <HallOfFameDialog
          title="검토를 시작할까요?"
          description="요청 상태가 검토 중으로 바뀌고 운영 이력에 기록됩니다."
          busy={busy}
          onClose={() => setDialog(undefined)}
          returnFocus={returnFocus}
          initialFocusRef={reviewConfirmRef}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" disabled={busy} onClick={() => setDialog(undefined)} className="min-h-12 rounded-xl border border-pul-border px-5 font-bold text-pul-deep">취소</button>
            <button
              ref={reviewConfirmRef}
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await startReview()) setDialog(undefined);
              }}
              className="min-h-12 rounded-xl bg-pul-point px-5 font-bold text-white disabled:opacity-50"
            >
              {busy ? "처리 중…" : "검토 시작"}
            </button>
          </div>
        </HallOfFameDialog>
      ) : null}

      {dialog === "resolution" ? (
        <ResolutionDialog trigger={returnFocus} onClose={() => setDialog(undefined)} />
      ) : null}
    </div>
  );
}
