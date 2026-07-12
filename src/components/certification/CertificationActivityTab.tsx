"use client";

import { CertificationJobCard } from "@/components/certification/CertificationJobCard";
import { CertificationTalentProfileCard } from "@/components/certification/CertificationTalentProfileCard";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import {
  ACTIVITY_TAB_DISCLAIMER,
  jobPostingRegistrationConditions,
  pulActivityScoreItems,
  refereeJobPosts,
  refereeTalentProfiles,
  talentProfileRegistrationConditions,
  type RefereeJobPost,
  type RefereeTalentProfile,
} from "@/data/certificationData";
import { cn } from "@/lib/utils";
import { useState } from "react";

const MOBILE_PREVIEW = 2;
const PC_PREVIEW = 3;

type CertificationActivityTabProps = {
  onJobInquiry: (job: RefereeJobPost) => void;
  onJobRegister: () => void;
  onProfileInquiry: (profile: RefereeTalentProfile) => void;
  onProfileRegister: () => void;
};

const introCards = [
  {
    title: "구인 공고",
    description:
      "대회 운영자, 협회, 동호회, 교육기관은 심판·강사·진행요원 모집 공고를 등록할 수 있습니다. 초기에는 운영자 확인 후 수동 등록됩니다.",
  },
  {
    title: "구직 프로필",
    description:
      "자격증 보유 회원은 자격 인증과 PUL 활동 점수를 바탕으로 심판·강사 구직 프로필을 등록할 수 있습니다.",
  },
];

