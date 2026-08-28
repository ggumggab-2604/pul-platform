"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { resolveCourseInformationReportAction } from "@/app/courses/manage/actions";
import type { CourseInformationReportDetail, CourseReportResolution } from "@/lib/courses/courseManagement";
import { cn } from "@/lib/utils";

export function CourseReportActions({ report }: { report: CourseInformationReportDetail }) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [resolution, setResolution] = useState<CourseReportResolution | null>(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (report.reportStatus !== "received") {
    return <section className="mt-5 rounded-2xl border border-pul-border bg-pul-light p-4"><h3 className="font-black text-foreground">처리 결과</h3><p className="mt-2 text-sm leading-6 text-pul-muted">{report.reportStatus === "handled" ? "처리 완료" : "적용할 내용 없음"}{report.resolutionNote ? ` · ${report.resolutionNote}` : ""}</p></section>;
  }

  const open = (next: CourseReportResolution, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setNote("");
    setNotice(null);
    setResolution(next);
  };

  const close = () => {
    setResolution(null);
    requestAnimationFrame(() => triggerRef.current?.isConnected && triggerRef.current.focus({ preventScroll: true }));
  };

  const submit = () => {
    if (!resolution) return;
    startTransition(async () => {
      const result = await resolveCourseInformationReportAction({
        reportId: report.reportId,
        resolution,
        expectedUpdatedAt: report.updatedAt,
        note: note.trim() || null,
      });
      setResolution(null);
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      router.refresh();
      requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    });
  };

  return (
    <section className="mt-5 rounded-2xl border border-pul-border bg-white p-4 sm:p-5" aria-busy={isPending}>
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-black text-foreground outline-none">제보 처리</h3>
      <p className="mt-1 text-sm leading-6 text-pul-muted">정보를 반영했거나 확인을 마쳤다면 처리 완료를, 적용할 내용이 없다면 적용 없음으로 종료하세요.</p>
      {notice ? <p role={notice.type === "error" ? "alert" : "status"} className={cn("mt-3 rounded-xl border p-3 text-sm", notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{notice.message}</p> : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={isPending} onClick={(event) => open("handled", event.currentTarget)} className="min-h-12 rounded-xl bg-pul-deep px-4 font-bold text-white">처리 완료</button>
        <button type="button" disabled={isPending} onClick={(event) => open("dismissed", event.currentTarget)} className="min-h-12 rounded-xl border border-amber-300 bg-amber-50 px-4 font-bold text-amber-900">적용할 내용 없음</button>
      </div>
      {resolution ? <ResolutionDialog resolution={resolution} note={note} busy={isPending} onNote={setNote} onCancel={close} onConfirm={submit} /> : null}
    </section>
  );
}

function ResolutionDialog({ resolution, note, busy, onNote, onCancel, onConfirm }: { resolution: CourseReportResolution; note: string; busy: boolean; onNote: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    noteRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); return; }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("textarea,button:not([disabled])");
      if (!focusable?.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);
  const label = resolution === "handled" ? "처리 완료" : "적용할 내용 없음";
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation"><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="course-report-resolution-title" aria-describedby="course-report-resolution-description" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><h2 id="course-report-resolution-title" className="text-xl font-black text-foreground">제보 {label}</h2><p id="course-report-resolution-description" className="mt-2 text-base leading-7 text-pul-muted">짧은 운영 메모는 선택 사항입니다. 회원 개인정보나 확인되지 않은 내용을 적지 마세요.</p><label htmlFor="course-report-resolution-note" className="mt-4 block font-bold text-foreground">운영 메모 (선택)</label><textarea ref={noteRef} id="course-report-resolution-note" value={note} onChange={(event) => onNote(event.target.value)} minLength={2} maxLength={500} rows={4} className="mt-2 w-full rounded-xl border border-pul-border p-3 text-base" /><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={onCancel} className="min-h-12 rounded-xl border border-pul-border font-bold text-pul-deep">취소</button><button type="button" disabled={busy || (note.length > 0 && note.trim().length < 2)} onClick={onConfirm} className="min-h-12 rounded-xl bg-pul-deep font-bold text-white disabled:opacity-50">{busy ? "처리 중…" : label}</button></div></div></div>;
}
