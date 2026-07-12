import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type SoftBadgeTone = "default" | "point" | "muted" | "warn";

type SoftBadgeProps = {
  children: ReactNode;
  tone?: SoftBadgeTone;
  className?: string;
};

export function SoftBadge({
  children,
  tone = "default",
  className,
}: SoftBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold lg:text-[11px]",
        tone === "point" && "border-pul-point/30 bg-pul-light text-pul-deep",
        tone === "muted" && "border-pul-border bg-pul-page text-pul-muted",
        tone === "warn" && "border-amber-300 bg-amber-50 text-amber-800",
        tone === "default" && "border-pul-border bg-white text-pul-deep",
        className,
      )}
    >
      {children}
    </span>
  );
}
