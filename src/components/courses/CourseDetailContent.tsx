"use client";

import { CompactCourseWeather } from "@/components/courses/detail/CompactCourseWeather";
import { CourseBottomActions } from "@/components/courses/detail/CourseBottomActions";
import { CourseEventList } from "@/components/courses/detail/CourseEventList";
import { CourseHallOfFame } from "@/components/courses/detail/CourseHallOfFame";
import { CourseMapPhotoHero } from "@/components/courses/detail/CourseMapPhotoHero";
import { CourseOneLineSummary } from "@/components/courses/detail/CourseOneLineSummary";
import { NearbyPlaceSection } from "@/components/courses/detail/nearby/NearbyPlaceSection";
import { CourseDetailSidebar } from "@/components/courses/detail/sidebar/CourseDetailSidebar";
import { CourseTitleHeader } from "@/components/courses/detail/CourseTitleHeader";
import { HofRecordRegisterPanel } from "@/components/courses/detail/HofRecordRegisterPanel";
import { MonthlyClubWinnerGrid } from "@/components/courses/detail/MonthlyClubWinnerGrid";
import { UsingClubGrid } from "@/components/courses/detail/UsingClubGrid";
import {
  COURSE_CLUB_REGISTER_MESSAGE,
  COURSE_FAVORITE_MESSAGE,
  COURSE_MONTHLY_REGISTER_MESSAGE,
  COURSE_PHOTO_UPLOAD_MESSAGE,
  COURSE_REPORT_MESSAGE,
  COURSE_SHARE_MESSAGE,
  getUsageGuideLabel,
  scrollToUsageGuide,
} from "@/components/courses/detail/courseDetailShared";
import { DetailPageWithSidebar } from "@/components/layout/DetailPageWithSidebar";
import { InfoModal } from "@/components/ui/InfoModal";
import { getCourseDetailPageData } from "@/data/courseDetailPageData";
import type { CourseMapItem } from "@/data/courseMapData";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CourseDetailContentProps = {
  course: CourseMapItem;
};

export function CourseDetailContent({ course }: CourseDetailContentProps) {
  const router = useRouter();
  const detail = useMemo(() => getCourseDetailPageData(course), [course]);
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const [hofRegisterOpen, setHofRegisterOpen] = useState(false);

  const mapsUrl = `https://map.kakao.com/link/map/${encodeURIComponent(course.name)},${course.lat},${course.lng}`;
  const phoneHref = `tel:${course.phone.replace(/-/g, "")}`;
  const usageGuideLabel = getUsageGuideLabel(course);

  const openModal = (title: string, message: string) => setModal({ title, message });
  const closeModal = () => setModal(null);

  const scrollToNearby = () => {
    document.getElementById("nearby-places")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openPhotoUpload = () => openModal("현장 사진 올리기", COURSE_PHOTO_UPLOAD_MESSAGE);

  return (
    <>
      <div className="space-y-5 lg:space-y-6">
        {/* 제목은 2열 grid 밖(전체 폭). 그 아래 layout 이 본문 전체를 감싼다. */}
        <CourseTitleHeader
          course={course}
          detail={detail}
          onFavoriteHint={(message) => openModal("즐겨찾기", message)}
          onShareHint={(message) => openModal("공유", message)}
        />

        {/*
          course-detail-layout: 좌측 본문 전체 + 우측 빠른이용 1회.
          aside 높이가 좌측과 같아 sticky 가 날씨~행사~푸터 직전까지 유지된다.
        */}
        <DetailPageWithSidebar
          mainTestId="course-main"
          sidebar={
            <CourseDetailSidebar
              detail={detail}
              mapsUrl={mapsUrl}
              phoneHref={phoneHref}
              reservationUrl={detail.reservationUrl}
              reservationGuideSummary={detail.reservationGuideSummary}
              usageGuideLabel={usageGuideLabel}
              onUsageGuide={scrollToUsageGuide}
              onReport={() => openModal("정보 수정 제보", COURSE_REPORT_MESSAGE)}
              onMoreNearby={scrollToNearby}
              onFavorite={() => openModal("즐겨찾기", COURSE_FAVORITE_MESSAGE)}
              onShare={() => openModal("공유", COURSE_SHARE_MESSAGE)}
            />
          }
        >
          <div className="space-y-4 lg:space-y-5">
            <CourseMapPhotoHero
              course={course}
              detail={detail}
              mapsUrl={mapsUrl}
              phoneHref={phoneHref}
              onUploadPhoto={openPhotoUpload}
            />
            <div id="course-core-info">
              <CourseOneLineSummary course={course} detail={detail} />
            </div>
            {/* 상세 페이지 유일 날씨 카드 — 사이드바/중복 패널 금지 */}
            <CompactCourseWeather weather={course.weather} detail={detail} />
            <CourseHallOfFame
              records={detail.hallOfFameRecords}
              onViewAll={() => router.push("/hall-of-fame")}
              onVerifyApply={() => setHofRegisterOpen(true)}
            />
            <MonthlyClubWinnerGrid
              winners={detail.monthlyWinners}
              onRegister={() => openModal("월례회 결과 등록", COURSE_MONTHLY_REGISTER_MESSAGE)}
              onViewPast={() => openModal("지난 우승자", "지난 우승자 전체 목록은 준비 중입니다.")}
            />
            <div id="using-clubs">
              <UsingClubGrid
                clubs={course.homeClubs}
                region={`${course.region} ${course.city}`}
                onRegister={() => openModal("동호회 등록", COURSE_CLUB_REGISTER_MESSAGE)}
              />
            </div>
            <div id="course-events">
              <CourseEventList
                events={detail.nearbyEvents}
                onPastEvents={() =>
                  openModal("지난 대회", "이 구장의 지난 대회 목록은 준비 중입니다.")
                }
                onRegisterInquiry={() =>
                  openModal("대회·행사 등록 문의", "대회·행사 등록 문의 기능은 추후 제공됩니다.")
                }
              />
            </div>
            <NearbyPlaceSection
              data={detail.nearbyPlacesData}
              weather={course.weather}
              onReport={() => openModal("정보 수정 제보", COURSE_REPORT_MESSAGE)}
            />
            <CourseBottomActions
              onUploadPhoto={openPhotoUpload}
              onRecordVerify={() => setHofRegisterOpen(true)}
              onReport={() => openModal("정보 수정 제보", COURSE_REPORT_MESSAGE)}
            />
          </div>
        </DetailPageWithSidebar>
      </div>

      {modal ? (
        <InfoModal
          title={modal.title}
          message={modal.message}
          onClose={closeModal}
          largeText
        />
      ) : null}

      <HofRecordRegisterPanel
        open={hofRegisterOpen}
        onClose={() => setHofRegisterOpen(false)}
      />
    </>
  );
}
