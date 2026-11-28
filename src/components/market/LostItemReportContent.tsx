import Link from "next/link";
import { LostItemFacts } from "./LostItemFacts";
import { LostItemCompleteButton } from "./LostItemCompleteButton";
import { lostItemButton, lostItemsPath, type LostItemReport } from "@/lib/market/lostItems";

export function LostItemReportContent({ report, screen = false }: { report: LostItemReport; screen?: boolean }) {
  const { id, course_key: course, post_key: post } = report;
  return <article className="space-y-5 rounded-xl border border-pul-border bg-white p-5 sm:p-7">
    <h1 className="break-words text-2xl font-bold text-pul-deep">{report.item}</h1>
    <LostItemFacts report={report} />
    {!!report.photos.length && <section className="grid gap-3 sm:grid-cols-2" aria-label="공개 사진">
      {report.photos.map((photo, index) => (
        // eslint-disable-next-line @next/next/no-img-element -- fresh per-request photo authorization
        <img key={photo} src={`${lostItemsPath}/${id}/photos/${photo}`} alt={`공개 사진 ${index + 1}`} className="max-h-96 w-full rounded-lg bg-pul-light object-contain" />
      ))}
    </section>}
    <div className="flex flex-wrap gap-2 border-t border-pul-border pt-4">
      {report.can_message && <Link className={lostItemButton + " !bg-pul-point !text-white"} prefetch={false} href={`/messages/new?lost=${id}`}>글쓴이에게 쪽지 보내기</Link>}
      {report.mine && !report.resolved && <LostItemCompleteButton id={id} />}
      {screen ? <Link prefetch={false} className={lostItemButton} href={`${lostItemsPath}/${id}`}>장터 분실 신고 보기</Link>
        : course && report.course_type === "screen" ? <Link prefetch={false} className={lostItemButton} href={`/courses/${course}/lost-items/${id}`}>스크린 시설 분실 신고 보기</Link>
        : course && post && <Link prefetch={false} className={lostItemButton} href={`/courses/${course}/stories/${post}`}>구장 이야기방 글 보기</Link>}
    </div>
  </article>;
}
