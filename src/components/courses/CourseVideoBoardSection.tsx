"use client";

import { Card } from "@/components/ui/Card";
import {
  dashboardBodyClass,
  dashboardCardClass,
  dashboardFooterClass,
  dashboardListClass,
} from "@/components/courses/courseDetailDashboardLayout";
import type { CourseMapItem, CourseStrategyVideo } from "@/data/courseMapData";
import {
  getFeaturedStrategyVideos,
  getStrategyVideosSearchUrl,
} from "@/data/courseStrategyVideos";
import { cn } from "@/lib/utils";
import { ExternalLink, Link2, Mail, Play, Upload } from "lucide-react";
import { useState } from "react";

/**
 * TODO:
 * - YouTube 링크 등록 폼
 * - PUL 업로드 요청 접수
 * - 운영자 승인 후 영상 노출
 * - YouTube 링크 유효성 확인
 * - 골프장 상세에서 전체 영상게시판 페이지 연결
 * - 초상권/저작권 검수 워크플로
 */

const VIDEO_REGISTER_PREP_MESSAGE =
  "정식 오픈 후 회원은 YouTube 링크를 등록하거나, PUL 업로드 요청을 제출할 수 있습니다.\n유튜브 계정이 없는 회원은 촬영 영상을 운영자에게 제출하면 PUL 공식 YouTube 채널 업로드를 검토합니다.";

const featuredTypeStyles: Record<CourseStrategyVideo["featuredType"], string> = {
  "운영자 추천": "bg-pul-light text-pul-deep ring-pul-border/80",
  "인기 영상": "bg-orange-50 text-orange-800 ring-orange-200/70",
  "최신 영상": "bg-sky-50 text-sky-800 ring-sky-200/70",
};

