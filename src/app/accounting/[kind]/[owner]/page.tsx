import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { getAccountingEntry, getAccountingWorkspace, listAccountingScopes } from "@/lib/accounting/server";
import { accountingHref, directions, isId, kinds, receipts, reports, selectEntries, won, type Query } from "@/lib/accounting/model";
import { EntryForm } from "@/components/accounting/EntryForm";
import { RequestCard, RequestForm } from "@/components/accounting/PaymentForms";
import { Balance, EntryTable, FilteredTotals } from "@/components/accounting/Reports";
import { CancelBatch, DelegateForm, Settings, StartForm, SwitchScope } from "@/components/accounting/WorkspaceForms";
import { buttonClass, fieldClass, fieldGrid, panelClass } from "@/components/accounting/styles";

export const metadata = { title: "회계장부" };

export default async function Page({ params, searchParams }: {
  params: Promise<{ kind: string; owner: string }>; searchParams: Promise<Query>;
}) {
  const { kind, owner } = await params;
  const query = await searchParams;
  const { auth, data, from, to } = await getAccountingWorkspace(kind, owner, query);
  const href = accountingHref(data.scope.kind, owner);
  const scopes = await listAccountingScopes(auth.supabase);
  const { rows, report } = selectEntries(data, query);
  const original = typeof query.refund === "string" && isId(query.refund)
    ? await getAccountingEntry(auth.supabase, data.scope.kind, owner, query.refund) : undefined;
  const returnedFrom = typeof query.return === "string" && isId(query.return)
    ? await getAccountingEntry(auth.supabase, data.scope.kind, owner, query.return) : undefined;
  if (query.refund && (!original || original.cancelled || !data.categories.some(c => c.id === original.category_id && c.direction === "income" && c.group_name !== "agency_return"))) notFound();
  if (query.return && (!returnedFrom || returnedFrom.cancelled || !returnedFrom.agency_event ||
    !data.categories.some(c => c.id === returnedFrom.category_id && c.label === "대리 수납 송금"))) notFound();
  const agencyEvents = [...new Set([
    ...data.agency.map(row => row.event_id),
    ...data.requests.filter(request => request.route === "agency" && request.sent_at).flatMap(request => request.event_id ? [request.event_id] : []),
  ])];
  const selected = (key: string) => typeof query[key] === "string" ? String(query[key]) : "";
  const printQuery = new URLSearchParams({ from, to, report });
  for (const key of ["category", "event", "receipt"]) {
    if (selected(key)) printQuery.set(key, selected(key));
  }
  return <main className="bg-pul-page"><Container className="max-w-6xl space-y-4 px-3 py-6 pb-24 sm:px-6">
    <header className={panelClass}>
      <Link href="/my" className="text-sm font-semibold text-pul-point underline">내 정보</Link>
      <h1 className="text-3xl font-black text-pul-deep">회계장부</h1>
      <p className="break-words font-semibold">{kinds[data.scope.kind]} · {data.scope.name}</p>
      {data.book && <p className="text-sm text-pul-muted">기준일 {data.book.opening_date} · 시작 잔액 {won(data.book.opening_amount)}</p>}
      {scopes.length > 1 && <div className="max-w-xl"><SwitchScope current={data.scope} scopes={scopes} /></div>}
    </header>
    {!data.book || !data.report ? <section className={panelClass}>
      <h2 className="text-xl font-bold">장부 시작</h2><StartForm scope={data.scope} />
    </section> : <>
      <section className={panelClass} aria-label="장부 조회">
        <h2 className="text-xl font-bold">잔액 및 내역</h2>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 gap-1 text-sm font-bold">월별 정산<input className={fieldClass} type="month" name="month" defaultValue={from.slice(0,7)} required /></label>
          <button className={buttonClass}>월별 조회</button>
        </form>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="period" value="year" />
          <label className="grid min-w-0 gap-1 text-sm font-bold">연간 정산<input className={fieldClass} type="number" name="year" min="1900" max="9999" defaultValue={from.slice(0,4)} required /></label>
          <button className={buttonClass}>연간 조회</button>
        </form>
        <form method="get" className="space-y-2">
          <div className={fieldGrid}>
            <label className="grid gap-1 text-sm font-bold">조회 시작일<input className={fieldClass} type="date" name="from" defaultValue={from} required /></label>
            <label className="grid gap-1 text-sm font-bold">조회 종료일<input className={fieldClass} type="date" name="to" defaultValue={to} required /></label>
            <label className="grid gap-1 text-sm font-bold">내역서<select className={fieldClass} name="report" defaultValue={report}>
              {Object.entries(reports).map(([id,label]) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            <label className="grid gap-1 text-sm font-bold">항목<select className={fieldClass} name="category" defaultValue={selected("category")}><option value="">전체 항목</option>
              {data.categories.map(c => <option key={c.id} value={c.id}>{directions[c.direction]} · {c.label}</option>)}
            </select></label>
            <label className="grid gap-1 text-sm font-bold">행사<select className={fieldClass} name="event" defaultValue={selected("event")}><option value="">전체 행사</option>
              {data.events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>
            <label className="grid gap-1 text-sm font-bold">증빙 상태<select className={fieldClass} name="receipt" defaultValue={selected("receipt")}><option value="">전체 상태</option>
              {Object.entries(receipts).map(([id,label]) => <option key={id} value={id}>{label}</option>)}
            </select></label>
          </div>
          <button className={buttonClass}>조회</button>
        </form>
        <p className="text-sm font-semibold">{from} ~ {to} · 운영 잔액</p>
        <Balance report={data.report} />
        <div className="flex flex-wrap gap-2">
          <Link className={buttonClass} href={href + "/print?" + printQuery}>내부용 내역서 미리보기</Link>
          <Link className={buttonClass} href={href + "/print?view=member&" + printQuery}>회원용 정산표 미리보기</Link>
        </div>
        {(report !== "all" || selected("event") || selected("category") || selected("receipt")) &&
          <FilteredTotals data={data} rows={rows} byEvent={report === "event"} />}
        <EntryTable data={data} rows={rows} />
        <CancelBatch data={data} rows={rows} />
      </section>
      <details className={panelClass} open={original || returnedFrom ? true : undefined}><summary className="cursor-pointer text-lg font-bold">{original ? "실제 환불 기록" : returnedFrom ? "주최자가 반환한 돈 기록" : "거래 입력"}</summary>
        <EntryForm data={data} original={original ?? undefined} returnedFrom={returnedFrom ?? undefined} />
      </details>
      <details className={panelClass}><summary className="cursor-pointer text-lg font-bold">납부 요청과 재안내</summary>
        <RequestForm data={data} />
        {data.requests.map(r => <RequestCard key={r.id} request={r} data={data} />)}
      </details>
      {data.scope.kind === "club" && agencyEvents.length > 0 && <section className={panelClass}><h2 className="text-lg font-bold">외부 대회 대리 수납</h2>
        {agencyEvents.map(eventId => {
          const row = data.agency.find(item => item.event_id === eventId);
          const unpaid = data.requests.filter(r => r.route === "agency" && r.event_id === eventId && r.sent_at)
            .reduce((total, r) => total + r.targets.reduce((sum, t) => sum + (t.status === "exempt" || t.status === "cancelled" || t.status === "refunded" ? BigInt(0) : BigInt(Math.max(0, r.amount - t.paid + t.refunded))), BigInt(0)), BigInt(0));
          return <article key={eventId} className="space-y-1 rounded-lg border border-pul-border p-3">
            <h3 className="break-words font-bold">{data.events.find(e => e.id === eventId)?.name ?? "이전 외부 대회"}</h3>
            <p>입금 {won(row?.income ?? 0)} · 송금·환불 {won(row?.expense ?? 0)} · 미납 {won(unpaid)}</p><p>남은 대리 수납 잔액 · {won(row?.balance ?? 0)}</p>
          </article>;
        })}
      </section>}
      <Settings data={data} />
      {data.publications.length > 0 && <section className={panelClass}><h2 className="text-lg font-bold">발행한 정산표</h2>
        <ul className="space-y-2">{data.publications.map(p => <li key={p.id} className="flex flex-wrap gap-2">
          <Link className={buttonClass} href={"/accounting/shared/" + p.id}>{p.from} ~ {p.to} {p.previous_id ? "정정본" : "발행본"}</Link>
          {data.scope.access > 1 && !data.publications.some(other => other.previous_id === p.id) &&
            <Link className={buttonClass} href={href + "/print?view=member&" + new URLSearchParams({ from: p.from, to: p.to, previous: p.id })}>정정 발행 미리보기</Link>}
        </li>)}</ul>
      </section>}
    </>}
    {data.scope.access === 3 && <DelegateForm data={data} />}
  </Container></main>;
}

