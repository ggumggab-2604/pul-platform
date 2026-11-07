import { ConfirmedCompanions, SpecialPending } from "./SpecialConfirmation";
import { ApprovalPendingBadge } from "@/components/clubs/tournaments/ApprovalPendingBadge";
import Image from "next/image";
import Link from "next/link";
import { Trophy } from "lucide-react";

import { specialPhotoUrl, specialTypes, type SpecialType } from "@/lib/hall-of-fame/hallSpecialRecords";
import { hallHref, type NationalScore, type SpecialResults, type TournamentAward } from "@/lib/hall-of-fame/nationalHall";

const triangleColors = ["text-amber-600", "text-slate-500", "text-orange-800"];
const specialKinds = Object.keys(specialTypes) as SpecialType[];

export const hallButton = "inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-semibold text-pul-deep hover:bg-pul-light";
export const hallPanel = "min-w-0 rounded-xl border border-pul-border bg-white p-4 sm:p-6";

export function HallTitle() {
  return (
    <header className="rounded-xl border border-emerald-200/60 bg-gradient-to-br from-pul-light via-white to-emerald-50 px-4 py-5 shadow-sm sm:px-6 sm:py-8 lg:py-10">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pul-point text-white sm:h-14 sm:w-14">
          <Trophy className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold text-pul-point sm:text-sm">PUL 파크골프 명예 기록</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-pul-deep sm:text-3xl lg:text-4xl">명예의 전당</h1>
          <p className="mt-2 text-sm text-pul-muted sm:text-base">전국 순위, 대회 수상, 특별 기록을 확인하세요.</p>
          <Link id="my-hall-of-fame" className={`${hallButton} mt-4`} href="/hall-of-fame/mine">내 명예의 전당</Link>
        </div>
      </div>
    </header>
  );
}

export function RankMark({ rank, tied = false }: { rank: number; tied?: boolean }) {
  const color = triangleColors[rank - 1];
  return <span className="whitespace-nowrap">{color && <span aria-hidden="true" className={`mr-1 ${color}`}>▲</span>}{tied ? "공동 " : ""}{rank}위</span>;
}

export function ScoreDirection({ direction }: { direction: NationalScore["direction"] }) {
  if (direction === "up") return <span className="text-red-700" aria-label="이전 평균보다 낮은 타수">▲</span>;
  if (direction === "down") return <span className="text-blue-700" aria-label="이전 평균보다 높은 타수">▼</span>;
  return <span aria-label="이전 평균과 같거나 비교 기록 없음">—</span>;
}

