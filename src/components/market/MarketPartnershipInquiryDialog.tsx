"use client";

import { submitMarketPartnershipInquiryAction } from "@/app/market/actions";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import type { MarketPartnershipInquiryType } from "@/lib/market/marketPartnershipInquiries";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";

type Props = {
  trigger: HTMLElement | null;
  onClose: () => void;
};

export function MarketPartnershipInquiryDialog({ trigger, onClose }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const organizationNameRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [inquiryType, setInquiryType] = useState<MarketPartnershipInquiryType>("shop_entry");
  const [organizationName, setOrganizationName] = useState("");
  const [proposalSummary, setProposalSummary] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
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
    organizationNameRef.current?.focus({ preventScroll: true });
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
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
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
      const result = await submitMarketPartnershipInquiryAction({
        inquiryType,
        organizationName,
        proposalSummary,
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
            <h2 id={titleId} className="text-xl font-bold text-foreground">
              광고·입점·제휴 문의
            </h2>
            <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-pul-muted">
              기본 제안 내용을 접수하면 PUL 운영팀이 확인합니다. 접수만으로 광고 노출·입점·계약이 확정되지 않습니다.
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
              광고·입점·제휴 문의가 정상적으로 접수되었습니다. PUL 운영팀이 내용을 확인합니다.
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
            <label htmlFor={`${descriptionId}-organization-name`} className="text-sm font-bold">
              업체·단체명 *
            </label>
            <input
              ref={organizationNameRef}
              id={`${descriptionId}-organization-name`}
              required
              minLength={2}
              maxLength={120}
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="예: PUL 파크골프"
              className="mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
            />

            <label htmlFor={`${descriptionId}-inquiry-type`} className="mt-4 block text-sm font-bold">
              문의 유형 *
            </label>
            <select
              id={`${descriptionId}-inquiry-type`}
              value={inquiryType}
              onChange={(event) => setInquiryType(event.target.value as MarketPartnershipInquiryType)}
              className="mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
            >
              <option value="shop_entry">장터 입점 제안</option>
              <option value="advertising">광고 문의</option>
              <option value="partnership">제휴 문의</option>
            </select>

            <label htmlFor={`${descriptionId}-proposal-summary`} className="mt-4 block text-sm font-bold">
              문의 내용 *
            </label>
            <textarea
              id={`${descriptionId}-proposal-summary`}
              required
              minLength={10}
              maxLength={3000}
              rows={6}
              value={proposalSummary}
              onChange={(event) => setProposalSummary(event.target.value)}
              placeholder="제안 목적과 PUL 운영팀이 확인할 기본 내용을 적어 주세요. 가격·결제·계약은 이 화면에서 진행하지 않습니다."
              className="mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 py-3 text-base leading-relaxed outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
            />

            <label htmlFor={`${descriptionId}-source-url`} className="mt-4 block text-sm font-bold">
              공식 확인 URL <span className="font-normal text-pul-muted">(선택)</span>
            </label>
            <input
              id={`${descriptionId}-source-url`}
              type="url"
              inputMode="url"
              maxLength={500}
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://example.com"
              className="mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
            />

            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
              전화번호·이메일·주소·계좌 등 개인정보나 민감정보는 입력하지 마세요. 이 화면에서는 파일을 첨부하거나 결제하지 않습니다.
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
                    href="/login?next=%2Fmarket"
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
                {pending ? "접수 중…" : "문의 접수"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
