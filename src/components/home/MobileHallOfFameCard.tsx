"use client";

import Link from "next/link";
import {
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
  type TouchEvent,
} from "react";

import { Card } from "@/components/ui/Card";
import { SoftBadge } from "@/components/ui/SoftBadge";
import {
  useElementInView,
  useHofSectionRotation,
  usePageVisible,
  usePrefersReducedMotion,
} from "@/hooks/useHofSectionRotation";
import type {
  HomeHallOfFameRanking,
  HomeHallOfFameRecord,
} from "@/lib/home/homeAggregation";
import { cn } from "@/lib/utils";

const HOF_VIEW_HREF = "/hall-of-fame";
const HOF_MEMBER_HREF = "/hall-of-fame#my-hall-of-fame";
const MOBILE_HOF_MAX = 10;
const SWIPE_THRESHOLD_PX = 48;
const SPECIAL_CODES = new Set(["hole_in_one", "albatross", "condor"]);
const FADE_CLASS = "duration-[320ms]";
const RECORD_AREA_CLASS = "h-[4.5rem]";

type MobileHallOfFameCardProps = {
  records: HomeHallOfFameRecord[];
  rankings: HomeHallOfFameRanking[];
  recordsLoadFailed: boolean;
  rankingsLoadFailed: boolean;
};

function publicDisplayName(value?: string) {
  return value === "PUL member" || !value ? "PUL 회원" : value;
}

