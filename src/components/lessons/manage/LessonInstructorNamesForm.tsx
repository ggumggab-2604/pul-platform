"use client";

import { useActionState } from "react";
import type { InstructorEditState } from "@/app/lessons/manage/videos/actions";

export function LessonInstructorNamesForm({
  title, description, channelName, instructorName, action, submitLabel,
}: {
  title: string;
  description: string;
  channelName: string;
  instructorName: string;
  action: (state: InstructorEditState, data: FormData) => Promise<InstructorEditState>;
  submitLabel: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const fieldClass = "min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 py-2";

  return (
    <form action={submit} className="space-y-4 rounded-xl border border-pul-border bg-white p-5">
      <div>
        <h2 className="font-bold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-pul-muted">{description}</p>
      </div>
      <fieldset key={JSON.stringify([channelName, instructorName])} disabled={pending} className="space-y-3">
        <label className="block space-y-1 text-sm font-semibold">
          <span>채널명</span>
          <input name="channelName" required maxLength={120} defaultValue={channelName} className={fieldClass} />
        </label>
        <label className="block space-y-1 text-sm font-semibold">
          <span>교습가 활동명</span>
          <input name="instructorName" required maxLength={100} defaultValue={instructorName} className={fieldClass} />
        </label>
        <button type="submit" className="min-h-11 rounded-lg bg-pul-deep px-4 text-sm font-bold text-white disabled:opacity-50">
          {pending ? "저장 중…" : submitLabel}
        </button>
      </fieldset>
      {!pending && state.error && <p role="alert" className="text-sm font-semibold text-red-800">{state.error}</p>}
      {!pending && state.message && <p role="status" className="text-sm font-semibold text-pul-deep">{state.message}</p>}
    </form>
  );
}
