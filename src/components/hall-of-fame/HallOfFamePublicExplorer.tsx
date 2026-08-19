"use client";

import { Award, CircleAlert, MapPin, Trophy, Users } from "lucide-react";
import { useMemo, useRef, useState, type RefObject } from "react";

import { HallOfFameDialog } from "@/components/hall-of-fame/HallOfFameDialog";
import { SoftBadge } from "@/components/ui/SoftBadge";
import {
  HallOfFameMemberUiError,
  listHallOfFamePublicRankings,
  listHallOfFamePublicRecordsByType,
  type HallOfFamePublicRanking,
  type HallOfFamePublicRankingKind,
  type HallOfFamePublicRecord,
  type HallOfFamePublicRecordFilter,
} from "@/lib/hall-of-fame/hallOfFameMemberUi";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const recordFilters: ReadonlyArray<{
  value: HallOfFamePublicRecordFilter;
  label: string;
}> = [
  { value: "all", label: "전체" },
  { value: "hole_in_one", label: "홀인원" },
  { value: "albatross", label: "알바트로스" },
  { value: "condor", label: "콘도르" },
];

const rankingTabs: ReadonlyArray<{
  value: HallOfFamePublicRankingKind;
  label: string;
  description: string;
}> = [
  { value: "monthly", label: "월간", description: "이번 달 개인 기록" },
  { value: "yearly", label: "연간", description: "올해 개인 기록" },
  { value: "region", label: "지역", description: "지역별 누적 기록" },
  { value: "club", label: "동호회", description: "공개 동호회별 누적 기록" },
  { value: "course", label: "골프장", description: "골프장별 누적 기록" },
];

type LoadState = "ready" | "loading" | "error";

function formatDate(value?: string) {
  if (!value) return "날짜 비공개";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function formatTimestamp(value?: string) {
  if (!value) return undefined;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function periodTitle(kind: HallOfFamePublicRankingKind, referenceDate: string) {
  const [year, month] = referenceDate.split("-");
  if (kind === "monthly") return `${year}년 ${Number(month)}월 개인 순위`;
  if (kind === "yearly") return `${year}년 개인 순위`;
  return rankingTabs.find((tab) => tab.value === kind)?.description ?? "공개 순위";
}

function publicDisplayName(value?: string) {
  return value === "PUL member" || !value ? "PUL 회원" : value;
}

function courseDescription(record: HallOfFamePublicRecord) {
  return [
    record.courseName,
    record.courseRegion,
    record.courseLayout,
    record.courseSegment,
  ]
    .filter(Boolean)
    .join(" · ");
}

function scoreDescription(record: HallOfFamePublicRecord) {
  const details = [
    record.holeNumber ? `${record.holeNumber}번 홀` : undefined,
    record.holePar ? `파 ${record.holePar}` : undefined,
    record.strokes ? `${record.strokes}타` : undefined,
  ].filter(Boolean);
  return details.length > 0 ? details.join(" · ") : "기록 세부 정보 비공개";
}

function publicErrorMessage(error: unknown, fallback: string) {
  return error instanceof HallOfFameMemberUiError ? error.userMessage : fallback;
}

function LoadingState({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-pul-border bg-pul-page/45 px-5 py-10 text-center text-base font-semibold text-pul-muted"
    >
      {label}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-pul-border bg-pul-page/45 px-5 py-10 text-center">
      <p className="text-lg font-bold text-foreground">{title}</p>
      <p className="mt-2 text-base leading-7 text-pul-muted">{description}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-center">
      <CircleAlert className="mx-auto h-8 w-8 text-rose-700" aria-hidden="true" />
      <p className="mt-2 text-base font-bold text-rose-900">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 min-h-11 rounded-xl border border-rose-300 bg-white px-5 font-bold text-rose-800 hover:bg-rose-100"
      >
        다시 불러오기
      </button>
    </div>
  );
}

function RecordBadges({ record }: { record: HallOfFamePublicRecord }) {
  if (record.badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="획득 배지">
      {record.badges.map((badge) => (
        <span
          key={badge.code}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-sm font-bold text-amber-900 ring-1 ring-amber-200"
        >
          <Award className="h-4 w-4" aria-hidden="true" />
          {badge.name}
          {badge.sourceCount > 1 ? ` ${badge.sourceCount}회` : ""}
        </span>
      ))}
    </div>
  );
}

function RecordDetail({ record }: { record: HallOfFamePublicRecord }) {
  const environment =
    record.courseEnvironment === "outdoor"
      ? "야외"
      : record.courseEnvironment === "screen"
        ? "스크린"
        : undefined;
  const rows = [
    ["기록 종류", record.recordTypeName],
    ["기록자", publicDisplayName(record.displayName)],
    ["기록 일자", formatDate(record.playedOn)],
    ["골프장", record.courseName ?? "비공개"],
    ["지역", record.courseRegion ?? "비공개"],
    ["환경", environment ?? "비공개"],
    ["코스·구간", [record.courseLayout, record.courseSegment].filter(Boolean).join(" · ") || "비공개"],
    ["홀·기록", scoreDescription(record)],
    ["동호회", record.clubName ?? "비공개"],
    ["공개일", formatTimestamp(record.publishedAt) ?? "공식 인증 완료"],
  ] as const;

  return (
    <div>
      <div className="rounded-xl bg-pul-light/35 p-4">
        <SoftBadge tone="point">공식 인증 기록</SoftBadge>
        <dl className="mt-4 divide-y divide-pul-border/70">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
              <dt className="text-sm font-bold text-pul-muted">{label}</dt>
              <dd className="text-base font-semibold leading-6 text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-5">
        <p className="mb-3 text-sm font-bold text-pul-muted">획득 배지</p>
        {record.badges.length > 0 ? (
          <RecordBadges record={record} />
        ) : (
          <p className="text-base text-pul-muted">공개된 배지가 없습니다.</p>
        )}
      </div>
    </div>
  );
}

function RankingList({ rankings }: { rankings: HallOfFamePublicRanking[] }) {
  return (
    <ol className="grid gap-3" aria-label="명예의 전당 순위">
      {rankings.map((ranking, index) => (
        <li
          key={`${ranking.rank}-${ranking.label}-${ranking.sublabel ?? ""}-${index}`}
          className="grid gap-3 rounded-xl border border-pul-border bg-white p-4 shadow-sm sm:grid-cols-[4.5rem_1fr_auto] sm:items-center sm:gap-5"
        >
          <div className="flex items-center gap-3 sm:block sm:text-center">
            <span className="text-3xl font-black text-pul-point" aria-label={`${ranking.rank}위`}>
              {ranking.rank}
            </span>
            <span className="text-sm font-bold text-pul-muted sm:block">위</span>
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground sm:text-xl">{ranking.label}</p>
            {ranking.sublabel ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-pul-muted">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {ranking.sublabel}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {ranking.recordTypeCounts.map((item) => (
                <span key={item.code} className="rounded-full bg-pul-page px-2.5 py-1 text-sm font-semibold text-pul-muted">
                  {item.name} {item.count}건
                </span>
              ))}
            </div>
          </div>
          <p className="text-base font-bold text-pul-deep sm:text-right">
            인증 기록 <span className="text-2xl text-pul-point">{ranking.recordCount}</span>건
          </p>
        </li>
      ))}
    </ol>
  );
}

