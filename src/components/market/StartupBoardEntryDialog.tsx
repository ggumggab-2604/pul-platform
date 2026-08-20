"use client";

import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  marketRegions,
  startupBoardCategoryLabels,
  startupBoardConsultationLabels,
} from "@/data/marketData";
import type {
  MarketStartupPostInput,
  MarketStartupPostMutationContext,
} from "@/lib/market/market";
import type { StartupBoardCategory, StartupBoardConsultationType } from "@/types";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type Props = {
  item?: MarketStartupPostMutationContext;
  initialCategory: StartupBoardCategory;
  initialConsultation: StartupBoardConsultationType;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: MarketStartupPostInput) => void;
};

const categories: StartupBoardCategory[] = [
  "screenStartup",
  "screenResale",
  "fieldCourseDevelopment",
  "idleLandUse",
  "constructionFacility",
];

const consultationsByCategory: Record<StartupBoardCategory, StartupBoardConsultationType[]> = {
  screenStartup: ["startupInquiry"],
  screenResale: ["resaleInquiry", "transfer"],
  fieldCourseDevelopment: ["courseDevelopment"],
  idleLandUse: ["idleLandUse"],
  constructionFacility: ["facilityConsulting"],
};

const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20";

export function StartupBoardEntryDialog({
  item,
  initialCategory,
  initialConsultation,
  busy,
  error,
  onClose,
  onSubmit,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [category, setCategory] = useState<StartupBoardCategory>(item?.category ?? initialCategory);
  const [region, setRegion] = useState(item?.region ?? "서울");
  const [desiredScale, setDesiredScale] = useState(item?.desiredScale ?? "");
  const [consultationType, setConsultationType] = useState<StartupBoardConsultationType>(item?.consultationType ?? initialConsultation);
  const consultationOptions = useMemo(() => consultationsByCategory[category], [category]);
  useBodyScrollLock(true);

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
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

  const changeCategory = (next: StartupBoardCategory) => {
    setCategory(next);
    setConsultationType(consultationsByCategory[next][0]);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div ref={panelRef} className="flex max-h-[calc(100dvh-16px)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-pul-border px-4 py-3 sm:px-5">
          <div>
            <h2 id={titleId} className="text-xl font-bold text-foreground">{item ? "창업·매매 글 수정" : "창업·매매 글쓰기"}</h2>
            <p id={descriptionId} className="mt-1 text-sm text-pul-muted">연락처 대신 지역과 필요한 내용을 중심으로 작성해 주세요.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="닫기" className="min-h-11 min-w-11 rounded-full bg-pul-page text-2xl font-bold text-pul-muted disabled:opacity-50">×</button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ title, body, category, region, desiredScale, consultationType });
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="text-sm font-bold">제목</span><input ref={firstRef} required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} /></label>
            <label><span className="text-sm font-bold">카테고리</span><select value={category} onChange={(event) => changeCategory(event.target.value as StartupBoardCategory)} className={fieldClass}>{categories.map((value) => <option key={value} value={value}>{startupBoardCategoryLabels[value]}</option>)}</select></label>
            <label><span className="text-sm font-bold">상담 유형</span><select value={consultationType} onChange={(event) => setConsultationType(event.target.value as StartupBoardConsultationType)} className={fieldClass}>{consultationOptions.map((value) => <option key={value} value={value}>{startupBoardConsultationLabels[value]}</option>)}</select></label>
            <label><span className="text-sm font-bold">지역</span><select value={region} onChange={(event) => setRegion(event.target.value)} className={fieldClass}>{marketRegions.filter((value) => value !== "전체").map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span className="text-sm font-bold">희망 규모</span><input required minLength={2} maxLength={100} value={desiredScale} onChange={(event) => setDesiredScale(event.target.value)} placeholder="예: 약 30평" className={fieldClass} /></label>
            <label className="sm:col-span-2"><span className="text-sm font-bold">내용</span><textarea required minLength={10} maxLength={5000} rows={8} value={body} onChange={(event) => setBody(event.target.value)} className={`${fieldClass} py-3`} /></label>
          </div>
          {error ? <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{error}</p> : null}
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">전화번호·상세 주소 등 개인정보를 공개 본문에 작성하지 마세요. 비용·계약·인허가는 당사자와 전문가에게 직접 확인해야 합니다.</p>
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-pul-border pt-4">
            <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-lg border border-pul-border text-base font-bold text-pul-muted disabled:opacity-50">취소</button>
            <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-pul-point text-base font-bold text-white disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
