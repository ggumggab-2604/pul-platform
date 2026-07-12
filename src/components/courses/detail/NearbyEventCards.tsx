import { Card } from "@/components/ui/Card";
import type { CourseNearbyEventItem } from "@/data/courseDetailPageData";
import Link from "next/link";

type NearbyEventCardsProps = {
  events: CourseNearbyEventItem[];
  region: string;
  onRegisterInquiry: () => void;
};

export function NearbyEventCards({
  events,
  region,
  onRegisterInquiry,
}: NearbyEventCardsProps) {
  const display = events.slice(0, 3);

  return (
    <Card title="이 골프장에서 열리는 대회·이벤트" dense>
      {display.length > 0 ? (
        <ul className="space-y-3">
          {display.map((event) => (
            <li
              key={event.id}
              className="rounded-xl border border-pul-border/80 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-foreground lg:text-lg">{event.title}</h3>
                  <p className="mt-1 text-sm text-pul-muted">
                    {event.date} · 참가 대상: {event.targetAudience}
                  </p>
                </div>
                <span className="rounded-full bg-pul-light px-2.5 py-0.5 text-xs font-bold text-pul-deep ring-1 ring-emerald-200/70">
                  {event.status}
                </span>
              </div>
              {event.benefitTags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {event.benefitTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <Link
                href={event.href}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light sm:w-auto sm:min-w-[10rem] lg:text-base"
              >
                상세보기
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-pul-border bg-pul-light/40 px-4 py-6 text-center">
          <p className="text-base text-pul-muted lg:text-lg">
            예정된 대회 정보가 없습니다. 같은 지역 대회를 확인해 보세요.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/events?region=${encodeURIComponent(region)}`}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:text-base"
        >
          같은 지역 대회 보기
        </Link>
        <button
          type="button"
          onClick={onRegisterInquiry}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep lg:text-base"
        >
          대회·행사 등록 문의
        </button>
      </div>
    </Card>
  );
}
