"use client";

import { submitLessonInformationReportAction } from "@/app/lessons/actions";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import type { LessonInformationReportType } from "@/lib/lessons/lessonInformationReports";
import type { ParkGolfLesson } from "@/types";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";

type Props = {
  lesson: ParkGolfLesson;
  trigger: HTMLElement | null;
  nextPath: string;
  onClose: () => void;
};

const fieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20";

export function LessonInformationReportDialog({ lesson, trigger, nextPath, onClose }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLSelectElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [reportType, setReportType] = useState<LessonInformationReportType>(
    "incorrect_information",
  );
  const [reportBody, setReportBody] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [authenticationRequired, setAuthenticationRequired] = useState(false);
  const [pending, startTransition] = useTransition();
  useBodyScrollLock(true);

  const close = useCallback(() => {
    if (pending) return;
    onClose();
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }, [onClose, pending, trigger]);

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], select:not([disabled]), textarea:not([disabled])',
        ),
      ];
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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setAuthenticationRequired(false);
    startTransition(async () => {
      const result = await submitLessonInformationReportAction({
        lessonKey: lesson.lessonKey ?? lesson.id,
        reportType,
        reportBody,
      });
      if (!result.ok) {
        setError(result.error);
        setAuthenticationRequired(result.authenticationRequired);
        return;
      }
      setSuccess(true);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        ref={panelRef}
        className="flex max-h-[calc(100dvh-16px)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-pul-border px-4 py-3 sm:px-5">
          <div>
            <h2 id={titleId} className="text-xl font-bold text-foreground">
              레슨 정보 제보하기
            </h2>
            <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-pul-muted">
              접수한 내용은 PUL 운영팀이 확인하며 레슨 정보는 자동으로 변경되지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={pending}
            aria-label="닫기"
            className="min-h-11 min-w-11 rounded-full bg-pul-page text-2xl font-bold text-pul-muted disabled:opacity-50"
          >
            ×
          </button>
        </header>

        {success ? (
          <div className="p-5" role="status">
            <p className="rounded-xl bg-emerald-50 p-4 text-base font-bold leading-relaxed text-emerald-900">
              제보가 정상적으로 접수되었습니다. PUL 운영팀이 내용을 확인합니다.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-5 min-h-11 w-full rounded-lg bg-pul-point px-4 font-bold text-white"
            >
              확인
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <section aria-label="대상 레슨" className="rounded-xl bg-pul-light px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-pul-point">대상 레슨</p>
              <p className="mt-1 font-bold text-foreground">{lesson.title}</p>
              <p className="mt-1 text-sm text-pul-muted">
                {lesson.regionLabel} · {lesson.location}
              </p>
              <p className="mt-1 text-sm text-pul-muted">운영기관: {lesson.organizer}</p>
            </section>

            <div className="mt-4 grid gap-4">
              <label>
                <span className="text-sm font-bold">신고 유형 *</span>
                <select
                  ref={firstRef}
                  required
                  value={reportType}
                  onChange={(event) => setReportType(event.target.value as LessonInformationReportType)}
                  className={fieldClass}
                >
                  <option value="incorrect_information">잘못된 정보</option>
                  <option value="operation_changed">운영 종료·변경</option>
                  <option value="inappropriate_content">부적절한 내용</option>
                  <option value="other">기타</option>
                </select>
              </label>
              <label>
                <span className="text-sm font-bold">제보 내용 *</span>
                <textarea
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={8}
                  value={reportBody}
                  onChange={(event) => setReportBody(event.target.value)}
                  className={`${fieldClass} py-3 leading-relaxed`}
                />
              </label>
            </div>

            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
              개인 전화번호·주민번호 등 불필요한 개인정보는 입력하지 마세요.
            </p>
            {error ? (
              <div className="mt-3">
                <p
                  ref={errorRef}
                  tabIndex={-1}
                  className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800 outline-none"
                  role="alert"
                >
                  {error}
                </p>
                {authenticationRequired ? (
                  <Link
                    href={`/login?next=${encodeURIComponent(nextPath)}`}
                    className="mt-2 inline-flex min-h-11 items-center font-bold text-pul-deep underline"
                  >
                    로그인하기
                  </Link>
                ) : null}
              </div>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-pul-border pt-4">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="min-h-11 rounded-lg border border-pul-border font-bold disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 rounded-lg bg-pul-point font-bold text-white disabled:opacity-50"
              >
                {pending ? "접수 중…" : "제보 접수"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
