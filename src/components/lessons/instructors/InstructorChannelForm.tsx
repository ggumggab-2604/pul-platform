"use client";

import { useActionState, type ReactNode } from "react";
import type { ChannelActionState } from "@/app/lessons/instructors/actions";

export function InstructorChannelForm({
  action, children, buttonLabel,
}: {
  action: (state: ChannelActionState, form: FormData) => Promise<ChannelActionState>;
  children: ReactNode;
  buttonLabel: string;
}) {
  const [state, submit, pending] = useActionState(action, { ok: false, message: "" });
  return (
    <form action={submit} className="space-y-3">
      {children}
      <button className="min-h-11 rounded-lg bg-pul-deep px-4 font-bold text-white disabled:opacity-50" disabled={pending}>
        {pending ? "저장 중…" : buttonLabel}
      </button>
      {state.message && <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-pul-deep" : "text-sm text-red-800"}>{state.message}</p>}
    </form>
  );
}
