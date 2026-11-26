import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { getAccountingWorkspace } from "@/lib/accounting/server";
import { accountingHref, isId, reports, selectEntries, statuses, won, type Query } from "@/lib/accounting/model";
import { Balance, EntryTable, FilteredTotals, MemberReport } from "@/components/accounting/Reports";
import { PrintButton, PublishForm } from "@/components/accounting/WorkspaceForms";
import { buttonClass, panelClass } from "@/components/accounting/styles";

export default async function Page({ params, searchParams }: {
  params: Promise<{ kind: string; owner: string }>; searchParams: Promise<Query>;
}) {
  const { kind, owner } = await params;
  const query = await searchParams;
  const { auth, data, from, to } = await getAccountingWorkspace(kind, owner, query);
  if (!data.report) notFound();
  const member = query.view === "member";
  const selected = selectEntries(data, query);
  const previous = typeof query.previous === "string" && isId(query.previous) ? query.previous : "";
  const canPublish = member && data.scope.access > 1;
  let audiences: Record<string, string[]> = {};
  if (canPublish && data.publications.some(row => row.from === from && row.to === to)) {
    const result = await auth.supabase.rpc("get_accounting_correction_audiences", { k: data.scope.kind, o: owner, p_from: from, p_to: to });
    if (result.error) throw Error("정정 정산표의 기존 공유 대상을 불러오지 못했습니다.");
    audiences = result.data as Record<string, string[]>;
  }
  if (member && previous && !Object.hasOwn(audiences, previous)) notFound();
  const title = member ? previous ? "회원용 정정 정산표" : "회원용 정산표" : reports[selected.report] + " · 내부용";
  const targetRequests = !member && (selected.report === "dues" || selected.report === "donation") ? data.requests.filter(r =>
    r.sent_at && r.starts <= to && r.due >= from && r.id &&
    data.categories.some(c => c.id === r.category_id && c.group_name === (selected.report === "dues" ? "dues" : "donation"))) : [];
  return <Container className="max-w-6xl space-y-4 px-3 py-6 pb-24">
    <div className="flex flex-wrap gap-2"><Link className={buttonClass} href={accountingHref(data.scope.kind, owner) + "?" + new URLSearchParams({ from, to })}>장부로 돌아가기</Link><PrintButton /></div>
    <article id="accounting-print" className={panelClass}>
      <h1 className="break-words text-2xl font-black text-pul-deep">{title}</h1>
      <p className="break-words font-bold">{data.scope.name}</p>
      {member ? <MemberReport report={data.report} /> : <>
        <p>{from} ~ {to} · 운영 잔액</p>
        <Balance report={data.report} />
        {(selected.report !== "all" || query.event || query.category || query.receipt) &&
          <FilteredTotals data={data} rows={selected.rows} byEvent={selected.report === "event"} />}
        <EntryTable data={data} rows={selected.rows} print />
        {targetRequests.map(r => <section key={r.id}>
          <h2 className="mt-3 font-bold">{r.title} · {won(r.amount)} · {r.starts} ~ {r.due}</h2>
          <table className="w-full text-left text-sm"><thead><tr>{["대상", "상태", "입금 확인", "환불", "희망액"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{r.targets.map(t => <tr key={t.user_id}><td>{t.name}</td><td>{statuses[t.status]}</td><td>{won(t.paid)}</td><td>{won(t.refunded)}</td><td>{t.pledged === null ? "—" : won(t.pledged)}</td></tr>)}</tbody>
          </table>
        </section>)}
      </>}
    </article>
    {canPublish && <section className={panelClass}>
      <h2 className="text-lg font-bold">회원에게 공유</h2><PublishForm key={from + to + previous} data={data} report={data.report} previous={previous} audiences={audiences} />
    </section>}
  </Container>;
}


