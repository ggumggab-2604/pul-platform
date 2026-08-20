import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { SoftBadge } from "@/components/ui/SoftBadge";
import type {
  HomeHallOfFameRanking,
  HomeHallOfFameRecord,
} from "@/lib/home/homeAggregation";
import { cn } from "@/lib/utils";

const specialTypes = [
  { code: "hole_in_one", label: "홀인원" },
  { code: "albatross", label: "알바트로스" },
  { code: "condor", label: "콘도르" },
] as const;

const profileColors = [
  "from-emerald-400 to-pul-deep",
  "from-teal-400 to-emerald-700",
  "from-lime-400 to-green-700",
];

const SPECIAL_ROW =
  "flex h-[52px] min-h-[52px] max-h-[52px] items-center gap-2 overflow-hidden";

type HallOfFameSectionProps = {
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

function Avatar({ name, index }: { name: string; index: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm ring-2 ring-white",
        profileColors[index % profileColors.length],
      )}
    >
      {name.charAt(0)}
    </span>
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
  label,
  extraCount,
  index,
}: {
  record: HomeHallOfFameRecord;
  label: string;
  extraCount: number;
  index: number;
}) {
  const name = publicDisplayName(record.displayName);
  return (
    <li className={SPECIAL_ROW}>
      <Avatar name={name} index={index} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-center gap-1.5">
          <SoftBadge tone="point" className="shrink-0 text-xs">
            {label}
          </SoftBadge>
          <p className="min-w-0 truncate text-sm font-bold text-foreground">{name}</p>
          <ExtraCount count={extraCount} />
        </div>
        <p className="truncate text-xs leading-snug text-pul-muted lg:text-sm">
          {[
            record.courseName,
            record.holeNumber ? `${record.holeNumber}번 홀` : undefined,
            formatDate(record.playedOn),
          ]
            .filter(Boolean)
            .join(" · ") || "공개된 세부 정보가 없습니다"}
        </p>
      </div>
    </li>
  );
}

function SpecialEmptyRow({ label }: { label: string }) {
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
            {label}
          </SoftBadge>
          <span className="truncate text-sm font-semibold text-pul-muted">
            등록된 기록이 없습니다
          </span>
        </div>
        <p className="truncate text-xs text-pul-muted lg:text-sm">
          첫 공개 기록을 기다리고 있습니다
        </p>
      </div>
    </li>
  );
}

function SectionMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <p
      className={cn(
        "rounded-lg border border-dashed px-3 py-3 text-sm",
        error
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-pul-border bg-pul-page/40 text-pul-muted",
      )}
      role={error ? "alert" : undefined}
    >
      {children}
    </p>
  );
}

function RankingRow({ item, index }: { item: HomeHallOfFameRanking; index: number }) {
  const name = publicDisplayName(item.label);
  const summary = item.recordTypeCounts
    .map((type) => `${type.name} ${type.count}건`)
    .join(" · ");
  return (
    <li className="flex h-[44px] min-h-[44px] max-h-[44px] items-center gap-2 overflow-hidden">
      <span className="w-6 shrink-0 text-center text-base font-black text-pul-point">
        {item.rank}
      </span>
      <Avatar name={name} index={index} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-sm font-bold text-foreground">
          {name}
          <span className="text-pul-point"> · {item.recordCount}건</span>
        </p>
        <p className="truncate text-xs leading-snug text-pul-muted lg:text-sm">
          {[item.sublabel, summary].filter(Boolean).join(" · ")}
        </p>
      </div>
    </li>
  );
}

function RecentRecordRow({
  record,
  index,
}: {
  record: HomeHallOfFameRecord;
  index: number;
}) {
  const name = publicDisplayName(record.displayName);
  return (
    <li className="flex h-[44px] min-h-[44px] max-h-[44px] items-center gap-2 overflow-hidden">
      <Avatar name={name} index={index} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-sm font-bold text-foreground">
          {name}
          <span className="text-pul-point"> · {record.recordTypeName}</span>
        </p>
        <p className="truncate text-xs leading-snug text-pul-muted lg:text-sm">
          {[record.courseName, formatDate(record.playedOn), record.clubName]
            .filter(Boolean)
            .join(" · ") || "공개된 세부 정보가 없습니다"}
        </p>
      </div>
    </li>
  );
}

