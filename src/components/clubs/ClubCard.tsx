import { HomeCourseLink } from "@/components/clubs/HomeCourseLink";
import {
  clubEventOperationFilters,
  clubEventStatusLabels,
  memberStyleLabels,
  recruitStatusLabels,
  recruitStatusStyles,
} from "@/data/clubData";
import { cn } from "@/lib/utils";
import type { ParkGolfClub } from "@/types";
import Link from "next/link";

type RecruitStatusBadgeProps = {
  status: ParkGolfClub["recruitStatus"];
  compact?: boolean;
};

export function RecruitStatusBadge({ status, compact = false }: RecruitStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md font-bold",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        recruitStatusStyles[status],
      )}
    >
      {recruitStatusLabels[status]}
    </span>
  );
}

function getCoreTags(club: ParkGolfClub): string[] {
  const tags: string[] = [];

  for (const style of club.memberStyles) {
    const label = memberStyleLabels[style];
    if (!tags.includes(label)) tags.push(label);
    if (tags.length >= 3) return tags;
  }

  if (club.beginnerFriendly && !tags.includes("초보 환영")) {
    tags.push("초보 환영");
  }

  return tags.slice(0, 3);
}

function ClubEventSummary({ club }: { club: ParkGolfClub }) {
  return (
    <div className="mt-2 rounded-md border border-pul-border/60 bg-pul-page/50 px-2 py-1.5 lg:px-2.5 lg:py-2">
      <p className="text-[10px] leading-snug text-pul-muted lg:text-xs">
        최근 행사{" "}
        <span className="font-medium text-foreground">{club.recentEvent}</span>
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-pul-muted lg:text-xs">
        다음 월례회{" "}
        <span className="font-medium text-foreground">{club.nextMonthlyMeeting}</span>
      </p>
      <p className="mt-1 text-[10px] font-semibold text-pul-deep lg:text-xs">
        {clubEventStatusLabels[club.eventStatus]}
      </p>
    </div>
  );
}

type ClubCardProps = {
  club: ParkGolfClub;
  onApply: (club: ParkGolfClub) => void;
  onDetail: (club: ParkGolfClub) => void;
  featured?: boolean;
};

export function ClubCard({
  club,
  onApply,
  onDetail,
  featured = false,
}: ClubCardProps) {
  const coreTags = getCoreTags(club);

  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)] transition-shadow hover:shadow-[0_4px_16px_rgba(6,78,59,0.1)]",
        featured && "lg:ring-1 lg:ring-pul-point/15",
      )}
    >
      {/* 모바일: 핵심 정보만 컴팩트 표시 */}
      <div className="lg:hidden">
        <div className="px-2.5 py-2">
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold leading-tight text-foreground">
                {club.name}
              </h3>
              <p className="mt-0.5 text-[11px] font-medium leading-snug text-pul-deep">
                {club.regionLabel}
              </p>
            </div>
            <RecruitStatusBadge status={club.recruitStatus} compact />
          </div>

          <dl className="mt-1.5 space-y-0.5 text-xs leading-snug">
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-pul-muted">활동 구장</dt>
              <dd className="min-w-0 truncate font-medium text-foreground">
                {club.homeCourse}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-pul-muted">회원 수</dt>
              <dd className="font-medium text-foreground">{club.memberCount}명</dd>
            </div>
          </dl>

          {coreTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {coreTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-pul-light/80 px-1.5 py-0.5 text-[10px] font-semibold text-pul-deep"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <ClubEventSummary club={club} />
        </div>

        <div className="flex gap-1.5 border-t border-pul-border/80 px-2.5 py-2">
          <button
            type="button"
            onClick={() => onApply(club)}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-pul-point text-xs font-bold text-white transition-colors hover:bg-pul-deep"
          >
            가입 신청
          </button>
          <Link
            href={`/clubs/${club.id}`}
            onClick={() => onDetail(club)}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-xs font-bold text-pul-deep transition-colors hover:border-pul-point/40"
          >
            자세히 보기
          </Link>
        </div>
      </div>

      {/* PC: 기존 상세 카드 유지 */}
      <div className="hidden h-full flex-col lg:flex">
        <div className="border-b border-pul-border/60 bg-gradient-to-r from-pul-light/50 to-white px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold leading-snug text-foreground">
                {club.name}
              </h3>
              <p className="mt-1 text-sm text-pul-muted">{club.regionLabel}</p>
            </div>
            <RecruitStatusBadge status={club.recruitStatus} />
          </div>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <dl className="space-y-2 text-sm">
            <div className="flex flex-row items-center justify-between">
              <dt className="shrink-0 text-sm font-medium text-pul-muted">활동 구장</dt>
              <dd className="min-w-0">
                <HomeCourseLink
                  courseName={club.homeCourse}
                  courseId={club.homeCourseId}
                  compact
                />
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium text-pul-muted">회원 수</dt>
              <dd className="font-medium text-foreground">{club.memberCount}명</dd>
            </div>
            {!featured && (
              <>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 font-medium text-pul-muted">활동 요일</dt>
                  <dd className="font-medium text-foreground">
                    {club.scheduleLabel} (
                    {club.schedule === "weekday"
                      ? "평일"
                      : club.schedule === "weekend"
                        ? "주말"
                        : "평일+주말"}
                    )
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 font-medium text-pul-muted">활동 시간</dt>
                  <dd className="font-medium text-foreground">{club.time}</dd>
                </div>
              </>
            )}
          </dl>

          {club.beginnerFriendly && (
            <span className="mt-3 inline-flex w-fit rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
              초보 환영
            </span>
          )}

          <ClubEventSummary club={club} />

          {!featured && (
            <>
              <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-pul-muted">
                {club.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {club.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-[#fafbfa] px-2 py-0.5 text-xs font-medium text-pul-deep"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </>
          )}

          {featured && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {club.memberStyles.slice(0, 2).map((style) => (
                <span
                  key={style}
                  className="rounded-md bg-pul-light/80 px-2 py-0.5 text-xs font-medium text-pul-deep"
                >
                  {memberStyleLabels[style]}
                </span>
              ))}
            </div>
          )}

          {featured && <ClubEventSummary club={club} />}
        </div>

        <div className="mt-auto flex flex-row gap-2 border-t border-pul-border/80 px-5 pb-5 pt-3">
          <button
            type="button"
            onClick={() => onApply(club)}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white transition-colors hover:bg-pul-deep"
          >
            가입 신청
          </button>
          <Link
            href={`/clubs/${club.id}`}
            onClick={() => onDetail(club)}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep transition-colors hover:border-pul-point/40"
          >
            자세히 보기
          </Link>
        </div>
      </div>
    </article>
  );
}
