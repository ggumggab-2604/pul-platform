"use client";

import { useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { changeAccounting, type AccountingResult } from "@/app/accounting/actions";
import { timestamp, won, type Entry, type Kind } from "@/lib/accounting/model";

import { buttonClass } from "./styles";
export { buttonClass, fieldClass, fieldGrid, panelClass } from "./styles";
const subscribe = () => () => {};
const readyOnClient = () => true;
const readyOnServer = () => false;
export const useAccountingReady = () => useSyncExternalStore(subscribe, readyOnClient, readyOnServer);

export type Owner = { kind: Kind; id: string };

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1 text-sm font-semibold">{label}{children}</label>;
}

export function Conflict({ row, mine }: { row: Entry; mine?: Record<string, unknown> }) {
  return <div role="alert" className="space-y-1 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm">
    <strong>다른 담당자가 먼저 저장했습니다.</strong>
    <p className="break-words">최신 저장 · {row.entry_date} · {won(row.amount)} · {row.description} · {row.updated_name} · {timestamp(row.updated_at)}</p>
    {mine && typeof mine.description === "string" && <p className="break-words">내 입력 · {String(mine.date ?? "")} · {String(mine.amount ?? "")}원 · {mine.description}</p>}
    <p>입력값은 이 양식에 남아 있습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.</p>
  </div>;
}

export function AccountingForm({ scope, operation, label, children, build, reset = false, onSaved, onConflict }: {
  scope: Owner; operation: string; label: string; children?: ReactNode;
  build?: (form: FormData) => Record<string, unknown>; reset?: boolean; onSaved?: (result: AccountingResult) => void; onConflict?: (row: Entry) => void;
}) {
  const router = useRouter();
  const ready = useAccountingReady();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AccountingResult>({});
  const [mine, setMine] = useState<Record<string, unknown>>();
  const last = useRef<{ key: string; fingerprint: string } | null>(null);
  const busy = useRef(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = build ? build(data) : Object.fromEntries(data);
    const fingerprint = JSON.stringify(input);
    if (last.current?.fingerprint !== fingerprint) last.current = { key: crypto.randomUUID(), fingerprint };
    const key = last.current.key;
    setMine(input);
    setResult({});
    busy.current = true;
    start(async () => {
      try {
        const next = await changeAccounting(scope.kind, scope.id, operation, key, input);
        setResult(next);
        if (next.conflict) onConflict?.(next.conflict);
        if (next.id) {
          last.current = null;
          if (reset) form.reset();
          onSaved?.(next);
          router.refresh();
        }
      } catch {
        setResult({ error: "저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요." });
      } finally { busy.current = false; }
    });
  }
  return <form method="post" onSubmit={submit} className="space-y-3">
    <fieldset disabled={!ready || pending} className="min-w-0 space-y-3">{children}
      <button className={buttonClass} type="submit">{pending ? "처리 중…" : label}</button>
    </fieldset>
    {result.error && <p role="alert" className="break-words text-sm text-red-800">{result.error}</p>}
    {result.conflict && <Conflict row={result.conflict} mine={mine} />}
    {result.id && <p role="status" className="text-sm text-pul-deep">저장했습니다.</p>}
  </form>;
}

