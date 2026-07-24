"use client";

import { ShieldAlert, UserRoundCheck } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { MembershipStatusBadge } from "@/components/clubs/manage/ClubMemberList";
import {
  useClubMemberManagement,
  useClubMemberStatusMutation,
} from "@/components/clubs/manage/ClubMemberManagementProvider";
import {
  normalizeClubMembershipStatusReason,
  toClubMembershipStatusMutationError,
  type ClubMembershipStatusMutationAction,
} from "@/lib/clubs/clubMembershipStatusManagement";
import { getClubMemberDisplayName } from "@/lib/clubs/clubMemberManagement";

const buttonClass =
  "min-h-12 rounded-lg border px-4 text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-55";

function ClubMemberStatusConfirmationDialog({
  action,
  hasManagerRole,
  onClose,
  returnFocus,
}: {
  action: ClubMembershipStatusMutationAction;
  hasManagerRole: boolean;
  onClose: () => void;
  returnFocus: HTMLButtonElement | null;
}) {
  const management = useClubMemberManagement();
  const statusMutation = useClubMemberStatusMutation();
  const member = management.detail?.member;
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const returnFocusRef = useRef(returnFocus);
  const completedRef = useRef(false);
  const restoreFrameRef = useRef<number | undefined>(undefined);
  const busy = Boolean(statusMutation?.statusMutationAction);
  const isSuspend = action === "suspend";
  const titleId = "club-member-status-dialog-title";
  const descriptionId = "club-member-status-dialog-description";
  const reasonId = "club-member-status-reason";
  const reasonHelpId = "club-member-status-reason-help";
  const reasonErrorId = "club-member-status-reason-error";
  const displayedError = validationError ?? statusMutation?.statusMutationError;

  const cleanupAndCloseDialog = useCallback(
    (options: { preserveResult?: boolean } = {}) => {
      if (busy) return;
      setReason("");
      setValidationError(undefined);
      if (!options.preserveResult) {
        statusMutation?.clearStatusMutationState();
      }
      onClose();
    },
    [busy, onClose, statusMutation],
  );

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const input = reasonRef.current;
      if (input?.isConnected) input.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!displayedError) return;
    const frameId = window.requestAnimationFrame(() => {
      const input = reasonRef.current;
      if (input?.isConnected) input.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [displayedError]);

  useEffect(() => {
    if (!busy) return;
    const frameId = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const activeElement = document.activeElement;
      if (
        dialog?.isConnected &&
        (!(activeElement instanceof Node) ||
          !dialog.contains(activeElement) ||
          (activeElement instanceof HTMLButtonElement && activeElement.disabled))
      ) {
        dialog.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [busy]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog?.isConnected) return;

      if (event.key === "Escape") {
        event.preventDefault();
        cleanupAndCloseDialog();
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
        dialog.focus({ preventScroll: true });
        return;
      }

      const activeElement = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        !(activeElement instanceof Node) ||
        !dialog.contains(activeElement) ||
        activeElement === dialog
      ) {
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

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [busy, cleanupAndCloseDialog]);

  useEffect(() => {
    const trigger = returnFocusRef.current;
    return () => {
      if (completedRef.current) return;
      if (restoreFrameRef.current !== undefined) {
        window.cancelAnimationFrame(restoreFrameRef.current);
      }
      restoreFrameRef.current = window.requestAnimationFrame(() => {
        restoreFrameRef.current = undefined;
        if (trigger?.isConnected && !trigger.disabled) {
          trigger.focus({ preventScroll: true });
        }
      });
    };
  }, []);

  if (!member || !statusMutation) return null;

  const submit = async () => {
    if (busy) return;
    try {
      normalizeClubMembershipStatusReason(reason);
      setValidationError(undefined);
    } catch (error) {
      setValidationError(
        toClubMembershipStatusMutationError(error).userMessage,
      );
      return;
    }

    const result = await statusMutation.runStatusMutation(action, reason);
    if (
      result.status === "mutation_succeeded_and_synced" ||
      result.status === "mutation_succeeded_but_refresh_failed"
    ) {
      completedRef.current = true;
      setReason("");
      statusMutation.finalizeStatusMutationUi(result);
      cleanupAndCloseDialog({ preserveResult: true });
    }
  };

  const displayName = getClubMemberDisplayName(member.displayName);
  const description = isSuspend
    ? "정지 중에는 회원 권한과 보존된 운영 역할의 효력이 중단됩니다. 역할 기록 자체는 삭제되지 않습니다."
    : "정지를 해제하면 회원 권한이 다시 유효해집니다. 보존된 역할 기록이 있으면 해당 역할도 다시 유효해질 수 있습니다.";

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cleanupAndCloseDialog();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl outline-none sm:max-h-[calc(100dvh-2.5rem)] sm:p-5"
      >
        <h3 id={titleId} className="break-words text-xl font-bold text-foreground">
          {isSuspend ? "회원 활동을 정지하시겠습니까?" : "회원 정지를 해제하시겠습니까?"}
        </h3>
        <p className="mt-2 break-words font-bold text-pul-deep">{displayName}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-pul-muted">
          <MembershipStatusBadge status={member.membershipStatus} />
          <span aria-hidden="true">→</span>
          <span>{isSuspend ? "정지" : "활동 중"}</span>
        </div>
        <p id={descriptionId} className="mt-3 text-[15px] leading-7 text-pul-muted">
          {description}
        </p>
        {hasManagerRole ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-900">
            {isSuspend
              ? "정지해도 운영진 역할 기록은 삭제되지 않습니다."
              : "정지 해제 후 보존된 운영진 역할이 다시 활성화될 수 있습니다."}
          </p>
        ) : null}

        <div className="mt-5">
          <label htmlFor={reasonId} className="font-bold text-foreground">
            처리 사유
          </label>
          <textarea
            ref={reasonRef}
            id={reasonId}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setValidationError(undefined);
              if (statusMutation.statusMutationError) {
                statusMutation.clearStatusMutationState();
              }
            }}
            disabled={busy}
            rows={4}
            maxLength={500}
            aria-invalid={Boolean(displayedError)}
            aria-describedby={`${reasonHelpId}${displayedError ? ` ${reasonErrorId}` : ""}`}
            className="mt-2 w-full resize-y rounded-lg border border-pul-border bg-white p-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/25 disabled:bg-gray-50"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm text-pul-muted">
            <span id={reasonHelpId}>2자 이상 500자 이하로 입력해 주세요.</span>
            <span>{Array.from(reason).length}/500</span>
          </div>
          {displayedError ? (
            <p id={reasonErrorId} role="alert" className="mt-2 text-sm font-bold text-rose-700">
              {displayedError}
            </p>
          ) : null}
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {busy ? "회원 상태를 처리하고 있습니다." : ""}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cleanupAndCloseDialog()}
            disabled={busy}
            className={`${buttonClass} border-pul-border bg-white text-pul-deep hover:bg-pul-light`}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className={`${buttonClass} ${
              isSuspend
                ? "border-rose-700 bg-rose-700 text-white"
                : "border-pul-point bg-pul-point text-white"
            }`}
          >
            {busy
              ? "처리 중..."
              : isSuspend
                ? "회원 활동 정지"
                : "회원 정지 해제"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClubMemberStatusActions() {
  const management = useClubMemberManagement();
  const statusMutation = useClubMemberStatusMutation();
  const detail = management.detail;
  const member = detail?.member;
  const [confirmation, setConfirmation] = useState<{
    action: ClubMembershipStatusMutationAction;
    returnFocus: HTMLButtonElement | null;
  }>();

  if (
    !member ||
    !statusMutation ||
    !management.canManageMembershipStatus ||
    detail.historyScope !== "limited_history" ||
    statusMutation.statusActionsBlockedUntilRefresh
  ) {
    return null;
  }

  const protectedRole = member.currentRoles.some(
    ({ roleKey }) =>
      roleKey === "club_admin" || roleKey === "club_vice_admin",
  );
  const hasManagerRole = member.currentRoles.some(
    ({ roleKey }) => roleKey === "club_manager",
  );
  const action =
    member.membershipStatus === "active"
      ? "suspend"
      : member.membershipStatus === "suspended"
        ? "resume"
        : undefined;

  return (
    <section
      aria-labelledby="club-member-status-management-heading"
      className="rounded-xl border border-pul-border bg-pul-light/20 p-4"
    >
      <h3
        id="club-member-status-management-heading"
        className="flex items-center gap-2 text-lg font-bold text-foreground"
      >
        {protectedRole ? (
          <ShieldAlert className="h-5 w-5 text-amber-700" aria-hidden="true" />
        ) : (
          <UserRoundCheck className="h-5 w-5 text-pul-point" aria-hidden="true" />
        )}
        회원 상태 관리
      </h3>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-pul-muted">현재 상태</p>
          <div className="mt-1">
            <MembershipStatusBadge status={member.membershipStatus} />
          </div>
        </div>
        {!protectedRole && action ? (
          <button
            type="button"
            disabled={Boolean(statusMutation.statusMutationAction)}
            onClick={(event) =>
              setConfirmation({
                action,
                returnFocus: event.currentTarget,
              })
            }
            className={`${buttonClass} ${
              action === "suspend"
                ? "border-rose-300 bg-white text-rose-800 hover:bg-rose-50"
                : "border-pul-point bg-pul-point text-white hover:bg-pul-deep"
            }`}
          >
            {action === "suspend" ? "회원 활동 정지" : "회원 정지 해제"}
          </button>
        ) : null}
      </div>

      {protectedRole ? (
        <p className="mt-3 text-[15px] leading-6 text-pul-muted">
          본인 또는 회장·부회장 역할을 가진 회원은 역할 절차를 먼저 완료해야 합니다.
        </p>
      ) : member.membershipStatus === "left" ? (
        <p className="mt-3 text-[15px] leading-6 text-pul-muted">
          탈퇴 회원의 재가입 처리는 이후 단계에서 제공됩니다.
        </p>
      ) : (
        <p className="mt-3 text-[15px] leading-6 text-pul-muted">
          상태 변경은 사유 입력과 최종 확인 후 처리됩니다.
        </p>
      )}

      {statusMutation.statusMutationSuccess ? (
        <p
          role="status"
          className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800"
        >
          {statusMutation.statusMutationSuccess}
        </p>
      ) : null}

      {confirmation ? (
        <ClubMemberStatusConfirmationDialog
          action={confirmation.action}
          hasManagerRole={hasManagerRole}
          returnFocus={confirmation.returnFocus}
          onClose={() => setConfirmation(undefined)}
        />
      ) : null}
    </section>
  );
}
