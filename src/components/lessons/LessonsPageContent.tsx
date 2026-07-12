"use client";

import { CertificationLinkBanner } from "@/components/lessons/CertificationLinkBanner";
import { FeaturedLessonCards } from "@/components/lessons/FeaturedLessonCards";
import { FreeVideoLessonsSection } from "@/components/lessons/FreeVideoLessonsSection";
import { LessonCard } from "@/components/lessons/LessonCard";
import { LessonDetailModal } from "@/components/lessons/LessonDetailModal";
import { LessonPartnerBanner } from "@/components/lessons/LessonPartnerBanner";
import { LessonsInstructorPromotionTab } from "@/components/lessons/LessonsInstructorPromotionTab";
import { LessonsUniversityDepartmentsTab } from "@/components/lessons/LessonsUniversityDepartmentsTab";
import { LessonsIntroGuideTab } from "@/components/lessons/LessonsIntroGuideTab";
import {
  LessonSearchFilter,
  MobileLessonQuickFilter,
  MobileSearchToolbar,
  createDefaultLessonFilters,
} from "@/components/lessons/LessonSearchFilter";
import {
  LessonsPageTabs,
  type LessonsPageTab,
} from "@/components/lessons/LessonsPageTabs";
import { InfoModal } from "@/components/ui/InfoModal";
import {
  LESSON_INQUIRY_MESSAGE,
  LESSON_PARTNER_INQUIRY_MESSAGE,
  LESSON_PARTNER_INQUIRY_URL,
  LESSON_REGISTER_FORM_URL,
  filterLessons,
  generalFeaturedLessons,
  generalPaidLessons,
  paidTabLessonTargets,
  paidTabLessonTypes,
} from "@/data/lessonData";
import { VIDEO_LESSON_REGISTER_FORM_URL } from "@/data/videoLessonData";
import type { ParkGolfLesson, VideoLesson } from "@/types";
import { useEffect, useMemo, useState } from "react";

const PC_PAID_LIST_PREVIEW = 6;
const MOBILE_PAID_LIST_PREVIEW = 4;
const MOBILE_FEATURED_PREVIEW = 3;

function getRegionSummary(region: string) {
  return region === "전체" ? "전국" : region;
}

