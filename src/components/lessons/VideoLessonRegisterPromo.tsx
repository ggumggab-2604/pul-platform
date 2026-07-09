"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

/**
 * TODO:
 * - 회원 전용 YouTube 영상 링크 등록
 * - 카테고리 필수 선택
 * - 난이도 선택
 * - 하루 등록 수 제한
 * - 인증 교습가 등록 수 확대
 * - 신고 누적 자동 블라인드
 * - 운영자 추천 영상 지정
 * - 운영자 삭제/숨김 처리
 */

const VIDEO_REGISTER_CRITERIA = [
  "파크골프와 관련된 영상만 등록할 수 있습니다.",
  "영상 등록 시 카테고리를 선택해야 합니다.",
  "제목, 설명, 채널명, 강사명, 난이도를 입력해야 합니다.",
  "정치, 종교, 투자, 건강식품, 무관한 광고 영상은 제한됩니다.",
  "중복 영상이나 허위 제목 영상은 숨김 처리될 수 있습니다.",
  "신고가 누적되면 임시 블라인드 처리될 수 있습니다.",
  "운영자는 부적절한 영상을 삭제하거나 추천에서 제외할 수 있습니다.",
] as const;

type VideoLessonRegisterPromoProps = {
  onRegisterLink: () => void;
};

function RegisterCriteriaModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-register-criteria-title"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-pul-border bg-white p-5 shadow-[0_12px_40px_rgba(6,78,59,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="video-register-criteria-title"
          className="text-lg font-bold text-foreground"
        >
          영상 등록 기준
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-pul-muted">
          PUL 무료 영상 강의에 등록할 때 아래 기준을 확인해 주세요.
        </p>
        <ul className="mt-4 space-y-2">
          {VIDEO_REGISTER_CRITERIA.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
              {item}
            </li>
          ))}
        </ul>
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

export function VideoLessonRegisterPromo({
  onRegisterLink,
}: VideoLessonRegisterPromoProps) {
  const [showCriteria, setShowCriteria] = useState(false);

  return (
    <>
      <aside
        data-ad-slot="youtube-lesson-register-promo"
        className="rounded-lg border border-dashed border-pul-point/30 bg-gradient-to-r from-pul-light/40 via-white to-emerald-50/50 px-2.5 py-2.5 lg:rounded-xl lg:px-4 lg:py-4"
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-pul-deep lg:text-base">
            내 유튜브 강의 영상을 등록하고 싶으신가요?
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-pul-muted lg:text-sm lg:leading-relaxed">
            YouTube에 올린 파크골프 강의 영상을 PUL에 등록하고, 내 채널로 더 많은
            사람을 유입해보세요.
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-pul-muted lg:text-xs lg:leading-relaxed">
            초기에는 운영자가 확인 후 수동 등록하고, 이후에는 회원 직접 등록 기능으로
            확장할 예정입니다.
          </p>
        </div>

        <div
          className={cn(
            "mt-3 flex flex-col gap-2 sm:flex-row lg:mt-4 lg:justify-end",
          )}
        >
          {/*
            TODO: 회원 로그인 후 YouTube 영상 링크 직접 등록 기능으로 확장 예정
            현재는 임시 문의 연결만 제공합니다.
          */}
          <button
            type="button"
            onClick={onRegisterLink}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-pul-point px-4 text-sm font-bold text-white transition-colors hover:bg-pul-deep sm:flex-none lg:min-w-[160px]"
          >
            영상 링크 등록하기
          </button>
          <button
            type="button"
            onClick={() => setShowCriteria(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep transition-colors hover:bg-pul-light sm:flex-none lg:min-w-[140px]"
          >
            등록 기준 보기
          </button>
        </div>
      </aside>

      {showCriteria && (
        <RegisterCriteriaModal onClose={() => setShowCriteria(false)} />
      )}
    </>
  );
}
