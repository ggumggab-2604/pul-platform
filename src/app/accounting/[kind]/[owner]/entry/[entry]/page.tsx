import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { EntryForm, ReceiptForm } from "@/components/accounting/EntryForm";
import { CancelEntry } from "@/components/accounting/CancelEntry";
import { buttonClass, panelClass } from "@/components/accounting/styles";
import { accountingHref, columnLabels, directions, isId, isKind, receipts, timestamp, won, type Entry } from "@/lib/accounting/model";
import { accountingSession, getAccountingEntry, getAccountingWorkspace } from "@/lib/accounting/server";

const fields: [keyof Entry, string][] = [
  ["entry_date","거래일"], ["category_id","항목"], ["amount","금액"], ["description","내용"],
  ["counterparty",columnLabels.counterparty], ["member_id",columnLabels.member], ["event_id",columnLabels.event], ["agency_event","대리 수납"],
  ["daily_total","일별 합계"], ["facility",columnLabels.facility], ["work_date",columnLabels.work_date],
  ["receipt_status","증빙 상태"], ["receipt_reason","증빙 사유"], ["receipt_id","첨부 파일"],
  ["refund_of","원래 거래"], ["cancelled","입력 취소"],
];

export default async function Page({ params }: { params: Promise<{ kind: string; owner: string; entry: string }> }) {
  const { kind, owner, entry } = await params;
  if (!isKind(kind) || !isId(owner) || !isId(entry)) notFound();
  const href = accountingHref(kind, owner);
  const auth = await accountingSession(href + "/entry/" + entry);
  const row = await getAccountingEntry(auth.supabase, kind, owner, entry);
  if (!row) notFound();
  const { data } = await getAccountingWorkspace(kind, owner, { from: row.entry_date, to: row.entry_date });
  const category = data.categories.find(c => c.id === row.category_id);
  function display(key: keyof Entry, value: Entry[keyof Entry]) {
    if (value === null || value === "") return "—";
    if (key === "category_id") return data.categories.find(c => c.id === value)?.label ?? "이전 항목";
    if (key === "member_id") return data.people.find(p => p.user_id === value)?.name ?? "이전 회원";
    if (key === "event_id" || key === "agency_event") return data.events.find(e => e.id === value)?.name ?? "이전 행사";
    if (key === "amount") return won(Number(value));
    if (key === "receipt_status") return receipts[value as keyof typeof receipts];
    if (key === "receipt_id") return "첨부 " + String(value).slice(0,8);
    if (typeof value === "boolean") return value ? "예" : "아니요";
    return String(value);
  }
  return <Container className="max-w-4xl space-y-4 px-3 py-6 pb-24 sm:px-6">
    <header className={panelClass}>
      <Link className={buttonClass} href={href + "?month=" + row.entry_date.slice(0,7)}>장부로 돌아가기</Link>
      <p className="break-words font-semibold">{data.scope.name}</p>
      <h1 className="break-words text-2xl font-black text-pul-deep">{row.description}</h1>
      <p>{row.entry_date} · {category ? directions[category.direction] + " · " + category.label : ""} · {won(row.amount)}{row.cancelled && " · 취소됨"}</p>
      {row.refund_of && <Link className={buttonClass} href={href + "/entry/" + row.refund_of}>원래 납부 열기</Link>}
      {row.return_of && <Link className={buttonClass} href={href + "/entry/" + row.return_of}>원래 송금 열기</Link>}
      <p>최초 입력 · {row.created_name} · {timestamp(row.created_at)}</p>
      <p>최종 수정 · {row.updated_name} · {timestamp(row.updated_at)}</p>
    </header>
    <section className={panelClass}><h2 className="text-lg font-bold">증빙</h2>
      <p>{receipts[row.receipt_status]}{row.receipt_reason && " · " + row.receipt_reason}</p>
      {row.receipt_id && <a className={buttonClass} href={href + "/receipt/" + row.id} target="_blank" rel="noreferrer">증빙 원본 열기</a>}
      {!row.cancelled && <ReceiptForm scope={data.scope} row={row} />}
    </section>
    {!row.cancelled && <>
      <details className={panelClass}><summary className="cursor-pointer text-lg font-bold">거래 수정</summary><EntryForm data={data} row={row} /></details>
      <section className={panelClass}><h2 className="text-lg font-bold">취소·환불</h2>
        {category?.label === "대리 수납 송금" && <Link className={buttonClass} href={href + "?return=" + row.id}>주최자가 반환한 돈 기록</Link>}
        {category?.direction === "income" && category.group_name !== "agency_return" && <Link className={buttonClass} href={href + "?refund=" + row.id}>실제 환불 기록</Link>}
        <CancelEntry scope={data.scope} row={row} />
      </section>
    </>}
    <section className={panelClass}><h2 className="text-lg font-bold">변경 이력</h2>
      {!row.audit.length && <p>저장된 변경 이력이 없습니다.</p>}
      {row.audit.map(change => <details key={change.version} className="rounded-lg border border-pul-border p-3">
        <summary className="cursor-pointer break-words">{change.after_values.updated_name} · {timestamp(change.after_values.updated_at)} · {change.reason}</summary>
        <dl className="mt-2 space-y-2">
          {fields.filter(([key]) => change.before_values[key] !== change.after_values[key]).map(([key,name]) => <div key={key} className="break-words">
            <dt className="font-bold">{name}</dt>
            <dd>변경 전 · {display(key, change.before_values[key])}</dd>
            <dd>변경 후 · {display(key, change.after_values[key])}</dd>
          </div>)}
        </dl>
      </details>)}
    </section>
  </Container>;
}

