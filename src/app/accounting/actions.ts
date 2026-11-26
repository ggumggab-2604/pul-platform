"use server";

import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { isId, isKind, type Entry } from "@/lib/accounting/model";

export type AccountingResult = { id?: string; error?: string; conflict?: Entry };

export async function changeAccounting(kind: string, owner: string, operation: string, requestId: string, input: Record<string, unknown>): Promise<AccountingResult> {
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth || !isKind(kind) || !isId(owner) || !isId(requestId)) return { error: "회계 권한과 로그인 상태를 확인해 주세요." };
  const { data, error } = await auth.supabase.rpc("mutate_accounting", { k: kind, o: owner, op: operation, request_id: requestId, p: input });
  if (!error) return data as AccountingResult;
  if (error.code === "23505") return { error: "이미 등록된 항목, 기준일, 일별 이용료 또는 정정 발행입니다." };
  if (/^[가-힣]/.test(error.message)) return { error: error.message };
  return { error: error.code === "42501" ? "회계 권한이 필요합니다." : "저장하지 못했습니다. 입력한 내용을 확인해 주세요." };
}

export async function respondToAccountingPayment(id: string, form: FormData): Promise<void> {
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth || !isId(id)) return;
  const pledge = form.get("pledge");
  const result = await auth.supabase.rpc("get_accounting_payment", {
    p_id: id, p_ack: form.get("ack") === "yes", p_pledge: typeof pledge === "string" && /^\d{1,13}$/.test(pledge) ? Number(pledge) : null,
  });
  const { redirect } = await import("next/navigation");
  redirect(`/accounting/payment/${id}${result.error ? "?failed=1" : ""}`);
}

