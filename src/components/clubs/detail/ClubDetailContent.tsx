import { ClubDetailActions } from "@/components/clubs/detail/ClubDetailActions";
import { ClubJoinInquiryProvider } from "@/components/clubs/detail/ClubJoinInquiryProvider";
import { ClubParticipationRequestProvider } from "@/components/clubs/detail/ClubParticipationRequestProvider";
import {
  ClubBoardSection,
  ClubContactSection,
  ClubHomeCourseSection,
  ClubIntroSection,
  ClubJoinSection,
  ClubOfficialEventsSection,
  ClubNoticesSection,
  ClubParticipationSection,
  ClubPhotosSection,
  ClubRecentActivitySection,
} from "@/components/clubs/detail/ClubDetailSections";
import { Card } from "@/components/ui/Card";
import { clubDetailRecruitStatusLabels, recruitStatusStyles } from "@/data/clubData";
import { cn } from "@/lib/utils";
import type { ClubDetailData } from "@/types";
import { CalendarDays, Camera, Flag, MapPin, Users } from "lucide-react";

type ClubDetailContentProps = {
  detail: ClubDetailData;
};

/**
 * 동호회 상세 본문.
 * 중간 섹션은 PC/모바일 동일 단일 트리 — 뷰포트별 데이터·섹션 분기 금지.
 * 각 섹션은 독립 Card sibling (중첩·조건부 다음형제 감싸기 금지).
 */
export function ClubDetailContent({ detail }: ClubDetailContentProps) {
  const { club } = detail;

  return (
    <ClubJoinInquiryProvider
      club={club}
      inquiryContext={detail.joinInquiryContext}
    >
      <ClubParticipationRequestProvider
        club={club}
        requestContext={detail.participationRequestContext}
      >
      <div className="flex flex-col gap-5 lg:gap-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-5">
        <div className="order-1 rounded-xl border border-pul-border bg-white p-5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:order-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-md px-2.5 py-1 text-sm font-bold", recruitStatusStyles[club.recruitStatus])}>
              {clubDetailRecruitStatusLabels[club.recruitStatus]}
            </span>
            {club.beginnerFriendly ? (
              <span className="rounded-md bg-pul-light px-2.5 py-1 text-sm font-bold text-pul-deep">초보자 가입 가능</span>
            ) : null}
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold leading-snug text-foreground lg:text-3xl">{club.name}</h1>
          <p className="mt-3 flex items-start gap-2 text-base font-semibold text-pul-deep">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-pul-point" />
            {club.regionLabel}
          </p>
          <p className="mt-2 flex items-start gap-2 text-base text-pul-muted">
            <Flag className="mt-0.5 h-5 w-5 shrink-0 text-pul-point" />
            {club.homeCourse}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-pul-light/30 p-3 text-[15px]">
            <div>
              <p className="font-semibold text-pul-muted">정기 활동</p>
              <p className="mt-1 font-bold text-pul-deep">
                {club.scheduleLabel} · {club.time}
              </p>
            </div>
            <div>
              <p className="font-semibold text-pul-muted">회원 규모</p>
              <p className="mt-1 font-bold text-pul-deep">{club.memberCount}명</p>
            </div>
          </div>
          <p className="mt-4 text-base leading-7 text-pul-muted">{club.detailSummary ?? club.description}</p>
        </div>

        <div className="order-2 flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-pul-border bg-white px-5 py-8 text-center shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:order-1 lg:row-span-2">
          <Camera className="h-12 w-12 text-pul-muted/40" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-foreground">동호회 대표사진</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-pul-muted">
            등록된 대표사진이 없습니다.
            <br />
            동호회 운영진이 대표사진을 등록할 수 있습니다.
          </p>
        </div>

        <div className="order-3 lg:order-3">
          <ClubDetailActions club={club} variant="top" />
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <main data-testid="club-detail-main" className="min-w-0">
          {/* PC·모바일 공통 단일 섹션 트리. 각 컴포넌트는 독립 Card sibling입니다. */}
          <div className="flex flex-col gap-4 pb-10 lg:gap-5 lg:pb-20" data-club-section-stack="true">
            <ClubIntroSection detail={detail} />
            <ClubJoinSection detail={detail} />
            <ClubOfficialEventsSection detail={detail} />
            <ClubNoticesSection detail={detail} />
            <ClubBoardSection detail={detail} />
            <ClubPhotosSection detail={detail} />
            <ClubHomeCourseSection detail={detail} />
            <ClubRecentActivitySection detail={detail} />
            <ClubContactSection detail={detail} />
            <ClubParticipationSection detail={detail} />
          </div>
        </main>

        <aside className="hidden self-stretch lg:block" aria-label="동호회 빠른 이용">
          <div className="sticky top-4 space-y-4">
            <Card title="빠른 이용">
              <ClubDetailActions club={club} variant="sidebar" />
            </Card>
            <Card dense title="가입 안내">
              <div className="space-y-3 text-[15px] leading-relaxed text-pul-muted">
                <p className="flex gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-pul-point" />
                  {clubDetailRecruitStatusLabels[club.recruitStatus]}
                </p>
                <p className="flex gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-pul-point" />
                  {club.scheduleLabel} · {club.time}
                </p>
                <p>가입 조건과 활동 안내는 신청 전에 다시 확인해 주세요.</p>
              </div>
            </Card>
          </div>
        </aside>
      </div>
      </div>
      </ClubParticipationRequestProvider>
    </ClubJoinInquiryProvider>
  );
}
