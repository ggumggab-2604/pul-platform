"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { photoUploadForm } from "@/lib/images/preparePhoto";
import { accountingHref, directions, receipts, today, won, type Entry, type Workspace } from "@/lib/accounting/model";
import { AccountingForm, Conflict, Field, buttonClass, fieldClass, fieldGrid, useAccountingReady, type Owner } from "./AccountingForm";
import type { AccountingResult } from "@/app/accounting/actions";

type Allocation = { request: string; user: string; amount: string };
const blank: Allocation = { request: "", user: "", amount: "" };

export function EntryForm({ data, row, original, returnedFrom }: { data: Workspace; row?: Entry; original?: Entry; returnedFrom?: Entry }) {
  const group = original || row?.refund_of ? "refund" : returnedFrom || row?.return_of ? "agency_return" : "ordinary";
  const [category, setCategory] = useState(row?.category_id ?? data.categories.find(c => group === "ordinary" ? c.direction === "income" && c.group_name !== "agency_return" : c.group_name === group)?.id ?? "");
  const [event, setEvent] = useState(row?.event_id ?? original?.event_id ?? returnedFrom?.event_id ?? (data.scope.kind === "tournament" ? data.scope.id : ""));
  const [agency, setAgency] = useState(Boolean(row?.agency_event ?? original?.agency_event ?? returnedFrom?.agency_event));
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [version, setVersion] = useState(row?.version);
  const [conflictVersion, setConflictVersion] = useState<number>();
  const selected = data.categories.find(c => c.id === category);
  const external = data.events.some(e => e.id === event && e.external);
  const href = accountingHref(data.scope.kind, data.scope.id);
  const columns = data.book?.columns ?? [];
  const requests = data.requests.filter(r => r.sent_at && (original || category === r.category_id) &&
    (r.event_id ?? "") === event && (r.route === "agency") === agency && (r.route === "agency" || r.route === "standard"));
  const set = (index: number, change: Partial<Allocation>) => setAllocations(items => items.map((item, i) => i === index ? { ...item, ...change } : item));
  return <AccountingForm scope={data.scope} operation={row ? "edit" : "entry"} label={row ? "수정 저장" : original ? "실제 환불 기록" : returnedFrom ? "주최자가 반환한 돈 저장" : "거래 저장"}
    onConflict={latest => setConflictVersion(latest.version)}
    onSaved={result => { if (result.id && !row) window.location.assign(href + "/entry/" + result.id); }}
    build={form => ({
      ...Object.fromEntries(form), id: row?.id ?? "", version: Number(form.get("latest") || version || 0),
      category, event, agency: external && agency, allocations,
      daily_total: form.get("daily_total") === "yes", refund_of: original?.id ?? row?.refund_of ?? "",
      return_of: returnedFrom?.id ?? row?.return_of ?? "",
    })}>
    <div className={fieldGrid}>
      <Field label="거래일"><input name="date" type="date" min={data.book?.opening_date} defaultValue={row?.entry_date ?? today()} className={fieldClass} required /></Field>
      <Field label="수입·지출 항목"><select value={category} onChange={e => { setCategory(e.target.value); setAllocations([]); }} className={fieldClass} required>
        {Object.entries(directions).map(([direction, label]) => <optgroup key={direction} label={label}>
          {data.categories.filter(c => c.direction === direction && (group === "ordinary" ? !["refund","agency_return"].includes(c.group_name) : c.group_name === group)).map(c => <option key={c.id} value={c.id}>{label} · {c.label}</option>)}
        </optgroup>)}
      </select></Field>
      <Field label="금액 (원)"><input name="amount" type="number" min={1} max={1000000000000} step={1} inputMode="numeric" defaultValue={row?.amount} className={fieldClass} required /></Field>
      {(columns.includes("counterparty") || row?.counterparty) && <Field label="거래 상대·업체"><input name="counterparty" defaultValue={row?.counterparty ?? ""} maxLength={160} className={fieldClass} /></Field>}
      {(columns.includes("member") || row?.member_id) && <Field label="연결 회원"><select name="member" defaultValue={row?.member_id ?? ""} className={fieldClass}><option value="">선택 안 함</option>
        {data.people.map(p => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
        {row?.member_id && !data.people.some(p => p.user_id === row.member_id) && <option value={row.member_id}>이전 연결 회원</option>}
      </select></Field>}
      {(columns.includes("event") || event || (data.scope.kind === "club" && selected?.group_name === "fee")) && <Field label="행사"><select value={event} onChange={e => { setEvent(e.target.value); setAgency(false); setAllocations([]); }} className={fieldClass}>
        <option value="">선택 안 함</option>{data.events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        {event && !data.events.some(e => e.id === event) && <option value={event}>이전 연결 행사</option>}
      </select></Field>}
      {data.scope.kind === "course" && selected?.label === "이용료" && selected.direction === "income" && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="daily_total" value="yes" defaultChecked={row?.daily_total} />하루 이용료 합계</label>}
      {data.scope.kind === "course" && selected?.direction === "expense" && <>
        {(columns.includes("facility") || row?.facility) && <Field label="시설 위치"><input name="facility" className={fieldClass} maxLength={160} defaultValue={row?.facility ?? ""} /></Field>}
        {(columns.includes("work_date") || row?.work_date) && <Field label="작업일"><input name="work_date" type="date" className={fieldClass} defaultValue={row?.work_date ?? ""} /></Field>}
      </>}
    </div>
    {external && (selected?.group_name === "fee" || Boolean(original?.agency_event ?? row?.agency_event ?? returnedFrom?.agency_event)) &&
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={agency} onChange={e => { setAgency(e.target.checked); setAllocations([]); }} />이 대회의 대리 수납으로 기록</label>}
    {!row && !original && selected?.label === "단체 참가비" && data.scope.kind === "tournament" && data.transfers.length > 0 &&
      <Field label="동호회 일괄 송금 연결"><select name="transfer" className={fieldClass}>
        <option value="">선택 안 함</option>{data.transfers.map(t => <option key={t.id} value={t.id}>{t.name} · {t.date} · {won(t.amount)}</option>)}
      </select></Field>}
    <Field label="내용"><textarea name="description" defaultValue={row?.description ?? (original ? original.description + " 환불" : "")} maxLength={500} rows={2} className={fieldClass} required /></Field>
    {original && <p>원래 납부 · <Link className="underline" href={href + "/entry/" + original.id}>{original.entry_date} · {won(original.amount)}</Link></p>}
    {returnedFrom && <p>원래 송금 · <Link className="underline" href={href + "/entry/" + returnedFrom.id}>{returnedFrom.entry_date} · {won(returnedFrom.amount)}</Link></p>}
    {!row && !returnedFrom && requests.length > 0 && (original || selected?.direction === "income") && <fieldset className="space-y-2 rounded-lg border border-pul-border p-3">
      <legend className="px-1 font-bold">납부 배정</legend>
      {allocations.map((item, index) => <div key={index} className={fieldGrid}>
        <Field label="납부 요청"><select value={item.request} onChange={e => set(index, { request: e.target.value, user: "" })} className={fieldClass} required>
          <option value="">선택해 주세요</option>{requests.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select></Field>
        <Field label="대상"><select value={item.user} onChange={e => set(index, { user: e.target.value })} className={fieldClass} required>
          <option value="">선택해 주세요</option>{requests.find(r => r.id === item.request)?.targets.map(t => <option key={t.user_id} value={t.user_id}>{t.name} · {won(t.paid - t.refunded)} 확인</option>)}
        </select></Field>
        <Field label="배정 금액 (원)"><input type="number" min={1} max={1000000000000} value={item.amount} onChange={e => set(index, { amount: e.target.value })} className={fieldClass} required /></Field>
        <button type="button" onClick={() => setAllocations(items => items.filter((_, i) => i !== index))} className={buttonClass}>이 배정 삭제</button>
      </div>)}
      <button type="button" onClick={() => setAllocations(items => [...items, blank])} className={buttonClass}>납부 배정 추가</button>
    </fieldset>}
    <div className={fieldGrid}>
      {row?.receipt_id ? <p>증빙 상태 · 첨부 완료</p> : <Field label="증빙 상태"><select name="receipt_status" defaultValue={row?.receipt_status ?? "later"} className={fieldClass}>
        {Object.entries(receipts).filter(([key]) => key !== "attached").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></Field>}
      {!row?.receipt_id && <Field label="증빙 없음 사유 (선택)"><input name="receipt_reason" defaultValue={row?.receipt_reason ?? ""} className={fieldClass} maxLength={500} /></Field>}
    </div>
    {row && <>
      <Field label="수정 사유"><input name="reason" maxLength={500} className={fieldClass} required /></Field>
      <input type="hidden" name="latest" value={version} />
      {(conflictVersion ?? row.version) !== version && <button className={buttonClass} type="button" onClick={() => setVersion(conflictVersion ?? row.version)}>최신 버전에 내 입력 적용</button>}
    </>}
  </AccountingForm>;
}

export function ReceiptForm({ scope, row }: { scope: Owner; row: Entry }) {
  const router = useRouter();
  const ready = useAccountingReady();
  const [result, setResult] = useState<AccountingResult>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const retry = useRef<{ file: File; reason: string; version: number; body: FormData } | null>(null);
  const href = accountingHref(scope.kind, scope.id) + "/receipt/" + row.id;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reason = String(new FormData(form).get("reason") ?? "").trim();
    setBusy(true);
    setResult({});
    try {
      if (retry.current?.file !== file || retry.current.reason !== reason || retry.current.version !== row.version) {
        const fields = { requestId: crypto.randomUUID(), reason, version: String(row.version) };
        const body = file.type === "application/pdf" ? new FormData() :
          await photoUploadForm(file, fields, { purpose: "document", onProcessing: () => setProgress("사진을 준비하는 중입니다.") });
        if (file.type === "application/pdf") {
          body.append("file", file);
          for (const [key, value] of Object.entries(fields)) body.append(key, value);
        }
        retry.current = { file, reason, version: row.version, body };
      }
      setProgress("증빙을 전송하는 중입니다.");
      const response = await fetch(href, { method: "POST", body: retry.current.body });
      const saved = await response.json() as AccountingResult;
      setResult(saved);
      if (saved.id) { retry.current = null; form.reset(); router.refresh(); }
    } catch (error) {
      setResult({ error: error instanceof Error && /^[가-힣]/.test(error.message) ? error.message : "첨부 결과를 확인하지 못했습니다. 같은 파일로 다시 시도해 주세요." });
    } finally { setProgress(""); setBusy(false); }
  }
  return <form method="post" onSubmit={submit} className="space-y-3">
    <Field label="증빙 사진 또는 PDF"><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={fieldClass} required disabled={!ready || busy} /></Field>
    <Field label="첨부 사유"><input name="reason" className={fieldClass} defaultValue={row.receipt_id ? "" : "증빙 추가"} maxLength={500} required disabled={!ready || busy} /></Field>
    <button className={buttonClass} disabled={!ready || busy}>{row.receipt_id ? "증빙 교체" : "증빙 첨부"}</button>
    {progress && <p role="status">{progress}</p>}
    {result.id && <p role="status">증빙을 첨부했습니다.</p>}
    {result.error && <p role="alert" className="text-red-800">{result.error}</p>}
    {result.conflict && <Conflict row={result.conflict} />}
  </form>;
}

