"use client";

import { HofRecordPhotoLightbox } from "@/components/courses/detail/HofRecordPhotoLightbox";
import type { HallOfFameRecordCard } from "@/data/courseDetailPageData";
import { cn } from "@/lib/utils";
import { BadgeCheck, ImageIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type HallOfFameRecordCardProps = {
  record: HallOfFameRecordCard;
  onViewAll: () => void;
  onVerifyApply: () => void;
};

export function HallOfFameRecordCardView({
  record,
  onViewAll,
  onVerifyApply,
}: HallOfFameRecordCardProps) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const empty = !record.recent || record.totalCount === 0;
  const recent = record.recent;
  const isVerified = recent?.verified === true;

  return (
    <>
      <article className="flex h-full flex-col rounded-xl border border-pul-border/80 bg-gradient-to-br from-amber-50/40 via-white to-pul-light/30 p-4 lg:p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-foreground lg:text-xl">{record.label}</h3>
            <p className="mt-1 text-2xl font-bold text-pul-point lg:text-3xl">
              누적 {record.totalCount}회
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
            {record.label}
          </span>
        </div>

        {empty ? (
          <p className="mt-4 flex-1 text-base text-pul-muted lg:text-lg">
            이 구장의 첫 {record.label} 기록을 등록해 보세요.
          </p>
        ) : !isVerified ? (
          <div className="mt-4 flex-1 space-y-2">
            <p className="text-sm font-semibold text-pul-muted">인증 대기 기록</p>
            <p className="text-base text-pul-muted">
              제출된 기록이 검토 중입니다. 인증 완료 전에는 공식 기록으로 표시되지 않습니다.
            </p>
            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600 ring-1 ring-gray-200/80">
              인증 대기 · 공식 기록 아님
            </span>
          </div>
        ) : (
          <div className="mt-4 flex-1">
            <div className="flex gap-3">
              {recent!.photoSrc ? (
                <button
                  type="button"
                  onClick={() => setPhotoOpen(true)}
                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-2 ring-pul-point/30 transition hover:ring-pul-point lg:h-24 lg:w-24"
                  aria-label={`${recent!.memberName} 인증사진 보기`}
                >
                  <Image
                    src={recent!.photoSrc}
                    alt={`${recent!.memberName} ${record.label} 인증사진`}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] font-bold text-white lg:text-xs">
                    인증사진
                  </span>
                </button>
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-pul-light text-pul-muted ring-1 ring-pul-border lg:h-24 lg:w-24">
                  <ImageIcon className="h-6 w-6" aria-hidden="true" />
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[15px] font-semibold text-pul-muted lg:text-sm">최근 기록자</p>
                <p className="text-xl font-bold text-foreground">{recent!.memberName}</p>
                <p className="text-[15px] text-pul-muted lg:text-base">{recent!.clubName}</p>
                <p className="text-[15px] font-semibold text-pul-deep lg:text-base">
                  {recent!.date} · {recent!.courseHole}
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200/70">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  인증 완료
                </span>
              </div>
            </div>

            {recent!.photoSrc ? (
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-[15px] font-bold text-pul-deep hover:bg-pul-light lg:text-base"
              >
                인증사진 보기
              </button>
            ) : null}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-[15px] font-bold text-pul-deep hover:bg-pul-light lg:text-base"
          >
            전체 기록 보기
          </button>
          <button
            type="button"
            onClick={onVerifyApply}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg text-[15px] font-bold lg:text-base",
              empty
                ? "bg-pul-point text-white hover:bg-pul-deep"
                : "border border-pul-border bg-white text-pul-deep hover:bg-pul-light",
            )}
          >
            기록 인증 신청
          </button>
        </div>
      </article>

      {photoOpen && recent?.photoSrc && isVerified ? (
        <HofRecordPhotoLightbox
          photoSrc={recent.photoSrc}
          alt={`${recent.memberName} ${record.label} 인증사진`}
          memberName={recent.memberName}
          courseHole={recent.courseHole}
          date={recent.date}
          verified={recent.verified}
          onClose={() => setPhotoOpen(false)}
        />
      ) : null}
    </>
  );
}
