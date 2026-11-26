import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { buttonClass, panelClass } from "@/components/accounting/styles";
import { accountingHref, kinds } from "@/lib/accounting/model";
import { accountingSession, listAccountingScopes } from "@/lib/accounting/server";

export const metadata = { title: "회계장부" };

export default async function Page() {
  const { supabase } = await accountingSession("/accounting");
  const [scopes, { data }] = await Promise.all([listAccountingScopes(supabase), supabase.rpc("list_accounting_publications")]);
  const shared = (data ?? []) as { id: string; from: string; to: string; name: string; is_correction: boolean }[];
  return <Container className="max-w-3xl space-y-4 px-3 py-6 pb-24 sm:px-6">
    <h1 className="text-3xl font-black text-pul-deep">회계장부</h1>
    {scopes.length > 0 && <section className={panelClass}><h2 className="text-xl font-bold">관리할 조직</h2>
      <ul className="space-y-2">{scopes.map(scope => <li key={scope.kind + scope.id}>
        <Link className={buttonClass + " break-words"} href={accountingHref(scope.kind, scope.id)}>{kinds[scope.kind]} · {scope.name}</Link>
      </li>)}</ul>
    </section>}
    <section className={panelClass}><h2 className="text-xl font-bold">공유받은 정산표</h2>
      {shared.length ? <ul className="space-y-2">{shared.map(p => <li key={p.id}>
        <Link className={buttonClass + " break-words"} href={"/accounting/shared/" + p.id}>{p.name} · {p.from} ~ {p.to} {p.is_correction ? "정정본" : ""}</Link>
      </li>)}</ul> : <p>공유받은 정산표가 없습니다.</p>}
    </section>
  </Container>;
}


