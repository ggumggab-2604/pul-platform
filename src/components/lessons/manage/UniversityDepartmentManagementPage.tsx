"use client";

import { mutateUniversityDepartmentAction } from "@/app/lessons/manage/university-departments/actions";
import {
  UNIVERSITY_REGIONS,
  type ManagedUniversityDepartment,
  type UniversityDirectoryPage,
} from "@/lib/lessons/universityDirectory";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

type Draft = { departmentKey: string; universityName: string; departmentName: string; summary: string; region: string; officialUrl: string; admissionsUrl: string };
const emptyDraft: Draft = { departmentKey: "", universityName: "", departmentName: "", summary: "", region: "서울", officialUrl: "", admissionsUrl: "" };
const inputClass = "min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 py-2 text-base text-foreground";

export function UniversityDepartmentManagementPage({ initialPage }: { initialPage: UniversityDirectoryPage<ManagedUniversityDepartment> }) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected = selectedKey ? initialPage.items.find((item) => item.departmentKey === selectedKey) ?? null : null;

  const choose = (item: ManagedUniversityDepartment) => {
    setIsEditorOpen(true);
    setSelectedKey(item.departmentKey);
    setDraft({ departmentKey: item.departmentKey, universityName: item.universityName, departmentName: item.departmentName, summary: item.summary, region: item.region, officialUrl: item.officialUrl ?? "", admissionsUrl: item.admissionsUrl ?? "" });
    setNotice(null);
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  };
  const create = () => { setIsEditorOpen(true); setSelectedKey(null); setDraft(emptyDraft); setNotice(null); requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true })); };
  const cancel = () => { setIsEditorOpen(false); setSelectedKey(null); setDraft(emptyDraft); setNotice(null); requestAnimationFrame(() => createTriggerRef.current?.focus({ preventScroll: true })); };
  const payload = { universityName: draft.universityName, departmentName: draft.departmentName, summary: draft.summary, region: draft.region, officialUrl: draft.officialUrl || null, admissionsUrl: draft.admissionsUrl || null };
  const run = (operation: "create" | "update" | "publish" | "hide") => {
    if (isPending) return;
    setNotice(null);
    startTransition(async () => {
      const result = await mutateUniversityDepartmentAction({ operation, departmentKey: draft.departmentKey, expectedVersion: operation === "create" ? null : selected?.version ?? null, payload: operation === "create" || operation === "update" ? payload : null });
      if (result.ok && operation === "create") {
        router.refresh();
        setIsEditorOpen(false);
        setSelectedKey(null);
        setDraft(emptyDraft);
        setNotice(null);
        requestAnimationFrame(() => createTriggerRef.current?.focus({ preventScroll: true }));
        return;
      }
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok || result.shouldRefresh) router.refresh();
    });
  };
  const save = (event: FormEvent) => { event.preventDefault(); run(selected ? "update" : "create"); };
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(280px,.75fr)_minmax(0,1.4fr)]" aria-busy={isPending}>
      <section className="rounded-2xl border border-pul-border bg-white p-4">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black text-foreground">디렉터리 목록</h2><p className="mt-1 text-sm text-pul-muted">전체 {initialPage.total}건</p></div><button ref={createTriggerRef} type="button" onClick={create} aria-expanded={isEditorOpen} aria-controls="university-department-editor" className="min-h-11 rounded-lg bg-pul-deep px-3 font-bold text-white">새 항목</button></div>
        {initialPage.items.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-pul-border p-6 text-center text-sm text-pul-muted">등록된 항목이 없습니다.</p> : <ul className="mt-4 space-y-2">{initialPage.items.map((item) => <li key={item.departmentKey}><button type="button" onClick={() => choose(item)} aria-pressed={item.departmentKey === selectedKey} className={`min-h-12 w-full rounded-xl border p-3 text-left ${item.departmentKey === selectedKey ? "border-pul-point bg-pul-light" : "border-pul-border"}`}><span className="block font-bold text-foreground">{item.universityName} · {item.departmentName}</span><span className="mt-1 block text-xs text-pul-muted">{item.region} · {item.publicationStatus === "published" ? "공개" : "숨김"} · v{item.version}</span></button></li>)}</ul>}
      </section>
      {isEditorOpen ? <section id="university-department-editor" className="rounded-2xl border border-pul-border bg-white p-4 sm:p-6">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-black text-foreground outline-none">{selected ? "대학·학과 수정" : "새 대학·학과 등록"}</h2>
        <p className="mt-1 text-sm text-pul-muted">새 항목은 hidden으로 저장되며 공개 버튼을 별도로 눌러야 합니다.</p>
        <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="공개 key" id="university-department-key"><input id="university-department-key" required readOnly={Boolean(selected)} pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" maxLength={64} value={draft.departmentKey} onChange={(event) => set("departmentKey", event.target.value)} className={`${inputClass} ${selected ? "bg-slate-50" : ""}`} /></Field>
          <Field label="지역" id="university-department-region"><select id="university-department-region" value={draft.region} onChange={(event) => set("region", event.target.value)} className={inputClass}>{UNIVERSITY_REGIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
          <Field label="대학명" id="university-department-university"><input id="university-department-university" required minLength={2} maxLength={160} value={draft.universityName} onChange={(event) => set("universityName", event.target.value)} className={inputClass} /></Field>
          <Field label="학과·과정명" id="university-department-name"><input id="university-department-name" required minLength={2} maxLength={160} value={draft.departmentName} onChange={(event) => set("departmentName", event.target.value)} className={inputClass} /></Field>
          <div className="sm:col-span-2"><Field label="공개 설명" id="university-department-summary"><textarea id="university-department-summary" required minLength={10} maxLength={1000} rows={5} value={draft.summary} onChange={(event) => set("summary", event.target.value)} className={`${inputClass} resize-y`} /></Field></div>
          <Field label="공식 홈페이지 (선택)" id="university-department-official"><input id="university-department-official" type="url" pattern="https://.*" maxLength={500} value={draft.officialUrl} onChange={(event) => set("officialUrl", event.target.value)} className={inputClass} /></Field>
          <Field label="입학 안내 (선택)" id="university-department-admissions"><input id="university-department-admissions" type="url" pattern="https://.*" maxLength={500} value={draft.admissionsUrl} onChange={(event) => set("admissionsUrl", event.target.value)} className={inputClass} /></Field>
          {notice ? <p role={notice.type === "error" ? "alert" : "status"} className={`sm:col-span-2 rounded-lg p-3 text-sm ${notice.type === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{notice.message}</p> : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" disabled={isPending} className="min-h-11 rounded-lg bg-pul-deep px-4 font-bold text-white disabled:opacity-50">{isPending ? "저장 중…" : selected ? "수정 저장" : "hidden으로 등록"}</button>{selected ? <button type="button" disabled={isPending} onClick={() => run(selected.publicationStatus === "published" ? "hide" : "publish")} className="min-h-11 rounded-lg border border-pul-border px-4 font-bold text-pul-deep disabled:opacity-50">{selected.publicationStatus === "published" ? "숨김" : "공개"}</button> : null}<button type="button" disabled={isPending} onClick={cancel} className="min-h-11 rounded-lg border border-pul-border px-4 font-bold text-pul-deep disabled:opacity-50">취소</button></div>
        </form>
      </section> : null}
      <span className="sr-only" aria-live="polite">{isPending ? "대학·학과 정보를 처리하는 중입니다." : ""}</span>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) { return <div><label htmlFor={id} className="block font-bold text-foreground">{label}</label><div className="mt-2">{children}</div></div>; }
