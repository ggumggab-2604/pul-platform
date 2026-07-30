"use client";

import { UserCog } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  useClubMemberRoleMutation,
} from "@/components/clubs/manage/ClubMemberManagementProvider";
import type { ClubMemberRoleMutationFeedback } from "@/lib/clubs/clubMemberMutationOperationState";
import type { ClubMemberDetailRole } from "@/lib/clubs/clubMemberDetailManagement";
import type { ClubMembershipStatus } from "@/lib/clubs/clubMemberManagement";
import {
  CLUB_MEMBER_ROLE_REASON_MAX_LENGTH,
  CLUB_MEMBER_ROLE_REASON_MIN_LENGTH,
  normalizeClubMemberRoleReason,
  toClubMemberRoleMutationError,
  type ClubMemberRoleMutationAction,
} from "@/lib/clubs/clubMemberRoleManagement";

type ClubMemberRoleActionsProps = {
  membershipId: string;
  membershipStatus: ClubMembershipStatus;
  currentRoles: ClubMemberDetailRole[];
};

type RoleActionKind = ClubMemberRoleMutationAction;

const knownRoleKeys = new Set([
  "club_member",
  "club_manager",
  "club_admin",
  "club_vice_admin",
]);

const triggerButtonClass =
  "min-h-12 rounded-lg border px-4 text-[15px] font-bold outline-none transition hover:bg-pul-light focus-visible:ring-2 focus-visible:ring-pul-point focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55";
const dialogButtonClass =
  "min-h-12 rounded-lg border px-4 text-[15px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-pul-point focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";

function getCodePointLength(value: string): number {
  return Array.from(value).length;
}

function isUsableFocusTarget(target: HTMLElement | null): target is HTMLElement {
  return Boolean(
    target?.isConnected &&
      !target.hasAttribute("disabled") &&
      target.getClientRects().length > 0,
  );
}

function focusWithoutScroll(target: HTMLElement | null): boolean {
  if (!isUsableFocusTarget(target)) return false;
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}

function getRoleFlags(currentRoles: ClubMemberDetailRole[]) {
  const roleKeys = currentRoles.map(({ roleKey }) => roleKey);
  return {
    hasUnknownRole: roleKeys.some((roleKey) => !knownRoleKeys.has(roleKey)),
    hasMemberRole: roleKeys.includes("club_member"),
    hasManagerRole: roleKeys.includes("club_manager"),
    hasAdminRole: roleKeys.includes("club_admin"),
    hasViceAdminRole: roleKeys.includes("club_vice_admin"),
  };
}

function getRoleAction(input: {
  canManageClubRoles: boolean;
  currentRoles: ClubMemberDetailRole[];
  isSelfTarget: boolean;
  membershipStatus: ClubMembershipStatus;
}): RoleActionKind | null {
  if (!input.canManageClubRoles || input.isSelfTarget) return null;
  if (input.membershipStatus !== "active") return null;

  const {
    hasAdminRole,
    hasManagerRole,
    hasMemberRole,
    hasUnknownRole,
    hasViceAdminRole,
  } = getRoleFlags(input.currentRoles);

  if (hasUnknownRole || hasAdminRole || hasViceAdminRole) return null;
  if (hasManagerRole) return "revoke";
  if (hasMemberRole) return "grant";
  return null;
}

function getResultMessage(
  action: RoleActionKind,
  result?: ClubMemberRoleMutationFeedback,
): string | undefined {
  if (!result) return undefined;
  if (result.replayed) {
    return "이미 처리된 동일한 요청 결과를 확인했습니다.";
  }
  if (result.outcome === "noop") {
    return "이미 요청한 역할 상태입니다. 최신 정보를 다시 불러왔습니다.";
  }
  return action === "grant"
    ? "운영진 역할을 부여했습니다."
    : "운영진 역할을 회수했습니다. 회원 자격은 유지됩니다.";
}

