"use client";

import { useState, useTransition } from "react";
import { reportLessonVideoAction } from "@/app/lessons/actions";

export function VideoLessonReportButton({ videoKey }: { videoKey: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string }>();

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-pul-muted">
      <button
        type="button"
        className="min-h-11 px-1 underline underline-offset-2 hover:text-pul-deep disabled:opacity-60"
        disabled={pending || result?.ok}
        onClick={() => startTransition(async () => {
          try {
            setResult(await reportLessonVideoAction(videoKey));
          } catch {
            setResult({ ok: false, message: "신고를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요." });
          }
        })}
      >
        {pending ? "신고 중…" : "신고"}
      </button>
      {result && <span role={result.ok ? "status" : "alert"}>{result.message}</span>}
    </div>
  );
}
