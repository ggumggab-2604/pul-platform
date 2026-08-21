"use client";

import { LessonRecruitBadge, LessonTypeBadge } from "@/components/lessons/LessonCard";
import {
  lessonFormatLabels,
  lessonTargetLabels,
  lessonTypeLabels,
} from "@/data/lessonData";
import type { ParkGolfLesson } from "@/types";
import { useEffect, useRef } from "react";

type LessonDetailModalProps = {
  lesson: ParkGolfLesson | null;
  onClose: () => void;
  onInquiry: (lesson: ParkGolfLesson) => void;
  onReport: (lesson: ParkGolfLesson, trigger: HTMLButtonElement) => void;
  isCovered?: boolean;
};

export function LessonDetailModal({
  lesson,
  onClose,
  onInquiry,
  onReport,
  isCovered = false,
}: LessonDetailModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isCoveredRef = useRef(isCovered);

  useEffect(() => {
    isCoveredRef.current = isCovered;
  }, [isCovered]);

  useEffect(() => {
    if (!lesson) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isCoveredRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [lesson, onClose]);

  if (!lesson) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lesson-detail-title"
      aria-hidden={isCovered || undefined}
      inert={isCovered || undefined}
      onClick={onClose}
    >
      <article
        ref={dialogRef}
        className="max-h-[min(92dvh,100%)] w-full overflow-y-auto rounded-t-2xl border border-pul-border bg-white shadow-[0_12px_40px_rgba(6,78,59,0.2)] sm:max-w-lg sm:rounded-xl lg:max-h-[90vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-pul-border/60 bg-gradient-to-r from-pul-light/60 to-white px-4 py-3 lg:static lg:px-5 lg:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 pr-1">
              <p className="text-xs font-semibold text-pul-point">
                {lessonTypeLabels[lesson.type]}
              </p>
              <h2
                id="lesson-detail-title"
                className="mt-1 text-lg font-bold leading-snug text-foreground lg:text-xl"
              >
                {lesson.title}
              </h2>
              <p className="mt-1 text-xs font-medium text-pul-deep lg:text-sm lg:font-normal lg:text-pul-muted">
                {lesson.regionLabel} · {lesson.location}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl font-bold text-pul-muted shadow-sm ring-1 ring-pul-border lg:h-9 lg:w-9 lg:text-lg"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4 pb-6 lg:space-y-5 lg:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <LessonTypeBadge type={lesson.type} />
            <LessonRecruitBadge lesson={lesson} />
            <span className="rounded-md bg-pul-light/80 px-2 py-0.5 text-xs font-medium text-pul-deep">
              {lessonFormatLabels[lesson.format]}
            </span>
          </div>

          <dl className="grid grid-cols-1 gap-3 text-sm lg:grid-cols-2">
            <div>
              <dt className="font-medium text-pul-muted">강사</dt>
              <dd className="mt-0.5 font-semibold text-foreground">
                {lesson.instructor}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-pul-muted">운영기관</dt>
              <dd className="mt-0.5 font-semibold text-foreground">
                {lesson.organizer}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-pul-muted">대상</dt>
              <dd className="mt-0.5 font-semibold text-foreground">
                {lesson.target.map((t) => lessonTargetLabels[t]).join(", ")}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-pul-muted">일정</dt>
              <dd className="mt-0.5 font-semibold text-foreground">
                {lesson.schedule}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-pul-muted">교육 시간</dt>
              <dd className="mt-0.5 font-semibold text-foreground">{lesson.time}</dd>
            </div>
            <div>
              <dt className="font-medium text-pul-muted">비용</dt>
              <dd className="mt-0.5 font-bold text-pul-deep">{lesson.price}</dd>
            </div>
          </dl>

          <div>
            <h3 className="text-sm font-bold text-foreground">준비물</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-pul-muted">
              {lesson.supplies}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">교육 내용</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-pul-muted">
              {lesson.curriculum}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">신청 방법</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-pul-muted">
              {lesson.contactMethod}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">유의사항</h3>
            <ul className="mt-2 space-y-1.5">
              {lesson.notices.map((notice) => (
                <li
                  key={notice}
                  className="rounded-lg bg-pul-light/60 px-3 py-2 text-sm text-pul-deep"
                >
                  {notice}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm leading-relaxed text-pul-muted">{lesson.description}</p>

          <p className="rounded-lg bg-pul-light/60 px-3 py-2 text-sm leading-relaxed text-pul-deep">
            PUL은 레슨 신청·예약·결제를 직접 처리하지 않습니다. 주관기관이나 강사의
            외부 공식 페이지에서 조건을 다시 확인해 주세요.
          </p>

          <div className="flex flex-col gap-2 pb-2 lg:flex-row">
            {lesson.inquiryUrl ? (
              <a
                href={lesson.inquiryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
              >
                외부 공식 문의·신청
              </a>
            ) : (
              <button
                type="button"
                onClick={() => onInquiry(lesson)}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
              >
                문의 정보 확인
              </button>
            )}
            {lesson.officialUrl && lesson.officialUrl !== lesson.inquiryUrl && (
              <a
                href={lesson.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-pul-point/30 text-sm font-bold text-pul-deep hover:bg-pul-light"
              >
                공식 안내 보기
              </a>
            )}
            <button
              type="button"
              onClick={(event) => onReport(lesson, event.currentTarget)}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-pul-border text-sm font-bold text-pul-muted hover:text-pul-deep"
            >
              신고하기
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
