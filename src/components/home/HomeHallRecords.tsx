import { ApprovalPendingBadge } from "@/components/clubs/tournaments/ApprovalPendingBadge";
import Link from "next/link";

import { HallSpecialSummary, RankMark, ScoreDirection } from "@/components/hall-of-fame/NationalHall";
import { Card } from "@/components/ui/Card";
import { specialTypes, type SpecialType } from "@/lib/hall-of-fame/hallSpecialRecords";
import { hallHref, type LatestHallRecord, type NationalScores, type SpecialResults } from "@/lib/hall-of-fame/nationalHall";

function recordHref(record: LatestHallRecord) {
  if (record.kind === "award") return record.newsId ? `/hall-of-fame/awards/${encodeURIComponent(record.newsId)}` : hallHref({ tab: "awards" });
  if (record.kind === "special") return hallHref({ tab: "special", type: record.label });
  return hallHref({ period: "all" });
}

export function HomeHallRecords({ today, latest, special }: { today?: NationalScores; latest?: LatestHallRecord[]; special?: SpecialResults }) {
  return (
    <Card className="h-full min-w-0" bodyClassName="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-pul-deep">명예의 전당</h2>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-pul-point underline" href={hallHref()}>전국 순위 보기</Link>
      </div>
      <section>
        <h3 className="font-bold text-pul-deep">오늘의 전국 최저타</h3>
        <p className="mb-1 text-xs text-pul-muted">{today?.date ?? ""} · 한국시간 오늘 입력 기준</p>
        {!today ? <p role="alert" className="text-sm text-rose-700">오늘 순위를 불러오지 못했습니다.</p> :
          today.items.length ? <ol className="divide-y divide-pul-border">
            {today.items.map((row, index) => (
              <li key={index} className="py-2 text-sm">
                <p className="flex flex-wrap justify-between gap-2"><span><RankMark rank={row.rank} tied={row.tied} /> · {row.name}</span><strong>{row.score}타 {row.approvalPending&&<ApprovalPendingBadge/>}<ScoreDirection direction={row.direction} /></strong></p>
                <p className="break-words text-xs text-pul-muted">{row.club} · {row.course}</p>
              </li>
            ))}
          </ol> : <p className="text-sm text-pul-muted">오늘 입력된 공개 성적이 없습니다.</p>}
      </section>
      <section className="border-t border-pul-border pt-3">
        <h3 className="mb-2 font-bold text-pul-deep">최신 기록</h3>
        {!latest ? <p role="alert" className="text-sm text-rose-700">최신 기록을 불러오지 못했습니다.</p> :
          latest.length ? <ul className="divide-y divide-pul-border">
            {latest.slice(0, 3).map((row, index) => (
              <li key={index}>
                <Link href={recordHref(row)} className="block break-words py-2 text-sm hover:text-pul-point">
                  <strong>{row.kind === "special" ? specialTypes[row.label as SpecialType] : row.label}</strong> · {row.name}{row.score !== null && ` · ${row.score}타`}{row.approvalPending&&<ApprovalPendingBadge/>}
                  <span className="block text-xs text-pul-muted">{[row.club, row.course, row.date].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul> : <p className="text-sm text-pul-muted">최근 공개된 기록이 없습니다.</p>}
      </section>
      <section className="border-t border-pul-border pt-3">
        <h3 className="mb-2 font-bold text-pul-deep">특별 기록</h3>
        <HallSpecialSummary data={special} showCondor={false} />
      </section>
      <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-pul-point underline" href="/hall-of-fame/mine">내 기록·신청 확인</Link>
    </Card>
  );
}
