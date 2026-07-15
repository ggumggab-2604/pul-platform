"use client";

import { logout } from "@/app/auth/actions";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type LogoutButtonProps = {
  className?: string;
  label?: string;
  onSuccess?: () => void;
};

export function LogoutButton({
  className,
  label = "로그아웃",
  onSuccess,
}: LogoutButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  function handleLogout() {
    if (pending) return;
    setErrorMessage("");

    startTransition(async () => {
      const result = await logout();
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      onSuccess?.();
      window.dispatchEvent(new Event("pul-auth-signed-out"));
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        className={cn(className, pending && "cursor-not-allowed opacity-60")}
      >
        {pending ? "로그아웃 중…" : label}
      </button>
      {errorMessage ? (
        <p className="mt-2 text-sm font-semibold text-red-700" role="alert" aria-live="assertive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
