import { Card } from "@/components/ui/Card";
import { eventSchedule, featuredEvent } from "@/data/homeData";
import Link from "next/link";

const CORE_CARD_CLASS = "lg:min-h-[400px]";

export function EventSection() {
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
          <p className="mt-1 text-xs text-pul-muted">{featuredEvent.date}</p>
          <p className="text-xs text-pul-muted">{featuredEvent.location}</p>
          <button
            type="button"
            className="mt-2.5 h-10 w-full rounded-lg bg-pul-gold text-sm font-bold text-white shadow-[0_2px_8px_rgba(217,164,65,0.35)] transition-colors hover:bg-pul-gold-light"
          >
            {featuredEvent.cta}
          </button>
        </div>
      </div>

      <ul className="mt-2.5 flex-1 divide-y divide-pul-border/70">
        {eventSchedule.map((event) => (
          <li key={event.id}>
            <Link
              href={`/events/${event.id}`}
              className="flex gap-2.5 py-2 transition-colors hover:bg-pul-light/50"
            >
              <span className="w-11 shrink-0 text-sm font-bold text-pul-point">
                {event.date}
              </span>
              <span className="truncate text-sm leading-snug">{event.title}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/events"
        className="mt-3 flex h-10 shrink-0 items-center justify-center rounded-lg border border-pul-border text-sm font-semibold text-pul-deep transition-colors hover:bg-pul-light/60"
      >
        전체 일정 보기
      </Link>
    </Card>
  );
}
