"use client";

import { useEffect, useId, useRef } from "react";

type CertificationDirectoryModalProps = {
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string | null;
  onClose: () => void;
};

export function CertificationDirectoryModal({
  title,
  message,
  actionLabel,
  actionUrl,
  onClose,
}: CertificationDirectoryModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <article
        ref={dialogRef}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-pul-border bg-white shadow-[0_12px_40px_rgba(6,78,59,0.2)] sm:max-w-lg sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-pul-border/70 bg-white px-5 py-4">
          <h2 id={titleId} className="text-xl font-bold leading-snug text-foreground">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-pul-page text-xl font-bold text-pul-muted hover:bg-pul-light hover:text-pul-deep"
            aria-label="닫기"
          >
            ×
          </button>
        </header>
        <div className="px-5 py-4">
          <p className="whitespace-pre-line text-base leading-relaxed text-pul-muted">
            {message}
          </p>
          <p className="mt-4 rounded-lg bg-pul-light/60 px-3 py-2 text-sm leading-relaxed text-pul-deep">
            PUL은 교육 신청·결제·채용·심판 배정을 직접 처리하지 않습니다. 최신 조건은
            반드시 주관기관의 공식 페이지에서 확인해 주세요.
          </p>
        </div>
        <footer className="flex flex-col gap-2 border-t border-pul-border/70 px-5 py-3 sm:flex-row">
          {actionLabel && actionUrl ? (
            <a
              href={actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-pul-point px-4 text-base font-bold text-white hover:bg-pul-deep"
              aria-label={`${actionLabel} (새 창)`}
            >
              {actionLabel}
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border text-base font-bold text-pul-muted hover:text-pul-deep"
          >
            닫기
          </button>
        </footer>
      </article>
    </div>
  );
}
