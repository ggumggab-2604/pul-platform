"use client";

import { SoftBadge } from "@/components/ui/SoftBadge";
import { Card } from "@/components/ui/Card";
import { hallOfFamePeople, hallOfFamePortalData } from "@/data/homeData";
import { cn } from "@/lib/utils";
import type {
  ClubBestScore,
  HallOfFameTab,
  SpecialRecord,
  SpecialRecordType,
  TournamentWinner,
} from "@/types";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

const mobileTabs: { key: HallOfFameTab; label: string }[] = [
  { key: "holeInOne", label: "홀인원" },
  { key: "bestScore", label: "베스트스코어" },
  { key: "winner", label: "우승자" },
];

const medalStyles = [
  "bg-gradient-to-br from-amber-300 to-amber-600 text-amber-950 ring-1 ring-amber-200/80",
  "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 ring-1 ring-slate-300/80",
  "bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950 ring-1 ring-orange-200/80",
];

const profileColors = [
  "from-emerald-400 to-pul-deep",
  "from-teal-400 to-emerald-700",
  "from-lime-400 to-green-700",
];

const specialTypeLabels: Record<SpecialRecordType, string> = {
  holeInOne: "홀인원",
  albatross: "알바트로스",
  condor: "콘도르",
};

const SPECIAL_TYPES: SpecialRecordType[] = ["holeInOne", "albatross", "condor"];
const CLUB_BEST_LIMIT = 2;
const TOURNAMENT_LIMIT = 2;

/** 특별 기록 1행 고정 높이 — 데이터 유무와 무관하게 동일 */
const SPECIAL_ROW =
  "flex h-[52px] min-h-[52px] max-h-[52px] items-center gap-2 overflow-hidden";

type HallOfFameSectionProps = {
  /** PC 포털용 레이아웃 (모바일 기본 UI와 분리) */
  portal?: boolean;
};

function Avatar({ name, index, size = "sm" }: { name: string; index: number; size?: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm ring-2 ring-white",
        size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-base",
        profileColors[index % profileColors.length],
      )}
    >
      {name.charAt(0)}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-1.5 shrink-0 text-sm font-bold text-pul-deep lg:text-base">
      {children}
    </h3>
  );
}

function ExtraCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="shrink-0 text-xs font-semibold text-pul-point lg:text-sm">
      외 {count}건
    </span>
  );
}

function SpecialRecordRow({
  record,
  extraCount,
  index,
}: {
  record: SpecialRecord;
  extraCount: number;
  index: number;
}) {
  return (
    <li className={SPECIAL_ROW}>
      <Avatar name={record.memberName} index={index} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-center gap-1.5">
          <SoftBadge tone="point" className="shrink-0 text-xs">
            {specialTypeLabels[record.type]}
          </SoftBadge>
          <p className="min-w-0 truncate text-sm font-bold text-foreground">
            {record.memberName}
          </p>
          <ExtraCount count={extraCount} />
        </div>
        <p className="truncate text-xs leading-snug text-pul-muted lg:text-sm">
          {[record.courseName, record.hole].filter(Boolean).join(" · ")}
        </p>
      </div>
    </li>
  );
}

function EmptyTypeRow({ type }: { type: SpecialRecordType }) {
  return (
    <li
      className={cn(
        SPECIAL_ROW,
        "rounded-lg border border-dashed border-pul-border/80 bg-pul-page/40 px-2",
      )}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-center gap-1.5">
          <SoftBadge tone="muted" className="shrink-0 text-xs">
            {specialTypeLabels[type]}
          </SoftBadge>
          <span className="truncate text-sm font-semibold text-pul-muted">
            등록된 기록이 없습니다
          </span>
        </div>
        <p className="truncate text-xs text-pul-muted lg:text-sm">
          첫 기록을 기다리고 있습니다
        </p>
      </div>
    </li>
  );
}

function ClubBestRow({ item, index }: { item: ClubBestScore; index: number }) {
  return (
    <li className="flex h-[44px] min-h-[44px] max-h-[44px] items-center gap-2 overflow-hidden">
      <Avatar name={item.memberName} index={index} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-sm font-bold text-foreground">
          {item.memberName}
          <span className="text-pul-point"> · {item.score}타</span>
        </p>
        <p className="truncate text-xs leading-snug text-pul-muted lg:text-sm">
          {[item.clubName, item.courseName, item.recordMonth].filter(Boolean).join(" · ")}
        </p>
      </div>
    </li>
  );
}

function TournamentWinnerRow({
  item,
  index,
}: {
  item: TournamentWinner;
  index: number;
}) {
  return (
    <li className="flex h-[44px] min-h-[44px] max-h-[44px] items-center gap-2 overflow-hidden">
      <Avatar name={item.winnerName} index={index} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-sm font-bold text-foreground">{item.winnerName}</p>
        <p className="truncate text-xs leading-snug text-pul-muted lg:text-sm">
          {[item.tournamentName, item.clubName, item.winDate].filter(Boolean).join(" · ")}
        </p>
      </div>
    </li>
  );
}

