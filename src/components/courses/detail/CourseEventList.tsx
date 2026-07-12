"use client";

import { Card } from "@/components/ui/Card";
import type { CourseNearbyEventItem } from "@/data/courseDetailPageData";
import Link from "next/link";
import { useState } from "react";

type CourseEventListProps = {
  events: CourseNearbyEventItem[];
  onPastEvents: () => void;
  onRegisterInquiry: () => void;
};

function EventItem({ event }: { event: CourseNearbyEventItem }) {
  return (
    <li className="rounded-xl border border-pul-border/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-foreground lg:text-lg">{event.title}</h3>
          <p className="mt-1 text-[15px] text-pul-muted lg:text-sm">
            {event.date} · 필드 대회
          </p>
        </div>
        <span className="rounded-full bg-pul-light px-2.5 py-0.5 text-[13px] font-bold text-pul-deep ring-1 ring-emerald-200/70 lg:text-xs">
          {event.status}
        </span>
      </div>
      {event.benefitTags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {event.benefitTags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-amber-50 px-2 py-0.5 text-[13px] font-semibold text-amber-900 lg:text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <Link
        href={event.href}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-[15px] font-bold text-pul-deep hover:bg-pul-light sm:w-auto sm:min-w-[10rem] lg:text-base"
      >
        상세보기
      </Link>
    </li>
  );
}

export function CourseEventList({
  events,
  onPastEvents,
  onRegisterInquiry,
}: CourseEventListProps) {
  const [expanded, setExpanded] = useState(false);
  const all = events.slice(0, 3);
  const mobileVisible = expanded ? all : all.slice(0, 1);
  const hasMore = all.length > 1;

  return (
    <Card title="이 구장에서 열리는 대회·이벤트" dense>
      {all.length > 0 ? (
        <>
          <ul className="space-y-3 lg:hidden">
            {mobileVisible.map((event) => (
              <EventItem key={event.id} event={event} />
            ))}
          </ul>
          {hasMore ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-[15px] font-bold text-pul-deep hover:bg-pul-light lg:hidden"
            >
              {expanded ? "접기" : "대회·이벤트 더보기"}
            </button>
          ) : null}

          <ul className="hidden space-y-3 lg:block">
            {all.map((event) => (
              <EventItem key={event.id} event={event} />
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-pul-border bg-pul-light/40 px-4 py-6 text-center text-[15px] text-pul-muted lg:text-base">
          예정된 대회 정보가 없습니다.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onPastEvents}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-[15px] font-bold text-pul-deep hover:bg-pul-light lg:text-base"
        >
          이 구장의 지난 대회 보기
        </button>
        <button
          type="button"
          onClick={onRegisterInquiry}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-[15px] font-bold text-white hover:bg-pul-deep lg:text-base"
        >
          대회·행사 등록 문의
        </button>
      </div>
    </Card>
  );
}
