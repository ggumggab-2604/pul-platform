"use client";

import { cn } from "@/lib/utils";
import { useEffect, useId } from "react";

type InfoModalProps = {
  title: string;
  message: string;
  onClose: () => void;
  actionLabel?: string;
  actionHref?: string;
  /** 골프장 상세 등 본문·버튼을 한 단계 크게 */
  largeText?: boolean;
  /**
   * 배경 클릭으로 닫기. 기본 true.
   * 중요 입력 폼 등에서 실수 닫힘을 막으려면 false.
   */
  closeOnBackdrop?: boolean;
};

/** 모달 오픈 시 배경 스크롤 잠금 + 닫을 때 스크롤 위치 복원 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return;

    const { body } = document;
    const scrollY = window.scrollY;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    if (scrollbarGap > 0) {
      body.style.paddingRight = `${scrollbarGap}px`;
    }

    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.paddingRight = prev.paddingRight;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}

export function InfoModal({
  title,
  message,
  onClose,
  actionLabel,
  actionHref,
  largeText = false,
  closeOnBackdrop = true,
}: InfoModalProps) {
  const titleId = useId();
  const hasAction = Boolean(actionLabel && actionHref);

  useBodyScrollLock(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={cn(
          "flex w-full max-h-[calc(100dvh-24px)] flex-col overflow-hidden rounded-t-2xl border border-pul-border bg-white shadow-[0_12px_40px_rgba(6,78,59,0.2)]",
          "resize-none overscroll-contain",
          "sm:max-w-md sm:rounded-xl",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-pul-border/70 px-5 py-3">
          <h2
            id={titleId}
            className="min-w-0 flex-1 text-xl font-bold leading-snug text-foreground"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-pul-page text-2xl leading-none font-bold text-pul-muted hover:bg-pul-light hover:text-pul-deep"
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4",
            largeText ? "text-base" : "text-sm",
          )}
        >
          <p
            className={cn(
              "whitespace-pre-line leading-relaxed text-pul-muted",
              largeText ? "text-base" : "text-sm",
            )}
          >
            {message}
          </p>
        </div>

        {hasAction ? (
          <footer className="flex shrink-0 gap-2 border-t border-pul-border/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <a
              href={actionHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
            >
              {actionLabel}
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border text-sm font-bold text-pul-muted hover:text-pul-deep"
            >
              닫기
            </button>
          </footer>
        ) : (
          <footer className="shrink-0 border-t border-pul-border/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border font-bold text-pul-muted hover:text-pul-deep",
                largeText ? "text-base" : "text-sm",
              )}
            >
              닫기
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
