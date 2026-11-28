import { categoryLabels } from "@/data/marketData";
import type { LostItemReport } from "@/lib/market/lostItems";

const date = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

export function LostItemFacts({ report, compact = false }: { report: LostItemReport; compact?: boolean }) {
  const features = [report.brand, report.model, report.color].filter(Boolean).join(" · ");
  return <div className="space-y-2 break-words text-sm">
    <p className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-pul-light px-3 py-1 font-bold text-pul-deep">{report.resolved ? "찾음 완료" : "찾는 중"}</span>
      <span>{categoryLabels[report.category]}</span>
      <span>{[report.region, report.course_name, report.place].filter(Boolean).join(" · ")}</span>
      <span>분실일 {report.lost_on}</span>
    </p>
    {features && <p>{features}</p>}
    <p className={compact ? "line-clamp-2 whitespace-pre-wrap" : "whitespace-pre-wrap leading-7"}>{report.features}</p>
    <p className="text-xs text-pul-muted">{report.resolved
      ? report.handled_at ? "찾음 처리 · " + date.format(new Date(report.handled_at)) : "기존 글에서 찾음 처리"
      : "장터 공개 · " + date.format(new Date(report.created_at))}</p>
  </div>;
}
