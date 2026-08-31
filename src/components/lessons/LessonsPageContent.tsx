"use client";

import { setLessonVideoBookmarkAction } from "@/app/lessons/actions";
import { CertificationLinkBanner } from "@/components/lessons/CertificationLinkBanner";
import { FeaturedLessonCards } from "@/components/lessons/FeaturedLessonCards";
import { FreeVideoLessonsSection } from "@/components/lessons/FreeVideoLessonsSection";
import { LessonCard } from "@/components/lessons/LessonCard";
import { LessonDetailModal } from "@/components/lessons/LessonDetailModal";
import { LessonInformationReportDialog } from "@/components/lessons/LessonInformationReportDialog";
import { LessonPartnerBanner } from "@/components/lessons/LessonPartnerBanner";
import { LessonsInstructorPromotionTab } from "@/components/lessons/LessonsInstructorPromotionTab";
import { LessonsIntroGuideTab } from "@/components/lessons/LessonsIntroGuideTab";
import {
  LessonSearchFilter,
  MobileLessonQuickFilter,
  MobileSearchToolbar,
  createDefaultLessonFilters,
  type LessonFilters,
} from "@/components/lessons/LessonSearchFilter";
import {
  LessonsPageTabs,
  type LessonsPageTab,
} from "@/components/lessons/LessonsPageTabs";
import { LessonsUniversityDepartmentsTab } from "@/components/lessons/LessonsUniversityDepartmentsTab";
import { InfoModal } from "@/components/ui/InfoModal";
import {
  LESSON_PARTNER_INQUIRY_MESSAGE,
  LESSON_PARTNER_INQUIRY_URL,
  paidTabLessonTargets,
  paidTabLessonTypes,
} from "@/data/lessonData";
import type {
  LessonDirectoryFilters,
  PublicLesson,
  PublicLessonPage,
  PublicLessonVideo,
  PublicLessonVideoPage,
} from "@/lib/lessons/lessonDirectory";
import type { ParkGolfLesson, VideoLessonCategory } from "@/types";
import type {
  PublicUniversityDepartment,
  UniversityDirectoryPage,
  UniversityRegion,
} from "@/lib/lessons/universityDirectory";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type LessonsPageContentProps = {
  lessonPage: PublicLessonPage;
  featuredLessons: PublicLesson[];
  videoPage: PublicLessonVideoPage;
  isAuthenticated: boolean;
  savedOnly: boolean;
  initialSavedVideoKeys: string[];
  initialFilters: LessonDirectoryFilters;
  initialVideoCategory?: VideoLessonCategory;
  lessonError: string | null;
  videoError: string | null;
  bookmarkError: string | null;
  universityDepartmentPage: UniversityDirectoryPage<PublicUniversityDepartment>;
  universityDepartmentError: string | null;
  universityKeyword: string;
  universityRegion?: UniversityRegion;
};

function toUiFilters(filters: LessonDirectoryFilters): LessonFilters {
  return {
    ...createDefaultLessonFilters(),
    keyword: filters.keyword ?? "",
    type: filters.type ?? "all",
    region: filters.region ?? "전체",
    format: filters.format ?? "all",
    target: filters.target ?? "all",
    schedule: filters.schedule ?? "all",
  };
}

function setOptional(params: URLSearchParams, key: string, value: string, empty: string) {
  if (!value || value === empty) params.delete(key);
  else params.set(key, value);
}

const emptySavedVideoKeys = new Set<string>();