export function HallOfFameSection({
  records,
  rankings,
  recordsLoadFailed,
  rankingsLoadFailed,
}: HallOfFameSectionProps) {
  const rankingVisible = rankings.slice(0, 2);
  const recentVisible = records.slice(0, 2);

  return (
    <Card
      dense
      className="flex h-full min-h-0 flex-col overflow-hidden"
      title="명예의 전당"
      action={
        <Link href="/hall-of-fame" className="text-sm font-semibold text-pul-point hover:underline">
          전체보기
        </Link>
      }
      bodyClassName={cn(
        "grid min-h-0 flex-1 overflow-hidden p-3",
        "grid-rows-[minmax(0,1.3fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto]",
      )}
    >
      <section className="flex min-h-0 flex-col overflow-hidden">
        <SectionTitle>특별 기록</SectionTitle>
        {recordsLoadFailed ? (
          <SectionMessage error>
            명예의 전당 기록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
          </SectionMessage>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col justify-start gap-1.5 overflow-hidden">
            {specialTypes.map(({ code, label }, index) => {
              const matches = records.filter((record) => record.recordTypeCode === code);
              const record = matches[0];
              return record ? (
                <SpecialRecordRow
                  key={code}
                  record={record}
                  label={label}
                  extraCount={Math.max(0, matches.length - 1)}
                  index={index}
                />
              ) : (
                <SpecialEmptyRow key={code} label={label} />
              );
            })}
          </ul>
        )}
        <Link
          href="/hall-of-fame#my-hall-of-fame"
          className="mt-1.5 shrink-0 truncate text-sm font-semibold text-pul-point hover:underline"
        >
          내 기록·신청 확인
        </Link>
      </section>

      <div className="my-2 shrink-0 border-t border-pul-border/70" aria-hidden="true" />

      <section className="flex min-h-0 flex-col overflow-hidden">
        <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
          <h3 className="truncate text-sm font-bold text-pul-deep lg:text-base">
            이번 달 개인 순위
          </h3>
          <ExtraCount count={Math.max(0, rankings.length - 2)} />
        </div>
        {rankingsLoadFailed ? (
          <SectionMessage error>이번 달 공개 순위를 불러오지 못했습니다.</SectionMessage>
        ) : rankingVisible.length === 0 ? (
          <SectionMessage>이번 달 공개된 순위 기록이 없습니다.</SectionMessage>
        ) : (
          <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
            {rankingVisible.map((item, index) => (
              <RankingRow
                key={`${item.rank}-${item.label}-${item.sublabel ?? ""}`}
                item={item}
                index={index}
              />
            ))}
          </ol>
        )}
      </section>

      <div className="my-2 shrink-0 border-t border-pul-border/70" aria-hidden="true" />

      <section className="flex min-h-0 flex-col overflow-hidden">
        <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
          <h3 className="truncate text-sm font-bold text-pul-deep lg:text-base">
            최근 공개 기록
          </h3>
          <ExtraCount count={Math.max(0, records.length - 2)} />
        </div>
        {recordsLoadFailed ? (
          <SectionMessage error>최근 공개 기록을 불러오지 못했습니다.</SectionMessage>
        ) : recentVisible.length === 0 ? (
          <SectionMessage>최근 공개된 명예 기록이 없습니다.</SectionMessage>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
            {recentVisible.map((record, index) => (
              <RecentRecordRow
                key={`${record.recordTypeCode}-${record.playedOn ?? ""}-${record.displayName ?? ""}-${index}`}
                record={record}
                index={index}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="mt-2 shrink-0 pt-1">
        <Link
          href="/hall-of-fame"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
        >
          명예의 전당 전체보기
        </Link>
      </div>
    </Card>
  );
}
