"use client";

import { setLessonInstructorBookmarkAction } from "@/app/lessons/actions";
import { cn } from "@/lib/utils";
import { useState, useTransition } from "react";

export function InstructorInterestButton({
  instructorId,
  instructorName,
  isSaved,
  isAuthenticated,
  readError,
}: {
  instructorId: string;
  instructorName: string;
  isSaved: boolean;
  isAuthenticated: boolean;
  readError: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        aria-label={`${instructorName} 교습가 관심 ${isSaved ? "해제" : "저장"}`}
        aria-pressed={isSaved}
        disabled={isPending || Boolean(readError)}
        onClick={() => {
          if (!isAuthenticated) {
            setError("로그인하면 관심 교습가를 저장할 수 있습니다.");
            return;
          }
          setError(null);
          startTransition(async () => {
            try {
              const result = await setLessonInstructorBookmarkAction(instructorId, !isSaved);
              if (!result.ok) setError(result.error);
            } catch {
              setError("관심 교습가를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
            }
          });
        }}
        className={cn(
          "min-h-11 rounded-lg border px-3 text-xs font-bold disabled:opacity-50 lg:text-sm",
          isSaved ? "border-rose-200 bg-rose-50 text-rose-700" : "border-pul-border bg-white text-pul-deep",
        )}
      >
        {isPending ? "처리 중" : isSaved ? "♥ 관심 해제" : "♡ 관심 저장"}
      </button>
      {error && <p role="status" className="mt-1 text-xs text-pul-muted">{error}</p>}
    </div>
  );
}
