"use client";

import { useActionState } from "react";

import { finalizeTournament, reviewTournamentCorrection } from "@/app/events/register/actions";

type Correction = {
  id: string; name: string; division: string; reason: string;
  oldPlace: number; oldScore: number; oldTied: boolean; newPlace: number; newScore: number; newTied: boolean;
};
export type HostResults = {
  finalized: boolean; reviewToken: string;
  entries: { name: string; club: string; division: string; place: number; score: number }[];
  corrections: Correction[];
};

function ReviewCorrection({ row, eventKey, viewerId }: { row: Correction; eventKey: string; viewerId: string }) {
  const [state, action, pending] = useActionState(reviewTournamentCorrection, {});
  if (state.done) return <p role="status">정정 요청을 처리했습니다.</p>;
  return <form action={action} className="space-y-2 border-b border-pul-border py-3 text-sm">
    <p className="font-semibold">{row.division} · {row.name}</p>
    <p>{row.oldTied ? "공동 " : ""}{row.oldPlace}위 · {row.oldScore}타 → {row.newTied ? "공동 " : ""}{row.newPlace}위 · {row.newScore}타</p>
    <p className="break-words text-pul-muted">{row.reason}</p>
    <input type="hidden" name="eventKey" value={eventKey} />
    <input type="hidden" name="viewerId" value={viewerId} />
    <input type="hidden" name="correction" value={row.id} />
    <div className="flex flex-wrap gap-2">
      <button className="min-h-11 rounded-lg bg-pul-point px-4 font-bold text-white" name="decision" value="approve" disabled={pending}>승인</button>
      <button className="min-h-11 rounded-lg border border-pul-border px-4 font-bold" name="decision" value="reject" disabled={pending}>반려</button>
    </div>
    {state.error && <p role="alert" className="text-rose-700">{state.error}</p>}
  </form>;
}

export function TournamentFinalization({ eventKey, viewerId, results }: { eventKey: string; viewerId: string; results: HostResults }) {
  const [state, action, pending] = useActionState(finalizeTournament, {});
  const finalized = results.finalized || state.done;
  return <section className="mt-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6">
    <h2 className="text-xl font-bold text-pul-deep">주최자 결과 관리</h2>
    <p className="mt-2 text-sm text-pul-muted">{finalized ? "공식 결과를 확정했습니다." : "동호회 운영진이 제출한 성적을 확인한 뒤 결과를 확정하세요."}</p>
    {results.entries.length ? <ul className="mt-3 divide-y divide-pul-border">
      {results.entries.map((entry, index) => <li key={index} className="break-words py-2 text-sm">{entry.division} · {entry.name} · {entry.club} · {entry.place}위 · {entry.score}타</li>)}
    </ul> : <p className="mt-3 text-sm text-pul-muted">확정할 성적이 없습니다.</p>}
    {!finalized && results.entries.length > 0 && <form action={action} className="mt-3">
      <input type="hidden" name="eventKey" value={eventKey} />
      <input type="hidden" name="reviewToken" value={results.reviewToken} />
      <input type="hidden" name="viewerId" value={viewerId} />
      <button className="min-h-11 rounded-lg bg-pul-point px-4 font-bold text-white" disabled={pending}>{pending ? "확정 중…" : "대회 결과 확정"}</button>
    </form>}
    {state.error && <p role="alert" className="mt-2 text-sm text-rose-700">{state.error}</p>}
    {results.corrections.length > 0 && <section className="mt-5">
      <h3 className="font-bold text-pul-deep">공식 성적 정정 요청</h3>
      {results.corrections.map(row => <ReviewCorrection key={row.id} row={row} eventKey={eventKey} viewerId={viewerId} />)}
    </section>}
  </section>;
}
