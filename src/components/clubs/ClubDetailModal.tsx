"use client";

import { RecruitStatusBadge } from "@/components/clubs/ClubCard";
import { ClubMiniSpaceSection } from "@/components/clubs/ClubMiniSpaceSection";
import { HomeCourseLink } from "@/components/clubs/HomeCourseLink";
import {
  CLUB_MINI_BOARD_APPROVAL_MESSAGE,
  memberStyleLabels,
  scheduleTypeLabels,
} from "@/data/clubData";
import type { ParkGolfClub } from "@/types";

type ClubDetailModalProps = {
  club: ParkGolfClub | null;
  onClose: () => void;
  onApply: (club: ParkGolfClub) => void;
  onReport: (club: ParkGolfClub) => void;
};

export function ClubDetailModal({
  club,
  onClose,
  onApply,
  onReport,
}: ClubDetailModalProps) {
  if (!club) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="club-detail-title"
      onClick={onClose}
    >
      <article
        className="max-h-[min(92dvh,100%)] w-full overflow-y-auto rounded-t-2xl border border-pul-border bg-white shadow-[0_12px_40px_rgba(6,78,59,0.2)] sm:max-w-lg sm:rounded-xl lg:max-h-[90vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-pul-border/60 bg-gradient-to-r from-pul-light/60 to-white px-4 py-3 lg:static lg:px-5 lg:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 pr-1">
              <RecruitStatusBadge status={club.recruitStatus} />
              <h2
                id="club-detail-title"
                className="mt-2 text-lg font-bold leading-snug text-foreground lg:text-xl"
              >
                {club.name}
              </h2>
              <p className="mt-1 text-xs font-medium text-pul-deep lg:text-sm lg:font-normal lg:text-pul-muted">
                {club.regionLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl font-bold text-pul-muted shadow-sm ring-1 ring-pul-border lg:h-9 lg:w-9 lg:text-lg"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4 pb-6 lg:space-y-5 lg:p-5">
          <section className="rounded-lg border border-pul-border/70 bg-[#fafbfa] p-3 lg:p-4">
            <h3 className="text-sm font-bold text-foreground">활동 구장</h3>
            <div className="mt-2">
              <HomeCourseLink
                courseName={club.homeCourse}
                courseId={club.homeCourseId}
                compact
              />
            </div>
          </section>

          <dl className="grid grid-cols-1 gap-3 text-sm lg:grid-cols-2">
            <div>
              <dt className="font-medium text-pul-muted">회장/운영진</dt>
              <dd className="mt-0.5 font-semibold text-foreground">{club.leaderName}</dd>
            </div>
            <div>
              <dt className="font-medium text-pul-muted">회원 수</dt>
              <dd className="mt-0.5 font-semibold text-foreground">{club.memberCount}명</dd>
            </div>
            <div>
              <dt className="font-medium text-pul-muted">활동 요일</dt>
              <dd className="mt-0.5 font-semibold text-foreground">
                {club.scheduleLabel} ({scheduleTypeLabels[club.schedule]})
              </dd>
            </div>
            <div>
              <dt className="font-medium text-pul-muted">활동 시간</dt>
              <dd className="mt-0.5 font-semibold text-foreground">{club.time}</dd>
            </div>
          </dl>

          <div>
            <h3 className="text-sm font-bold text-foreground">가입 조건</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-pul-muted">
              {club.joinConditions}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">회비 안내</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-pul-muted">
              {club.feeInfo}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">초보자 안내</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-pul-muted">
              {club.beginnerGuide}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">최근 공지</h3>
            <ul className="mt-2 space-y-2">
              {club.notices.map((notice) => (
                <li
                  key={notice}
                  className="rounded-lg bg-pul-light/60 px-3 py-2 text-sm text-pul-deep"
                >
                  {notice}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">월례회 · 정기모임 안내</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-pul-muted">
              {club.meetingInfo}
            </p>
          </div>

          <ClubMiniSpaceSection />

          <p className="rounded-lg bg-pul-light/70 px-3 py-2.5 text-sm leading-relaxed text-pul-deep">
            {CLUB_MINI_BOARD_APPROVAL_MESSAGE}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {club.memberStyles.map((style) => (
              <span
                key={style}
                className="rounded-md bg-[#fafbfa] px-2 py-0.5 text-xs font-medium text-pul-deep"
              >
                {memberStyleLabels[style]}
              </span>
            ))}
            {club.beginnerFriendly && (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
                초보 환영
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2 pb-2 lg:flex-row">
            <button
              type="button"
              onClick={() => onApply(club)}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
            >
              가입 신청
            </button>
            <button
              type="button"
              onClick={() => onReport(club)}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-pul-border text-sm font-bold text-pul-muted hover:text-pul-deep"
            >
              신고하기
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
