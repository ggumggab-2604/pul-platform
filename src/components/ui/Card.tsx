import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  fullHeight?: boolean;
  bodyClassName?: string;
  dense?: boolean;
};

export function Card({
  children,
  className,
  title,
  action,
  fullHeight = false,
  bodyClassName,
  dense = false,
}: CardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)]",
        fullHeight && "flex h-full flex-col",
        className,
      )}
    >
      {(title || action) && (
        <div
          className={cn(
            "flex shrink-0 items-center justify-between border-b border-pul-border/80",
            dense ? "px-4 py-2.5" : "px-5 py-4",
          )}
        >
          {title && (
            <h2
              className={cn(
                "font-bold text-foreground",
                dense ? "text-base lg:text-lg" : "text-lg lg:text-xl",
              )}
            >
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      <div
        className={cn(
          dense ? "p-3.5" : "p-5",
          fullHeight && "flex flex-1 flex-col",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