export function CertificationActivityTab({
  onJobInquiry,
  onJobRegister,
  onProfileInquiry,
  onProfileRegister,
}: CertificationActivityTabProps) {
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [showAllProfiles, setShowAllProfiles] = useState(false);

  const visibleJobs = showAllJobs
    ? refereeJobPosts
    : refereeJobPosts.slice(0, PC_PREVIEW);
  const visibleProfiles = showAllProfiles
    ? refereeTalentProfiles
    : refereeTalentProfiles.slice(0, PC_PREVIEW);
  const hasMoreJobs =
    !showAllJobs && refereeJobPosts.length > MOBILE_PREVIEW;
  const hasMoreProfiles =
    !showAllProfiles && refereeTalentProfiles.length > MOBILE_PREVIEW;

  return (
    <div className="space-y-3 lg:space-y-4">
      <section className="rounded-xl border border-pul-border bg-white p-2.5 lg:p-4">
        <h2 className="text-base font-bold text-foreground lg:text-xl">
          심판·강사 구인구직
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          자격증 보유자와 대회 운영자, 협회, 동호회, 교육기관을 연결하는 공간입니다.
          심판·강사·진행요원 모집 공고와 자격 인증 회원의 활동 프로필을 확인할 수
          있습니다.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:gap-3">
          {introCards.map((card) => (
            <div
              key={card.title}
              className="rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-2.5"
            >
              <p className="text-sm font-bold text-pul-deep">{card.title}</p>
              <p className="mt-1 text-[11px] leading-snug text-pul-muted lg:text-xs">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-bold text-foreground lg:text-lg">구인 공고</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAllJobs(true)}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-pul-border px-3 text-xs font-bold text-pul-deep hover:bg-pul-light"
            >
              전체 구인 공고 보기
            </button>
            <button
              type="button"
              onClick={onJobRegister}
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-pul-point px-3 text-xs font-bold text-white hover:bg-pul-deep"
            >
              구인 공고 등록 문의
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3 lg:gap-3">
          {visibleJobs.map((job, index) => (
            <div
              key={job.id}
              className={cn(
                index >= MOBILE_PREVIEW && !showAllJobs && "hidden lg:block",
              )}
            >
              <CertificationJobCard job={job} onInquiry={onJobInquiry} />
            </div>
          ))}
        </div>

        {hasMoreJobs && (
          <button
            type="button"
            onClick={() => setShowAllJobs(true)}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-xs font-bold text-pul-deep hover:bg-pul-light lg:hidden"
          >
            구인 공고 더 보기
          </button>
        )}
      </section>

      <section>
        <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground lg:text-lg">
              구직 프로필
            </h3>
            <p className="mt-0.5 text-xs text-pul-muted lg:text-sm">
              자격증 인증 회원과 PUL 활동 우수 회원의 심판·강사 활동 가능 프로필을
              확인할 수 있습니다.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAllProfiles(true)}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-pul-border px-3 text-xs font-bold text-pul-deep hover:bg-pul-light"
            >
              구직 프로필 전체 보기
            </button>
            <button
              type="button"
              onClick={onProfileRegister}
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-pul-point px-3 text-xs font-bold text-white hover:bg-pul-deep"
            >
              구직 프로필 등록 신청
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3 lg:gap-3">
          {visibleProfiles.map((profile, index) => (
            <div
              key={profile.id}
              className={cn(
                index >= MOBILE_PREVIEW && !showAllProfiles && "hidden lg:block",
              )}
            >
              <CertificationTalentProfileCard
                profile={profile}
                onInquiry={onProfileInquiry}
              />
            </div>
          ))}
        </div>

        {hasMoreProfiles && (
          <button
            type="button"
            onClick={() => setShowAllProfiles(true)}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-xs font-bold text-pul-deep hover:bg-pul-light lg:hidden"
          >
            구직 프로필 더 보기
          </button>
        )}
      </section>

      <div className="lg:hidden">
        <CollapsibleSection
          title="등록 조건 안내"
          summary="구인·구직 등록 조건과 PUL 활동 점수 항목"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm font-bold text-pul-deep">구인 등록 조건</p>
              <ul className="mt-2 space-y-1">
                {jobPostingRegistrationConditions.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-1.5 text-sm leading-snug text-foreground"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pul-point" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-bold text-pul-deep">구직 등록 조건</p>
              <ul className="mt-2 space-y-1">
                {talentProfileRegistrationConditions.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-1.5 text-sm leading-snug text-foreground"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pul-point" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-bold text-pul-deep">PUL 활동 점수 반영 항목</p>
              <ul className="mt-2 space-y-1">
                {pulActivityScoreItems.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-1.5 text-sm leading-snug text-foreground"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-sm leading-relaxed text-pul-muted">
              초기에는 자격 인증 회원의 기본 구직 프로필 등록을 무료로 운영하고, 향후
              추천 노출, 상단 노출, 지역별 우선 노출은 유료 상품으로 확장할 수 있습니다.
            </p>
          </div>
        </CollapsibleSection>
      </div>

      <section className="hidden rounded-xl border border-pul-border bg-white p-2.5 lg:block lg:p-4">
        <h3 className="text-base font-bold text-foreground lg:text-lg">
          등록 조건 안내
        </h3>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold text-pul-deep lg:text-sm">구인 등록 조건</p>
            <ul className="mt-2 space-y-1">
              {jobPostingRegistrationConditions.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-1.5 text-[11px] leading-snug text-foreground lg:text-xs"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pul-point" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold text-pul-deep lg:text-sm">구직 등록 조건</p>
            <ul className="mt-2 space-y-1">
              {talentProfileRegistrationConditions.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-1.5 text-[11px] leading-snug text-foreground lg:text-xs"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pul-point" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-xs font-bold text-pul-deep lg:text-sm">
            PUL 활동 점수 반영 항목
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {pulActivityScoreItems.map((item) => (
              <li
                key={item}
                className="flex items-start gap-1.5 text-[11px] leading-snug text-foreground lg:text-xs"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-pul-muted lg:text-xs">
          초기에는 자격 인증 회원의 기본 구직 프로필 등록을 무료로 운영하고, 향후
          추천 노출, 상단 노출, 지역별 우선 노출은 유료 상품으로 확장할 수 있습니다.
          {/* TODO: 구직 프로필 추천 노출 · 상단 노출 · 지역별 우선 노출 유료 상품 */}
        </p>
      </section>

      <aside className="rounded-lg border border-pul-border/80 bg-[#fafbfa] px-3 py-2.5 lg:px-4 lg:py-3">
        <p className="text-[11px] leading-relaxed text-pul-muted lg:text-xs lg:leading-relaxed">
          {ACTIVITY_TAB_DISCLAIMER}
        </p>
      </aside>
    </div>
  );
}
