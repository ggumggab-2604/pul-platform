"use client";

import { cn } from "@/lib/utils";

export type FilterChipSize = "md" | "sm" | "smMarket" | "cert";

type FilterChipProps = {
  label: string;
  active: boolean;
  onClick: () => void;
  size?: FilterChipSize;
  className?: string;
};

const sizeClass: Record<FilterChipSize, string> = {
  md: "h-9 px-3 text-sm",
  sm: "h-7 px-2 text-[11px]",
  smMarket: "h-8 px-2.5 text-xs",
  cert: "whitespace-nowrap px-2.5 py-1 text-[11px]",
};

export function FilterChip({
  label,
  active,
  onClick,
  size = "md",
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border font-medium transition-colors",
        sizeClass[size],
        active
          ? "border-pul-point bg-pul-light text-pul-deep"
          : "border-pul-border bg-white text-pul-muted hover:border-pul-point/40 hover:text-pul-deep",
        className,
      )}
    >
      {label}
    </button>
  );
}
