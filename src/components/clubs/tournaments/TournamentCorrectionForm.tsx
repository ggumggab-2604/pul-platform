"use client";

import { useActionState, useRef } from "react";

import { requestTournamentCorrection } from "@/app/events/register/actions";
import type { Entrant } from "@/lib/clubs/tournaments";
import s from "./Tournaments.module.css";

export function TournamentCorrectionForm({ clubKey, viewerId, entry }: { clubKey: string; viewerId: string; entry: Entrant }) {
  const [state, action, pending] = useActionState(requestTournamentCorrection, {});
  const request = useRef<{ id: string; input: string } | null>(null);
  return <details className="mt-2">
    <summary className="min-h-11 cursor-pointer py-2 font-semibold text-pul-point">공식 성적 정정 요청</summary>
    {state.done ? <p role="status">주최자에게 정정을 요청했습니다.</p> : <form action={form => {
      const input = JSON.stringify(["place", "score", "tied", "reason"].map(key => form.get(key)));
      if (request.current?.input !== input) request.current = { id: crypto.randomUUID(), input };
      form.set("requestId", request.current.id);
      action(form);
    }} className="space-y-2">
      <input type="hidden" name="clubKey" value={clubKey} />
      <input type="hidden" name="viewerId" value={viewerId} />
      <input type="hidden" name="entry" value={entry.id} />
      <label className={s.field}>공식 순위<input name="place" type="number" min={1} required defaultValue={entry.place ?? undefined} /></label>
      <label className={s.field}>최종 타수<input name="score" type="number" min={1} required defaultValue={entry.score ?? undefined} /></label>
      <label className={s.check}><input name="tied" type="checkbox" defaultChecked={entry.tied} />공동 순위</label>
      <label className={s.field}>정정 사유<textarea name="reason" required minLength={2} maxLength={500} /></label>
      {state.error && <p role="alert" className={s.error}>{state.error}</p>}
      <button className={s.button} disabled={pending}>{pending ? "접수 중…" : "정정 요청 보내기"}</button>
    </form>}
  </details>;
}
