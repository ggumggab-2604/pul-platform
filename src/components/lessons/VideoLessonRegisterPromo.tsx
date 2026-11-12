"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

const VIDEO_REGISTER_CRITERIA = [
  "파크골프와 관련된 영상만 등록할 수 있습니다.",
  "YouTube 영상 주소와 카테고리를 선택하면 바로 공개됩니다.",
  "정치, 종교, 투자, 건강식품, 무관한 광고 영상은 제한됩니다.",
  "서로 다른 회원 5명이 신고하면 영상 링크가 자동으로 숨겨집니다.",
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
            무료 영상 링크 등록
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-pul-muted lg:text-sm lg:leading-relaxed">
            로그인한 회원은 YouTube 파크골프 강의 링크를 공유할 수 있습니다.
          </p>
        </div>

        <div
          className={cn(
            "mt-3 flex flex-col gap-2 sm:flex-row lg:mt-4 lg:justify-end",
          )}
        >
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
