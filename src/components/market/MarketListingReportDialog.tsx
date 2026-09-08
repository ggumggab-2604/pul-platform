"use client";

import { submitMarketListingReportAction } from "@/app/market/actions";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import type { MarketListingReportReason } from "@/lib/market/marketListingReports";
import type { MarketListingDetail } from "@/types";
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  item: MarketListingDetail;
  onClose: () => void;
};

const reasons: { value: MarketListingReportReason; label: string }[] = [
  { value: "fraud_or_false", label: "사기 또는 허위 정보" },
  { value: "prohibited_or_inappropriate", label: "금지 또는 부적절한 상품" },
  { value: "spam_or_duplicate", label: "도배 또는 중복 게시" },
  { value: "privacy_exposure", label: "개인정보 노출" },
  { value: "other", label: "기타" },
];

export function MarketListingReportDialog({ item, onClose }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLSelectElement>(null);
  const successRef = useRef<HTMLButtonElement>(null);
  const requestIdRef = useRef("");
  const [reasonCode, setReasonCode] = useState<MarketListingReportReason>("fraud_or_false");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useBodyScrollLock(true);

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (submitted) successRef.current?.focus({ preventScroll: true });
  }, [submitted]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), select:not([disabled]), textarea:not([disabled])",
      )];
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
  }, [busy, onClose]);

  const resetRequestIdentity = () => {
    requestIdRef.current = "";
    setError("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const result = await submitMarketListingReportAction({
        listingId: item.id,
        reasonCode,
        note,
        requestId: requestIdRef.current,
      });
      if (result.ok) setSubmitted(true);
      else setError(result.error);
    } catch {
      setError("네트워크 연결을 확인한 뒤 같은 내용으로 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div ref={panelRef} className="flex max-h-[calc(100dvh-16px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-pul-border px-4 py-4 sm:px-5">
          <div>
            <h2 id={titleId} className="text-xl font-black text-foreground">판매글 신고</h2>
            <p id={descriptionId} className="mt-1 text-sm leading-6 text-pul-muted">{item.name} 판매글을 운영자에게 알립니다. 신고만으로 글이 자동 삭제되지는 않습니다.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="닫기" className="min-h-11 min-w-11 rounded-full bg-pul-page text-2xl font-bold text-pul-muted disabled:opacity-50">×</button>
        </header>

        {submitted ? (
          <div className="px-5 py-8 text-center">
            <p className="text-lg font-black text-foreground" role="status">신고가 접수되었습니다.</p>
            <p className="mt-2 text-sm leading-6 text-pul-muted">운영자가 내용을 확인합니다. 신고만으로 판매글 상태가 자동 변경되지는 않습니다.</p>
            <button ref={successRef} type="button" onClick={onClose} className="mt-5 min-h-11 rounded-lg bg-pul-point px-6 font-bold text-white">닫기</button>
          </div>
        ) : (
          <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <label className="block"><span className="text-sm font-bold text-foreground">신고 사유</span><select ref={firstRef} value={reasonCode} onChange={(event) => { setReasonCode(event.target.value as MarketListingReportReason); resetRequestIdentity(); }} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20">{reasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label>
            <label className="mt-4 block"><span className="text-sm font-bold text-foreground">상세 내용</span><textarea required minLength={10} maxLength={1000} rows={7} value={note} onChange={(event) => { setNote(event.target.value); resetRequestIdentity(); }} className="mt-1 w-full rounded-lg border border-pul-border bg-white px-3 py-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20" /><span className="mt-1 block text-xs leading-5 text-pul-muted">10~1000자로 작성해 주세요. 주민등록번호, 계좌 비밀번호 등 민감정보는 입력하지 마세요.</span></label>
            {error ? <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{error}</p> : null}
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-pul-border pt-4"><button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-lg border border-pul-border font-bold text-pul-muted disabled:opacity-50">취소</button><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-pul-point font-bold text-white disabled:opacity-50">{busy ? "접수 중…" : "신고 접수"}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
