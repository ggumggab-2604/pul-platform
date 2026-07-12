"use client";

import { useBodyScrollLock } from "@/components/ui/InfoModal";
import type { HofRecordType } from "@/data/courseDetailPageData";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock3 } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

const RECORD_TYPES: { value: HofRecordType; label: string }[] = [
  { value: "holeInOne", label: "홀인원" },
  { value: "albatross", label: "알바트로스" },
  { value: "condor", label: "콘도르" },
];

type HofRecordRegisterPanelProps = {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
};

/**
 * 명예의 전당 기록 등록 — UI 구조만 (승인 백엔드 없음).
 * 제출 시 상태는 '관리자 검토 대기'로 표시.
 */
export function HofRecordRegisterPanel({
  open,
  onClose,
  onSubmitted,
}: HofRecordRegisterPanelProps) {
  const [recordType, setRecordType] = useState<HofRecordType>("holeInOne");
  const [date, setDate] = useState("");
  const [holeInfo, setHoleInfo] = useState("");
  const [clubName, setClubName] = useState("");
  const [companionConfirm, setCompanionConfirm] = useState(false);
  const [publicConsent, setPublicConsent] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useBodyScrollLock(open);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    onSubmitted?.();
  };

  const resetAndClose = () => {
    setSubmitted(false);
    setDate("");
    setHoleInfo("");
    setClubName("");
    setCompanionConfirm(false);
    setPublicConsent(false);
    setPhotoNote("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hof-register-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-pul-border bg-white p-4 shadow-xl lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="hof-register-title" className="text-xl font-bold text-foreground lg:text-2xl">
              기록 인증 신청
            </h2>
            <p className="mt-1 text-[15px] text-pul-muted lg:text-base">
              제출 후 관리자 승인 전까지는 공식 기록으로 표시되지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-pul-muted hover:bg-pul-light hover:text-pul-deep"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {submitted ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-3">
              <p className="inline-flex items-center gap-2 text-base font-bold text-amber-900 lg:text-lg">
                <Clock3 className="h-5 w-5" aria-hidden="true" />
                관리자 검토 대기
              </p>
              <p className="mt-1 text-[15px] leading-relaxed text-amber-950 lg:text-base">
                신청이 접수되었습니다. 사진·스코어카드·동행 확인 검토 후 승인 상태가 변경됩니다.
                (UI 예시 · 실제 승인 API 없음)
              </p>
            </div>
            <ul className="space-y-1 text-[15px] text-pul-deep lg:text-base">
              <li>
                기록 유형 ·{" "}
                <strong>{RECORD_TYPES.find((t) => t.value === recordType)?.label}</strong>
              </li>
              <li>
                날짜 · <strong>{date || "—"}</strong>
              </li>
              <li>
                홀 정보 · <strong>{holeInfo || "—"}</strong>
              </li>
              <li>
                동호회 · <strong>{clubName || "—"}</strong>
              </li>
            </ul>
            <button
              type="button"
              onClick={resetAndClose}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-pul-point text-base font-bold text-white hover:bg-pul-deep"
            >
              확인
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <fieldset>
              <legend className="text-[15px] font-bold text-pul-deep lg:text-base">기록 유형</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {RECORD_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setRecordType(type.value)}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-lg px-4 text-[15px] font-bold lg:text-base",
                      recordType === type.value
                        ? "bg-pul-point text-white"
                        : "border border-pul-border bg-white text-pul-deep",
                    )}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="text-[15px] font-bold text-pul-deep lg:text-base">기록 일자</span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 min-h-12 w-full rounded-lg border border-pul-border px-3 text-base text-foreground"
              />
            </label>

            <label className="block">
              <span className="text-[15px] font-bold text-pul-deep lg:text-base">홀 정보</span>
              <input
                type="text"
                required
                value={holeInfo}
                onChange={(e) => setHoleInfo(e.target.value)}
                placeholder="예: B코스 6번 홀"
                className="mt-1.5 min-h-12 w-full rounded-lg border border-pul-border px-3 text-base text-foreground"
              />
            </label>

            <label className="block">
              <span className="text-[15px] font-bold text-pul-deep lg:text-base">소속 동호회</span>
              <input
                type="text"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="동호회명 (선택)"
                className="mt-1.5 min-h-12 w-full rounded-lg border border-pul-border px-3 text-base text-foreground"
              />
            </label>

            <label className="block">
              <span className="text-[15px] font-bold text-pul-deep lg:text-base">
                사진·스코어카드 안내
              </span>
              <textarea
                value={photoNote}
                onChange={(e) => setPhotoNote(e.target.value)}
                rows={3}
                placeholder="인증 사진·스코어카드 첨부 메모 (파일 업로드는 추후 연동)"
                className="mt-1.5 w-full rounded-lg border border-pul-border px-3 py-2.5 text-base text-foreground"
              />
              <span className="mt-1 block text-[13px] text-pul-muted lg:text-sm">
                MVP: 파일 업로드 UI 자리만 준비 · 실제 저장 없음
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-[15px] text-pul-deep lg:text-base">
              <input
                type="checkbox"
                checked={companionConfirm}
                onChange={(e) => setCompanionConfirm(e.target.checked)}
                required
                className="mt-1 h-5 w-5 accent-[var(--pul-point)]"
              />
              <span>동행자 확인을 받았으며, 사실과 다름없음을 확인합니다.</span>
            </label>

            <label className="flex items-start gap-2.5 text-[15px] text-pul-deep lg:text-base">
              <input
                type="checkbox"
                checked={publicConsent}
                onChange={(e) => setPublicConsent(e.target.checked)}
                required
                className="mt-1 h-5 w-5 accent-[var(--pul-point)]"
              />
              <span>승인 후 명예의 전당에 이름·동호회·사진이 공개되는 것에 동의합니다.</span>
            </label>

            <div className="rounded-lg border border-pul-border/70 bg-pul-light/40 px-3 py-2.5 text-[15px] text-pul-muted lg:text-base">
              <p className="inline-flex items-center gap-1.5 font-bold text-pul-deep">
                <CheckCircle2 className="h-4 w-4 text-pul-point" aria-hidden="true" />
                승인 상태
              </p>
              <p className="mt-1">제출 전 · 미신청 → 제출 후 · 관리자 검토 대기 → 승인 완료</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={resetAndClose}
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg border border-pul-border bg-white text-base font-bold text-pul-deep hover:bg-pul-light"
              >
                취소
              </button>
              <button
                type="submit"
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-pul-point text-base font-bold text-white hover:bg-pul-deep"
              >
                인증 신청 제출
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
