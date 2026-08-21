"use client";

import { submitCertificationSubmissionRequestAction } from "@/app/certification/actions";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import type { CertificationSubmissionRequestType } from "@/lib/certification/certificationSubmissionRequests";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";

type Props = {
  requestType: CertificationSubmissionRequestType;
  trigger: HTMLElement | null;
  returnPath: string;
  onClose: () => void;
};

export function CertificationSubmissionRequestDialog({
  requestType,
  trigger,
  returnPath,
  onClose,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const [title, setTitle] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [region, setRegion] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [authenticationRequired, setAuthenticationRequired] = useState(false);
  const [pending, startTransition] = useTransition();
  useBodyScrollLock(true);

  const isCourse = requestType === "course_registration";
  const dialogTitle = isCourse ? "교육과정 등록 문의" : "구인 공고 등록 문의";

  const close = useCallback(() => {
    if (pending) return;
    onClose();
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }, [onClose, pending, trigger]);

  useEffect(() => {
    titleInputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  useEffect(() => {
    if (success) successRef.current?.focus({ preventScroll: true });
  }, [success]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled])',
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
      const result = await submitCertificationSubmissionRequestAction({
        requestType,
        title,
        organizationName,
        region,
        summary,
        sourceUrl,
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
            <h2 id={titleId} className="text-xl font-bold text-foreground">{dialogTitle}</h2>
            <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-pul-muted">
              접수한 내용은 PUL 운영팀이 확인하며 교육과정이나 구인 공고로 자동 게시되지 않습니다.
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
          <div className="p-5">
            <p
              ref={successRef}
              tabIndex={-1}
              className="rounded-xl bg-emerald-50 p-4 text-base font-bold leading-relaxed text-emerald-900 outline-none"
              role="status"
            >
              등록 문의가 정상적으로 접수되었습니다. PUL 운영팀이 내용을 확인합니다.
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
            <div className="space-y-4">
              <label className="block text-sm font-bold">
                {isCourse ? "과정명" : "공고 제목"} *
                <input
                  ref={titleInputRef}
                  required
                  minLength={2}
                  maxLength={180}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
                />
              </label>
              <label className="block text-sm font-bold">
                {isCourse ? "운영기관" : "기관·업체명"} *
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
                />
              </label>
              <label className="block text-sm font-bold">
                지역 <span className="font-normal text-pul-muted">(선택)</span>
                <input
                  maxLength={80}
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  placeholder="예: 서울"
                  className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
                />
              </label>
              <label className="block text-sm font-bold">
                간단한 안내 *
                <textarea
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={6}
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder={
                    isCourse
                      ? "교육 대상, 일정, 교육 방식 등 확인에 필요한 내용을 적어 주세요."
                      : "모집 역할, 일정, 조건 등 확인에 필요한 내용을 적어 주세요."
                  }
                  className="mt-1 w-full rounded-lg border border-pul-border px-3 py-3 text-base leading-relaxed outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
                />
              </label>
              <label className="block text-sm font-bold">
                공식 확인 URL <span className="font-normal text-pul-muted">(선택)</span>
                <input
                  type="url"
                  inputMode="url"
                  maxLength={500}
                  pattern="https://.*"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://"
                  className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
                />
              </label>
            </div>

            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
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
                    href={`/login?next=${encodeURIComponent(returnPath)}`}
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
                {pending ? "접수 중…" : "접수하기"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
