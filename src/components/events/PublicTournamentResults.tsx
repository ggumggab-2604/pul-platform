import Link from "next/link";

import { ApprovalPendingBadge } from "@/components/clubs/tournaments/ApprovalPendingBadge";
import type { PublicTournamentResult } from "@/lib/events/tournamentSignup";

export function PublicTournamentResultLine({ row }: { row: PublicTournamentResult }) {
  return <p>{row.division} · {row.tied ? "공동 " : ""}{row.place}위 · {row.name} · {row.score}타{row.club && ` · ${row.club}`}
    {row.affiliationPending ? <ApprovalPendingBadge affiliation /> : row.approvalPending ? <ApprovalPendingBadge /> : null}
  </p>;
}

export function PublicTournamentResults({ results, showEvent = false }: { results: PublicTournamentResult[]; showEvent?: boolean }) {
  if (!results.length) return null;
  return <section id="tournament-results" className="mt-4 space-y-2 rounded-xl border border-pul-border bg-white p-4">
    <h2 className="text-lg font-bold text-pul-deep">공개 대회 결과</h2>
    <ul className="divide-y divide-pul-border">
      {results.map((row, index) => <li key={index} className="py-2 text-sm">
        {showEvent && <Link className="block font-semibold text-pul-point underline" href={`/events/${encodeURIComponent(row.eventKey)}#tournament-results`}>{row.title} · {row.date}</Link>}
        <PublicTournamentResultLine row={row} />
      </li>)}
    </ul>
  </section>;
}