/** PC 포털 — 그리드 고정 높이, 데이터 증가해도 카드 높이 불변 */
function PortalHallOfFame() {
  const { specialRecords, clubBestScores, tournamentWinners } = hallOfFamePortalData;

  const clubVisible = clubBestScores.slice(0, CLUB_BEST_LIMIT);
  const clubExtra = Math.max(0, clubBestScores.length - CLUB_BEST_LIMIT);
  const tournamentVisible = tournamentWinners.slice(0, TOURNAMENT_LIMIT);
  const tournamentExtra = Math.max(0, tournamentWinners.length - TOURNAMENT_LIMIT);

  return (
    <Card
      dense
      className="flex h-full min-h-0 flex-col overflow-hidden"
      title="명예의 전당"
      action={
        <Link
          href="/community"
          className="text-sm font-semibold text-pul-point hover:underline"
        >
          전체보기
        </Link>
      }
      bodyClassName={cn(
        "grid min-h-0 flex-1 overflow-hidden p-3",
        "grid-rows-[minmax(0,1.3fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto]",
      )}
    >
      {/* 1 · 특별 기록 (3행 고정) */}
      <section className="flex min-h-0 flex-col overflow-hidden">
        <SectionTitle>특별 기록</SectionTitle>
        <ul className="flex min-h-0 flex-1 flex-col justify-start gap-1.5 overflow-hidden">
          {SPECIAL_TYPES.map((type, index) => {
            const ofType = specialRecords.filter((r) => r.type === type);
            const record = ofType[0];
            if (!record) {
              return <EmptyTypeRow key={type} type={type} />;
            }
            return (
              <SpecialRecordRow
                key={type}
                record={record}
                extraCount={Math.max(0, ofType.length - 1)}
                index={index}
              />
            );
          })}
        </ul>
        <Link
          href="/community"
          className="mt-1.5 shrink-0 truncate text-sm font-semibold text-pul-point hover:underline"
        >
          기록 등록하기
        </Link>
      </section>

      <div className="my-2 shrink-0 border-t border-pul-border/70" aria-hidden="true" />

      {/* 2 · 동호회 베스트 (최대 2건) */}
      <section className="flex min-h-0 flex-col overflow-hidden">
        <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
          <h3 className="truncate text-sm font-bold text-pul-deep lg:text-base">
            이번 달 동호회 베스트
          </h3>
          <ExtraCount count={clubExtra} />
        </div>
        {clubVisible.length === 0 ? (
          <p className="truncate text-sm text-pul-muted">아직 등록된 기록이 없습니다.</p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
            {clubVisible.map((item, index) => (
              <ClubBestRow key={item.id} item={item} index={index} />
            ))}
          </ul>
        )}
      </section>

      <div className="my-2 shrink-0 border-t border-pul-border/70" aria-hidden="true" />

      {/* 3 · 대회 우승자 (최대 2건) */}
      <section className="flex min-h-0 flex-col overflow-hidden">
        <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
          <h3 className="truncate text-sm font-bold text-pul-deep lg:text-base">
            최근 대회 우승자
          </h3>
          <ExtraCount count={tournamentExtra} />
        </div>
        {tournamentVisible.length === 0 ? (
          <p className="truncate text-sm text-pul-muted">아직 등록된 우승자가 없습니다.</p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
            {tournamentVisible.map((item, index) => (
              <TournamentWinnerRow key={item.id} item={item} index={index} />
            ))}
          </ul>
        )}
      </section>

      {/* 4 · 전체보기 (항상 하단 고정) */}
      <div className="mt-2 shrink-0 pt-1">
        <Link
          href="/community"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
        >
          명예의 전당 전체보기
        </Link>
      </div>
    </Card>
  );
}

/** 모바일 — 기존 3탭 UI 유지 */
function MobileHallOfFame() {
  const [activeTab, setActiveTab] = useState<HallOfFameTab>("holeInOne");

  const filtered = useMemo(
    () => hallOfFamePeople.filter((p) => p.tab === activeTab),
    [activeTab],
  );

  return (
    <Card
      dense
      fullHeight
      className="lg:min-h-[400px]"
      title="명예의 전당"
      bodyClassName="flex flex-1 flex-col p-3.5"
    >
      <div className="mb-3 flex gap-1.5">
        {mobileTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-bold transition-colors lg:text-sm",
              activeTab === tab.key
                ? "bg-pul-deep text-white shadow-sm"
                : "bg-pul-light text-pul-muted hover:text-pul-deep",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ul className="flex-1 space-y-2">
        {filtered.map((person, index) => (
          <li
            key={person.id}
            className="flex items-center gap-3 rounded-lg border border-pul-border/70 bg-white px-2.5 py-2.5 shadow-[0_1px_4px_rgba(6,78,59,0.04)]"
          >
            <div className="relative shrink-0">
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-base font-bold text-white shadow-md ring-2 ring-white",
                  profileColors[index % profileColors.length],
                )}
              >
                {person.name.charAt(0)}
              </div>
              <span
                className={cn(
                  "absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black shadow-sm",
                  medalStyles[index] ?? medalStyles[2],
                )}
              >
                {index + 1}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">{person.name}</p>
              <p className="truncate text-xs text-pul-muted">{person.achievement}</p>
            </div>
            {index === 0 ? (
              <span className="shrink-0 rounded-full bg-pul-gold/20 px-2 py-0.5 text-[10px] font-bold text-pul-gold">
                TOP
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function HallOfFameSection({ portal = false }: HallOfFameSectionProps) {
  if (portal) {
    return <PortalHallOfFame />;
  }
  return <MobileHallOfFame />;
}