function PrepModal({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-pul-border bg-white p-5 shadow-[0_12px_40px_rgba(6,78,59,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-pul-muted">
          {message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
        >
          확인
        </button>
      </div>
    </div>
  );
}

function StrategyVideoCard({
  video,
  className,
}: {
  video: CourseStrategyVideo;
  className?: string;
}) {
  return (
    <li className={cn("rounded-lg border border-pul-border/80 p-3 max-lg:p-2 lg:p-2.5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 max-lg:gap-1">
        <h3 className="min-w-0 flex-1 text-sm font-bold leading-snug text-foreground max-lg:line-clamp-1 max-lg:text-xs">
          {video.title}
        </h3>
        <span className="shrink-0 text-xs font-semibold text-pul-muted max-lg:text-[11px]">{video.duration}</span>
      </div>
      <p className="mt-1 text-xs text-pul-muted max-lg:mt-0.5 max-lg:line-clamp-1 max-lg:text-[11px]">
        {video.channelName} · {video.authorType}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5 max-lg:mt-1 max-lg:gap-1">
        <span className="rounded-full bg-pul-light px-2 py-0.5 text-[11px] font-semibold text-pul-deep ring-1 ring-pul-border/70">
          {video.category}
        </span>
        <span
          className={cn(
            "hidden rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 lg:inline-flex",
            featuredTypeStyles[video.featuredType],
          )}
        >
          {video.featuredType}
        </span>
      </div>
      <a
        href={video.youtubeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-red-700 max-lg:mt-1.5 max-lg:min-h-9 max-lg:py-2 lg:mt-2.5 lg:w-auto lg:min-h-0 lg:justify-start"
      >
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
        YouTube 보기
      </a>
    </li>
  );
}

const MOBILE_VIDEO_LIMIT = 2;
const PC_VIDEO_LIMIT = 2;

type CourseVideoBoardSectionProps = {
  course: CourseMapItem;
  className?: string;
  compact?: boolean;
};

export function CourseVideoBoardSection({
  course,
  className,
  compact = false,
}: CourseVideoBoardSectionProps) {
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const featured = getFeaturedStrategyVideos(course.strategyVideos, 3);
  const allVideosUrl = getStrategyVideosSearchUrl(course.name);

  if (featured.length === 0) return null;

  return (
    <>
      <Card
        title="이 구장 영상게시판"
        dense
        className={cn(dashboardCardClass, className)}
        bodyClassName={dashboardBodyClass}
      >
        <p
          className={cn(
            "shrink-0 text-sm leading-relaxed text-pul-muted max-lg:line-clamp-1 max-lg:text-xs",
            compact ? "line-clamp-1" : "lg:line-clamp-none",
          )}
        >
          회원 YouTube 공략 영상과 PUL 공식 채널 영상을 모아 보여줍니다.
        </p>

        {!compact && (
          <div className="mt-3 rounded-lg border border-pul-border/70 bg-[#fafbfa] p-2.5 lg:hidden">
            <p className="text-xs font-bold text-foreground">영상 등록 방식</p>
            <p className="mt-1 text-[11px] leading-relaxed text-pul-muted">
              ① YouTube 링크 직접 등록 · ② PUL 업로드 요청(이메일·카톡·Drive)
            </p>
          </div>
        )}

        {compact && (
          <p className="mt-2 line-clamp-1 text-[11px] leading-relaxed text-pul-muted max-lg:block lg:hidden">
            YouTube 링크 등록 · PUL 업로드 요청(이메일·카톡·Drive)
          </p>
        )}

        {!compact && (
          <div className="mt-3 hidden gap-2 lg:grid lg:grid-cols-2">
            <div className="rounded-lg border border-pul-border/70 bg-[#fafbfa] p-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-pul-point" aria-hidden="true" />
                <p className="text-xs font-bold text-foreground">YouTube 링크 등록</p>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-pul-muted">
                공개 YouTube 영상 링크를 직접 등록합니다.
              </p>
            </div>
            <div className="rounded-lg border border-pul-border/70 bg-[#fafbfa] p-3">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-pul-point" aria-hidden="true" />
                <p className="text-xs font-bold text-foreground">PUL 업로드 요청</p>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-pul-muted">
                이메일·카카오톡·Drive 제출 후 운영자 검토 업로드.
              </p>
            </div>
          </div>
        )}

        {compact && (
          <p className="mt-2 hidden shrink-0 text-[11px] leading-relaxed text-pul-muted lg:line-clamp-1 lg:block">
            YouTube 링크 등록 · PUL 업로드 요청(이메일·카톡·Drive)
          </p>
        )}

        <ul
          className={cn(
            "mt-3 grid grid-cols-1 gap-2.5 max-lg:mt-2 max-lg:gap-1.5 lg:gap-2",
            dashboardListClass,
          )}
        >
          {featured.map((video, index) => (
            <StrategyVideoCard
              key={video.id}
              video={video}
              className={cn(
                index >= MOBILE_VIDEO_LIMIT && "hidden lg:list-item",
                index >= PC_VIDEO_LIMIT && "lg:hidden",
              )}
            />
          ))}
        </ul>

        <div
          className={cn(
            "mt-4 flex shrink-0 flex-col gap-2 max-lg:mt-2.5 max-lg:gap-2 lg:flex-row lg:gap-2.5 lg:pt-0",
            dashboardFooterClass,
          )}
        >
          <button
            type="button"
            onClick={() => setShowRegisterModal(true)}
            className="inline-flex min-h-12 w-full flex-1 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 py-3 text-sm font-bold text-pul-deep hover:bg-pul-light max-lg:min-h-11 max-lg:py-2.5 lg:min-h-0 lg:py-2.5"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            영상 등록
          </button>
          <a
            href={allVideosUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 w-full flex-1 items-center justify-center gap-2 rounded-lg bg-pul-point px-4 py-2.5 text-sm font-bold text-white hover:bg-pul-deep max-lg:min-h-11 max-lg:py-2.5 lg:min-h-0"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            전체 영상 보기
            <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
          </a>
        </div>

        {!compact && (
          <p className="mt-2 hidden items-center justify-center gap-1 text-center text-[11px] text-pul-muted lg:flex">
            <Mail className="h-3 w-3" aria-hidden="true" />
            PUL 업로드 요청: video@pul-platform.kr (준비 중)
          </p>
        )}
      </Card>

      {showRegisterModal && (
        <PrepModal
          title="영상 등록 준비 중"
          message={VIDEO_REGISTER_PREP_MESSAGE}
          onClose={() => setShowRegisterModal(false)}
        />
      )}
    </>
  );
}
