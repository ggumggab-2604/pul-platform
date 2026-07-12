"use client";

import { Camera, Pencil, Trophy } from "lucide-react";

type CourseBottomActionsProps = {
  onUploadPhoto: () => void;
  onRecordVerify: () => void;
  onReport: () => void;
};

/** 하단 참여 액션만 — 길찾기·전화·동호회·즐겨찾기·공유는 상단 빠른이용과 중복이라 제외 */
export function CourseBottomActions({
  onUploadPhoto,
  onRecordVerify,
  onReport,
}: CourseBottomActionsProps) {
  return (
    <section
      className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5"
      aria-label="참여하기"
    >
      <h2 className="mb-3 text-base font-bold text-pul-deep lg:text-lg">참여하기</h2>
      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-3 lg:gap-3">
        <button
          type="button"
          onClick={onUploadPhoto}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light"
        >
          <Camera className="h-5 w-5 shrink-0" aria-hidden="true" />
          현장사진 올리기
        </button>
        <button
          type="button"
          onClick={onRecordVerify}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light"
        >
          <Trophy className="h-5 w-5 shrink-0" aria-hidden="true" />
          기록 인증 신청
        </button>
        <button
          type="button"
          onClick={onReport}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light"
        >
          <Pencil className="h-5 w-5 shrink-0" aria-hidden="true" />
          정보 수정 제보
        </button>
      </div>
    </section>
  );
}
