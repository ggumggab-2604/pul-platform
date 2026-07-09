"use client";

import {
  CLUB_EVENTS_VS_TOURNAMENTS_NOTE,
  CLUB_EVENT_MOBILE_PREVIEW,
  CLUB_EVENT_PC_PREVIEW,
  clubEventRecruitmentLabels,
  clubEventTypeLabels,
  clubEvents,
} from "@/data/clubData";
import { cn } from "@/lib/utils";
import type { ClubEvent, ParkGolfClub } from "@/types";
import Link from "next/link";
import { useEffect, useState } from "react";

const CARD_BASE =
  "flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:p-4";
const DETAIL_BUTTON_CLASS =
  "inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-pul-point text-[11px] font-bold text-white hover:bg-pul-deep lg:min-h-10 lg:text-xs";
const OUTLINE_BUTTON_CLASS =
  "inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-[11px] font-bold text-pul-deep hover:bg-pul-light lg:min-h-10 lg:text-xs";

function recruitmentTone(status: ClubEvent["recruitmentStatus"]) {
  if (status === "open") return "border-pul-point/30 bg-pul-light text-pul-deep";
  if (status === "membersOnly") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "inquiryNeeded" || status === "needCheck")
    return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-pul-border bg-pul-page text-pul-muted";
}

function ClubEventCard({
  event,
  onClubView,
  onDetail,
}: {
  event: ClubEvent;
  onClubView: (clubId: string) => void;
  onDetail: (event: ClubEvent) => void;
}) {
  return (
    <article className={CARD_BASE}>
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex rounded-full border border-pul-point/30 bg-pul-light px-2 py-0.5 text-[10px] font-bold text-pul-deep lg:text-[11px]">
          {clubEventTypeLabels[event.eventType]}
        </span>
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold lg:text-[11px]",
            recruitmentTone(event.recruitmentStatus),
          )}
        >
          {clubEventRecruitmentLabels[event.recruitmentStatus]}
        </span>
      </div>
      <h3 className="mt-2 text-sm font-bold text-foreground lg:text-base">{event.title}</h3>
      <p className="mt-1 text-xs font-semibold text-pul-deep">{event.clubName}</p>
      <dl className="mt-2 space-y-1 text-xs text-pul-muted">
        <div className="flex gap-1">
          <dt className="shrink-0 font-semibold text-pul-deep">지역</dt>
          <dd>{event.region}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="shrink-0 font-semibold text-pul-deep">활동 구장</dt>
          <dd>{event.courseName}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="shrink-0 font-semibold text-pul-deep">일정</dt>
          <dd>{event.dateText}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="shrink-0 font-semibold text-pul-deep">참가 조건</dt>
          <dd>{event.participationCondition}</dd>
        </div>
      </dl>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted lg:text-sm">{event.summary}</p>
      <div className="mt-auto space-y-2 pt-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onClubView(event.relatedClubId)}
            className={OUTLINE_BUTTON_CLASS}
          >
            동호회 보기
          </button>
          <button type="button" onClick={() => onDetail(event)} className={DETAIL_BUTTON_CLASS}>
            자세히 보기
          </button>
        </div>
      </div>
    </article>
  );
}

type ClubEventsSectionProps = {
  clubs: ParkGolfClub[];
  onClubDetail: (club: ParkGolfClub) => void;
};

export function ClubEventsSection({ clubs, onClubDetail }: ClubEventsSectionProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const limit = isMobile ? CLUB_EVENT_MOBILE_PREVIEW : CLUB_EVENT_PC_PREVIEW;
  const visibleEvents = clubEvents.slice(0, limit);

  const handleClubView = (clubId: string) => {
    const club = clubs.find((item) => item.id === clubId);
    if (club) {
      onClubDetail(club);
      return;
    }
    console.log("[clubs] 동호회 보기:", clubId);
  };

  const handleEventDetail = (event: ClubEvent) => {
    console.log("[clubs] 행사 자세히 보기:", event.id, event.title);
  };

  const handleMore = () => {
    console.log("[clubs] 동호회 행사 더보기");
  };

  return (
    <section>
      <div className="mb-3 lg:mb-4">
        <h2 className="text-lg font-bold text-foreground lg:text-xl">동호회 행사·월례회</h2>
        <p className="mt-0.5 text-xs text-pul-muted lg:mt-1 lg:text-sm">
          동호회 월례회, 친선전, 정기 라운드, 회원 전용 행사를 확인하세요.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {visibleEvents.map((event) => (
          <ClubEventCard
            key={event.id}
            event={event}
            onClubView={handleClubView}
            onDetail={handleEventDetail}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleMore}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:mt-4"
      >
        동호회 행사 더보기
      </button>

      <p className="mt-2 text-[11px] leading-relaxed text-pul-muted lg:mt-3 lg:text-xs">
        {CLUB_EVENTS_VS_TOURNAMENTS_NOTE}{" "}
        <Link href="/events" className="font-semibold text-pul-point underline-offset-2 hover:underline">
          대회·이벤트 메뉴
        </Link>
        에서 확인할 수 있습니다.
      </p>
    </section>
  );
}