export function LessonsPageContent({
  lessonPage,
  featuredLessons,
  videoPage,
  isAuthenticated,
  savedOnly,
  initialSavedVideoKeys,
  initialFilters,
  initialVideoCategory,
  lessonError,
  videoError,
  bookmarkError,
  universityDepartmentPage,
  universityDepartmentError,
  universityKeyword,
  universityRegion,
}: LessonsPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") as LessonsPageTab | null;
  const [activeTab, setActiveTab] = useState<LessonsPageTab>(
    initialTab && ["intro-guide", "free-videos", "paid-lessons", "instructor-promotion", "university-departments"].includes(initialTab)
      ? initialTab
      : "intro-guide",
  );
  const [filters, setFilters] = useState(() => toUiFilters(initialFilters));
  const [selectedLesson, setSelectedLesson] = useState<ParkGolfLesson | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [savedVideoKeys, setSavedVideoKeys] = useState(() => new Set(initialSavedVideoKeys));
  const [pendingVideoKeys, setPendingVideoKeys] = useState(() => new Set<string>());
  const [bookmarkNotice, setBookmarkNotice] = useState<string | null>(null);
  const [bookmarkMutationError, setBookmarkMutationError] = useState<string | null>(null);
  const keywordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [infoModal, setInfoModal] = useState<
    | "inquiry"
    | "partner"
    | "certification"
    | null
  >(null);
  const [actionLesson, setActionLesson] = useState<ParkGolfLesson | null>(null);
  const [reportLesson, setReportLesson] = useState<ParkGolfLesson | null>(null);
  const [reportTrigger, setReportTrigger] = useState<HTMLButtonElement | null>(null);

  useEffect(() => () => {
    if (keywordTimer.current) clearTimeout(keywordTimer.current);
  }, []);

  const navigate = (params: URLSearchParams) => {
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const applyFilters = (next: LessonFilters) => {
    const params = new URLSearchParams(searchParams.toString());
    setOptional(params, "keyword", next.keyword.trim(), "");
    setOptional(params, "type", next.type, "all");
    setOptional(params, "region", next.region, "전체");
    setOptional(params, "format", next.format, "all");
    setOptional(params, "target", next.target, "all");
    setOptional(params, "schedule", next.schedule, "all");
    params.set("tab", "paid-lessons");
    params.delete("page");
    navigate(params);
  };

  const updateFilters = (next: LessonFilters) => {
    const keywordChanged = next.keyword !== filters.keyword;
    setFilters(next);
    if (keywordTimer.current) clearTimeout(keywordTimer.current);
    if (keywordChanged) {
      keywordTimer.current = setTimeout(() => applyFilters(next), 350);
    } else {
      applyFilters(next);
    }
  };

  const resetFilters = () => {
    const next = createDefaultLessonFilters();
    setFilters(next);
    if (keywordTimer.current) clearTimeout(keywordTimer.current);
    applyFilters(next);
  };

  const changeLessonPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "paid-lessons");
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    navigate(params);
  };

  const changeVideoCategory = (category: VideoLessonCategory | "all") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "free-videos");
    if (category === "all") params.delete("videoCategory");
    else params.set("videoCategory", category);
    params.delete("videoPage");
    navigate(params);
  };

  const changeVideoPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "free-videos");
    if (page <= 1) params.delete("videoPage");
    else params.set("videoPage", String(page));
    navigate(params);
  };

  const changeSavedOnly = (nextSavedOnly: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "free-videos");
    if (nextSavedOnly) params.set("saved", "1");
    else params.delete("saved");
    params.delete("videoPage");

    if (nextSavedOnly && !isAuthenticated) {
      const nextPath = `${pathname}?${params.toString()}`;
      router.push(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }
    navigate(params);
  };

  const handleInquiry = (lesson: ParkGolfLesson) => {
    setActionLesson(lesson);
    setInfoModal("inquiry");
  };

  const handleReport = (lesson: ParkGolfLesson, trigger: HTMLButtonElement) => {
    setReportLesson(lesson);
    setReportTrigger(trigger);
  };

  const handleVideoBookmark = (video: PublicLessonVideo) => {
    const videoKey = video.videoKey;
    const nextSaved = !savedVideoKeys.has(videoKey);
    if (!isAuthenticated) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "free-videos");
      const nextPath = `${pathname}?${params.toString()}`;
      router.push(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }
    if (pendingVideoKeys.has(videoKey)) return;

    setBookmarkMutationError(null);
    setBookmarkNotice(null);
    setPendingVideoKeys((current) => new Set(current).add(videoKey));
    startTransition(async () => {
      const result = await setLessonVideoBookmarkAction(videoKey, nextSaved);
      if (result.ok) {
        setSavedVideoKeys((current) => {
          const next = new Set(current);
          if (result.data.saved) next.add(result.data.videoKey);
          else next.delete(result.data.videoKey);
          return next;
        });
        setBookmarkNotice(result.data.saved ? "관심 영상에 저장했습니다." : "관심 영상에서 해제했습니다.");
      } else if (result.code === "authentication") {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", "free-videos");
        const nextPath = `${pathname}?${params.toString()}`;
        router.push(`/login?next=${encodeURIComponent(nextPath)}`);
      } else {
        setBookmarkMutationError(result.error);
      }
      setPendingVideoKeys((current) => {
        const next = new Set(current);
        next.delete(videoKey);
        return next;
      });
    });
  };

  const lessonPageNumber = Math.floor(lessonPage.offset / lessonPage.limit) + 1;
  const videoPageNumber = Math.floor(videoPage.offset / videoPage.limit) + 1;
  const regionSummary = filters.region === "전체" ? "전국" : filters.region;
  const inquiryHref = actionLesson?.inquiryUrl ?? actionLesson?.officialUrl ?? undefined;
  const currentLessonsPath = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;

  const paidSection = (
    <div id="paid-lessons-section" className="space-y-3 rounded-xl border border-pul-border bg-white p-2.5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:space-y-6 lg:p-5">
      <div>
        <p className="text-[10px] font-bold tracking-[0.14em] text-pul-point lg:text-[11px]">PAID LESSONS</p>
        <h2 className="mt-1 text-lg font-bold text-foreground lg:text-xl">유료 레슨·교육</h2>
        <p className="mt-1 text-xs text-pul-muted lg:text-sm">
          PUL은 교육 정보를 제공하며 신청·예약·결제는 주관기관의 외부 공식 경로에서 진행됩니다.
        </p>
      </div>

      <div className="space-y-2 lg:hidden">
        <MobileSearchToolbar
          keyword={filters.keyword}
          onKeywordChange={(keyword) => updateFilters({ ...filters, keyword })}
          onFilterToggle={() => setShowMobileFilters((value) => !value)}
          showFilters={showMobileFilters}
          resultCount={lessonPage.total}
          regionSummary={regionSummary}
        />
        <MobileLessonQuickFilter filters={filters} onChange={updateFilters} typeOptions={paidTabLessonTypes} />
        {showMobileFilters && (
          <LessonSearchFilter
            filters={filters}
            onChange={updateFilters}
            onReset={resetFilters}
            resultCount={lessonPage.total}
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
          resultCount={lessonPage.total}
          typeOptions={paidTabLessonTypes}
          targetOptions={paidTabLessonTargets}
        />
      </div>

      {featuredLessons.length > 0 && (
        <FeaturedLessonCards lessons={featuredLessons} onInquiry={handleInquiry} onDetail={setSelectedLesson} />
      )}

      <LessonPartnerBanner variant="paid-register" onInquiry={() => router.push("/lessons/submit?type=lesson")} />

      <section aria-busy={isPending}>
        <div className="mb-3 lg:mb-4">
          <h3 className="text-base font-bold text-foreground lg:text-lg">유료 레슨·교육 목록</h3>
          <p className="mt-0.5 text-xs text-pul-muted lg:mt-1 lg:text-sm">
            {regionSummary} 기준 검색 결과 {lessonPage.total}개입니다.
          </p>
          <span className="sr-only" aria-live="polite">{isPending ? "검색 결과를 불러오는 중입니다." : "검색 결과를 불러왔습니다."}</span>
        </div>

        {lessonError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-800">{lessonError}</div>
        ) : lessonPage.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-pul-border bg-[#fafbfa] px-6 py-14 text-center">
            <p className="text-base font-semibold text-foreground">현재 등록된 레슨·교육 프로그램이 없습니다.</p>
            <p className="mt-1 text-sm text-pul-muted">다른 검색 조건을 선택하거나 추후 다시 확인해 주세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
            {lessonPage.items.map((lesson) => (
              <LessonCard key={lesson.lessonKey} lesson={lesson} onInquiry={handleInquiry} onDetail={setSelectedLesson} />
            ))}
          </div>
        )}

        {!lessonError && lessonPage.total > 0 && (
          <nav className="mt-4 flex items-center justify-center gap-2" aria-label="유료 레슨 페이지">
            <button type="button" disabled={lessonPageNumber <= 1 || isPending} onClick={() => changeLessonPage(lessonPageNumber - 1)} className="min-h-11 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep disabled:cursor-not-allowed disabled:opacity-40">이전</button>
            <span className="px-2 text-sm font-semibold text-pul-muted">{lessonPageNumber}페이지</span>
            <button type="button" disabled={!lessonPage.hasMore || isPending} onClick={() => changeLessonPage(lessonPageNumber + 1)} className="min-h-11 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep disabled:cursor-not-allowed disabled:opacity-40">다음</button>
          </nav>
        )}
      </section>

      <CertificationLinkBanner variant="paid-footer" onViewCertification={() => setInfoModal("certification")} />
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
            videos={videoPage.items}
            total={videoPage.total}
            hasMore={videoPage.hasMore}
            pageNumber={videoPageNumber}
            category={initialVideoCategory ?? "all"}
            error={videoError}
            bookmarkError={bookmarkMutationError ?? bookmarkError}
            bookmarkNotice={bookmarkNotice}
            isAuthenticated={isAuthenticated}
            savedOnly={savedOnly}
            savedVideoKeys={isAuthenticated ? savedVideoKeys : emptySavedVideoKeys}
            pendingVideoKeys={pendingVideoKeys}
            onCategoryChange={changeVideoCategory}
            onPageChange={changeVideoPage}
            onSavedOnlyChange={changeSavedOnly}
            onToggleInterest={handleVideoBookmark}
            onVideoRegister={() => router.push("/lessons/submit?type=video")}
            hiddenCategories={["cert_referee"]}
          />
        )}
        {activeTab === "paid-lessons" && paidSection}
        {activeTab === "instructor-promotion" && (
          <LessonsInstructorPromotionTab
            onVideoRegister={() => router.push("/lessons/submit?type=video")}
            onLessonRegister={() => router.push("/lessons/submit?type=lesson")}
            onPartnerInquiry={() => setInfoModal("partner")}
          />
        )}
        {activeTab === "university-departments" && (
          <LessonsUniversityDepartmentsTab
            page={universityDepartmentPage}
            error={universityDepartmentError}
            keyword={universityKeyword}
            region={universityRegion}
            isAuthenticated={isAuthenticated}
          />
        )}
      </div>

      <LessonDetailModal
        lesson={selectedLesson}
        onClose={() => setSelectedLesson(null)}
        onInquiry={handleInquiry}
        onReport={handleReport}
        isCovered={reportLesson !== null}
      />

      {reportLesson ? (
        <LessonInformationReportDialog
          lesson={reportLesson}
          trigger={reportTrigger}
          nextPath={currentLessonsPath}
          onClose={() => {
            setReportLesson(null);
            setReportTrigger(null);
          }}
        />
      ) : null}

      {infoModal === "inquiry" && (
        <InfoModal
          title="외부 문의·신청"
          message={`${actionLesson?.title ?? "교육"}\n\n${actionLesson?.contactMethod ?? "주관기관 문의 정보가 아직 등록되지 않았습니다."}\n\nPUL은 신청·예약·결제를 직접 처리하지 않습니다.`}
          actionLabel={inquiryHref ? "공식 문의처 열기" : undefined}
          actionHref={inquiryHref}
          onClose={() => { setInfoModal(null); setActionLesson(null); }}
        />
      )}
      {infoModal === "partner" && (
        <InfoModal title="홍보·제휴 문의" message={LESSON_PARTNER_INQUIRY_MESSAGE} actionLabel="문의 양식" actionHref={LESSON_PARTNER_INQUIRY_URL} onClose={() => setInfoModal(null)} />
      )}
      {infoModal === "certification" && (
        <InfoModal title="자격증·심판 메뉴" message="자격증·심판 정보는 별도 메뉴에서 제공합니다." actionLabel="자격증·심판 보기" actionHref="/certification" onClose={() => setInfoModal(null)} />
      )}
    </>
  );
}
