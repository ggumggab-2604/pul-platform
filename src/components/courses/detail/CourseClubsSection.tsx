"use client";

import { useBodyScrollLock } from "@/components/ui/InfoModal";
import type { PublicClub } from "@/lib/clubs/clubDirectory";
import {
  CourseClubError,
  linkClubToCourse,
  listManageableCourseLinkClubs,
  type ManageableCourseClub,
  unlinkClubFromCourse,
} from "@/lib/courses/courseClubs";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

type CourseClubsSectionProps = {
  courseKey: string;
  initialClubs: PublicClub[];
};

type DialogState =
  | { action: "link" }
  | { action: "unlink"; club: PublicClub };

type CourseClubDialogProps = {
  action: DialogState;
  availableClubs: ManageableCourseClub[];
  busy: boolean;
  error: string;
  selectedPublicKey: string;
  trigger: HTMLElement | null;
  onSelectedPublicKeyChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const recruitmentLabels = {
  recruiting: "회원 모집 중",
  waiting: "대기 접수",
  closed: "모집 마감",
} as const;

function CourseClubDialog({
  action,
  availableClubs,
  busy,
  error,
  selectedPublicKey,
  trigger,
  onSelectedPublicKeyChange,
  onClose,
  onSubmit,
}: CourseClubDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLSelectElement | HTMLButtonElement>(null);
  useBodyScrollLock(true);

  const close = useCallback(() => {
    if (busy) return;
    onClose();
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }, [busy, onClose, trigger]);

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel?.isConnected) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [close]);

  const isLink = action.action === "link";
  const canSubmit = isLink ? selectedPublicKey.length > 0 : true;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
        aria-busy={busy}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl outline-none"
      >
        <h3 id={titleId} className="text-xl font-bold text-foreground">
          {isLink ? "내 동호회 연결" : "활동 동호회 연결 해제"}
        </h3>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-pul-muted">
          {isLink
            ? "운영 권한이 있는 동호회를 이 골프장의 주요 활동 동호회로 표시합니다. 공식 제휴나 골프장 승인을 뜻하지 않습니다."
            : `${action.club.name}을(를) 이 골프장의 활동 동호회 목록에서 제거합니다.`}
        </p>

        {isLink ? (
          <label className="mt-5 block font-bold text-foreground">
            연결할 동호회
            <select
              ref={firstRef as React.RefObject<HTMLSelectElement>}
              value={selectedPublicKey}
              onChange={(event) => onSelectedPublicKeyChange(event.target.value)}
              disabled={busy}
              className="mt-2 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20 disabled:bg-gray-50"
            >
              <option value="">동호회를 선택해 주세요</option>
              {availableClubs.map((club) => (
                <option key={club.publicKey} value={club.publicKey}>
                  {club.name} · {club.regionLabel}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? (
          <p id={errorId} role="alert" className="mt-3 text-sm font-bold text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            ref={isLink ? undefined : (firstRef as React.RefObject<HTMLButtonElement>)}
            type="button"
            onClick={close}
            disabled={busy}
            className="min-h-11 rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light disabled:cursor-wait disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || !canSubmit}
            className={`min-h-11 rounded-lg px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${
              isLink ? "bg-pul-point hover:bg-pul-deep" : "bg-rose-700 hover:bg-rose-800"
            }`}
          >
            {busy ? "처리 중..." : isLink ? "연결하기" : "연결 해제"}
          </button>
        </div>
      </div>
    </div>
  );
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof CourseClubError) return error.userMessage;
  return "활동 동호회 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function CourseClubsSection({
  courseKey,
  initialClubs,
}: CourseClubsSectionProps) {
  const supabase = useMemo(() => createClient(), []);
  const sectionRef = useRef<HTMLElement>(null);
  const actorRef = useRef<string | null | undefined>(undefined);
  const generationRef = useRef(0);
  const [clubs, setClubs] = useState(initialClubs);
  const [authStatus, setAuthStatus] = useState<"loading" | "signedOut" | "signedIn">(
    "loading",
  );
  const [manageableClubs, setManageableClubs] = useState<ManageableCourseClub[]>([]);
  const [managementLoading, setManagementLoading] = useState(false);
  const [managementError, setManagementError] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogTrigger, setDialogTrigger] = useState<HTMLElement | null>(null);
  const [selectedPublicKey, setSelectedPublicKey] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");

  const loadManageable = useCallback(
    async (actorId: string, generation: number) => {
      setManagementLoading(true);
      setManagementError("");
      try {
        const next = await listManageableCourseLinkClubs(supabase, courseKey);
        if (
          generationRef.current !== generation ||
          actorRef.current !== actorId
        ) {
          return;
        }
        setManageableClubs(next);
      } catch (error) {
        if (
          generationRef.current !== generation ||
          actorRef.current !== actorId
        ) {
          return;
        }
        setManageableClubs([]);
        setManagementError(safeErrorMessage(error));
      } finally {
        if (
          generationRef.current === generation &&
          actorRef.current === actorId
        ) {
          setManagementLoading(false);
        }
      }
    },
    [courseKey, supabase],
  );

  useEffect(() => {
    let active = true;

    const applySession = (actorId: string | null) => {
      if (!active) return;
      if (actorRef.current === actorId) {
        setAuthStatus(actorId ? "signedIn" : "signedOut");
        return;
      }
      actorRef.current = actorId;
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setAuthStatus(actorId ? "signedIn" : "signedOut");
      setManageableClubs([]);
      setManagementError("");
      setManagementLoading(false);
      setDialog(null);
      setDialogTrigger(null);
      setSelectedPublicKey("");
      setDialogError("");
      setBusy(false);
      setSuccess("");
      if (actorId) void loadManageable(actorId, generation);
    };

    void supabase.auth.getSession().then(({ data }) => {
      applySession(data.session?.user.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user.id ?? null);
    });
    const handleServerSignOut = () => applySession(null);
    window.addEventListener("pul-auth-signed-out", handleServerSignOut);

    return () => {
      active = false;
      generationRef.current += 1;
      subscription.unsubscribe();
      window.removeEventListener("pul-auth-signed-out", handleServerSignOut);
    };
  }, [loadManageable, supabase]);

  const availableClubs = manageableClubs.filter((club) => !club.linked);
  const manageableKeys = new Set(
    manageableClubs.filter((club) => club.linked).map((club) => club.publicKey),
  );
  const canManage = manageableClubs.length > 0;

  const closeDialog = () => {
    if (busy) return;
    setDialog(null);
    setDialogError("");
    setSelectedPublicKey("");
    setDialogTrigger(null);
  };

  const openLinkDialog = (trigger: HTMLButtonElement) => {
    if (busy || availableClubs.length === 0) return;
    setDialogTrigger(trigger);
    setSelectedPublicKey(availableClubs[0]?.publicKey ?? "");
    setDialogError("");
    setSuccess("");
    setDialog({ action: "link" });
  };

  const openUnlinkDialog = (club: PublicClub, trigger: HTMLButtonElement) => {
    if (busy) return;
    setDialogTrigger(trigger);
    setDialogError("");
    setSuccess("");
    setDialog({ action: "unlink", club });
  };

  const submitMutation = async () => {
    if (!dialog || busy) return;
    const actorId = actorRef.current;
    if (!actorId) {
      setDialogError("로그인 후 다시 시도해 주세요.");
      return;
    }
    const generation = generationRef.current;
    const action = dialog.action;
    const publicKey =
      action === "link" ? selectedPublicKey : dialog.club.publicKey;
    const sourceClub =
      action === "link"
        ? manageableClubs.find((club) => club.publicKey === publicKey)
        : dialog.club;
    if (!sourceClub) {
      setDialogError("연결할 동호회를 다시 선택해 주세요.");
      return;
    }

    setBusy(true);
    setDialogError("");
    try {
      if (action === "link") {
        await linkClubToCourse(supabase, courseKey, publicKey);
      } else {
        await unlinkClubFromCourse(supabase, courseKey, publicKey);
      }
      if (
        generationRef.current !== generation ||
        actorRef.current !== actorId
      ) {
        return;
      }
      setClubs((current) => {
        if (action === "unlink") {
          return current.filter((club) => club.publicKey !== publicKey);
        }
        return current.some((club) => club.publicKey === publicKey)
          ? current
          : [...current, sourceClub].sort((left, right) =>
              left.name.localeCompare(right.name, "ko"),
            );
      });
      setManageableClubs((current) =>
        current.map((club) =>
          club.publicKey === publicKey
            ? { ...club, linked: action === "link" }
            : club,
        ),
      );
      setSuccess(
        action === "link"
          ? "활동 동호회를 연결했습니다."
          : "활동 동호회 연결을 해제했습니다.",
      );
      setDialog(null);
      setDialogTrigger(null);
      setSelectedPublicKey("");
      window.requestAnimationFrame(() => {
        sectionRef.current?.focus({ preventScroll: true });
      });
    } catch (error) {
      if (
        generationRef.current === generation &&
        actorRef.current === actorId
      ) {
        setDialogError(safeErrorMessage(error));
      }
    } finally {
      if (
        generationRef.current === generation &&
        actorRef.current === actorId
      ) {
        setBusy(false);
      }
    }
  };

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="course-active-clubs-heading"
      className="rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)] outline-none"
    >
      <div className="flex flex-col gap-3 border-b border-pul-border/80 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="course-active-clubs-heading" className="text-lg font-bold text-foreground lg:text-xl">
            이 골프장에서 활동하는 동호회
          </h2>
          <p className="mt-1 text-sm leading-6 text-pul-muted">
            각 동호회가 직접 등록한 주요 활동 골프장 정보이며, 공식 제휴나 골프장 승인을 뜻하지 않습니다.
          </p>
        </div>
        {authStatus === "signedIn" && canManage && availableClubs.length > 0 ? (
          <button
            type="button"
            onClick={(event) => openLinkDialog(event.currentTarget)}
            disabled={busy || managementLoading}
            aria-haspopup="dialog"
            aria-expanded={dialog?.action === "link"}
            className="min-h-11 shrink-0 rounded-lg bg-pul-point px-4 font-bold text-white hover:bg-pul-deep disabled:cursor-wait disabled:opacity-60"
          >
            내 동호회 연결
          </button>
        ) : null}
      </div>

      <div className="p-5">
        {clubs.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {clubs.map((club) => (
              <li key={club.publicKey} className="rounded-xl border border-pul-border bg-pul-page/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/clubs/${club.publicKey}`}
                      className="break-words text-base font-bold text-pul-deep hover:text-pul-point hover:underline"
                    >
                      {club.name}
                    </Link>
                    <p className="mt-1 text-sm text-pul-muted">{club.regionLabel}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-pul-deep ring-1 ring-pul-border">
                    {recruitmentLabels[club.recruitmentStatus]}
                  </span>
                </div>
                {club.summary ? (
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-foreground">
                    {club.summary}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/clubs/${club.publicKey}`}
                    className="inline-flex min-h-10 items-center rounded-lg border border-pul-border bg-white px-3 text-sm font-bold text-pul-deep hover:bg-pul-light"
                  >
                    동호회 보기
                  </Link>
                  {manageableKeys.has(club.publicKey) ? (
                    <button
                      type="button"
                      onClick={(event) => openUnlinkDialog(club, event.currentTarget)}
                      disabled={busy}
                      aria-haspopup="dialog"
                      aria-expanded={
                        dialog?.action === "unlink" &&
                        dialog.club.publicKey === club.publicKey
                      }
                      className="min-h-10 rounded-lg border border-rose-200 bg-white px-3 text-sm font-bold text-rose-800 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      연결 해제
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-pul-page px-4 py-5 text-center text-sm leading-6 text-pul-muted">
            아직 이 골프장을 주요 활동 골프장으로 등록한 동호회가 없습니다.
          </p>
        )}

        {managementLoading ? (
          <p className="mt-3 text-sm font-semibold text-pul-muted" role="status">
            관리 가능한 동호회를 확인하고 있습니다.
          </p>
        ) : null}
        {managementError ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900" role="status">
            <p>{managementError}</p>
            <button
              type="button"
              onClick={() => {
                const actorId = actorRef.current;
                if (actorId) void loadManageable(actorId, generationRef.current);
              }}
              className="mt-2 min-h-10 rounded-lg border border-amber-300 bg-white px-3"
            >
              권한 다시 확인
            </button>
          </div>
        ) : null}
        {success ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800" role="status">
            {success}
          </p>
        ) : null}
      </div>

      {dialog ? (
        <CourseClubDialog
          action={dialog}
          availableClubs={availableClubs}
          busy={busy}
          error={dialogError}
          selectedPublicKey={selectedPublicKey}
          trigger={dialogTrigger}
          onSelectedPublicKeyChange={(value) => {
            setSelectedPublicKey(value);
            setDialogError("");
          }}
          onClose={closeDialog}
          onSubmit={() => void submitMutation()}
        />
      ) : null}
    </section>
  );
}
