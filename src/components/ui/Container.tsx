import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ContainerProps = {
  children: ReactNode;
  className?: string;
};

export function Container({ children, className }: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1520px] px-2 sm:px-3 lg:px-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
