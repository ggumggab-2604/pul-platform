import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type CourseDetailTwoColumnRowProps = {
  children: ReactNode;
  className?: string;
};

export function CourseDetailTwoColumnRow({
  children,
  className,
}: CourseDetailTwoColumnRowProps) {
  return (
    <div
      className={cn(
        "grid auto-rows-auto grid-cols-1 gap-4 max-lg:gap-3 lg:grid-cols-2 lg:items-stretch lg:gap-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
