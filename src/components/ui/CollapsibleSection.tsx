"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useId, useState } from "react";

type CollapsibleSectionProps = {
  title: string;
  children: ReactNode;
  /** 접힌 상태에서 보여줄 짧은 요약 (모바일만) */
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  /**
   * true(기본): 모바일에서만 접기, PC에서는 제목+본문 항상 표시
   * false: 모든 폭에서 접기
   */
  mobileOnly?: boolean;
};

/**
 * 긴 이용안내·FAQ용 접기·펼치기.
 * 정보는 삭제하지 않고 모바일 첫 화면 길이를 줄인다.
 */
export function CollapsibleSection({
  title,
  children,
  summary,
  defaultOpen = false,
  className,
  bodyClassName,
  mobileOnly = true,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  if (mobileOnly) {
    return (
      <section
        className={cn(
          "rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)]",
          className,
        )}
      >
        {/* 모바일 접기 헤더 */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left lg:hidden"
        >
          <span className="text-lg font-bold text-pul-deep">{title}</span>
          <span className="shrink-0 text-base font-bold text-pul-point">
            {open ? "접기 ▲" : "펼치기 ▼"}
          </span>
        </button>

        {!open && summary ? (
          <div className="border-t border-pul-border/70 px-4 py-3 text-base text-pul-muted lg:hidden">
            {summary}
          </div>
        ) : null}

        <div
          id={panelId}
          className={cn(
            "border-t border-pul-border/70 px-4 py-3 lg:hidden",
            bodyClassName,
            !open && "hidden",
          )}
        >
          {children}
        </div>

        {/* PC: 항상 표시 */}
        <div className="hidden px-4 py-3 lg:block">
          <h2 className="mb-3 text-lg font-bold text-pul-deep lg:text-xl">{title}</h2>
          <div className={bodyClassName}>{children}</div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)]",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-lg font-bold text-pul-deep">{title}</span>
        <span className="shrink-0 text-base font-bold text-pul-point">
          {open ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>
      {!open && summary ? (
        <div className="border-t border-pul-border/70 px-4 py-3 text-base text-pul-muted">
          {summary}
        </div>
      ) : null}
      <div
        id={panelId}
        className={cn(
          "border-t border-pul-border/70 px-4 py-3",
          bodyClassName,
          !open && "hidden",
        )}
      >
        {children}
      </div>
    </section>
  );
}
