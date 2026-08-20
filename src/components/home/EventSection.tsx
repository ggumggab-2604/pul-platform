import { Card } from "@/components/ui/Card";
import { SectionMoreLink } from "@/components/ui/SectionMoreLink";
import { formatEventSchedule, type PublicEvent } from "@/lib/events/eventDirectory";
import Link from "next/link";

const CORE_CARD_CLASS = "lg:h-full";

type EventSectionProps = {
  events: PublicEvent[];
  loadFailed?: boolean;
  /** 모바일 일정 목록 노출 개수 (대표 대회는 항상 표시) */
  mobileLimit?: number;
};

export function EventSection({ events, loadFailed = false, mobileLimit }: EventSectionProps) {
  const featuredEvent = events[0];
  const scheduleEvents = events.slice(1);
  const mobileSchedule = mobileLimit
    ? scheduleEvents.slice(0, mobileLimit)
    : scheduleEvents;

  return (
    <Card
      dense
      fullHeight
      className={CORE_CARD_CLASS}
      title="예정 대회·이벤트"
      action={
        <Link
          href="/events"
          className="text-sm font-semibold text-pul-point hover:underline"
        >
          더보기
        </Link>
      }
      bodyClassName="flex flex-1 flex-col p-3.5"
    >
      {loadFailed ? (
        <p role="status" className="text-sm leading-6 text-pul-muted">
          대회·이벤트를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
        </p>
      ) : featuredEvent ? (
      <div className="overflow-hidden rounded-lg border border-pul-border shadow-sm">
        <div
          className="relative h-[88px] bg-cover bg-center"
          style={{
            backgroundImage:
              "linear-gradient(rgba(6,78,59,0.25), rgba(6,78,59,0.45)), url('/images/banner-course.jpg')",
          }}
        />
        <div className="bg-gradient-to-b from-pul-light/80 to-white px-3 py-3">
          <p className="text-sm font-bold leading-snug text-pul-deep">
            {featuredEvent.title}
          </p>
          <p className="mt-1 text-xs text-pul-muted">{formatEventSchedule(featuredEvent)}</p>
          <p className="text-xs text-pul-muted">{featuredEvent.venueName}</p>
          <Link
            href={`/events/${featuredEvent.eventKey}`}
            className="mt-2.5 h-10 w-full rounded-lg bg-pul-gold text-sm font-bold text-white shadow-[0_2px_8px_rgba(217,164,65,0.35)] transition-colors hover:bg-pul-gold-light"
          >
            <span className="flex h-full items-center justify-center">상세 보기</span>
          </Link>
        </div>
      </div>
      ) : (
        <p className="text-sm leading-6 text-pul-muted">
          예정된 대회·이벤트가 없습니다.
        </p>
      )}

      <ul className="mt-2.5 flex-1 divide-y divide-pul-border/70 lg:hidden">
        {mobileSchedule.map((event) => (
          <ScheduleRow key={event.eventKey} event={event} />
        ))}
      </ul>
      <ul className="mt-2.5 hidden flex-1 divide-y divide-pul-border/70 lg:block">
        {scheduleEvents.map((event) => (
          <ScheduleRow key={event.eventKey} event={event} />
        ))}
      </ul>

      {mobileLimit && scheduleEvents.length > mobileLimit ? (
        <SectionMoreLink href="/events" label="대회·이벤트 전체보기" mobileOnly />
      ) : null}

      <Link
        href="/events"
        className="mt-auto hidden h-10 shrink-0 items-center justify-center rounded-lg border border-pul-border text-sm font-semibold text-pul-deep transition-colors hover:bg-pul-light/60 lg:flex"
      >
        전체 일정 보기
      </Link>
    </Card>
  );
}

function ScheduleRow({ event }: { event: PublicEvent }) {
  return (
    <li>
      <Link
        href={`/events/${event.eventKey}`}
        className="flex gap-2.5 py-2 transition-colors hover:bg-pul-light/50"
      >
        <span className="w-11 shrink-0 text-sm font-bold text-pul-point">
          {event.startDate
            ? new Intl.DateTimeFormat("ko-KR", {
                month: "2-digit",
                day: "2-digit",
                timeZone: "UTC",
              }).format(new Date(`${event.startDate}T00:00:00Z`))
            : "일정"}
        </span>
        <span className="truncate text-sm leading-snug">{event.title}</span>
      </Link>
    </li>
  );
}
