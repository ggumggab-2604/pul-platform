import Link from "next/link";
import { accountingHref, columnLabels, directions, receipts, timestamp, won, type Entry, type Summary, type Workspace } from "@/lib/accounting/model";

const cell = "border-b border-pul-border px-2 py-2 text-left align-top [overflow-wrap:anywhere]";

export function Balance({ report }: { report: Summary }) {
  return <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {([["이월 잔액", report.opening], ["수입", report.income], ["지출", report.expense], ["기말 잔액", report.closing]] as const).map(([label, amount]) =>
      <div key={label} className="min-w-0 rounded-lg border border-pul-border bg-pul-light p-2 sm:p-3">
        <dt className="text-sm font-semibold">{label}</dt><dd className="break-all font-bold tabular-nums text-pul-deep sm:text-lg">{won(amount)}</dd>
      </div>)}
  </dl>;
}

export function MemberReport({ report }: { report: Summary }) {
  return <div className="space-y-4">
    <p className="font-semibold">{report.from} ~ {report.to}</p>
    <Balance report={report} />
    <table className="w-full table-fixed text-sm">
      <thead><tr><th scope="col" className={cell}>구분</th><th scope="col" className={cell}>항목</th><th scope="col" className={cell}>금액</th></tr></thead>
      <tbody>{report.items.map(item => <tr key={item.direction + item.label}>
        <td className={cell}>{directions[item.direction]}</td><td className={cell}>{item.label}</td><td className={cell}>{won(item.amount)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export function FilteredTotals({ data, rows, byEvent = false }: { data: Workspace; rows: Entry[]; byEvent?: boolean }) {
  const categories = new Map(data.categories.map(c => [c.id, c]));
  const eventNames = new Map(data.events.map(e => [e.id, e.name]));
  const totals = new Map<string, { name: string; income: bigint; expense: bigint }>();
  for (const row of rows) {
    const direction = categories.get(row.category_id)?.direction;
    if (row.cancelled || !direction) continue;
    const key = (byEvent ? row.event_id ?? "" : "") + (row.agency_event ? ":agency" : ":operating");
    const name = (byEvent ? (eventNames.get(row.event_id ?? "") ?? "이전 행사") + " · " : "") + (row.agency_event ? "대리 수납" : "운영 거래");
    const total = totals.get(key) ?? { name, income: BigInt(0), expense: BigInt(0) };
    total[direction] += BigInt(row.amount);
    totals.set(key, total);
  }
  return totals.size ? <ul aria-label="조회 내역 합계" className="space-y-1 text-sm">
    {[...totals].map(([key,total]) => <li key={key} className="break-words">
      <strong>{total.name}</strong> · 수입 {won(total.income)} · 지출 {won(total.expense)} · 차액 {won(total.income-total.expense)}
    </li>)}
  </ul> : null;
}

export function EntryTable({ data, rows, print = false }: { data: Workspace; rows: Entry[]; print?: boolean }) {
  const href = accountingHref(data.scope.kind, data.scope.id);
  const categories = new Map(data.categories.map(c => [c.id, c]));
  const people = new Map(data.people.map(p => [p.user_id, p.name]));
  const events = new Map(data.events.map(e => [e.id, e.name]));
  const columns = data.book?.columns ?? [];
  const optional = (row: Entry) => ({
    counterparty: row.counterparty, member: row.member_id && (people.get(row.member_id) ?? "이전 회원"),
    event: row.event_id && (events.get(row.event_id) ?? "이전 행사"), receipt: receipts[row.receipt_status],
    facility: row.facility, work_date: row.work_date,
  });
  return <>
    {!print && rows.length > 0 && <ul aria-label="거래 목록" className="max-h-96 divide-y divide-pul-border overflow-y-auto rounded-lg border border-pul-border sm:hidden">
      {rows.map(row => {
        const category = categories.get(row.category_id);
        const values = optional(row);
        return <li key={row.id} className="space-y-1 p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-x-2">
            <p>{row.entry_date} · {category && directions[category.direction]} · {category?.label}</p>
            <p className="font-bold tabular-nums">{won(row.amount)}</p>
          </div>
          <Link prefetch={false} className="block break-words font-semibold text-pul-deep underline" href={href + "/entry/" + row.id}>{row.description}</Link>
          {(row.cancelled || row.agency_event) && <p>{row.cancelled ? "취소됨" : "대리 수납"}</p>}
          {columns.some(column => values[column]) && <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-pul-muted">
            {columns.filter(column => values[column]).map(column => <div key={column} className="min-w-0 break-words"><dt className="font-bold">{columnLabels[column]}</dt><dd>{values[column]}</dd></div>)}
          </dl>}
          <p className="break-words text-xs text-pul-muted">최종 수정 · {row.updated_name} · {timestamp(row.updated_at)}</p>
        </li>;
      })}
    </ul>}
    <div className={"accounting-table overflow-x-auto" + (print ? "" : " hidden max-h-[32rem] overflow-y-auto sm:block")}>
    <table className="w-full text-sm">
      <thead><tr>{["거래일", "구분", "항목", "금액", "내용", ...columns.map(c => columnLabels[c]), "최종 수정"].map(label => <th key={label} scope="col" className={cell}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => {
        const category = categories.get(row.category_id);
        const values = optional(row);
        return <tr key={row.id}>
          <td className={cell + " whitespace-nowrap"}>{row.entry_date}</td>
          <td className={cell}>{category ? directions[category.direction] : "—"}</td>
          <td className={cell}>{category?.label}{row.agency_event && <><br />대리 수납</>}{row.cancelled && <><br />취소됨</>}</td>
          <td className={cell + " tabular-nums"}>{won(row.amount)}</td>
          <td className={cell}>{print ? row.description : <Link prefetch={false} className="font-semibold text-pul-deep underline" href={href + "/entry/" + row.id}>{row.description}</Link>}</td>
          {columns.map(column => <td className={cell} key={column}>{values[column] ?? "—"}</td>)}
          <td className={cell}>{row.updated_name}<br />{timestamp(row.updated_at)}</td>
        </tr>;
      })}</tbody>
    </table>
    </div>
    {!rows.length && <p className="py-3 text-sm text-pul-muted">표시할 거래가 없습니다.</p>}
  </>;
}

