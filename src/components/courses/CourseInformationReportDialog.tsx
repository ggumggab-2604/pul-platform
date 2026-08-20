"use client";

import { submitCourseInformationReportAction } from "@/app/courses/actions";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  courseRegionOptions,
  type CourseInformationReportInput,
  type CourseRegion,
  type PublicCourse,
} from "@/lib/courses/courseDirectory";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";

type Props = {
  course?: PublicCourse;
  trigger: HTMLElement | null;
  onClose: () => void;
};

const fieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20";

export function CourseInformationReportDialog({ course, trigger, onClose }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLSelectElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [reportType, setReportType] = useState<"new_course" | "correction">(
    course ? "correction" : "new_course",
  );
  const [courseName, setCourseName] = useState(course?.name ?? "");
  const [region, setRegion] = useState<CourseRegion>(course?.region ?? "서울");
  const [locationDescription, setLocationDescription] = useState(course?.address ?? "");
  const [operationDetails, setOperationDetails] = useState("");
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
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
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

  const changeType = (next: "new_course" | "correction") => {
    setReportType(next);
    if (next === "correction" && course) {
      setCourseName(course.name);
      setRegion(course.region);
      setLocationDescription(course.address);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setAuthenticationRequired(false);
    const input: CourseInformationReportInput = {
      reportType,
      courseKey: reportType === "correction" ? course?.courseKey ?? null : null,
      courseName: reportType === "new_course" ? courseName : course?.name ?? null,
      region: reportType === "new_course" ? region : course?.region ?? null,
      locationDescription:
        reportType === "new_course" ? locationDescription : course?.address ?? null,
      operationDetails,
      reportBody,
    };
    startTransition(async () => {
      const result = await submitCourseInformationReportAction(input);
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
              골프장 정보 제보하기
            </h2>
            <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-pul-muted">
              접수한 내용은 PUL 운영팀 확인 후 공식 골프장 정보에 별도로 반영됩니다.
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
              제보가 정상적으로 접수되었습니다. 확인이 필요한 경우 PUL 운영팀이 검토합니다.
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
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="text-sm font-bold">제보 종류</span>
                <select
                  ref={firstRef}
                  value={reportType}
                  onChange={(event) => changeType(event.target.value as "new_course" | "correction")}
                  className={fieldClass}
                >
                  <option value="new_course">신규 골프장</option>
                  {course ? <option value="correction">현재 골프장 정보수정</option> : null}
                </select>
              </label>

              {reportType === "new_course" ? (
                <>
                  <label>
                    <span className="text-sm font-bold">지역</span>
                    <select
                      value={region}
                      onChange={(event) => setRegion(event.target.value as CourseRegion)}
                      className={fieldClass}
                    >
                      {courseRegionOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-sm font-bold">골프장명</span>
                    <input required minLength={2} maxLength={120} value={courseName} onChange={(event) => setCourseName(event.target.value)} className={fieldClass} />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-sm font-bold">주소 또는 위치 설명</span>
                    <input required minLength={2} maxLength={500} value={locationDescription} onChange={(event) => setLocationDescription(event.target.value)} className={fieldClass} />
                  </label>
                </>
              ) : (
                <div className="rounded-lg bg-pul-light px-3 py-2 sm:col-span-2">
                  <p className="text-sm font-bold text-pul-deep">{course?.name}</p>
                  <p className="mt-1 text-sm text-pul-muted">{course?.address}</p>
                </div>
              )}

              <label className="sm:col-span-2">
                <span className="text-sm font-bold">알고 있는 운영 정보 (선택)</span>
                <textarea maxLength={1000} rows={3} value={operationDetails} onChange={(event) => setOperationDetails(event.target.value)} className={`${fieldClass} py-3 leading-relaxed`} />
              </label>
              <label className="sm:col-span-2">
                <span className="text-sm font-bold">제보 내용</span>
                <textarea required minLength={10} maxLength={3000} rows={7} value={reportBody} onChange={(event) => setReportBody(event.target.value)} className={`${fieldClass} py-3 leading-relaxed`} />
              </label>
            </div>

            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
              개인 전화번호·주민번호 등 불필요한 개인정보는 입력하지 마세요.
            </p>
            {error ? (
              <div className="mt-3">
                <p ref={errorRef} tabIndex={-1} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800 outline-none" role="alert">
                  {error}
                </p>
                {authenticationRequired ? (
                  <Link href="/login?next=/courses" className="mt-2 inline-flex min-h-11 items-center font-bold text-pul-deep underline">
                    로그인하기
                  </Link>
                ) : null}
              </div>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-pul-border pt-4">
              <button type="button" onClick={close} disabled={pending} className="min-h-11 rounded-lg border border-pul-border font-bold disabled:opacity-50">취소</button>
              <button type="submit" disabled={pending || (reportType === "correction" && !course)} className="min-h-11 rounded-lg bg-pul-point font-bold text-white disabled:opacity-50">
                {pending ? "접수 중…" : "제보 접수"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
