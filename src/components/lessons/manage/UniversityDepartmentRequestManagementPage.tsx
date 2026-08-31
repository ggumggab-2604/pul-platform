"use client";

import { resolveUniversityDepartmentRequestAction } from "@/app/lessons/manage/university-departments/actions";
import type { UniversityDepartmentSubmissionRequest, UniversityDirectoryPage } from "@/lib/lessons/universityDirectory";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

const labels = { pending: "처리 대기", completed: "완료", closed: "닫힘" } as const;

export function UniversityDepartmentRequestManagementPage({ initialPage }: { initialPage: UniversityDirectoryPage<UniversityDepartmentSubmissionRequest> }) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected = selectedKey ? initialPage.items.find((item) => item.requestKey === selectedKey) ?? null : null;
  const choose = (item: UniversityDepartmentSubmissionRequest) => { setSelectedKey(item.requestKey); setNote(""); setNotice(null); requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true })); };
  const resolve = (resolution: "completed" | "closed") => {
    if (!selected || selected.requestStatus !== "pending" || isPending) return;
    startTransition(async () => {
      const result = await resolveUniversityDepartmentRequestAction({ requestKey: selected.requestKey, expectedVersion: selected.version, resolution, resolutionNote: note || null });
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok || result.shouldRefresh) router.refresh();
    });
  };
  return <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(280px,.72fr)_minmax(0,1.35fr)]" aria-busy={isPending}>
    <section className="rounded-2xl border border-pul-border bg-white p-4"><h2 className="text-xl font-black text-foreground">요청 목록</h2><p className="mt-1 text-sm text-pul-muted">전체 {initialPage.total}건</p>{initialPage.items.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-pul-border p-6 text-center text-sm text-pul-muted">해당 상태의 요청이 없습니다.</p> : <ul className="mt-4 space-y-2">{initialPage.items.map((item) => <li key={item.requestKey}><button type="button" onClick={() => choose(item)} aria-pressed={selectedKey === item.requestKey} className={`min-h-12 w-full rounded-xl border p-3 text-left ${selectedKey === item.requestKey ? "border-pul-point bg-pul-light" : "border-pul-border"}`}><span className="block font-bold text-foreground">{item.universityName} · {item.departmentName}</span><span className="mt-1 block text-xs text-pul-muted">{item.region} · {labels[item.requestStatus]} · v{item.version}</span></button></li>)}</ul>}</section>
    <section className="rounded-2xl border border-pul-border bg-white p-4 sm:p-6"><h2 ref={headingRef} tabIndex={-1} className="text-xl font-black text-foreground outline-none">요청 상세·처리</h2>{!selected ? <p className="mt-4 rounded-xl border border-dashed border-pul-border p-8 text-center text-sm text-pul-muted">왼쪽 목록에서 요청을 선택해 주세요.</p> : <><dl className="mt-4 grid gap-3 rounded-xl bg-[#fafbfa] p-4 text-sm"><div><dt className="font-bold">대학·학과</dt><dd className="mt-1 break-words">{selected.universityName} · {selected.departmentName}</dd></div><div><dt className="font-bold">지역</dt><dd className="mt-1">{selected.region}</dd></div><div><dt className="font-bold">요청 내용</dt><dd className="mt-1 whitespace-pre-wrap break-words">{selected.requestMessage}</dd></div>{selected.referenceUrl ? <div><dt className="font-bold">참고 URL</dt><dd className="mt-1"><a href={selected.referenceUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-pul-point underline">공식 출처 열기</a></dd></div> : null}<div><dt className="font-bold">상태</dt><dd className="mt-1">{labels[selected.requestStatus]} · v{selected.version}</dd></div>{selected.resolutionNote ? <div><dt className="font-bold">처리 메모</dt><dd className="mt-1 whitespace-pre-wrap">{selected.resolutionNote}</dd></div> : null}</dl>{notice ? <p role={notice.type === "error" ? "alert" : "status"} className={`mt-4 rounded-lg p-3 text-sm ${notice.type === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{notice.message}</p> : null}{selected.requestStatus === "pending" ? <div className="mt-5"><label htmlFor="university-request-resolution-note" className="font-bold text-foreground">처리 메모 (선택)</label><textarea id="university-request-resolution-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={4} className="mt-2 min-h-11 w-full resize-y rounded-lg border border-pul-border p-3" /><p className="mt-2 text-sm text-pul-muted">완료 후 디렉터리 등록은 별도 운영 화면에서 직접 수행합니다.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={isPending} onClick={() => resolve("completed")} className="min-h-11 rounded-lg bg-pul-deep px-4 font-bold text-white disabled:opacity-50">완료 처리</button><button type="button" disabled={isPending} onClick={() => resolve("closed")} className="min-h-11 rounded-lg border border-red-200 bg-red-50 px-4 font-bold text-red-800 disabled:opacity-50">요청 닫기</button></div></div> : null}</>}</section>
    <span className="sr-only" aria-live="polite">{isPending ? "요청을 처리하는 중입니다." : ""}</span>
  </div>;
}
