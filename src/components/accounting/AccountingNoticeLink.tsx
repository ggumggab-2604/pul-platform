import Link from "next/link";
import type { AuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import type { Kind } from "@/lib/accounting/model";
import { buttonClass } from "./styles";

export async function AccountingNoticeLink({ supabase, kind, scopeKey }: {
  supabase: AuthenticatedSupabaseContext["supabase"]; kind: Kind; scopeKey: string;
}) {
  const result = await supabase.rpc("list_accounting_notices", { k: kind, scope_key: scopeKey });
  const notices = result.error ? [] : result.data as { id: string; from: string; to: string; correction: boolean }[];
  if (!notices.length) return null;
  return <section aria-label="회원 전용 정산 공지" className="flex flex-wrap gap-2">
    {notices.map(notice => <Link className={buttonClass} href={"/accounting/shared/" + notice.id} key={notice.id}>
      {notice.from} ~ {notice.to} {notice.correction ? "정정 정산표" : "회원 정산표"}
    </Link>)}
  </section>;
}

