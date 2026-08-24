"use client";

import { submitCertificationStudyPostAction } from "@/app/certification/actions";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import { useAuthSessionStatus } from "@/hooks/useAuthSessionStatus";
import type { CertificationStudyPage } from "@/lib/certification/certificationStudyPosts";
import { MessageSquare, PenLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";

type CertificationStudyBoardSectionProps = {
  page: CertificationStudyPage;
  returnPath: string;
  error?: string | null;
  full?: boolean;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function CertificationStudyWriteDialog({
  returnPath,
  trigger,
  onClose,
  onSuccess,
}: {
  returnPath: string;
  trigger: HTMLButtonElement | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [authenticationRequired, setAuthenticationRequired] = useState(false);
  const [pending, startTransition] = useTransition();
  useBodyScrollLock(true);

  const close = useCallback(() => {
    if (pending) return;
    onClose();
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }, [onClose, pending, trigger]);

  useEffect(() => {
    bodyRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], textarea:not([disabled])',
        ),
      ];
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
  }, [close]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setAuthenticationRequired(false);
    startTransition(async () => {
      const result = await submitCertificationStudyPostAction({ body });
      if (!result.ok) {
        setError(result.error);
        setAuthenticationRequired(result.authenticationRequired);
        return;
      }
      onSuccess();
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div ref={panelRef} className="w-full max-w-xl rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-pul-border px-4 py-3 sm:px-5">
          <div>
            <h2 id={titleId} className="text-xl font-bold text-foreground">시험 준비 이야기 쓰기</h2>
            <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-pul-muted">
              자격증·심판 시험을 준비하며 얻은 정보와 궁금한 점을 회원들과 나눠보세요.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={pending}
            aria-label="닫기"
            className="min-h-11 min-w-11 rounded-full bg-pul-page text-2xl font-bold text-pul-muted disabled:opacity-50"
          >
            ×
          </button>
        </header>
        <form onSubmit={submit} className="px-4 py-4 sm:px-5">
          <label htmlFor={`${titleId}-body`} className="text-sm font-bold">시험 준비 이야기</label>
          <textarea
            ref={bodyRef}
            id={`${titleId}-body`}
            required
            minLength={10}
            maxLength={1000}
            rows={7}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="시험 준비 경험이나 궁금한 점을 10자 이상 적어 주세요."
            className="mt-1 w-full rounded-lg border border-pul-border bg-white px-3 py-3 text-base leading-relaxed outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
          />
          <p className="mt-2 text-right text-xs text-pul-muted">{Array.from(body).length}/1000</p>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
            전화번호·주민번호 등 불필요한 개인정보는 작성하지 마세요.
          </p>
          {error ? (
            <div className="mt-3">
              <p
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800 outline-none"
              >
                {error}
              </p>
              {authenticationRequired ? (
                <Link
                  href={`/login?next=${encodeURIComponent(returnPath)}`}
                  className="mt-2 inline-flex min-h-11 items-center font-bold text-pul-deep underline"
                >
                  로그인하기
                </Link>
              ) : null}
            </div>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-pul-border pt-4">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="min-h-11 rounded-lg border border-pul-border font-bold disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-lg bg-pul-point font-bold text-white disabled:opacity-50"
            >
              {pending ? "등록 중…" : "이야기 등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CertificationStudyBoardSection({
  page,
  returnPath,
  error = null,
  full = false,
}: CertificationStudyBoardSectionProps) {
  const router = useRouter();
  const authStatus = useAuthSessionStatus();
  const successRef = useRef<HTMLParagraphElement>(null);
  const [writeTrigger, setWriteTrigger] = useState<HTMLButtonElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!success) return;
    const frame = window.requestAnimationFrame(() => {
      successRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [success]);

  const openWrite = (trigger: HTMLButtonElement) => {
    setSuccess("");
    if (authStatus === "signedOut") {
      router.push(`/login?next=${encodeURIComponent(returnPath)}`);
      return;
    }
    if (authStatus !== "signedIn") return;
    setWriteTrigger(trigger);
    setDialogOpen(true);
  };

  const submitted = () => {
    setDialogOpen(false);
    setSuccess("시험 준비 이야기가 등록되었습니다.");
  };

  return (
    <section
      id="exam-prep-talk"
      className="scroll-mt-20 rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:p-4"
      aria-labelledby="certification-study-board-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2
            id="certification-study-board-title"
            className="flex items-center gap-2 text-base font-bold text-foreground lg:text-lg"
          >
            <MessageSquare className="h-5 w-5 text-pul-point" aria-hidden="true" />
            시험 준비 이야기방
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
            필기·실기·구술 준비 경험과 궁금한 점을 짧게 공유하는 회원 게시판입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={(event) => openWrite(event.currentTarget)}
          disabled={authStatus === "loading"}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pul-point px-4 text-sm font-bold text-white hover:bg-pul-deep disabled:opacity-50"
        >
          <PenLine className="h-4 w-4" aria-hidden="true" />
          글쓰기
        </button>
      </div>

      {success ? (
        <p
          ref={successRef}
          tabIndex={-1}
          role="status"
          className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900 outline-none"
        >
          {success}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </p>
      ) : page.items.length > 0 ? (
        <ul className="mt-4 divide-y divide-pul-border border-y border-pul-border">
          {page.items.map((post) => (
            <li key={post.postKey} className="py-3.5">
              <p className={full
                ? "whitespace-pre-wrap break-words text-base leading-7 text-foreground"
                : "line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground"}
              >
                {post.body}
              </p>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-pul-muted">
                <span>{post.authorDisplayName}</span>
                <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg bg-pul-page px-4 py-6 text-center text-sm text-pul-muted">
          {full
            ? "아직 등록된 글이 없습니다. 첫 번째 시험 준비 이야기를 남겨보세요."
            : "아직 등록된 시험 준비 이야기가 없습니다."}
        </p>
      )}

      {!full ? (
        <Link
          href="/certification/study"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light"
        >
          전체 보기 {page.total > 0 ? `(${page.total})` : ""}
        </Link>
      ) : null}

      {dialogOpen ? (
        <CertificationStudyWriteDialog
          returnPath={returnPath}
          trigger={writeTrigger}
          onClose={() => setDialogOpen(false)}
          onSuccess={submitted}
        />
      ) : null}
    </section>
  );
}
