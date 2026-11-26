"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { accountingHref, columnLabels, directions, kinds, today, won, type Entry, type Scope, type Summary, type Workspace } from "@/lib/accounting/model";
import { AccountingForm, Field, buttonClass, fieldClass, fieldGrid, panelClass } from "./AccountingForm";

export function SwitchScope({ current, scopes }: { current: Scope; scopes: Scope[] }) {
  const router = useRouter();
  return <Field label="소유 조직 전환"><select className={fieldClass} value={accountingHref(current.kind, current.id)} onChange={e => router.push(e.target.value)}>
    {scopes.map(scope => <option key={scope.kind + scope.id} value={accountingHref(scope.kind, scope.id)}>{kinds[scope.kind]} · {scope.name}</option>)}
  </select></Field>;
}

export function StartForm({ scope }: { scope: Scope }) {
  return <AccountingForm scope={scope} operation="start" label="장부 시작">
    <div className={fieldGrid}>
      <Field label="기준일"><input className={fieldClass} type="date" name="date" defaultValue={today()} required /></Field>
      <Field label="시작 잔액 (원)"><input className={fieldClass} type="number" name="amount" min={-1000000000000} max={1000000000000} defaultValue={0} required /></Field>
    </div>
  </AccountingForm>;
}

export function Settings({ data }: { data: Workspace }) {
  return <details className={panelClass}><summary className="cursor-pointer text-lg font-bold">장부 설정</summary>
    <h2 className="font-bold">수입·지출 항목 추가</h2>
    <AccountingForm scope={data.scope} operation="category" label="항목 추가" reset>
      <div className={fieldGrid}>
        <Field label="구분"><select className={fieldClass} name="direction">{Object.entries(directions).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
        <Field label="항목 이름"><input className={fieldClass} name="label" maxLength={60} required /></Field>
        <Field label="내역서 분류"><select className={fieldClass} name="group"><option value="general">일반</option><option value="dues">회비</option><option value="donation">찬조금</option><option value="fee">참가비</option></select></Field>
      </div>
    </AccountingForm>
    <h2 className="border-t border-pul-border pt-3 font-bold">입력·목록·내부 출력에 표시할 선택 항목</h2>
    <AccountingForm scope={data.scope} operation="columns" label="표시 설정 저장"
      build={form => ({ columns: form.getAll("columns") })}>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {Object.entries(columnLabels).filter(([id]) => data.scope.kind === "course" || !["facility", "work_date"].includes(id)).map(([id,label]) => <label key={id} className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="columns" value={id} defaultChecked={data.book?.columns.includes(id as keyof typeof columnLabels)} />{label}
        </label>)}
      </div>
    </AccountingForm>
  </details>;
}

export function DelegateForm({ data }: { data: Workspace }) {
  return <details className={panelClass}><summary className="cursor-pointer text-lg font-bold">회계 담당자 관리</summary>
    <ul className="divide-y divide-pul-border">
      {data.delegates.map(d => <li className="flex flex-wrap items-center gap-3 py-2" key={d.user_id}>
        <span>{data.people.find(p => p.user_id === d.user_id)?.name ?? "회원"} · {d.can_share ? "장부 관리 및 회원 공유" : "장부 관리"}</span>
        <AccountingForm scope={data.scope} operation="delegate" label="권한 회수" build={() => ({ user: d.user_id, enabled: false })} />
      </li>)}
    </ul>
    <AccountingForm scope={data.scope} operation="delegate" label="회계 권한 저장"
      build={form => ({ user: form.get("user"), enabled: true, share: form.get("share") === "yes" })}>
      <Field label="활성 회원"><select className={fieldClass} name="user" required defaultValue=""><option value="">선택해 주세요</option>
        {data.people.map(p => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
      </select></Field>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="share" value="yes" />정산표 회원 공유 권한</label>
    </AccountingForm>
  </details>;
}

export function CancelBatch({ data, rows }: { data: Workspace; rows: Entry[] }) {
  const available = rows.filter(row => !row.cancelled);
  if (available.length < 2) return null;
  return <details className="rounded-lg border border-pul-border p-3">
    <summary className="cursor-pointer font-semibold">거래 입력 일괄 취소</summary>
    <AccountingForm scope={data.scope} operation="cancel_batch" label="선택 거래 취소" reset
      build={form => ({ reason: form.get("reason"), entries: form.getAll("entries").map(value => {
        const [id, version] = String(value).split(":");
        return { id, version };
      }) })}>
      <div className="mt-2 grid max-h-48 overflow-auto sm:grid-cols-2">
        {available.map(e => <label key={e.id} className="flex min-h-11 items-center gap-2 break-words"><input type="checkbox" name="entries" value={e.id + ":" + e.version} />{e.entry_date} · {e.description} · {won(e.amount)}</label>)}
      </div>
      <Field label="일괄 취소 사유"><input className={fieldClass} name="reason" maxLength={500} required /></Field>
    </AccountingForm>
  </details>;
}

export function PublishForm({ data, report, previous, audiences }: {
  data: Workspace; report: Summary; previous: string; audiences: Record<string, string[]>;
}) {
  const router = useRouter();
  const [selectedPrevious, setSelectedPrevious] = useState(previous);
  const required = new Set(audiences[selectedPrevious] ?? []);
  return <AccountingForm scope={data.scope} operation="publish" label={selectedPrevious ? "정정 정산표 발행 및 공유" : "정산표 발행 및 공유"}
    onSaved={result => { if (result.id) router.push("/accounting/shared/" + result.id); }}
    build={form => ({
      ...Object.fromEntries(form), from: report.from, to: report.to, snapshot: report, users: [...new Set([...required, ...form.getAll("users")])],
    })}>
    <div className={fieldGrid}>
      <Field label="공유 방법"><select className={fieldClass} name="channel"><option value="message">쪽지로 보내기</option><option value="notice">회원 전용 공지에 올리기</option><option value="both">둘 다</option></select></Field>
      <Field label="정정할 이전 발행본"><select className={fieldClass} name="previous" value={selectedPrevious} onChange={event => setSelectedPrevious(event.target.value)}>
        <option value="">새 정산표 발행</option>{data.publications.filter(p => Object.hasOwn(audiences, p.id)).map(p =>
          <option key={p.id} value={p.id}>{p.from} ~ {p.to} · {p.created_at.slice(0, 10)} 발행</option>)}
      </select></Field>
    </div>
    <fieldset className="space-y-2"><legend className="font-bold">공유 대상</legend>
      {required.size > 0 && <p className="text-sm">이전 발행본의 대상 중 현재 열람 자격이 있는 회원을 포함합니다.</p>}
      {!selectedPrevious && (data.scope.kind === "club" || data.scope.kind === "university") && <p className="text-sm">대상을 선택하지 않으면 현재 회원 전체에게 공유합니다.</p>}
      <div key={selectedPrevious} className="grid max-h-48 overflow-auto sm:grid-cols-2">
        {data.people.map(p => <label className="flex min-h-11 items-center gap-2 break-words" key={p.user_id}>
          <input type="checkbox" name="users" value={p.user_id} defaultChecked={required.has(p.user_id)} disabled={required.has(p.user_id)} />
          {p.name}{required.has(p.user_id) && <span className="text-xs">필수</span>}
        </label>)}
      </div>
    </fieldset>
  </AccountingForm>;
}

export function PrintButton() {
  return <button type="button" className={buttonClass} onClick={() => window.print()}>인쇄 · PDF 저장</button>;
}


