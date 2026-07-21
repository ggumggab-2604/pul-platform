"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { useClubMembershipApplicationManagement } from "@/components/clubs/manage/ClubMembershipApplicationManagementProvider";

type ConfirmationKind = "approve" | "reject";

const buttonClass = "min-h-12 rounded-lg border px-4 text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-55";

function ConfirmationDialog({
  kind,
  onClose,
  returnFocus,
}: {
  kind: ConfirmationKind;
  onClose: () => void;
  returnFocus: HTMLButtonElement | null;
}) {
  const management = useClubMembershipApplicationManagement();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(returnFocus);
  const restoreFrameRef = useRef<number | undefined>(undefined);
  const isApproval = kind === "approve";
  const busy = Boolean(management.mutationKey);

  useEffect(() => {
    if (restoreFrameRef.current !== undefined) {
      window.cancelAnimationFrame(restoreFrameRef.current);
      restoreFrameRef.current = undefined;
    }

    const initialFocus = cancelRef.current ?? confirmRef.current ?? dialogRef.current;
    if (initialFocus?.isConnected) initialFocus.focus();
    const trigger = returnFocusRef.current;

    return () => {
      if (restoreFrameRef.current !== undefined) {
        window.cancelAnimationFrame(restoreFrameRef.current);
      }
      restoreFrameRef.current = window.requestAnimationFrame(() => {
        restoreFrameRef.current = undefined;
        if (trigger instanceof HTMLElement && trigger.isConnected && !trigger.disabled) {
          trigger.focus();
          return;
        }

        const detailFocusTarget = document.querySelector<HTMLElement>(
          "[data-membership-application-detail-focus]",
        );
        if (detailFocusTarget?.isConnected) detailFocusTarget.focus();
      });
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const frameId = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog?.isConnected) return;
      const activeElement = document.activeElement;
      const activeElementIsDisabled =
        activeElement instanceof HTMLButtonElement && activeElement.disabled;
      const hasEnabledFocusableElement = Boolean(
        dialog.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (
        activeElementIsDisabled ||
        !(activeElement instanceof Node) ||
        !dialog.contains(activeElement) ||
        !hasEnabledFocusableElement
      ) {
        dialog.focus();
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [busy]);

  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog?.isConnected) return;

      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (busy || focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const activeElement = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!(activeElement instanceof Node) || !dialog.contains(activeElement) || activeElement === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleDocumentKeyDown, true);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown, true);
  }, [busy, onClose]);

  const confirm = async () => {
    const succeeded = isApproval ? await management.approve() : await management.reject();
    if (succeeded) onClose();
  };


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby="membership-decision-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
      >
        <h3 id="membership-decision-title" className="text-xl font-bold text-foreground">
          {isApproval ? "이 신청을 최종 승인하시겠습니까?" : "이 신청을 최종 거절하시겠습니까?"}
        </h3>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-pul-muted">
          {isApproval
            ? "승인하면 신청자의 동호회 회원 관계가 활성화되고\n기본 회원 역할이 부여됩니다."
            : "거절 후에는 현재 신청을 다시 검토 상태로 되돌릴 수 없습니다.\n필요한 운영 기록은 먼저 내부 메모에 남겨 주세요."}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button ref={cancelRef} type="button" onClick={onClose} disabled={busy} className={`${buttonClass} border-pul-border bg-white text-pul-deep`}>취소</button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className={`${buttonClass} ${isApproval ? "border-pul-point bg-pul-point text-white" : "border-rose-700 bg-rose-700 text-white"}`}
          >
            {busy ? "처리 중..." : isApproval ? "최종 승인" : "최종 거절"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClubMembershipApplicationActions({
  successFocusRef,
}: {
  successFocusRef: RefObject<HTMLElement | null>;
}) {
  const management = useClubMembershipApplicationManagement();
  const detail = management.detailBundle?.detail;
  const [additionalInfoBody, setAdditionalInfoBody] = useState("");
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);
  const [confirmation, setConfirmation] = useState<{ kind: ConfirmationKind; returnFocus: HTMLButtonElement | null }>();
  const additionalInfoInputRef = useRef<HTMLTextAreaElement>(null);
  const additionalInfoTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreAdditionalInfoFocusFrameRef = useRef<number | undefined>(undefined);
  const locked = Boolean(management.mutationKey);

  useEffect(() => {
    if (!showAdditionalInfo) return;

    const frameId = window.requestAnimationFrame(() => {
      const input = additionalInfoInputRef.current;
      if (!input?.isConnected) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [detail?.applicationId, showAdditionalInfo]);

  useEffect(() => () => {
    if (restoreAdditionalInfoFocusFrameRef.current !== undefined) {
      window.cancelAnimationFrame(restoreAdditionalInfoFocusFrameRef.current);
    }
  }, []);

  if (!detail || ["approved", "rejected", "withdrawn"].includes(detail.status)) return null;

  const additionalInfoPanelId = `membership-application-additional-info-${detail.applicationId}`;
  const additionalInfoInputId = `membership-application-additional-info-input-${detail.applicationId}`;
  const additionalInfoDescriptionId = `membership-application-additional-info-description-${detail.applicationId}`;

  const closeAdditionalInfo = () => {
    setShowAdditionalInfo(false);
    if (restoreAdditionalInfoFocusFrameRef.current !== undefined) {
      window.cancelAnimationFrame(restoreAdditionalInfoFocusFrameRef.current);
    }
    restoreAdditionalInfoFocusFrameRef.current = window.requestAnimationFrame(() => {
      restoreAdditionalInfoFocusFrameRef.current = undefined;
      const trigger = additionalInfoTriggerRef.current;
      if (trigger?.isConnected && !trigger.disabled) {
        trigger.focus({ preventScroll: true });
      }
    });
  };

  const operation = async (
    name: "review" | "request_additional_info" | "request_interview" | "waitlist" | "resume_review",
  ) => {
    const succeeded = await management.runOperation(name, name === "request_additional_info" ? additionalInfoBody : undefined);
    if (succeeded && name === "request_additional_info") {
      setAdditionalInfoBody("");
      setShowAdditionalInfo(false);
      window.requestAnimationFrame(() => {
        const focusTarget = successFocusRef.current;
        if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
      });
    }
  };

  const canApprove = management.permissions.canDecide && ["reviewing", "interview_requested", "waitlisted"].includes(detail.status);
  const canReject = management.permissions.canDecide && ["submitted", "reviewing", "additional_info_required", "interview_requested", "waitlisted"].includes(detail.status);
  const additionalInfoTrigger = (
    <button
      ref={additionalInfoTriggerRef}
      type="button"
      disabled={locked}
      aria-expanded={showAdditionalInfo}
      aria-controls={additionalInfoPanelId}
      onClick={() => setShowAdditionalInfo(true)}
      className={`${buttonClass} border-pul-point bg-pul-point text-white`}
    >
      추가 정보 요청
    </button>
  );

  return (
    <section className="sticky bottom-16 z-10 rounded-xl border border-pul-border bg-white p-4 shadow-[0_-3px_18px_rgba(6,78,59,0.12)] lg:bottom-4" aria-label="가입 신청 처리">
      <h3 className="text-lg font-bold text-foreground">현재 가능한 처리</h3>
      {showAdditionalInfo ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {additionalInfoTrigger}
          </div>
          <div id={additionalInfoPanelId} className="mt-3 rounded-lg bg-pul-light/30 p-3">
            <label htmlFor={additionalInfoInputId} className="font-bold text-foreground">신청자에게 요청할 내용</label>
            <textarea
              ref={additionalInfoInputRef}
              id={additionalInfoInputId}
              aria-describedby={additionalInfoDescriptionId}
              value={additionalInfoBody}
              onChange={(event) => setAdditionalInfoBody(event.target.value)}
              maxLength={1000}
              rows={4}
              className="mt-2 w-full rounded-lg border border-pul-border bg-white p-3 text-base outline-none focus:border-pul-point"
            />
            <div className="mt-1 flex items-center justify-between text-sm text-pul-muted"><span id={additionalInfoDescriptionId}>신청자에게 공개되는 안내입니다.</span><span>{additionalInfoBody.length}/1000</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={locked} onClick={closeAdditionalInfo} className={`${buttonClass} border-pul-border bg-white text-pul-deep`}>취소</button>
              <button type="button" disabled={locked} onClick={() => void operation("request_additional_info")} className={`${buttonClass} border-pul-point bg-pul-point text-white`}>{management.mutationKey ? "처리 중..." : "요청 보내기"}</button>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {management.permissions.canManage && detail.status === "submitted" ? (
            <button type="button" disabled={locked} onClick={() => void operation("review")} className={`${buttonClass} border-pul-point bg-pul-point text-white`}>검토 시작</button>
          ) : null}
          {management.permissions.canManage && detail.status === "reviewing" ? (
            <>
              {additionalInfoTrigger}
              <button type="button" disabled={locked} onClick={() => void operation("request_interview")} className={`${buttonClass} border-pul-border bg-white text-pul-deep`}>면담 요청</button>
              <button type="button" disabled={locked} onClick={() => void operation("waitlist")} className={`${buttonClass} border-pul-border bg-white text-pul-deep`}>가입 대기 처리</button>
            </>
          ) : null}
          {management.permissions.canManage && ["additional_info_required", "interview_requested", "waitlisted"].includes(detail.status) ? (
            <button type="button" disabled={locked} onClick={() => void operation("resume_review")} className={`${buttonClass} border-pul-point bg-pul-point text-white`}>검토 재개</button>
          ) : null}
          {canApprove ? (
            <button type="button" disabled={locked} onClick={(event) => setConfirmation({ kind: "approve", returnFocus: event.currentTarget })} className={`${buttonClass} border-emerald-700 bg-emerald-700 text-white`}>승인</button>
          ) : null}
          {canReject ? (
            <button type="button" disabled={locked} onClick={(event) => setConfirmation({ kind: "reject", returnFocus: event.currentTarget })} className={`${buttonClass} border-rose-700 bg-white text-rose-800`}>거절</button>
          ) : null}
        </div>
      )}
      {confirmation ? <ConfirmationDialog kind={confirmation.kind} returnFocus={confirmation.returnFocus} onClose={() => setConfirmation(undefined)} /> : null}
    </section>
  );
}
