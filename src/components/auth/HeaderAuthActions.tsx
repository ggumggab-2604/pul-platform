"use client";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { Icon } from "@/components/ui/Icon";
import { useAuthSessionStatus } from "@/hooks/useAuthSessionStatus";
import Link from "next/link";

type HeaderAuthActionsProps = {
  variant: "desktop" | "mobile";
};

export function HeaderAuthActions({ variant }: HeaderAuthActionsProps) {
  const status = useAuthSessionStatus();
  const signedIn = status === "signedIn";

  if (variant === "mobile") {
    return signedIn ? (
      <Link
        href="/my"
        className="ml-auto inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-4 text-base font-bold text-white shadow-sm"
      >
        내 정보
      </Link>
    ) : (
      <Link
        href="/login"
        className="ml-auto inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-4 text-base font-bold text-white shadow-sm"
      >
        로그인
      </Link>
    );
  }

  return (
    <div className="flex min-w-[18rem] shrink-0 items-center justify-end">
      {signedIn ? (
        <>
          <LogoutButton className="px-3 py-2 text-lg text-pul-muted transition-colors hover:text-pul-deep" />
          <Link
            href="/my"
            className="ml-2 inline-flex h-12 items-center gap-2 rounded-lg bg-pul-point px-5 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-pul-deep"
          >
            <Icon name="user" className="h-5 w-5" />
            내 정보
          </Link>
        </>
      ) : (
        <>
          <Link
            href="/login"
            className="px-3 py-2 text-lg text-pul-muted transition-colors hover:text-pul-deep"
          >
            로그인
          </Link>
          <span className="text-pul-border">|</span>
          <Link
            href="/signup"
            className="px-3 py-2 text-lg text-pul-muted transition-colors hover:text-pul-deep"
          >
            회원가입
          </Link>
        </>
      )}
    </div>
  );
}
