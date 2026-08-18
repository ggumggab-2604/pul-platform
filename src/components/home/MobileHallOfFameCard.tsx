"use client";

import { SoftBadge } from "@/components/ui/SoftBadge";
import { Card } from "@/components/ui/Card";
import { InfoModal } from "@/components/ui/InfoModal";
import { hallOfFamePortalData } from "@/data/homeData";
import {
  useElementInView,
  useHofSectionRotation,
  usePageVisible,
  usePrefersReducedMotion,
} from "@/hooks/useHofSectionRotation";
import { cn } from "@/lib/utils";
import type {
  ClubBestScore,
  SpecialRecord,
  SpecialRecordType,
  TournamentWinner,
} from "@/types";
import Link from "next/link";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";

const specialTypeLabels: Record<SpecialRecordType, string> = {
  holeInOne: "홀인원",
  albatross: "알바트로스",
  condor: "콘도르",
};

const SPECIAL_TYPES = new Set<SpecialRecordType>([
  "holeInOne",
  "albatross",
  "condor",
]);

const HOF_VIEW_HREF = "/hall-of-fame";
const MOBILE_HOF_MAX = 10;
const SWIPE_THRESHOLD_PX = 48;

/** Stagger: special immediate, club +2.5s, tournament +4.5s */
const STAGGER_SPECIAL_MS = 0;
const STAGGER_CLUB_MS = 2500;
const STAGGER_TOURNAMENT_MS = 4500;

const FADE_CLASS = "duration-[320ms]";
/** Fixed record slot — prevents CTA bounce when text length changes */
const RECORD_AREA_CLASS = "h-[4.5rem]";
const TOURNAMENT_AREA_CLASS = "h-[4.75rem]";

const SUBMIT_MESSAGE =
  "내 기록 자랑하기 기능은 준비 중입니다.\n홀인원·알바트로스·콘도르 등 특별 기록은 정식 오픈 후 등록할 수 있습니다.";

function parseRecordDate(date?: string): number {
  if (!date) return 0;
  const normalized = date.replace(/\./g, "-");
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? 0 : time;
}

/** Newest-first approved specials, max 10 — no fabricated fillers */
export function prepareMobileSpecialRecords(
  records: SpecialRecord[],
): SpecialRecord[] {
  return [...records]
    .filter((r) => SPECIAL_TYPES.has(r.type))
    .sort(
      (a, b) => parseRecordDate(b.recordDate) - parseRecordDate(a.recordDate),
    )
    .slice(0, MOBILE_HOF_MAX);
}

/**
 * This month club lows — prefer club diversity (round-robin by club),
 * then fill remaining; max 10; no duplicate cloning.
 */
export function prepareMobileClubBestScores(
  scores: ClubBestScore[],
): ClubBestScore[] {
  if (scores.length === 0) return [];

  const byClub = new Map<string, ClubBestScore[]>();
  for (const item of scores) {
    const list = byClub.get(item.clubName) ?? [];
    list.push(item);
    byClub.set(item.clubName, list);
  }

  const queues = [...byClub.values()].map((list) => [...list]);
  const result: ClubBestScore[] = [];
  let guard = 0;
  while (result.length < MOBILE_HOF_MAX && queues.some((q) => q.length > 0)) {
    const q = queues[guard % queues.length];
    if (q.length > 0) {
      result.push(q.shift()!);
    }
    guard += 1;
    if (guard > scores.length * 4) break;
  }
  return result;
}

