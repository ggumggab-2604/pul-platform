import "server-only";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedSupabaseContext, type AuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { accountingHref, isId, isKind, period, type Entry, type Audit, type Kind, type Query, type Scope, type Workspace } from "./model";

export async function accountingSession(next: string) {
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=" + encodeURIComponent(next));
  return auth;
}

export async function listAccountingScopes(supabase: AuthenticatedSupabaseContext["supabase"]) {
  const result = await supabase.rpc("list_accounting_scopes");
  return (result.error ? [] : result.data) as Scope[];
}

export async function getAccountingWorkspace(kind: string, owner: string, query: Query) {
  if (!isKind(kind) || !isId(owner)) notFound();
  const auth = await accountingSession(accountingHref(kind, owner));
  const { from, to } = period(query);
  const { data, error } = await auth.supabase.rpc("get_accounting_workspace", { k: kind, o: owner, first_day: from, last_day: to });
  if (error?.code === "42501") notFound();
  if (error) throw Error("회계장부를 불러오지 못했습니다.");
  return { auth, data: data as Workspace, from, to };
}

export async function getAccountingEntry(supabase: AuthenticatedSupabaseContext["supabase"], kind: Kind, owner: string, id: string) {
  if (!isId(id) || !isId(owner)) return null;
  const { data, error } = await supabase.rpc("get_accounting_entry", { k: kind, o: owner, p_id: id });
  return error ? null : data as Entry & { audit: Audit[] };
}

