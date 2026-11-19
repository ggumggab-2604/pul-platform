import type { ReactNode } from "react";

const button = "inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-center text-sm font-bold no-underline transition-colors";
export const refereePrimaryButton = `${button} border-pul-deep bg-pul-deep text-white hover:bg-pul-point`;
export const refereeSecondaryButton = `${button} border-pul-point bg-white text-pul-deep hover:bg-pul-light`;

export function RefereeSourceButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 flex-col items-stretch text-center">
      <a className={refereeSecondaryButton} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
      <span className="mt-1 text-xs text-pul-muted">새 탭에서 열림</span>
    </span>
  );
}
