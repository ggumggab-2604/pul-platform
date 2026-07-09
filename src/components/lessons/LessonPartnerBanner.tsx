"use client";

import { lessonPartnerBanner, paidLessonRegisterBanner } from "@/data/lessonData";
import { cn } from "@/lib/utils";

type LessonPartnerBannerProps = {
  onInquiry: () => void;
  variant?: "partner" | "paid-register";
};

export function LessonPartnerBanner({
  onInquiry,
  variant = "partner",
}: LessonPartnerBannerProps) {
  const content =
    variant === "paid-register" ? paidLessonRegisterBanner : lessonPartnerBanner;
  const eyebrow =
    variant === "paid-register" ? "PAID LESSON REGISTER" : "PUL PARTNER";

  return (
    <aside
      data-ad-slot={
        variant === "paid-register" ? "paid-lesson-register" : "lesson-partner-default"
      }
      className="rounded-lg border border-dashed border-pul-point/20 bg-gradient-to-r from-pul-light/50 via-white to-emerald-50/60 px-2.5 py-2 shadow-[0_1px_8px_rgba(6,78,59,0.04)] lg:rounded-xl lg:px-5 lg:py-4"
    >
      <div className="flex items-center gap-2 lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold tracking-wide text-pul-point">{eyebrow}</p>
          <p className="truncate text-xs font-bold text-pul-deep">{content.title}</p>
          <p className="line-clamp-2 text-[10px] leading-snug text-pul-muted">
            {content.description}
          </p>
        </div>
        <button
          type="button"
          onClick={onInquiry}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-pul-point/30 bg-white px-2.5 text-[11px] font-bold text-pul-deep transition-colors hover:bg-pul-light"
        >
          {content.ctaText}
        </button>
      </div>

      <div className="hidden lg:block">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[0.12em] text-pul-point">
              {eyebrow}
            </p>
            <h3 className="mt-0.5 text-base font-bold text-pul-deep">{content.title}</h3>
            <p className="mt-1 text-sm text-pul-muted">{content.description}</p>
          </div>
          <button
            type="button"
            onClick={onInquiry}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-pul-point/30 bg-white px-4 text-sm font-bold text-pul-deep transition-colors hover:bg-pul-light"
          >
            {content.ctaText}
          </button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {content.tags.map((tag) => (
            <span
              key={tag}
              className={cn(
                "rounded-md bg-white/80 px-2 py-0.5 text-xs font-medium text-pul-muted ring-1 ring-pul-border/60",
              )}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