export function LessonsPageContent({ registerSignal = 0 }: { registerSignal?: number }) {
  const [activeTab, setActiveTab] = useState<LessonsPageTab>("intro-guide");
  const [filters, setFilters] = useState(createDefaultLessonFilters);
  const [selectedLesson, setSelectedLesson] = useState<ParkGolfLesson | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [infoModal, setInfoModal] = useState<
    | "inquiry"
    | "register"
    | "report"
    | "partner"
    | "video-register"
    | "video-save"
    | "certification"
    | "university-recruitment"
    | null
  >(null);
  const [actionLesson, setActionLesson] = useState<ParkGolfLesson | null>(null);
  const [actionVideo, setActionVideo] = useState<VideoLesson | null>(null);
  const [showAllPaidLessons, setShowAllPaidLessons] = useState(false);

  const filteredLessons = useMemo(
    () => filterLessons(generalPaidLessons, filters),
    [filters],
  );

  const featuredIds = useMemo(
    () => new Set(generalFeaturedLessons.map((lesson) => lesson.id)),
    [],
  );

  const listLessons = useMemo(
    () => filteredLessons.filter((lesson) => !featuredIds.has(lesson.id)),
    [filteredLessons, featuredIds],
  );

  const mobileHiddenPaidCount = Math.max(
    0,
    listLessons.length - MOBILE_PAID_LIST_PREVIEW,
  );
  const pcHiddenPaidCount = Math.max(0, listLessons.length - PC_PAID_LIST_PREVIEW);
  const hasMorePaidLessons =
    !showAllPaidLessons &&
    (mobileHiddenPaidCount > 0 || pcHiddenPaidCount > 0);

  useEffect(() => {
    if (registerSignal > 0) {
      setInfoModal("register");
    }
  }, [registerSignal]);

  const updateFilters = (next: typeof filters) => {
    setFilters(next);
    setShowAllPaidLessons(false);
  };

  const resetFilters = () => {
    setFilters(createDefaultLessonFilters());
    setShowAllPaidLessons(false);
  };

  const handleInquiry = (lesson: ParkGolfLesson) => {
    setActionLesson(lesson);
    setInfoModal("inquiry");
  };

  const handleReport = (lesson: ParkGolfLesson) => {
    setActionLesson(lesson);
    setInfoModal("report");
  };

  const handleVideoSave = (video: VideoLesson) => {
    setActionVideo(video);
    setInfoModal("video-save");
  };

  const regionSummary = getRegionSummary(filters.region);

  const paidSection = (
    <div
      id="paid-lessons-section"
      className="space-y-3 rounded-xl border border-pul-border bg-white p-2.5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:space-y-6 lg:p-5"
    >
      <div>
        <p className="text-[10px] font-bold tracking-[0.14em] text-pul-point lg:text-[11px]">
          PAID LESSONS
        </p>
        <h2 className="mt-1 text-lg font-bold text-foreground lg:text-xl">
          유료 레슨·교육
        </h2>
        <p className="mt-1 text-xs text-pul-muted lg:text-sm">
          파크골프를 배우려는 분을 위한 유료 레슨·교육 프로그램입니다.
        </p>
      </div>

      <div className="space-y-2 lg:hidden">
        <MobileSearchToolbar
          keyword={filters.keyword}
          onKeywordChange={(keyword) => updateFilters({ ...filters, keyword })}
          onFilterToggle={() => setShowMobileFilters((value) => !value)}
          showFilters={showMobileFilters}
          resultCount={filteredLessons.length}
          regionSummary={regionSummary}
        />
        <MobileLessonQuickFilter
          filters={filters}
          onChange={updateFilters}
          typeOptions={paidTabLessonTypes}
        />
        {showMobileFilters && (
          <LessonSearchFilter
            filters={filters}
            onChange={updateFilters}
            onReset={resetFilters}
            resultCount={filteredLessons.length}
            showSearch={false}
            onClose={() => setShowMobileFilters(false)}
            typeOptions={paidTabLessonTypes}
            targetOptions={paidTabLessonTargets}
          />
        )}
      </div>

      <div className="hidden lg:block">
        <LessonSearchFilter
          filters={filters}
          onChange={updateFilters}
          onReset={resetFilters}
          resultCount={filteredLessons.length}
          typeOptions={paidTabLessonTypes}
          targetOptions={paidTabLessonTargets}
        />
      </div>

      <FeaturedLessonCards
        lessons={generalFeaturedLessons}
        onInquiry={handleInquiry}
        onDetail={setSelectedLesson}
        mobileVisibleCount={MOBILE_FEATURED_PREVIEW}
      />

      <LessonPartnerBanner
        variant="paid-register"
        onInquiry={() => setInfoModal("register")}
      />

      <section>
        <div className="mb-3 lg:mb-4">
          <h3 className="text-base font-bold text-foreground lg:text-lg">
            유료 레슨·교육 목록
          </h3>
          <p className="mt-0.5 text-xs text-pul-muted lg:mt-1 lg:text-sm">
            {filteredLessons.length === generalPaidLessons.length &&
            filters.region === "전체"
              ? "전국 파크골프 교육 프로그램입니다."
              : `${regionSummary} 기준 교육 프로그램입니다.`}
          </p>
        </div>

        {filteredLessons.length === 0 ? (
          <div className="rounded-xl border border-dashed border-pul-border bg-[#fafbfa] px-6 py-14 text-center">
            <p className="text-base font-semibold text-foreground">
              조건에 맞는 교육이 없습니다.
            </p>
            <p className="mt-1 text-sm text-pul-muted">
              필터를 변경하거나 검색어를 수정해 보세요.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 lg:hidden">
              {(showAllPaidLessons
                ? filteredLessons
                : listLessons.slice(0, MOBILE_PAID_LIST_PREVIEW)
              ).map((lesson) => (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  onInquiry={handleInquiry}
                  onDetail={setSelectedLesson}
                />
              ))}
            </div>
            <div className="hidden grid-cols-1 gap-2 lg:grid lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
              {(showAllPaidLessons
                ? filteredLessons
                : listLessons.slice(0, PC_PAID_LIST_PREVIEW)
              ).map((lesson) => (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  onInquiry={handleInquiry}
                  onDetail={setSelectedLesson}
                />
              ))}
            </div>
          </>
        )}

        {hasMorePaidLessons && (
          <>
            <button
              type="button"
              onClick={() => setShowAllPaidLessons(true)}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-pul-border bg-white text-base font-bold text-pul-deep hover:bg-pul-light/70 lg:hidden"
            >
              유료 레슨 더보기 (외 {mobileHiddenPaidCount}건) →
            </button>
            <button
              type="button"
              onClick={() => setShowAllPaidLessons(true)}
              className="mt-4 hidden min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:inline-flex"
            >
              전체 유료 레슨·교육 보기
            </button>
          </>
        )}
      </section>

      <CertificationLinkBanner
        variant="paid-footer"
        onViewCertification={() => setInfoModal("certification")}
      />
    </div>
  );

  return (
    <>
      <div className="space-y-3 pb-8 max-lg:pb-8 lg:space-y-6 lg:pb-2">
        <LessonsPageTabs activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "intro-guide" && (
          <LessonsIntroGuideTab
            onGoToFreeVideos={() => setActiveTab("free-videos")}
            onGoToPaidLessons={() => setActiveTab("paid-lessons")}
            onViewCertification={() => setInfoModal("certification")}
          />
        )}

        {activeTab === "free-videos" && (
          <FreeVideoLessonsSection
            onSaveInterest={handleVideoSave}
            onVideoRegister={() => setInfoModal("video-register")}
            hiddenCategories={["cert_referee"]}
          />
        )}

        {activeTab === "paid-lessons" && paidSection}

        {activeTab === "instructor-promotion" && (
          <LessonsInstructorPromotionTab
            onVideoRegister={() => setInfoModal("video-register")}
            onLessonRegister={() => setInfoModal("register")}
            onPartnerInquiry={() => setInfoModal("partner")}
          />
        )}

        {activeTab === "university-departments" && (
          <LessonsUniversityDepartmentsTab
            onRecruitmentInquiry={() => setInfoModal("university-recruitment")}
          />
        )}
      </div>

      <LessonDetailModal
        lesson={selectedLesson}
        onClose={() => setSelectedLesson(null)}
        onInquiry={handleInquiry}
        onReport={handleReport}
      />

      {infoModal === "inquiry" && (
        <InfoModal
          title="신청 문의"
          message={`${actionLesson?.title ?? "교육"} 신청 문의\n\n${LESSON_INQUIRY_MESSAGE}`}
          onClose={() => {
            setInfoModal(null);
            setActionLesson(null);
          }}
        />
      )}

      {infoModal === "register" && (
        <InfoModal
          title="레슨 강사 등록 문의"
          message="PUL 레슨 강사·교육기관 홍보 등록 기능은 준비 중입니다. Google Form을 통해 임시 등록 문의가 가능합니다."
          actionLabel="등록 문의 양식"
          actionHref={LESSON_REGISTER_FORM_URL}
          onClose={() => setInfoModal(null)}
        />
      )}

      {infoModal === "video-register" && (
        <InfoModal
          title="유튜브 강의 등록 문의"
          message="PUL 유튜브 강의 등록 기능은 준비 중입니다. 영상은 YouTube 링크로 연결되며, 운영자 확인 후 수동 등록됩니다."
          actionLabel="영상 등록 문의 양식"
          actionHref={VIDEO_LESSON_REGISTER_FORM_URL}
          onClose={() => setInfoModal(null)}
        />
      )}

      {infoModal === "video-save" && (
        <InfoModal
          title="관심 영상"
          message={`${actionVideo?.title ?? "영상"} 관심 목록 기능은 준비 중입니다. 정식 오픈 전에는 YouTube에서 바로 시청해 주세요.`}
          onClose={() => {
            setInfoModal(null);
            setActionVideo(null);
          }}
        />
      )}

      {infoModal === "partner" && (
        <InfoModal
          title="홍보·제휴 문의"
          message={LESSON_PARTNER_INQUIRY_MESSAGE}
          actionLabel="문의 양식"
          actionHref={LESSON_PARTNER_INQUIRY_URL}
          onClose={() => setInfoModal(null)}
        />
      )}

      {infoModal === "certification" && (
        <InfoModal
          title="자격증·심판 메뉴"
          message={
            "자격증·심판 정보는 상단 「자격증·심판」 메뉴에서 다룰 예정입니다.\n\n생활스포츠지도사, 장애인스포츠지도사, 지도자 과정, 심판 과정, 민간 교육과정, 심판 구인구직 정보는 별도 페이지에서 제공됩니다."
          }
          onClose={() => setInfoModal(null)}
        />
      )}

      {infoModal === "report" && (
        <InfoModal
          title="신고하기"
          message={`${actionLesson?.title ?? "교육"} 관련 신고는 운영자 확인 후 처리됩니다. 정식 오픈 전에는 PUL 문의 채널로 접수해 주세요.`}
          onClose={() => {
            setInfoModal(null);
            setActionLesson(null);
          }}
        />
      )}

      {infoModal === "university-recruitment" && (
        <InfoModal
          title="대학·학과 홍보 문의"
          message={
            "PUL 대학·학과 모집 홍보 기능은 준비 중입니다.\n\n모집 시즌 배너, 상단 추천 노출, 지역별 추천, 학과 상세 페이지, 입학상담 링크 연결 등의 상품 문의를 남겨 주시면 오픈 시 안내드립니다."
          }
          actionLabel="홍보 문의 양식"
          actionHref={LESSON_PARTNER_INQUIRY_URL}
          onClose={() => setInfoModal(null)}
        />
      )}
    </>
  );
}
