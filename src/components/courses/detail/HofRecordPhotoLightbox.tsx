"use client";

import { BadgeCheck, X } from "lucide-react";
import Image from "next/image";
import { useEffect } from "react";

type HofRecordPhotoLightboxProps = {
  photoSrc: string;
  alt: string;
  memberName: string;
  courseHole: string;
  date: string;
  verified: boolean;
  onClose: () => void;
};

export function HofRecordPhotoLightbox({
  photoSrc,
  alt,
  memberName,
  courseHole,
  date,
  verified,
  onClose,
}: HofRecordPhotoLightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="인증사진 보기"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          aria-label="닫기"
        >
          <X className="h-6 w-6" />
        </button>

        <div className="relative aspect-[4/3] w-full bg-black">
          <Image src={photoSrc} alt={alt} fill className="object-contain" sizes="640px" />
        </div>

        <div className="space-y-2 p-4 lg:p-5">
          <p className="text-lg font-bold text-foreground">{memberName}</p>
          <p className="text-base text-pul-muted">
            {date} · {courseHole}
          </p>
          {verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200/70">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              인증 완료
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-sm font-bold text-gray-600 ring-1 ring-gray-200/80">
              인증 대기 · 공식 기록 아님
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
