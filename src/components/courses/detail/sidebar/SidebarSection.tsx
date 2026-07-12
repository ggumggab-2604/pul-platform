import type { ReactNode } from "react";

type SidebarSectionProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function SidebarSection({ title, children, className }: SidebarSectionProps) {
  return (
    <section
      className={
        className ??
        "rounded-xl border border-pul-border/60 bg-white p-4 shadow-[0_1px_4px_rgba(6,78,59,0.04)]"
      }
    >
      {title ? (
        <h2 className="mb-3 text-base font-bold text-pul-deep lg:text-lg">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}
