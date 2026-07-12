"use client";

import { RecruitStatusBadge } from "@/components/clubs/ClubCard";
import {
  CLUB_FEATURED_MOBILE_PREVIEW,
  CLUB_RECRUIT_MOBILE_PREVIEW,
  featuredClubs,
} from "@/data/clubData";
import type { ParkGolfClub } from "@/types";

type ClubRecruitPostsSectionProps = {
  clubs: ParkGolfClub[];
  onApply: (club: ParkGolfClub) => void;
  onDetail: (club: ParkGolfClub) => void;
};

/**
 * 모바일용 최근 모집글 — 동호회 카드와 다른 정보 초점
 * (가입 조건·활동 요일·회원 수·지역·구장·초보 환영)
 */
export function ClubRecruitPostsSection({
  clubs,
  onApply,
  onDetail,
}: ClubRecruitPostsSectionProps) {
  const featuredIds = new Set(
    featuredClubs.slice(0, CLUB_FEATURED_MOBILE_PREVIEW).map((club) => club.id),
  );

  const recruitPosts = clubs
    .filter(
      (club) =>
        club.recruitStatus === "recruiting" && !featuredIds.has(club.id),
    )
    .slice(0, CLUB_RECRUIT_MOBILE_PREVIEW);

  if (recruitPosts.length === 0) return null;

  return (
    <section className="lg:hidden">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-foreground">최근 모집글</h2>
        <p className="mt-0.5 text-xs text-pul-muted">
          모집 조건과 활동 요일을 중심으로 확인하세요.
        </p>
      </div>
      <div className="space-y-2">
        {recruitPosts.map((club) => (
          <article
            key={club.id}
            className="rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)]"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 flex-1 text-sm font-bold leading-snug text-foreground">
                {club.name} 회원 모집
              </h3>
              <RecruitStatusBadge status={club.recruitStatus} compact />
            </div>
            <dl className="mt-2 space-y-1 text-xs leading-snug">
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-pul-muted">지역</dt>
                <dd className="font-medium text-foreground">{club.regionLabel}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-pul-muted">활동 구장</dt>
                <dd className="min-w-0 truncate font-medium text-foreground">
                  {club.homeCourse}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-pul-muted">활동 요일</dt>
                <dd className="font-medium text-foreground">
                  {club.scheduleLabel} · {club.time}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-pul-muted">모집 인원</dt>
                <dd className="font-medium text-foreground">
                  현재 {club.memberCount}명 · 추가 모집 중
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-pul-muted">가입 조건</dt>
                <dd className="line-clamp-2 font-medium text-foreground">
                  {club.joinConditions}
                </dd>
              </div>
            </dl>
            {club.beginnerFriendly ? (
              <p className="mt-2 text-[11px] font-semibold text-pul-point">
                초보 환영
              </p>
            ) : null}
            <div className="mt-2.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => onApply(club)}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-pul-point text-xs font-bold text-white hover:bg-pul-deep"
              >
                가입 신청
              </button>
              <button
                type="button"
                onClick={() => onDetail(club)}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-xs font-bold text-pul-deep hover:border-pul-point/40"
              >
                자세히 보기
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
