"use client";

import { submitUniversityDepartmentRequestAction } from "@/app/lessons/university-actions";
import {
  UNIVERSITY_REGIONS,
  type PublicUniversityDepartment,
  type UniversityDirectoryPage,
  type UniversityRegion,
} from "@/lib/lessons/universityDirectory";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";

type Props = {
  page: UniversityDirectoryPage<PublicUniversityDepartment>;
  error: string | null;
  keyword: string;
  region?: UniversityRegion;
  isAuthenticated: boolean;
};

const inputClass = "min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 py-2 text-base text-foreground";

export function LessonsUniversityDepartmentsTab({ page, error, keyword, region, isAuthenticated }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const universityInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const closeDialog = () => {
    setDialogOpen(false);
    requestIdRef.current = null;
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (dialogOpen) requestAnimationFrame(() => universityInputRef.current?.focus({ preventScroll: true }));
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) closeDialog();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const applyFilters = (formData: FormData) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextKeyword = String(formData.get("universityKeyword") ?? "").trim();
    const nextRegion = String(formData.get("universityRegion") ?? "");
    params.set("tab", "university-departments");
    if (nextKeyword) params.set("universityKeyword", nextKeyword);
    else params.delete("universityKeyword");
    if (nextRegion) params.set("universityRegion", nextRegion);
    else params.delete("universityRegion");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;
    setNotice(null);
    startTransition(async () => {
      const result = await submitUniversityDepartmentRequestAction({
        requestId,
        universityName: formData.get("universityName"),
        departmentName: formData.get("departmentName"),
        region: formData.get("region"),
        referenceUrl: formData.get("referenceUrl"),
        requestMessage: formData.get("requestMessage"),
      });
      if (result.ok) {
        requestIdRef.current = null;
        form.reset();
        setNotice({ type: "success", message: result.message });
      } else if (result.authenticationRequired) {
        router.push(`/login?next=${encodeURIComponent(`${pathname}?tab=university-departments`)}`);
      } else {
        setNotice({ type: "error", message: result.message });
      }
    });
  };

  return (
    <section aria-labelledby={headingId} className="space-y-4 rounded-2xl border border-pul-border bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-pul-point">UNIVERSITY DIRECTORY</p>
          <h2 id={headingId} className="mt-1 text-2xl font-black text-foreground">파크골프 관련 대학·학과</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-pul-muted">
            운영자가 공식 출처를 확인해 공개한 대학·학과 정보만 제공합니다. 순위나 입학 보장 정보가 아닙니다.
          </p>
        </div>
        <button ref={triggerRef} type="button" onClick={() => { setNotice(null); setDialogOpen(true); }} className="min-h-11 shrink-0 rounded-xl bg-pul-deep px-4 font-bold text-white">
          등록·수정 요청
        </button>
      </div>

      <form action={applyFilters} className="grid gap-2 rounded-xl bg-pul-light/50 p-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
        <label className="sr-only" htmlFor="university-directory-keyword">대학·학과 검색</label>
        <input id="university-directory-keyword" name="universityKeyword" defaultValue={keyword} maxLength={100} placeholder="대학명 또는 학과명 검색" className={inputClass} />
        <label className="sr-only" htmlFor="university-directory-region">지역</label>
        <select id="university-directory-region" name="universityRegion" defaultValue={region ?? ""} className={inputClass}>
          <option value="">전체 지역</option>
          {UNIVERSITY_REGIONS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <button type="submit" className="min-h-11 rounded-lg border border-pul-deep bg-white px-4 font-bold text-pul-deep">검색</button>
      </form>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-800">{error}</div>
      ) : page.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-pul-border bg-[#fafbfa] px-5 py-12 text-center">
          <p className="font-bold text-foreground">현재 공개된 대학·학과 정보가 없습니다.</p>
          <p className="mt-1 text-sm text-pul-muted">새 정보나 수정이 필요한 내용은 등록·수정 요청으로 알려주세요.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-pul-muted">검색 결과 {page.total}개</p>
          <ul className="grid gap-3 lg:grid-cols-2">
            {page.items.map((department) => (
              <li key={department.departmentKey} className="rounded-xl border border-pul-border bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-pul-light px-2.5 py-1 text-xs font-bold text-pul-deep">{department.region}</span>
                  <span className="text-sm font-bold text-pul-muted">{department.universityName}</span>
                </div>
                <h3 className="mt-2 text-lg font-black text-foreground">{department.departmentName}</h3>
                <p className="mt-2 text-sm leading-6 text-pul-muted">{department.summary}</p>
                {(department.officialUrl || department.admissionsUrl) ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {department.officialUrl ? <a href={department.officialUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 rounded-lg border border-pul-border px-3 py-2.5 text-sm font-bold text-pul-deep">공식 홈페이지</a> : null}
                    {department.admissionsUrl ? <a href={department.admissionsUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 rounded-lg border border-pul-border px-3 py-2.5 text-sm font-bold text-pul-deep">입학 안내</a> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {dialogOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget && !isPending) closeDialog(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="university-request-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <h3 id="university-request-title" className="text-xl font-black text-foreground">대학·학과 등록·수정 요청</h3>
            <p className="mt-2 text-sm leading-6 text-pul-muted">운영자가 확인할 수 있는 공식 출처와 필요한 변경 내용을 알려주세요. 요청은 자동 공개되지 않습니다.</p>
            {!isAuthenticated ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">요청 제출에는 로그인이 필요합니다.</p> : null}
            <form onSubmit={submit} className="mt-4 space-y-3">
              <label className="block font-bold text-foreground" htmlFor="university-request-university">대학명</label>
              <input ref={universityInputRef} id="university-request-university" name="universityName" required minLength={2} maxLength={160} className={inputClass} />
              <label className="block font-bold text-foreground" htmlFor="university-request-department">학과·과정명</label>
              <input id="university-request-department" name="departmentName" required minLength={2} maxLength={160} className={inputClass} />
              <label className="block font-bold text-foreground" htmlFor="university-request-region">지역</label>
              <select id="university-request-region" name="region" required defaultValue="" className={inputClass}>
                <option value="" disabled>지역 선택</option>
                {UNIVERSITY_REGIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <label className="block font-bold text-foreground" htmlFor="university-request-url">공식 참고 URL (선택)</label>
              <input id="university-request-url" name="referenceUrl" type="url" pattern="https://.*" maxLength={500} className={inputClass} />
              <label className="block font-bold text-foreground" htmlFor="university-request-message">요청 내용</label>
              <textarea id="university-request-message" name="requestMessage" required minLength={10} maxLength={2000} rows={5} className={`${inputClass} resize-y`} />
              {notice ? <p role={notice.type === "error" ? "alert" : "status"} className={notice.type === "error" ? "rounded-lg bg-red-50 p-3 text-sm text-red-800" : "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"}>{notice.message}</p> : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" disabled={isPending} onClick={closeDialog} className="min-h-11 rounded-lg border border-pul-border px-4 font-bold text-foreground disabled:opacity-50">닫기</button>
                <button type="submit" disabled={isPending} className="min-h-11 rounded-lg bg-pul-deep px-4 font-bold text-white disabled:opacity-50">{isPending ? "접수 중…" : "요청 접수"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
