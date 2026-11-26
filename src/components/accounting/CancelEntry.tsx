"use client";
import type { Entry } from "@/lib/accounting/model";
import { AccountingForm, Field, fieldClass, type Owner } from "./AccountingForm";

export function CancelEntry({ scope, row }: { scope: Owner; row: Entry }) {
  return <details className="rounded-lg border border-pul-border p-3">
    <summary className="cursor-pointer font-semibold">잘못 입력한 거래 취소</summary>
    <AccountingForm scope={scope} operation="cancel" label="거래 입력 취소"
      build={form => ({ id: row.id, version: row.version, reason: form.get("reason") })}>
      <Field label="입력 취소 사유"><input name="reason" className={fieldClass} maxLength={500} required /></Field>
    </AccountingForm>
  </details>;
}

