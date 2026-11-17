"use client";

import { startTransition, useActionState } from "react";
import type { CertificationFormState } from "@/app/certification/phaseOneActions";

export const certificationInput = "mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-pul-border bg-white px-3 py-2";

export function CertificationLocalForm({ action, children, label = "저장" }: {
  action: (state: CertificationFormState, form: FormData) => Promise<CertificationFormState>;
  children?: React.ReactNode;
  label?: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return <form onSubmit={(event) => {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    startTransition(() => submit(form));
  }} className="space-y-4">
    <fieldset disabled={pending} className="space-y-4">{children}
      <button type="submit" className="min-h-11 rounded-lg bg-pul-point px-4 font-bold text-white">{pending ? "처리 중…" : label}</button>
    </fieldset>
    {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
    {state.success && <p role="status" className="text-pul-deep">{state.success}</p>}
  </form>;
}
