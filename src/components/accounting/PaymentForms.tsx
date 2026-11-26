"use client";

import { useState } from "react";
import { AccountingForm, Field, buttonClass, fieldClass, fieldGrid } from "./AccountingForm";
import { routes, statuses, timestamp, today, won, type Workspace, type PaymentRequest } from "@/lib/accounting/model";

export function RequestForm({ data }: { data: Workspace }) {
  const [route, setRoute] = useState<keyof typeof routes>("standard");
  const defaultEvent = data.scope.kind === "tournament" ? data.scope.id : "";
  const [event, setEvent] = useState(defaultEvent);
  const confirmed = data.events.find(item => item.id === event)?.confirmed;
  const people = confirmed ? data.people.filter(person => confirmed.includes(person.user_id)) : data.people;
  return <AccountingForm scope={data.scope} operation="request" label="미리보기용 요청 저장" reset
    onSaved={() => { setRoute("standard"); setEvent(defaultEvent); }} build={form => ({ ...Object.fromEntries(form), users: form.getAll("users"), route })}>
    <div className={fieldGrid}>
      <Field label="요청 이름"><input name="title" className={fieldClass} maxLength={120} required /></Field>
      <Field label="수입 항목"><select name="category" className={fieldClass} required>
        {data.categories.filter(c => c.direction === "income" && c.group_name !== "agency_return").map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select></Field>
      <Field label="1인당 금액 (원)"><input name="amount" className={fieldClass} type="number" min={1} max={1000000000000} required /></Field>
      <Field label="시작일"><input name="starts" className={fieldClass} type="date" defaultValue={today()} required /></Field>
      <Field label="납부 마감일"><input name="due" className={fieldClass} type="date" required /></Field>
      <Field label="행사"><select name="event" className={fieldClass} value={event} onChange={e => setEvent(e.target.value)}>
        <option value="">선택 안 함</option>{data.events.filter(e => data.scope.kind !== "club" || e.external === (route === "agency" || route === "direct")).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select></Field>
      <Field label="회비 대상 기간 시작"><input name="period_start" className={fieldClass} type="date" /></Field>
      <Field label="회비 대상 기간 끝"><input name="period_end" className={fieldClass} type="date" /></Field>
      <Field label="납부 경로"><select name="route" className={fieldClass} value={route} onChange={e => { setRoute(e.target.value as keyof typeof routes); setEvent(defaultEvent); }}>
        <option value="standard">{routes.standard}</option>
        {data.scope.kind === "club" && <><option value="agency">{routes.agency}</option><option value="direct">{routes.direct}</option></>}
        {data.scope.kind === "university" && <option value="official">{routes.official}</option>}
      </select></Field>
      {route === "direct" && <Field label="공식 납부 경로 URL"><input name="link" type="url" className={fieldClass} maxLength={500} required /></Field>}
    </div>
    <Field label="납부 안내"><textarea name="guidance" className={fieldClass} rows={3} maxLength={1200} required /></Field>
    <fieldset className="space-y-2"><legend className="font-bold">납부 대상</legend>
      <p className="text-sm text-pul-muted">참가비 요청은 확정된 참가자에게 발송됩니다.</p>
      {confirmed && <p className="text-sm">참가 확정 {people.length}명 · 미확정 또는 명단에 없는 회원 {data.people.length - people.length}명</p>}
      <div key={event + route} className="grid max-h-56 overflow-y-auto rounded-lg border border-pul-border p-2 sm:grid-cols-2">
        {people.map(person => <label key={person.user_id} className="flex min-h-11 items-center gap-2 break-words">
          <input type="checkbox" name="users" value={person.user_id} />{person.name}
        </label>)}
        {!people.length && <p className="p-2 text-sm">선택할 수 있는 대상이 없습니다.</p>}
      </div>
    </fieldset>
  </AccountingForm>;
}

export function RequestCard({ request, data }: { request: PaymentRequest; data: Workspace }) {
  const canCollect = request.route === "standard" || request.route === "agency";
  const category = data.categories.find(c => c.id === request.category_id);
  return <details className="space-y-3 rounded-lg border border-pul-border p-3">
    <summary className="cursor-pointer break-words font-bold">{request.title} · {request.sent_at ? "발송 완료" : "발송 전 미리보기"}</summary>
    <p>{request.starts} ~ {request.due} · {won(request.amount)} · {routes[request.route]}</p>
    {request.period_start && <p>대상 기간 · {request.period_start} ~ {request.period_end}</p>}
    <p className="whitespace-pre-wrap break-words">{request.guidance}</p>
    {request.link && <a href={request.link} className={buttonClass} target="_blank" rel="noreferrer">공식 납부 안내 열기</a>}
    {request.sent_at && <p className="text-sm">발송 · {timestamp(request.sent_at)}</p>}
    <ul className="divide-y divide-pul-border">
      {request.targets.map(target => <li key={target.user_id} className="space-y-2 py-3">
        <p className="break-words font-semibold">{target.name} · {canCollect ? statuses[target.status] : routes[request.route]}</p>
        {canCollect && <p className="text-sm">확인 {won(target.paid)} · 환불 {won(target.refunded)}
          {category?.group_name === "donation" ? " · 희망 " + (target.pledged === null ? "미입력" : won(target.pledged)) :
            " · 남은 금액 " + won(target.status === "exempt" || target.status === "cancelled" || target.status === "refunded" ? 0 : Math.max(0, request.amount - target.paid + target.refunded))}
        </p>}
        {request.sent_at && canCollect && <div className="flex flex-wrap gap-2">
          {["unpaid", "partial", "pending"].includes(target.status) && <AccountingForm scope={data.scope} operation="remind" label="개인 쪽지로 재안내" build={() => ({ id: request.id, user: target.user_id })} />}
          {target.paid === target.refunded && <AccountingForm scope={data.scope} operation="resolve" label="상태 저장"
            build={form => ({ id: request.id, user: target.user_id, resolution: form.get("resolution") })}>
            <Field label="면제·취소 상태"><select name="resolution" defaultValue={target.status === "exempt" || target.status === "cancelled" ? target.status : ""} className={fieldClass}>
              <option value="">납부 대상</option><option value="exempt">면제</option><option value="cancelled">취소</option>
            </select></Field>
          </AccountingForm>}
        </div>}
      </li>)}
    </ul>
    {!request.sent_at && <div className="flex flex-wrap gap-2">
      <AccountingForm scope={data.scope} operation="send" label="미리 본 대상에게 쪽지 보내기" build={() => ({ id: request.id })} />
      <AccountingForm scope={data.scope} operation="discard" label="미발송 요청 취소" build={() => ({ id: request.id })} />
    </div>}
  </details>;
}