export function NationalScoreTable({ rows, average }: { rows: NationalScore[]; average: boolean }) {
  if (!rows.length) return <p className="py-4 text-sm text-pul-muted">이 기간에 공개된 유효 성적이 없습니다.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-left text-sm">
        <thead className="border-b border-pul-border text-pul-muted">
          <tr>{["순위", "동호회명", "이름", average ? "평균 타수" : "타수", "기록 구장"].map((label) => <th key={label} scope="col" className="px-2 py-3">{label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-pul-border">
          {rows.map((row, index) => (
            <tr key={index}>
              <td className="px-2 py-3"><RankMark rank={row.rank} tied={row.tied} /></td>
              <td className="px-2 py-3">{row.club ?? "—"}</td>
              <td className="px-2 py-3 font-semibold">{row.name}</td>
              <td className="whitespace-nowrap px-2 py-3 font-semibold tabular-nums">{row.score}타 {row.approvalPending && <ApprovalPendingBadge/>} {!average && <ScoreDirection direction={row.direction} />}</td>
              <td className="px-2 py-3">{row.course}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HallSpecialSummary({ data, showCondor = true }: { data?: SpecialResults; showCondor?: boolean }) {
  if (!data) return <p role="alert" className="text-sm text-rose-700">특별 기록 집계를 불러오지 못했습니다.</p>;
  if (!showCondor) {
    return (
      <ul className="flex flex-wrap gap-2" aria-label="특별 기록 인증 누적">
        {specialKinds.map((kind, index) => (
          <li key={kind}>
            <Link className={hallButton} href={hallHref({ tab: "special", type: kind })}>
              <span aria-hidden="true" className={`mr-1 ${triangleColors[index]}`}>▲</span>{specialTypes[kind]} {data.counts[kind]}건
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  const cardColors = [
    "border-amber-300 bg-amber-50 hover:border-amber-600",
    "border-slate-300 bg-slate-50 hover:border-slate-500",
    "border-orange-200 bg-orange-50 hover:border-orange-500",
  ];
  return (
    <section aria-labelledby="special-records-hero">
      <h2 id="special-records-hero" className="mb-3 text-lg font-bold text-pul-deep">한 타로 남긴 특별 기록</h2>
      <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4" aria-label="특별 기록 인증 누적">
        {specialKinds.map((kind, index) => {
          const condor = kind === "condor";
          const recent = condor ? data.yearCondor : data.latestByType?.[kind];
          return (
            <li key={kind} className={condor ? "col-span-2" : "min-w-0"}>
              <Link className={`block h-full rounded-xl border p-3 sm:p-4 ${cardColors[index]}`}
                href={hallHref({ tab: "special", type: kind })}>
                <p className={`font-bold text-pul-deep ${condor ? "text-xl sm:text-2xl" : "text-base"}`}>
                  <span aria-hidden="true" className={`mr-1 ${triangleColors[index]}`}>▲</span>{specialTypes[kind]}
                </p>
                {condor && <p className="mt-1 text-sm font-semibold text-amber-900">올해의 콘도르</p>}
                {recent ? (
                  <p className="mt-1 break-words text-sm font-semibold text-pul-deep">
                    {condor ? [recent.name, recent.course, recent.date].join(" · ") : `최근 달성 · ${recent.name}`}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-pul-muted">
                    {condor && data.counts.condor ? "올해 첫 인증 기록을 기다립니다" : "첫 인증 기록을 기다립니다"}
                  </p>
                )}
                <p className="mt-2 text-xs text-pul-muted">인증 누적 {data.counts[kind]}건</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function NationalSpecialList({ data }: { data: SpecialResults }) {
  return (
    <>
      {data.items.length === 0 && <p className="mt-3 text-sm text-pul-muted">이 기간에 공개된 특별 기록이 없습니다.</p>}
      <ul className="divide-y divide-pul-border">
        {data.items.map((row) => (
          <li key={row.id} id={`special-${row.id}`} className="py-3">
            <details>
              <summary className="cursor-pointer break-words font-semibold text-pul-deep">
                {specialTypes[row.type]}<SpecialPending status={row.companion_status} /> · {row.name} · {row.course}
              </summary>
              <p className="mt-2 text-sm text-pul-muted">{[row.date, row.club, row.segment, `${row.hole}홀`].filter(Boolean).join(" · ")}</p>
              {row.photos.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{row.photos.map((photo) => (
                <a key={photo} href={specialPhotoUrl(photo)} target="_blank" rel="noreferrer">
                  <Image unoptimized src={specialPhotoUrl(photo)} alt="공개 특별 기록 사진" width={128} height={96} className="h-24 w-32 rounded-lg object-cover" />
                </a>
              ))}</div>}
            </details>
            <ConfirmedCompanions status={row.companion_status} />
          </li>
        ))}
      </ul>
      <h3 id="public-hall-of-fame-ranking-title" className="mt-6 font-bold text-pul-deep">다기록 순위</h3>
      {data.leaders.length ? <ol className="mt-2 divide-y divide-pul-border">
        {data.leaders.map((row, index) => <li key={index} className="py-2 text-sm">{row.rank}위 · {row.name} · {row.count}건</li>)}
      </ol> : <p className="mt-2 text-sm text-pul-muted">집계할 기록이 없습니다.</p>}
    </>
  );
}

export function TournamentAwardList({ items }: { items: TournamentAward[] }) {
  if (!items.length) return <p className="py-3 text-sm text-pul-muted">공개된 공식 수상 결과가 없습니다.</p>;
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
      {items.map((event) => (
        <li key={event.id} className={hallPanel}>
          <p className="text-xs font-bold text-pul-point">{event.gameType === "field" ? "필드" : "스크린"} · {event.date}</p>
          <h3 className="mt-1 break-words font-bold text-pul-deep">
            {event.eventKey ? <Link className="underline underline-offset-4" href={`/events/${encodeURIComponent(event.eventKey)}`}>{event.title}</Link> : event.title}
          </h3>
          <ul className="mt-2 divide-y divide-pul-border">
            {event.winners.map((winner, index) => (
              <li key={index} className="break-words py-2 text-sm">
                <p><RankMark rank={winner.place} tied={winner.tied} /> ({["금메달", "은메달", "동메달"][winner.place - 1]}) · {winner.division} · {winner.name} · {winner.score}타{winner.approvalPending&&<ApprovalPendingBadge/>}</p>
                <p className="mt-1 text-pul-muted">{winner.club} · {winner.course}</p>
                {winner.newsId && <Link className="inline-flex min-h-11 items-center text-pul-point underline" href={`/hall-of-fame/awards/${encodeURIComponent(winner.newsId)}`}>사진 수상 소식</Link>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