export function HallOfFamePublicExplorer({
  initialRecords,
  initialRecordsFailed,
  initialRankings,
  initialRankingsFailed,
  referenceDate,
}: {
  initialRecords: HallOfFamePublicRecord[];
  initialRecordsFailed: boolean;
  initialRankings: HallOfFamePublicRanking[];
  initialRankingsFailed: boolean;
  referenceDate: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [recordFilter, setRecordFilter] = useState<HallOfFamePublicRecordFilter>("all");
  const [records, setRecords] = useState(initialRecords);
  const [recordState, setRecordState] = useState<LoadState>(
    initialRecordsFailed ? "error" : "ready",
  );
  const [recordError, setRecordError] = useState("공개 명예 기록을 불러오지 못했습니다.");
  const [rankingKind, setRankingKind] = useState<HallOfFamePublicRankingKind>("monthly");
  const [rankings, setRankings] = useState(initialRankings);
  const [rankingState, setRankingState] = useState<LoadState>(
    initialRankingsFailed ? "error" : "ready",
  );
  const [rankingError, setRankingError] = useState("명예의 전당 순위를 불러오지 못했습니다.");
  const [detailRecord, setDetailRecord] = useState<HallOfFamePublicRecord>();
  const [detailReturnFocus, setDetailReturnFocus] = useState<HTMLElement | null>(null);
  const recordCache = useRef(
    new Map<HallOfFamePublicRecordFilter, HallOfFamePublicRecord[]>(
      initialRecordsFailed ? [] : [["all", initialRecords]],
    ),
  );
  const rankingCache = useRef(
    new Map<HallOfFamePublicRankingKind, HallOfFamePublicRanking[]>(
      initialRankingsFailed ? [] : [["monthly", initialRankings]],
    ),
  );
  const recordRequestGeneration = useRef(0);
  const rankingRequestGeneration = useRef(0);
  const recordTabRefs = useRef<Partial<Record<HallOfFamePublicRecordFilter, HTMLButtonElement>>>({});
  const rankingTabRefs = useRef<Partial<Record<HallOfFamePublicRankingKind, HTMLButtonElement>>>({});

  const loadRecords = async (nextFilter: HallOfFamePublicRecordFilter, force = false) => {
    const generation = ++recordRequestGeneration.current;
    setRecordFilter(nextFilter);
    const cached = force ? undefined : recordCache.current.get(nextFilter);
    if (cached) {
      setRecords(cached);
      setRecordState("ready");
      return;
    }
    setRecordState("loading");
    try {
      const nextRecords = await listHallOfFamePublicRecordsByType(supabase, nextFilter, 24, 0);
      if (generation !== recordRequestGeneration.current) return;
      recordCache.current.set(nextFilter, nextRecords);
      setRecords(nextRecords);
      setRecordState("ready");
    } catch (error) {
      if (generation !== recordRequestGeneration.current) return;
      setRecordError(publicErrorMessage(error, "공개 명예 기록을 불러오지 못했습니다."));
      setRecordState("error");
    }
  };

  const loadRankings = async (nextKind: HallOfFamePublicRankingKind, force = false) => {
    const generation = ++rankingRequestGeneration.current;
    setRankingKind(nextKind);
    const cached = force ? undefined : rankingCache.current.get(nextKind);
    if (cached) {
      setRankings(cached);
      setRankingState("ready");
      return;
    }
    setRankingState("loading");
    try {
      const nextRankings = await listHallOfFamePublicRankings(
        supabase,
        nextKind,
        referenceDate,
        20,
      );
      if (generation !== rankingRequestGeneration.current) return;
      rankingCache.current.set(nextKind, nextRankings);
      setRankings(nextRankings);
      setRankingState("ready");
    } catch (error) {
      if (generation !== rankingRequestGeneration.current) return;
      setRankingError(publicErrorMessage(error, "명예의 전당 순위를 불러오지 못했습니다."));
      setRankingState("error");
    }
  };

  const moveTabFocus = <T extends string>(
    entries: ReadonlyArray<{ value: T }>,
    current: T,
    key: string,
    refs: RefObject<Partial<Record<T, HTMLButtonElement>>>,
    select: (value: T) => void,
  ) => {
    const currentIndex = entries.findIndex((entry) => entry.value === current);
    let nextIndex: number | undefined;
    if (key === "ArrowRight") nextIndex = (currentIndex + 1) % entries.length;
    if (key === "ArrowLeft") nextIndex = (currentIndex - 1 + entries.length) % entries.length;
    if (key === "Home") nextIndex = 0;
    if (key === "End") nextIndex = entries.length - 1;
    if (nextIndex === undefined) return false;
    const nextValue = entries[nextIndex].value;
    select(nextValue);
    window.requestAnimationFrame(() => refs.current?.[nextValue]?.focus({ preventScroll: true }));
    return true;
  };

  return (
    <>
      <section aria-labelledby="public-hall-of-fame-title" className="mt-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-pul-point">최신 인증 기록</p>
            <h2 id="public-hall-of-fame-title" className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
              함께 축하하는 명예 기록
            </h2>
          </div>
          <p className="max-w-xl text-[15px] leading-7 text-pul-muted sm:text-right">
            공개에 동의한 정상 공식 기록만 최신 기록일 순으로 보여 드립니다.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="명예 기록 종류"
          className="mt-5 flex gap-2 overflow-x-auto pb-1"
        >
          {recordFilters.map((filter) => {
            const selected = recordFilter === filter.value;
            return (
              <button
                ref={(element) => {
                  recordTabRefs.current[filter.value] = element ?? undefined;
                }}
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="public-hall-of-fame-record-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => void loadRecords(filter.value)}
                onKeyDown={(event) => {
                  if (
                    moveTabFocus(
                      recordFilters,
                      filter.value,
                      event.key,
                      recordTabRefs,
                      (value) => void loadRecords(value),
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
                className={cn(
                  "min-h-12 shrink-0 rounded-xl border px-5 text-base font-bold",
                  selected
                    ? "border-pul-point bg-pul-point text-white"
                    : "border-pul-border bg-white text-pul-muted hover:bg-pul-light hover:text-pul-deep",
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div
          id="public-hall-of-fame-record-panel"
          role="tabpanel"
          aria-busy={recordState === "loading"}
          className="mt-5"
        >
          {recordState === "loading" ? (
            <LoadingState label="공개 명예 기록을 불러오는 중입니다." />
          ) : recordState === "error" ? (
            <ErrorState message={recordError} onRetry={() => void loadRecords(recordFilter, true)} />
          ) : records.length === 0 ? (
            <EmptyState
              title="이 종류의 공개 기록이 아직 없습니다."
              description="승인과 공개 동의가 완료된 기록이 생기면 이곳에 표시됩니다."
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {records.map((record, index) => (
                <li
                  key={`${record.recordTypeCode}-${record.playedOn ?? "private"}-${record.approvedAt}-${index}`}
                  className="flex min-w-0 flex-col rounded-2xl border border-pul-border bg-white p-5 shadow-[0_3px_16px_rgba(6,78,59,0.07)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-sm">
                        <Trophy className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold text-foreground">
                          {publicDisplayName(record.displayName)}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-pul-point">{record.recordTypeName}</p>
                      </div>
                    </div>
                    <SoftBadge tone="point" className="shrink-0 text-xs">공식 기록</SoftBadge>
                  </div>

                  <div className="mt-4 flex-1 rounded-xl bg-pul-light/30 p-4">
                    <p className="text-base font-bold text-pul-deep">{scoreDescription(record)}</p>
                    <p className="mt-2 line-clamp-2 text-[15px] leading-6 text-pul-muted">
                      {courseDescription(record) || "골프장 정보 비공개"}
                    </p>
                    <p className="mt-2 text-sm text-pul-muted">
                      {formatDate(record.playedOn)}
                      {record.clubName ? ` · ${record.clubName}` : ""}
                    </p>
                  </div>

                  <div className="mt-4"><RecordBadges record={record} /></div>
                  <button
                    type="button"
                    onClick={(event) => {
                      setDetailReturnFocus(event.currentTarget);
                      setDetailRecord(record);
                    }}
                    className="mt-4 min-h-12 rounded-xl border border-pul-point bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light"
                  >
                    상세 보기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="public-hall-of-fame-ranking-title" className="mt-10 rounded-2xl border border-pul-border bg-white p-5 shadow-[0_3px_18px_rgba(6,78,59,0.07)] sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Users className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold text-pul-point">공개 인증 기록 수 기준</p>
            <h2 id="public-hall-of-fame-ranking-title" className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
              명예 기록 순위
            </h2>
            <p className="mt-2 text-base leading-7 text-pul-muted">
              점수나 가중치 없이 공개가 허용된 정상 공식 기록 수만 집계합니다.
            </p>
          </div>
        </div>

        <div role="tablist" aria-label="명예 기록 순위 종류" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {rankingTabs.map((tab) => {
            const selected = rankingKind === tab.value;
            return (
              <button
                ref={(element) => {
                  rankingTabRefs.current[tab.value] = element ?? undefined;
                }}
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="public-hall-of-fame-ranking-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => void loadRankings(tab.value)}
                onKeyDown={(event) => {
                  if (
                    moveTabFocus(
                      rankingTabs,
                      tab.value,
                      event.key,
                      rankingTabRefs,
                      (value) => void loadRankings(value),
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
                className={cn(
                  "min-h-14 rounded-xl border px-3 py-2 text-base font-bold",
                  selected
                    ? "border-pul-point bg-pul-light text-pul-deep ring-1 ring-pul-point/20"
                    : "border-pul-border bg-white text-pul-muted hover:bg-pul-page hover:text-pul-deep",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          id="public-hall-of-fame-ranking-panel"
          role="tabpanel"
          aria-busy={rankingState === "loading"}
          className="mt-5"
        >
          <h3 className="mb-4 text-xl font-bold text-foreground">{periodTitle(rankingKind, referenceDate)}</h3>
          {rankingState === "loading" ? (
            <LoadingState label="명예 기록 순위를 불러오는 중입니다." />
          ) : rankingState === "error" ? (
            <ErrorState message={rankingError} onRetry={() => void loadRankings(rankingKind, true)} />
          ) : rankings.length === 0 ? (
            <EmptyState title="표시할 순위가 아직 없습니다." description="공개 인증 기록이 생기면 순위가 자동으로 집계됩니다." />
          ) : (
            <RankingList rankings={rankings} />
          )}
        </div>
      </section>

      {detailRecord ? (
        <HallOfFameDialog
          title={`${detailRecord.recordTypeName} 상세`}
          description="공개에 동의한 공식 기록 정보입니다."
          busy={false}
          returnFocus={detailReturnFocus}
          onClose={() => setDetailRecord(undefined)}
        >
          <RecordDetail record={detailRecord} />
        </HallOfFameDialog>
      ) : null}
    </>
  );
}
