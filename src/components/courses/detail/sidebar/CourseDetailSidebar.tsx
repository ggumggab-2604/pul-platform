"use client";

import { CourseQuickActions } from "@/components/courses/detail/sidebar/CourseQuickActions";
import { SponsoredBusinessCard } from "@/components/courses/detail/sidebar/SponsoredBusinessCard";
import type { CourseDetailPageData } from "@/data/courseDetailPageData";

type CourseDetailSidebarProps = {
  detail: CourseDetailPageData;
  mapsUrl: string;
  phoneHref: string;
  reservationUrl?: string;
  reservationGuideSummary: string;
  usageGuideLabel: string;
  onUsageGuide: () => void;
  onReport: () => void;
  onMoreNearby: () => void;
  onFavorite?: () => void;
  onShare?: () => void;
};

/**
 * 우측 사이드바 — 날씨 카드는 넣지 않음.
 * 날씨는 본문 CompactCourseWeather 한 곳만 사용.
 * 루트는 aside 전체 높이(h-full)를 채워 sticky containing block 역할을 한다.
 * 「빠른 이용」은 CourseQuickActions 가 PC 2단 sticky 를 자체 처리 (1회만).
 * 주변정보는 compact 「빠른 이용」 2×2 버튼으로 이동.
 */
export function CourseDetailSidebar({
  detail,
  mapsUrl,
  phoneHref,
  reservationUrl,
  reservationGuideSummary,
  usageGuideLabel,
  onUsageGuide,
  onReport,
  onMoreNearby,
  onFavorite,
  onShare,
}: CourseDetailSidebarProps) {
  const sponsored = detail.sidebar.sponsoredCards[0] ?? null;

  return (
    <div
      data-testid="course-sidebar-content"
      className="relative flex h-full min-h-0 w-full flex-col gap-3"
    >
      <CourseQuickActions
        mapsUrl={mapsUrl}
        phoneHref={phoneHref}
        reservationUrl={reservationUrl}
        reservationGuideSummary={reservationGuideSummary}
        usageGuideLabel={usageGuideLabel}
        onUsageGuide={onUsageGuide}
        onReport={onReport}
        onMoreNearby={onMoreNearby}
        onFavorite={onFavorite}
        onShare={onShare}
      />

      {sponsored ? <SponsoredBusinessCard card={sponsored} /> : null}
    </div>
  );
}
