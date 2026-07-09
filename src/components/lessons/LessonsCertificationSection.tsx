"use client";

import { FeaturedYoutubeInstructors } from "@/components/lessons/FeaturedYoutubeInstructors";
import { LessonRegisterGuide } from "@/components/lessons/LessonRegisterGuide";
import { VideoLessonCard } from "@/components/lessons/VideoLessonCard";
import { YoutubePromotionBanner } from "@/components/lessons/YoutubePromotionBanner";
import { lessonTypeLabels, parkGolfLessons } from "@/data/lessonData";
import {
  certificationFeaturedInstructor,
  filterVideoLessons,
  getCertificationFeaturedVideos,
  videoLessons,
} from "@/data/videoLessonData";
import type { VideoLesson } from "@/types";

const MOBILE_CERT_PAID_LIMIT = 3;

type LessonsCertificationSectionProps = {
  onGoToPaidTab?: () => void;
  onGoToFreeVideosTab?: () => void;
  onSaveInterest?: (lesson: VideoLesson) => void;
  onVideoRegister?: () => void;
  onLessonRegister?: () => void;
};

export function LessonsCertificationSection({
  onGoToPaidTab,
  onGoToFreeVideosTab,
  onSaveInterest,
  onVideoRegister,
  onLessonRegister,
}: LessonsCertificationSectionProps) {
  const certVideos = filterVideoLessons(videoLessons, "cert_referee");
  const featuredCertVideos = getCertificationFeaturedVideos();
  const certLessons = parkGolfLessons.filter(
    (lesson) =>
      lesson.type === "certification" ||
      lesson.type === "referee" ||
      lesson.type === "instructor",
  );
  const mobileCertLessons = certLessons.slice(0, MOBILE_CERT_PAID_LIMIT);

  return (
    <section className="space-y-3 rounded-xl border border-pul-border bg-white p-2.5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:space-y-6 lg:p-5">
      <div>
        <h2 className="text-lg font-bold text-foreground lg:text-xl">
          자격증·심판 교육
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          지도자·심판 자격증 준비를 위한 무료 영상과 유료 과정을 함께 확인하세요.
        </p>
      </div>

      {/* 모바일: 간결한 자격증 탭 전용 구성 */}
      <div className="space-y-3 lg:hidden">
        {featuredCertVideos.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-bold text-foreground">주요 무료 영상</h3>
            <div className="grid grid-cols-1 gap-2">
              {featuredCertVideos.map((video) => (
                <VideoLessonCard
                  key={video.id}
                  lesson={video}
                  onSaveInterest={onSaveInterest ?? (() => undefined)}
                />
              ))}
            </div>
          </div>
        )}

        {onGoToFreeVideosTab && (
          <button
            type="button"
            onClick={onGoToFreeVideosTab}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
          >
            무료 영상 강의 전체 보기
          </button>
        )}

        {mobileCertLessons.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-bold text-foreground">
              유료 자격증·심판 과정
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {mobileCertLessons.map((lesson) => (
                <article
                  key={lesson.id}
                  className="rounded-lg border border-pul-border bg-[#fafbfa] px-2.5 py-2.5"
                >
                  <p className="text-[10px] font-semibold text-pul-point">
                    {lessonTypeLabels[lesson.type]}
                  </p>
                  <p className="mt-0.5 text-sm font-bold leading-snug text-foreground">
                    {lesson.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-pul-muted">
                    {lesson.regionLabel} · {lesson.price}
                  </p>
                </article>
              ))}
            </div>
            {certLessons.length > MOBILE_CERT_PAID_LIMIT && onGoToPaidTab && (
              <button
                type="button"
                onClick={onGoToPaidTab}
                className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-xs font-bold text-pul-deep hover:bg-pul-light"
              >
                유료 레슨·교육 탭에서 자세히 보기
              </button>
            )}
          </div>
        )}

        <FeaturedYoutubeInstructors
          instructors={[certificationFeaturedInstructor]}
          title="자격증 관련 추천 교습가"
          mobileVisibleCount={1}
          showOperationNotice={false}
          className="mb-0"
        />

        {onVideoRegister && (
          <YoutubePromotionBanner onRegister={onVideoRegister} />
        )}

        {onLessonRegister && (
          <LessonRegisterGuide onRegister={onLessonRegister} />
        )}
      </div>

      {/* PC: 기존 구성 유지 */}
      <div className="hidden space-y-5 lg:block">
        {certVideos.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-bold text-foreground lg:text-base">
              추천 무료 영상
            </h3>
            <ul className="space-y-2">
              {certVideos.map((video) => (
                <li
                  key={video.id}
                  className="rounded-lg border border-emerald-200/50 bg-emerald-50/30 px-3 py-2.5"
                >
                  <p className="text-sm font-semibold text-foreground">{video.title}</p>
                  <p className="mt-0.5 text-xs text-pul-muted">
                    {video.instructorName} · {video.duration}
                  </p>
                  <a
                    href={video.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex text-xs font-bold text-red-600 hover:underline"
                  >
                    YouTube 보기 →
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {certLessons.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-bold text-foreground lg:text-base">
              유료 자격증·심판 과정
            </h3>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-4">
              {certLessons.map((lesson) => (
                <article
                  key={lesson.id}
                  className="rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-3"
                >
                  <p className="text-xs font-semibold text-pul-point">
                    {lessonTypeLabels[lesson.type]}
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">{lesson.title}</p>
                  <p className="mt-1 text-xs text-pul-muted">
                    {lesson.regionLabel} · {lesson.price}
                  </p>
                </article>
              ))}
            </div>
            <button
              type="button"
              onClick={onGoToPaidTab}
              className="mt-3 inline-flex text-sm font-bold text-pul-point hover:underline"
            >
              유료 레슨·교육 탭에서 자세히 보기 →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