function ClubMemberRoleConfirmationDialog({
  action,
  membershipId,
  onClose,
  restoreFocus,
}: {
  action: RoleActionKind;
  membershipId: string;
  onClose: () => void;
  restoreFocus: (closedMembershipId: string) => void;
}) {
  const roleMutation = useClubMemberRoleMutation();
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const openFocusFrameRef = useRef<number | undefined>(undefined);
  const openFocusGenerationRef = useRef(0);
  const dialogOpenRef = useRef(true);
  const mountedRef = useRef(false);
  const currentMembershipRef = useRef(membershipId);
  const roleState = roleMutation?.getRoleMutationState(membershipId);
  const busy =
    roleMutation?.isRoleMutationPending(membershipId) === true ||
    roleState?.refreshRetrying === true ||
    submitting;
  const isGrant = action === "grant";
  const dialogId = `club-member-role-dialog-${membershipId}`;
  const titleId = `club-member-role-dialog-title-${membershipId}`;
  const descriptionId = `club-member-role-dialog-description-${membershipId}`;
  const reasonId = `club-member-role-reason-${membershipId}`;
  const helpId = `club-member-role-reason-help-${membershipId}`;
  const countId = `club-member-role-reason-count-${membershipId}`;
  const errorId = `club-member-role-reason-error-${membershipId}`;
  const displayedError = validationError ?? roleState?.safeError;
  const normalizedReasonLength = getCodePointLength(reason.trim());
  const description = isGrant
    ? "이 회원에게 동호회 운영진 역할을 부여합니다. 회장·부회장 역할은 변경되지 않습니다."
    : "운영진 역할만 회수합니다. 동호회 회원 자격과 일반회원 역할은 유지됩니다.";
  const confirmLabel = isGrant ? "운영진으로 임명" : "운영진 역할 회수";


  const cancelOpenFocus = useCallback(() => {
    dialogOpenRef.current = false;
    openFocusGenerationRef.current += 1;
    if (openFocusFrameRef.current !== undefined) {
      window.cancelAnimationFrame(openFocusFrameRef.current);
      openFocusFrameRef.current = undefined;
    }
  }, []);

  const closeDialog = useCallback(() => {
    if (busy) return;
    cancelOpenFocus();
    setReason("");
    setValidationError(undefined);
    onClose();
    restoreFocus(membershipId);
  }, [busy, cancelOpenFocus, membershipId, onClose, restoreFocus]);

  const focusInitialDialogTarget = useCallback(
    (focusGeneration: number): boolean => {
      if (
        !mountedRef.current ||
        !dialogOpenRef.current ||
        openFocusGenerationRef.current !== focusGeneration ||
        currentMembershipRef.current !== membershipId
      ) {
        return true;
      }

      const dialog = dialogRef.current;
      if (!isUsableFocusTarget(dialog)) return false;

      const activeElement = document.activeElement;
      if (
        activeElement instanceof Node &&
        dialog.contains(activeElement) &&
        activeElement !== dialog
      ) {
        return true;
      }

      const input = reasonRef.current;
      if (input && focusWithoutScroll(input)) {
        input.setSelectionRange(input.value.length, input.value.length);
        return true;
      }

      return focusWithoutScroll(dialog);
    },
    [membershipId],
  );

  useLayoutEffect(() => {
    mountedRef.current = true;
    dialogOpenRef.current = true;
    currentMembershipRef.current = membershipId;
    const focusGeneration = openFocusGenerationRef.current + 1;
    openFocusGenerationRef.current = focusGeneration;

    if (!focusInitialDialogTarget(focusGeneration)) {
      openFocusFrameRef.current = window.requestAnimationFrame(() => {
        openFocusFrameRef.current = undefined;
        if (!focusInitialDialogTarget(focusGeneration)) {
          openFocusFrameRef.current = window.requestAnimationFrame(() => {
            openFocusFrameRef.current = undefined;
            focusInitialDialogTarget(focusGeneration);
          });
        }
      });
    }

    return () => {
      mountedRef.current = false;
      cancelOpenFocus();
    };
  }, [cancelOpenFocus, focusInitialDialogTarget, membershipId]);

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
        if (!busy) closeDialog();
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
  }, [busy, closeDialog]);


  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roleMutation || busy) return;

    let normalizedReason: string;
    try {
      normalizedReason = normalizeClubMemberRoleReason(reason);
      setValidationError(undefined);
    } catch (error) {
      setValidationError(toClubMemberRoleMutationError(error).userMessage);
      return;
    }

    setSubmitting(true);
    let closedAfterSuccess = false;
    try {
      const result = isGrant
        ? await roleMutation.grantManagerRole(membershipId, normalizedReason)
        : await roleMutation.revokeManagerRole(membershipId, normalizedReason);

      if (
        result.status === "mutation_succeeded_and_synced" ||
        result.status === "mutation_succeeded_but_refresh_failed"
      ) {
        closedAfterSuccess = true;
        cancelOpenFocus();
        setReason("");
        setValidationError(undefined);
        onClose();
        restoreFocus(membershipId);
      } else if (result.status === "stale_or_cancelled") {
        setValidationError("최신 회원 정보를 다시 확인한 뒤 시도해 주세요.");
      }
    } finally {
      if (!closedAfterSuccess) {
        setSubmitting(false);
      }
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) closeDialog();
      }}
    >
      <div
        id={dialogId}
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
          {confirmLabel}
        </h3>
        <p id={descriptionId} className="mt-3 text-[15px] leading-7 text-pul-muted">
          {description}
        </p>
        <p className="mt-2 rounded-lg bg-pul-light/60 px-3 py-2 text-sm font-semibold leading-6 text-pul-deep">
          {isGrant
            ? "회원 자격은 유지되며, 사유는 운영 감사 이력에 저장될 수 있습니다."
            : "게시글·모임 데이터는 삭제하지 않고 운영 권한만 회수합니다."}
        </p>
        <p className="mt-2 text-sm font-semibold leading-6 text-pul-muted">
          개인정보나 민감정보를 입력하지 마세요.
        </p>

        <form onSubmit={(event) => void submit(event)} className="mt-5">
          <label htmlFor={reasonId} className="font-bold text-foreground">
            사유
          </label>
          <textarea
            ref={reasonRef}
            id={reasonId}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setValidationError(undefined);
              if (roleState?.safeError) {
                roleMutation?.clearRoleMutationFeedback(membershipId);
              }
            }}
            disabled={busy}
            rows={4}
            maxLength={CLUB_MEMBER_ROLE_REASON_MAX_LENGTH}
            placeholder="역할 변경 사유를 입력해 주세요."
            aria-invalid={Boolean(displayedError)}
            aria-describedby={`${helpId} ${countId}${displayedError ? ` ${errorId}` : ""}`}
            className="mt-2 w-full resize-y rounded-lg border border-pul-border bg-white p-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/25 disabled:bg-gray-50"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm text-pul-muted">
            <span id={helpId}>
              {CLUB_MEMBER_ROLE_REASON_MIN_LENGTH}자 이상 {CLUB_MEMBER_ROLE_REASON_MAX_LENGTH}자 이하로 입력해 주세요.
            </span>
            <span id={countId}>
              {normalizedReasonLength}/{CLUB_MEMBER_ROLE_REASON_MAX_LENGTH}
            </span>
          </div>
          {displayedError ? (
            <p id={errorId} role="alert" className="mt-2 text-sm font-bold text-rose-700">
              {displayedError}
            </p>
          ) : null}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {busy ? "운영진 역할 변경을 처리하고 있습니다." : ""}
          </p>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={closeDialog}
              disabled={busy}
              className={`${dialogButtonClass} border-pul-border bg-white text-pul-deep hover:bg-pul-light`}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy}
              className={`${dialogButtonClass} ${
                isGrant
                  ? "border-pul-point bg-pul-point text-white hover:bg-pul-deep"
                  : "border-rose-700 bg-rose-700 text-white hover:bg-rose-800"
              }`}
            >
              {busy ? "처리 중..." : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ClubMemberRoleActions({
  currentRoles,
  membershipId,
  membershipStatus,
}: ClubMemberRoleActionsProps) {
  const roleMutation = useClubMemberRoleMutation();
  const [dialogAction, setDialogAction] = useState<RoleActionKind | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusFrameRef = useRef<number | undefined>(undefined);
  const restoreGenerationRef = useRef(0);
  const pendingRestoreRef = useRef<{
    generation: number;
    membershipId: string;
  } | null>(null);
  const dialogOpenRef = useRef(false);
  const dialogMembershipRef = useRef<string | null>(null);
  const currentMembershipRef = useRef(membershipId);
  const mountedRef = useRef(true);
  const state = roleMutation?.getRoleMutationState(membershipId);
  const isSelfTarget = roleMutation?.isSelfTarget(membershipId) === true;
  const action = getRoleAction({
    canManageClubRoles: roleMutation?.canManageClubRoles === true,
    currentRoles,
    isSelfTarget,
    membershipStatus,
  });
  const flags = useMemo(() => getRoleFlags(currentRoles), [currentRoles]);
  const rolePending = roleMutation?.isRoleMutationPending(membershipId) === true;
  const membershipBusy =
    roleMutation?.isMembershipMutationPending(membershipId) === true ||
    rolePending ||
    state?.hasRefreshRecovery === true ||
    state?.refreshRetrying === true;
  const resultMessage = state?.refreshWarning
    ? undefined
    : getResultMessage(state?.result?.action ?? action ?? "grant", state?.result);
  const resultTone = state?.safeError
    ? "error"
    : state?.refreshWarning
      ? "warning"
      : resultMessage
        ? "success"
        : undefined;
  const dialogId = `club-member-role-dialog-${membershipId}`;

  const cancelRestoreFocus = useCallback(() => {
    if (restoreFocusFrameRef.current !== undefined) {
      window.cancelAnimationFrame(restoreFocusFrameRef.current);
      restoreFocusFrameRef.current = undefined;
    }
  }, []);

  const focusLatestRestoreTarget = useCallback(
    (restoreMembershipId: string, restoreGeneration: number): boolean => {
      if (
        !mountedRef.current ||
        dialogOpenRef.current ||
        restoreGenerationRef.current !== restoreGeneration ||
        currentMembershipRef.current !== restoreMembershipId ||
        dialogMembershipRef.current !== restoreMembershipId
      ) {
        return false;
      }

      const latestTrigger = triggerRef.current;
      if (
        latestTrigger &&
        !latestTrigger.disabled &&
        focusWithoutScroll(latestTrigger)
      ) {
        return true;
      }

      return focusWithoutScroll(sectionRef.current);
    },
    [],
  );

  const restoreFocus = useCallback((closedMembershipId: string) => {
    dialogOpenRef.current = false;
    cancelRestoreFocus();
    const restoreGeneration = restoreGenerationRef.current + 1;
    restoreGenerationRef.current = restoreGeneration;
    pendingRestoreRef.current = {
      generation: restoreGeneration,
      membershipId: closedMembershipId,
    };
  }, [cancelRestoreFocus]);

  useLayoutEffect(() => {
    if (dialogAction !== null) return;

    const pendingRestore = pendingRestoreRef.current;
    if (!pendingRestore) return;

    const { generation, membershipId: restoreMembershipId } = pendingRestore;
    if (
      !mountedRef.current ||
      dialogOpenRef.current ||
      restoreGenerationRef.current !== generation ||
      currentMembershipRef.current !== restoreMembershipId ||
      dialogMembershipRef.current !== restoreMembershipId
    ) {
      pendingRestoreRef.current = null;
      return;
    }

    if (focusLatestRestoreTarget(restoreMembershipId, generation)) {
      pendingRestoreRef.current = null;
      dialogMembershipRef.current = null;
      return;
    }

    cancelRestoreFocus();
    restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
      restoreFocusFrameRef.current = undefined;
      if (
        !mountedRef.current ||
        dialogOpenRef.current ||
        restoreGenerationRef.current !== generation ||
        currentMembershipRef.current !== restoreMembershipId ||
        dialogMembershipRef.current !== restoreMembershipId
      ) {
        return;
      }

      if (focusLatestRestoreTarget(restoreMembershipId, generation)) {
        pendingRestoreRef.current = null;
        dialogMembershipRef.current = null;
      }
    });
  }, [
    cancelRestoreFocus,
    dialogAction,
    focusLatestRestoreTarget,
    membershipId,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      dialogOpenRef.current = false;
      dialogMembershipRef.current = null;
      pendingRestoreRef.current = null;
      restoreGenerationRef.current += 1;
      cancelRestoreFocus();
    };
  }, [cancelRestoreFocus]);

  useEffect(() => {
    if (currentMembershipRef.current === membershipId) return;
    currentMembershipRef.current = membershipId;
    dialogOpenRef.current = false;
    dialogMembershipRef.current = null;
    pendingRestoreRef.current = null;
    restoreGenerationRef.current += 1;
    cancelRestoreFocus();
    setDialogAction(null);
  }, [cancelRestoreFocus, membershipId]);

  if (!roleMutation?.canManageClubRoles) return null;

  const neutralMessage = isSelfTarget
    ? "본인의 운영진 역할은 이 화면에서 변경할 수 없습니다."
    : membershipStatus !== "active"
      ? "활동 중인 회원에게만 운영진 역할을 부여하거나 회수할 수 있습니다."
      : flags.hasAdminRole || flags.hasViceAdminRole
        ? "회장·부회장 역할 관리는 별도 역할 관리 단계에서 처리합니다."
        : flags.hasUnknownRole || !flags.hasMemberRole
          ? "현재 역할 정보를 확인한 뒤 운영진 역할을 변경할 수 있습니다."
          : undefined;

  const openDialog = (
    nextAction: RoleActionKind,
    trigger: HTMLButtonElement,
  ) => {
    if (membershipBusy) return;
    cancelRestoreFocus();
    pendingRestoreRef.current = null;
    restoreGenerationRef.current += 1;
    dialogOpenRef.current = true;
    dialogMembershipRef.current = membershipId;
    triggerRef.current = trigger;
    roleMutation.clearRoleMutationFeedback(membershipId);
    setDialogAction(nextAction);
  };

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="club-member-role-management-heading"
      className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.04)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3
            id="club-member-role-management-heading"
            className="flex items-center gap-2 text-lg font-bold text-foreground"
          >
            <UserCog className="h-5 w-5 text-pul-point" aria-hidden="true" />
            운영진 역할 관리
          </h3>
          <p className="mt-2 text-[15px] leading-6 text-pul-muted">
            일반 운영진 역할만 부여하거나 회수합니다.
          </p>
        </div>
        {action ? (
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={dialogAction === action}
            aria-controls={dialogAction === action ? dialogId : undefined}
            disabled={membershipBusy}
            onClick={(event) => openDialog(action, event.currentTarget)}
            className={`${triggerButtonClass} ${
              action === "grant"
                ? "border-pul-point bg-pul-point text-white hover:bg-pul-deep"
                : "border-rose-300 bg-white text-rose-800 hover:bg-rose-50"
            }`}
          >
            {action === "grant" ? "운영진으로 임명" : "운영진 역할 회수"}
          </button>
        ) : null}
      </div>

      {neutralMessage ? (
        <p className="mt-3 rounded-lg bg-pul-light/50 px-3 py-2 text-sm font-semibold leading-6 text-pul-muted">
          {neutralMessage}
        </p>
      ) : null}

      {membershipBusy ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-900">
          이 회원의 관리 작업 또는 최신 정보 갱신이 진행 중입니다.
        </p>
      ) : null}

      {state?.refreshWarning ? (
        <div
          role="status"
          className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-950"
        >
          <p>
            역할 변경은 처리되었지만 최신 회원 정보를 불러오지 못했습니다.
          </p>
          <button
            type="button"
            onClick={() => void roleMutation.retryRoleMutationRefresh(membershipId)}
            disabled={state.refreshRetrying}
            className="mt-2 min-h-10 rounded-lg border border-amber-400 bg-white px-3 font-bold text-amber-950 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
          >
            {state.refreshRetrying ? "최신 정보 불러오는 중..." : "최신 정보 다시 불러오기"}
          </button>
        </div>
      ) : state?.safeError ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold leading-6 text-rose-800"
        >
          <p>{state.safeError}</p>
        </div>
      ) : resultMessage ? (
        <div
          role="status"
          className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold leading-6 text-emerald-800"
        >
          <p>{resultMessage}</p>
        </div>
      ) : null}

      {resultTone ? (
        <button
          type="button"
          onClick={() => roleMutation.clearRoleMutationFeedback(membershipId)}
          disabled={rolePending}
          className="mt-2 min-h-10 rounded-lg border border-pul-border bg-white px-3 text-sm font-bold text-pul-deep hover:bg-pul-light disabled:cursor-not-allowed disabled:opacity-60"
        >
          안내 닫기
        </button>
      ) : null}

      {dialogAction ? (
        <ClubMemberRoleConfirmationDialog
          action={dialogAction}
          membershipId={membershipId}
          restoreFocus={restoreFocus}
          onClose={() => setDialogAction(null)}
        />
      ) : null}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {rolePending ? "운영진 역할 변경을 처리하고 있습니다." : ""}
      </p>
    </section>
  );
}
