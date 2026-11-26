import Link from "next/link";
import { profileLinkClass } from "@/components/account/MyDashboard";
import { accountingHref, type Kind } from "@/lib/accounting/model";
import { listAccountingScopes } from "@/lib/accounting/server";
import type { AuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export async function AccountingLink({ supabase, kind, scopeKey }: {
  supabase: AuthenticatedSupabaseContext["supabase"]; kind: Kind; scopeKey: string;
}) {
  const scope = (await listAccountingScopes(supabase)).find(item => item.kind === kind && item.key === scopeKey);
  return scope ? <Link className={profileLinkClass + " my-2"} prefetch={false} href={accountingHref(kind, scope.id)}>회계장부</Link> : null;
}