function formatDate(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${year}.${month}.${day}`;
}

export function prepareMobileHallOfFameRecords(records: HomeHallOfFameRecord[]) {
  return records.slice(0, MOBILE_HOF_MAX);
}

type SectionPagerProps = {
  label: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
};

function SectionPager({ label, index, total, onPrev, onNext }: SectionPagerProps) {
  if (total <= 1) return null;
  return (
    <div className="-mr-1.5 flex shrink-0 items-center">
      <button
        type="button"
        onClick={onPrev}
        aria-label={`${label} 이전 항목`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-lg font-bold text-pul-deep hover:bg-pul-light"
      >
        ‹
      </button>
      <span
        className="min-w-[2.5rem] text-center text-sm tabular-nums text-pul-muted"
        aria-live="polite"
        aria-atomic="true"
      >
        {index + 1}/{total}
      </span>
      <button
        type="button"
        onClick={onNext}
        aria-label={`${label} 다음 항목`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-lg font-bold text-pul-deep hover:bg-pul-light"
      >
        ›
      </button>
    </div>
  );
}

function SectionHeader({
  title,
  pager,
}: {
  title: string;
  pager: SectionPagerProps;
}) {
  return (
    <div className="mb-1.5 flex min-h-10 items-center justify-between gap-2">
      <h3 className="min-w-0 truncate text-sm font-bold text-pul-deep">{title}</h3>
      <SectionPager {...pager} />
    </div>
  );
}

function SwipeArea({
  children,
  enabled,
  onSwipeLeft,
  onSwipeRight,
  ariaLabel,
  fading,
}: {
  children: ReactNode;
  enabled: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  ariaLabel: string;
  fading: boolean;
}) {
  const startX = useRef<number | null>(null);
  const onTouchStart = useCallback(
    (event: TouchEvent) => {
      if (enabled) startX.current = event.changedTouches[0]?.clientX ?? null;
    },
    [enabled],
  );
  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (!enabled || startX.current === null) return;
      const delta = (event.changedTouches[0]?.clientX ?? startX.current) - startX.current;
      startX.current = null;
      if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
      if (delta < 0) onSwipeLeft();
      else onSwipeRight();
    },
    [enabled, onSwipeLeft, onSwipeRight],
  );

  return (
    <div
      className={cn(
        "overflow-hidden transition-opacity",
        RECORD_AREA_CLASS,
        FADE_CLASS,
        fading ? "opacity-0" : "opacity-100",
      )}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="group"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

function SectionState({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div
      role={error ? "alert" : undefined}
      className={cn(
        RECORD_AREA_CLASS,
        "flex items-center rounded-lg border border-dashed px-3 text-sm",
        error
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-pul-border bg-pul-page/40 text-pul-muted",
      )}
    >
      {children}
    </div>
  );
}

export function MobileHallOfFameCard({
  records,
  rankings,
  recordsLoadFailed,
  rankingsLoadFailed,
}: MobileHallOfFameCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const specials = useMemo(
    () =>
      prepareMobileHallOfFameRecords(
        records.filter((record) => SPECIAL_CODES.has(record.recordTypeCode)),
      ),
    [records],
  );
  const monthlyRankings = useMemo(() => rankings.slice(0, MOBILE_HOF_MAX), [rankings]);
  const recentRecords = useMemo(() => prepareMobileHallOfFameRecords(records), [records]);
  const reducedMotion = usePrefersReducedMotion();
  const inView = useElementInView(cardRef);
  const pageVisible = usePageVisible();
  const autoPlay = inView && pageVisible && !reducedMotion;
  const specialRotation = useHofSectionRotation({
    count: specials.length,
    startDelayMs: 0,
    autoPlay,
    instant: reducedMotion,
  });
  const rankingRotation = useHofSectionRotation({
    count: monthlyRankings.length,
    startDelayMs: 2500,
    autoPlay,
    instant: reducedMotion,
  });
  const recentRotation = useHofSectionRotation({
    count: recentRecords.length,
    startDelayMs: 4500,
    autoPlay,
    instant: reducedMotion,
  });
  const special = specials[specialRotation.index] ?? null;
  const ranking = monthlyRankings[rankingRotation.index] ?? null;
  const recent = recentRecords[recentRotation.index] ?? null;

  return (
    <div ref={cardRef}>
      <Card
        dense
        title="명예의 전당"
        action={
          <Link href={HOF_VIEW_HREF} className="text-sm font-semibold text-pul-point hover:underline">
            전체보기
          </Link>
        }
        bodyClassName="space-y-3 p-3.5"
      >
        <section>
          <SectionHeader
            title="특별 기록"
            pager={{
              label: "특별 기록",
              index: specialRotation.index,
              total: specials.length,
              onPrev: specialRotation.prev,
              onNext: specialRotation.next,
            }}
          />
          {recordsLoadFailed ? (
            <SectionState error>명예의 전당 기록을 불러오지 못했습니다.</SectionState>
          ) : special ? (
            <SwipeArea
              enabled={specialRotation.canNavigate}
              onSwipeLeft={specialRotation.next}
              onSwipeRight={specialRotation.prev}
              ariaLabel={`특별 기록 ${specialRotation.index + 1}/${specials.length}`}
              fading={specialRotation.fading}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <SoftBadge tone="point" className="shrink-0 text-xs">
                    {special.recordTypeName}
                  </SoftBadge>
                  <p className="min-w-0 truncate text-base font-bold text-foreground">
                    {publicDisplayName(special.displayName)}
                  </p>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-pul-muted">
                  {[
                    special.courseName,
                    special.holeNumber ? `${special.holeNumber}번 홀` : undefined,
                    formatDate(special.playedOn),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "공개된 세부 정보가 없습니다"}
                </p>
              </div>
            </SwipeArea>
          ) : (
            <SectionState>아직 등록된 특별 기록이 없습니다.</SectionState>
          )}
        </section>

        <div className="border-t border-pul-border/70" aria-hidden="true" />

        <section>
          <SectionHeader
            title="이번 달 개인 순위"
            pager={{
              label: "이번 달 개인 순위",
              index: rankingRotation.index,
              total: monthlyRankings.length,
              onPrev: rankingRotation.prev,
              onNext: rankingRotation.next,
            }}
          />
          {rankingsLoadFailed ? (
            <SectionState error>이번 달 공개 순위를 불러오지 못했습니다.</SectionState>
          ) : ranking ? (
            <SwipeArea
              enabled={rankingRotation.canNavigate}
              onSwipeLeft={rankingRotation.next}
              onSwipeRight={rankingRotation.prev}
              ariaLabel={`이번 달 개인 순위 ${rankingRotation.index + 1}/${monthlyRankings.length}`}
              fading={rankingRotation.fading}
            >
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-foreground">
                  <span className="text-pul-point">{ranking.rank}위</span>
                  {" · "}
                  {publicDisplayName(ranking.label)}
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-pul-muted">
                  인증 기록 {ranking.recordCount}건
                  {ranking.recordTypeCounts.length > 0
                    ? ` · ${ranking.recordTypeCounts
                        .map((type) => `${type.name} ${type.count}건`)
                        .join(" · ")}`
                    : ""}
                </p>
              </div>
            </SwipeArea>
          ) : (
            <SectionState>이번 달 공개된 순위 기록이 없습니다.</SectionState>
          )}
        </section>

        <div className="border-t border-pul-border/70" aria-hidden="true" />

        <section>
          <SectionHeader
            title="최근 공개 기록"
            pager={{
              label: "최근 공개 기록",
              index: recentRotation.index,
              total: recentRecords.length,
              onPrev: recentRotation.prev,
              onNext: recentRotation.next,
            }}
          />
          {recordsLoadFailed ? (
            <SectionState error>최근 공개 기록을 불러오지 못했습니다.</SectionState>
          ) : recent ? (
            <SwipeArea
              enabled={recentRotation.canNavigate}
              onSwipeLeft={recentRotation.next}
              onSwipeRight={recentRotation.prev}
              ariaLabel={`최근 공개 기록 ${recentRotation.index + 1}/${recentRecords.length}`}
              fading={recentRotation.fading}
            >
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-foreground">
                  {publicDisplayName(recent.displayName)}
                  <span className="text-pul-point"> · {recent.recordTypeName}</span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-pul-muted">
                  {[recent.courseName, formatDate(recent.playedOn), recent.clubName]
                    .filter(Boolean)
                    .join(" · ") || "공개된 세부 정보가 없습니다"}
                </p>
              </div>
            </SwipeArea>
          ) : (
            <SectionState>최근 공개된 명예 기록이 없습니다.</SectionState>
          )}
        </section>

        <div className="pt-1">
          <Link
            href={HOF_MEMBER_HREF}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pul-point text-base font-bold text-white hover:bg-pul-deep"
          >
            내 기록·신청 확인
          </Link>
        </div>
      </Card>
    </div>
  );
}