/** Newest-first winners; skip duplicate tournament+winner; max 10 */
export function prepareMobileTournamentWinners(
  winners: TournamentWinner[],
): TournamentWinner[] {
  const sorted = [...winners].sort(
    (a, b) => parseRecordDate(b.winDate) - parseRecordDate(a.winDate),
  );
  const seen = new Set<string>();
  const result: TournamentWinner[] = [];
  for (const w of sorted) {
    const key = `${w.tournamentName}\0${w.winnerName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(w);
    if (result.length >= MOBILE_HOF_MAX) break;
  }
  return result;
}

/** Module-stable lists — safe as effect-adjacent inputs */
const DEFAULT_SPECIAL = prepareMobileSpecialRecords(
  hallOfFamePortalData.specialRecords,
);
const DEFAULT_CLUB = prepareMobileClubBestScores(
  hallOfFamePortalData.clubBestScores,
);
const DEFAULT_TOURNAMENT = prepareMobileTournamentWinners(
  hallOfFamePortalData.tournamentWinners,
);

type MobileHallOfFameCardProps = {
  specialRecords?: SpecialRecord[];
  clubBestScores?: ClubBestScore[];
  tournamentWinners?: TournamentWinner[];
};

type SectionPagerProps = {
  label: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
};

function SectionPager({
  label,
  index,
  total,
  onPrev,
  onNext,
}: SectionPagerProps) {
  if (total <= 1) return null;
  return (
    <div className="-mr-1.5 flex shrink-0 items-center">
      <button
        type="button"
        onClick={onPrev}
        aria-label={`${label} 이전 기록`}
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
        aria-label={`${label} 다음 기록`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-lg font-bold text-pul-deep hover:bg-pul-light"
      >
        ›
      </button>
    </div>
  );
}

type SectionHeaderProps = {
  title: string;
  pager?: SectionPagerProps | null;
};

function SectionHeader({ title, pager }: SectionHeaderProps) {
  return (
    <div className="mb-1.5 flex min-h-10 items-center justify-between gap-2">
      <h3 className="min-w-0 truncate text-sm font-bold text-pul-deep">
        {title}
      </h3>
      {pager && pager.total > 1 ? <SectionPager {...pager} /> : null}
    </div>
  );
}

type SwipeAreaProps = {
  children: ReactNode;
  className?: string;
  enabled: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  ariaLabel: string;
};

function SwipeArea({
  children,
  className,
  enabled,
  onSwipeLeft,
  onSwipeRight,
  ariaLabel,
}: SwipeAreaProps) {
  const startX = useRef<number | null>(null);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      startX.current = e.changedTouches[0]?.clientX ?? null;
    },
    [enabled],
  );

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!enabled || startX.current === null) return;
      const endX = e.changedTouches[0]?.clientX ?? startX.current;
      const delta = endX - startX.current;
      startX.current = null;
      if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
      if (delta < 0) onSwipeLeft();
      else onSwipeRight();
    },
    [enabled, onSwipeLeft, onSwipeRight],
  );

  return (
    <div
      className={className}
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

export function MobileHallOfFameCard({
  specialRecords,
  clubBestScores,
  tournamentWinners,
}: MobileHallOfFameCardProps = {}) {
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const specials = useMemo(
    () =>
      specialRecords
        ? prepareMobileSpecialRecords(specialRecords)
        : DEFAULT_SPECIAL,
    [specialRecords],
  );
  const clubs = useMemo(
    () =>
      clubBestScores
        ? prepareMobileClubBestScores(clubBestScores)
        : DEFAULT_CLUB,
    [clubBestScores],
  );
  const tournaments = useMemo(
    () =>
      tournamentWinners
        ? prepareMobileTournamentWinners(tournamentWinners)
        : DEFAULT_TOURNAMENT,
    [tournamentWinners],
  );

  const reducedMotion = usePrefersReducedMotion();
  const pageVisible = usePageVisible();
  const inView = useElementInView(cardRef);
  const autoPlay = inView && pageVisible && !reducedMotion;

  const specialRot = useHofSectionRotation({
    count: specials.length,
    startDelayMs: STAGGER_SPECIAL_MS,
    autoPlay,
    instant: reducedMotion,
  });
  const clubRot = useHofSectionRotation({
    count: clubs.length,
    startDelayMs: STAGGER_CLUB_MS,
    autoPlay,
    instant: reducedMotion,
  });
  const tournamentRot = useHofSectionRotation({
    count: tournaments.length,
    startDelayMs: STAGGER_TOURNAMENT_MS,
    autoPlay,
    instant: reducedMotion,
  });

  const special = specials[specialRot.index] ?? null;
  const clubBest = clubs[clubRot.index] ?? null;
  const tournament = tournaments[tournamentRot.index] ?? null;

  return (
    <>
      <div ref={cardRef}>
        <Card
          dense
          title="명예의 전당"
          action={
            <Link
              href={HOF_VIEW_HREF}
              className="text-sm font-semibold text-pul-point hover:underline"
            >
              전체보기
            </Link>
          }
          bodyClassName="space-y-3 p-3.5"
        >
          {/* 1 · 특별 기록 */}
          <section>
            <SectionHeader
              title="특별 기록"
              pager={{
                label: "특별 기록",
                index: specialRot.index,
                total: specials.length,
                onPrev: specialRot.prev,
                onNext: specialRot.next,
              }}
            />
            {special ? (
              <SwipeArea
                enabled={specialRot.canNavigate}
                onSwipeLeft={specialRot.next}
                onSwipeRight={specialRot.prev}
                ariaLabel={`특별 기록 ${specialRot.index + 1}/${specials.length}`}
                className={cn(
                  "overflow-hidden",
                  RECORD_AREA_CLASS,
                  "transition-opacity",
                  FADE_CLASS,
                  specialRot.fading ? "opacity-0" : "opacity-100",
                )}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <SoftBadge tone="point" className="shrink-0 text-xs">
                      {specialTypeLabels[special.type]}
                    </SoftBadge>
                    <p className="min-w-0 truncate text-base font-bold text-foreground">
                      {special.memberName}
                    </p>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-pul-muted">
                    {[
                      special.courseName,
                      special.hole,
                      special.recordDate ?? special.clubName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </SwipeArea>
            ) : (
              <div
                className={cn(
                  RECORD_AREA_CLASS,
                  "flex flex-col justify-center overflow-hidden rounded-lg border border-dashed border-pul-border/80 bg-pul-page/40 px-3",
                )}
              >
                <p className="text-sm font-semibold text-pul-muted">
                  아직 등록된 특별 기록이 없습니다.
                </p>
                <p className="mt-0.5 truncate text-sm text-pul-muted">
                  첫 기록의 주인공이 되어보세요.
                </p>
              </div>
            )}
          </section>

          <div className="border-t border-pul-border/70" aria-hidden="true" />

          {/* 2 · 이번 달 동호회 최저타수 */}
          <section>
            <SectionHeader
              title="이번 달 동호회 최저타수"
              pager={{
                label: "동호회 최저타수",
                index: clubRot.index,
                total: clubs.length,
                onPrev: clubRot.prev,
                onNext: clubRot.next,
              }}
            />
            {clubBest ? (
              <SwipeArea
                enabled={clubRot.canNavigate}
                onSwipeLeft={clubRot.next}
                onSwipeRight={clubRot.prev}
                ariaLabel={`동호회 최저타수 ${clubRot.index + 1}/${clubs.length}`}
                className={cn(
                  "overflow-hidden",
                  RECORD_AREA_CLASS,
                  "transition-opacity",
                  FADE_CLASS,
                  clubRot.fading ? "opacity-0" : "opacity-100",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-foreground">
                    {clubBest.memberName}
                    <span className="text-pul-point">
                      {" "}
                      · {clubBest.score}타
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-pul-muted">
                    {[
                      clubBest.clubName,
                      clubBest.recordMonth,
                      clubBest.courseName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </SwipeArea>
            ) : (
              <div className={cn(RECORD_AREA_CLASS, "flex items-center")}>
                <p className="text-sm text-pul-muted">
                  아직 등록된 기록이 없습니다.
                </p>
              </div>
            )}
          </section>

          <div className="border-t border-pul-border/70" aria-hidden="true" />

          {/* 3 · 최근 대회 우승자 */}
          <section>
            <SectionHeader
              title="최근 대회 우승자"
              pager={{
                label: "대회 우승자",
                index: tournamentRot.index,
                total: tournaments.length,
                onPrev: tournamentRot.prev,
                onNext: tournamentRot.next,
              }}
            />
            {tournament ? (
              <SwipeArea
                enabled={tournamentRot.canNavigate}
                onSwipeLeft={tournamentRot.next}
                onSwipeRight={tournamentRot.prev}
                ariaLabel={`최근 대회 우승자 ${tournamentRot.index + 1}/${tournaments.length}`}
                className={cn(
                  "overflow-hidden",
                  TOURNAMENT_AREA_CLASS,
                  "transition-opacity",
                  FADE_CLASS,
                  tournamentRot.fading ? "opacity-0" : "opacity-100",
                )}
              >
                <div className="min-w-0">
                  <p className="line-clamp-2 text-base font-bold text-foreground">
                    {tournament.tournamentName}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-pul-muted">
                    {[
                      tournament.winnerName,
                      tournament.clubName,
                      tournament.courseName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </SwipeArea>
            ) : (
              <div className={cn(TOURNAMENT_AREA_CLASS, "flex items-center")}>
                <p className="text-sm text-pul-muted">
                  아직 등록된 우승자가 없습니다.
                </p>
              </div>
            )}
          </section>

          {/* Footer CTA */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pul-point text-base font-bold text-white hover:bg-pul-deep"
            >
              내 기록 자랑하기
            </button>
          </div>
        </Card>
      </div>

      {showSubmitModal ? (
        <InfoModal
          title="내 기록 자랑하기"
          message={SUBMIT_MESSAGE}
          onClose={() => setShowSubmitModal(false)}
        />
      ) : null}
    </>
  );
}
