"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useBodyScrollLock } from "@/components/ui/InfoModal";

export function MarketDialog({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useBodyScrollLock(true);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    close.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[data-market-dialog="true"]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busy) onClose();
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = [
        ...panel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length > 0);
      const first = items[0],
        last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panel.current.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.current.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [busy, onClose]);
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-2 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panel}
        data-market-dialog="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`flex max-h-[calc(100dvh-16px)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? "max-w-5xl" : "max-w-xl"}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-pul-border px-4 py-2">
          <h2 id={id} className="text-xl font-bold">
            {title}
          </h2>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
            className="min-h-11 min-w-11 rounded-full text-2xl disabled:opacity-40"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
