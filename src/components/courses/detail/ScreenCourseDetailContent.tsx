"use client";

import {
  COURSE_FAVORITE_MESSAGE,
  COURSE_PHOTO_UPLOAD_MESSAGE,
  COURSE_REPORT_MESSAGE,
  COURSE_SHARE_MESSAGE,
  CourseTypeBadge,
  ReservationTypeBadge,
} from "@/components/courses/detail/courseDetailShared";
import {
  ScreenClubsSection,
  ScreenLeagueSection,
  ScreenLessonGroupSection,
  ScreenNearbySection,
  ScreenParticipationSection,
  ScreenPricingSection,
  ScreenReviewsSection,
  ScreenVenueFacilitiesSection,
} from "@/components/courses/detail/screen/ScreenDetailSections";
import { ScreenFacilityOverview } from "@/components/courses/detail/screen/ScreenFacilityOverview";
import { ScreenMediaSection } from "@/components/courses/detail/screen/ScreenMediaSection";
import { ScreenQuickActions } from "@/components/courses/detail/screen/ScreenQuickActions";
import { DetailPageWithSidebar } from "@/components/layout/DetailPageWithSidebar";
import { Card } from "@/components/ui/Card";
import { InfoModal } from "@/components/ui/InfoModal";
import type { ScreenCourseMapItem } from "@/data/courseMapData";
import { Clock3, MapPin, Phone } from "lucide-react";
import { useState } from "react";

type ScreenCourseDetailContentProps = {
  course: ScreenCourseMapItem;
};

export function ScreenCourseDetailContent({ course }: ScreenCourseDetailContentProps) {
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const mapsUrl = `https://map.kakao.com/link/map/${encodeURIComponent(course.name)},${course.lat},${course.lng}`;
  const phoneHref = `tel:${course.phone.replace(/-/g, "")}`;
  const openModal = (title: string, message: string) => setModal({ title, message });
  const scrollToNearby = () =>
    document.getElementById("screen-nearby")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: course.name,
          text: course.description,
          url: window.location.href,
        });
        return;
      } catch {
        // 사용자가 공유를 취소한 경우 안내로 이어집니다.
      }
    }
    openModal("공유", COURSE_SHARE_MESSAGE);
  };

  const desktopQuickActions = (
    <ScreenQuickActions
      mapsUrl={mapsUrl}
      phoneHref={phoneHref}
      onUsageGuide={() =>
        openModal(
          "예약·이용 안내",
          `${course.screenDetails?.reservationMethod ?? "예약 방식 정보 확인 중"} · 방문 전 매장에 이용 가능 시간을 확인해 주세요.`,
        )
      }
      onNearby={scrollToNearby}
      onFavorite={() => openModal("즐겨찾기", COURSE_FAVORITE_MESSAGE)}
      onShare={handleShare}
      onReport={() => openModal("정보 수정 제보", COURSE_REPORT_MESSAGE)}
    />
  );

  const roomOrBay = course.screenDetails?.roomCount
    ? `${course.screenDetails.roomCount}개 룸`
    : course.screenDetails?.bayCount
      ? `${course.screenDetails.bayCount}타석`
      : "룸·타석 정보 확인 중";
  const summary = [
    roomOrBay,
    course.screenDetails?.reservationMethod ?? "예약 방식 확인 중",
    course.hours,
    course.parking ? "주차 가능" : "주차 불가",
    course.screenDetails?.equipmentRental === true ? "장비 대여 가능" : "장비 대여 확인 중",
  ].join(" · ");

  return (
    <>
      <div className="space-y-5 lg:space-y-6">
        <header className="rounded-xl border border-pul-border bg-white px-4 py-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:px-5 lg:py-5">
          <div className="flex flex-wrap items-center gap-2">
            <CourseTypeBadge type={course.type} />
            <ReservationTypeBadge course={course} />
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200 lg:text-sm">
              운영 정보 확인 중
            </span>
            {course.screenDetails?.isSample ? (
              <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                개발용 샘플
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 text-2xl font-bold leading-snug text-foreground lg:text-3xl">
            {course.name}
          </h1>
          <div className="mt-3 flex flex-col gap-2 text-[15px] text-pul-muted sm:flex-row sm:flex-wrap sm:gap-x-5 lg:text-base">
            <p className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pul-point" aria-hidden="true" />
              {course.address}
            </p>
            <a href={phoneHref} className="inline-flex min-h-11 items-center gap-2 font-bold text-pul-deep hover:text-pul-point sm:min-h-0">
              <Phone className="h-4 w-4" aria-hidden="true" />{course.phone}
            </a>
            <p className="flex items-center gap-1.5">
              <Clock3 className="h-4 w-4 shrink-0 text-pul-point" aria-hidden="true" />{course.hours}
            </p>
          </div>
          <p className="mt-3 rounded-lg bg-pul-light/45 px-3 py-2.5 text-[15px] font-bold leading-relaxed text-pul-deep lg:text-base">
            {summary}
          </p>
        </header>

        <DetailPageWithSidebar
          mainTestId="screen-course-main"
          sidebar={
            <div className="sticky top-4">
              <Card title="빠른 이용">{desktopQuickActions}</Card>
            </div>
          }
        >
          <div className="space-y-4 lg:space-y-5">
            <ScreenMediaSection
              onUpload={() => openModal("매장사진 올리기", COURSE_PHOTO_UPLOAD_MESSAGE)}
            />

            <div className="lg:hidden">
              <Card title="주요 이용">
                <ScreenQuickActions
                  mapsUrl={mapsUrl}
                  phoneHref={phoneHref}
                  variant="mobile"
                  onUsageGuide={() => openModal("예약·이용 안내", "예약 가능 시간과 이용 조건은 방문 전 매장에 확인해 주세요.")}
                  onNearby={scrollToNearby}
                  onFavorite={() => openModal("즐겨찾기", COURSE_FAVORITE_MESSAGE)}
                  onShare={handleShare}
                  onReport={() => openModal("정보 수정 제보", COURSE_REPORT_MESSAGE)}
                />
              </Card>
            </div>

            <ScreenFacilityOverview course={course} />
            <ScreenPricingSection course={course} onAction={openModal} />
            <ScreenVenueFacilitiesSection course={course} onAction={openModal} />
            <ScreenLessonGroupSection course={course} onAction={openModal} />
            <ScreenLeagueSection course={course} onAction={openModal} />
            <ScreenReviewsSection course={course} onAction={openModal} />
            <ScreenClubsSection course={course} onAction={openModal} />
            <ScreenNearbySection course={course} onAction={openModal} />
            <ScreenParticipationSection onAction={openModal} />
          </div>
        </DetailPageWithSidebar>
      </div>

      {modal ? (
        <InfoModal
          title={modal.title}
          message={modal.message}
          onClose={() => setModal(null)}
          largeText
        />
      ) : null}
    </>
  );
}
