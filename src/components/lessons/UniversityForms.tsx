"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PhotoUploadStatus, usePhotoUploadProgress } from "@/components/ui/PhotoUploadStatus";
import { photoUploadForm } from "@/lib/images/preparePhoto";
import { universityHref, type UniversityResult, type UniversityWorkspace } from "@/lib/lessons/universityWorkspace";
import { universityBox, universityButton, universityInput, universityPrimary } from "./universityStyles";
import Link from "next/link";

export function UniversityActionForm({ action, button, children, once = false }: {
  action: (form: FormData) => Promise<UniversityResult>;
  button: string;
  children?: ReactNode;
  once?: boolean;
}) {
  const [result, setResult] = useState<UniversityResult>();
  const [pending, start] = useTransition();
  const lock = useRef(false);
  const request = useRef<string | null>(null);
  const router = useRouter();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setResult(undefined);
    const data = new FormData(event.currentTarget);
    data.set("requestKey", request.current ??= crypto.randomUUID());
    start(async () => {
      try {
        const next = await action(data);
        setResult(next);
        if (next.ok) {
          request.current = null;
          router.refresh();
        }
      } catch { setResult({ ok: false, message: "처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요." }); }
      finally { lock.current = false; }
    });
  }
  return <form method="post" onSubmit={submit} className="space-y-3">
    {!once || !result?.ok ? <fieldset disabled={pending} className="min-w-0 space-y-3">
      {children}
      <button className={universityPrimary} type="submit">{pending ? "처리 중…" : button}</button>
    </fieldset> : null}
    <UniversityNotice result={result} />
  </form>;
}

function UniversityNotice({ result }: { result?: UniversityResult }) {
  return result ? <p role={result.ok ? "status" : "alert"} className={"rounded-lg p-3 text-sm " + (result.ok ? "bg-pul-light text-pul-deep" : "bg-rose-50 text-rose-800")}>{result.message}</p> : null;
}

export function UniversityProfileForm({ profile, viewer, photo }: { profile: UniversityWorkspace; viewer: string; photo: ReactNode }) {
  const router = useRouter();
  const [result, setResult] = useState<UniversityResult>();
  const [version, setVersion] = useState(profile.version);
  const [conflicted, setConflicted] = useState(false);
  const [pending, start] = useTransition();
  const lock = useRef(false);
  const progress = usePhotoUploadProgress();
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || conflicted) return;
    lock.current = true;
    setResult(undefined);
    const element = event.currentTarget;
    const input = new FormData(element);
    const file = input.get("file");
    const phase = progress.begin();
    start(async () => {
      try {
        const data = file instanceof File && file.size > 0
          ? await photoUploadForm(file, Object.fromEntries([...input.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")), { onProcessing: () => phase.processing() })
          : input;
        if (!phase.isCurrent()) return;
        if (file instanceof File && file.size > 0) phase.uploading();
        const response = await fetch(universityHref(profile.department_key) + "/profile", { method: "POST", body: data });
        if (response.status === 409) {
          if (phase.isCurrent()) {
            setConflicted(true);
            setResult({ ok: false, message: "다른 곳에서 학과 정보가 변경되었습니다. 작성 내용과 선택한 사진은 이 탭에 남아 있습니다. 새 탭에서 최신 정보를 확인하고 필요한 변경을 다시 입력해 주세요." });
          }
          return;
        }
        const next = await response.json();
        if (!phase.isCurrent()) return;
        setResult(next);
        if (response.ok && next.ok && typeof next.version === "number") {
          setVersion(next.version);
          const photoInput = element.elements.namedItem("file");
          if (photoInput instanceof HTMLInputElement) photoInput.value = "";
          router.refresh();
        } else if (next.errors) {
          const first = element.elements.namedItem(Object.keys(next.errors)[0]);
          if (first instanceof HTMLElement) requestAnimationFrame(() => first.focus());
        }
      } catch (error) {
        if (phase.isCurrent()) setResult({ ok: false, message: error instanceof Error && /[가-힣]/.test(error.message) ? error.message : "저장 결과를 확인하지 못했습니다. 공개 학과를 확인해 주세요." });
      } finally { phase.clear(); lock.current = false; }
    });
  }
  function field(name: keyof UniversityWorkspace, label: string, max: number, kind: "text" | "textarea" | "date" | "url" = "text") {
    const error = result?.errors?.[name];
    const props = { id: name, name, defaultValue: String(profile[name] ?? ""), className: universityInput,
      "aria-invalid": Boolean(error), "aria-describedby": error ? name + "-error" : undefined, maxLength: max };
    return <div className="min-w-0 space-y-1">
      <label htmlFor={name} className="text-sm font-bold">{label}</label>
      {kind === "textarea" ? <textarea {...props} rows={4} required={name === "summary"} />
        : <input {...props} type={kind === "date" ? "date" : "text"} inputMode={kind === "url" ? "url" : undefined} placeholder={kind === "url" ? "https://" : undefined} />}
      {error ? <p id={name + "-error"} className="text-sm text-rose-800">{error}</p> : null}
    </div>;
  }
  return <form method="post" encType="multipart/form-data" onSubmit={save}>
    <input type="hidden" name="version" value={version} />
    <input type="hidden" name="viewerId" value={viewer} />
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <section className={universityBox + " space-y-3"}>
        <h2 className="text-lg font-bold">학과 소개 및 대표 사진</h2>
        {field("summary", "학과 소개", 1000, "textarea")}
        {photo}
        <label className="block text-sm font-bold">대표 사진 등록·교체
          <input type="file" name="file" accept="image/jpeg,image/png,image/webp" className={universityInput + " mt-1"} />
        </label>
        {field("school_url", "학교 공식 홈페이지 URL", 500, "url")}
        {field("official_url", "학과 공식 홈페이지 URL", 500, "url")}
      </section>
      <section className={universityBox + " space-y-3"}>
        <h2 className="text-lg font-bold">모집 공고</h2>
        {field("recruitment_title", "공고 제목", 160)}
        <div className="grid gap-3 sm:grid-cols-2">
          {field("recruitment_start", "모집 시작일", 10, "date")}
          {field("recruitment_end", "모집 마감일", 10, "date")}
        </div>
        {field("recruitment_body", "공고 내용", 2000, "textarea")}
        {field("guide_url", "공식 모집요강 URL", 500, "url")}
        {field("admissions_url", "원서접수 URL", 500, "url")}
        <p className="text-sm text-pul-muted">모집요강은 PDF 또는 안내 페이지 주소를 사용할 수 있습니다. 주소를 비우면 공개 화면에서 해당 버튼을 숨깁니다.</p>
        <UniversityNotice result={result} />
        <PhotoUploadStatus message={progress.message} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={universityPrimary} disabled={conflicted}>{pending ? "저장 중…" : "변경 저장"}</button>
          {conflicted ? <a className={universityButton} href={universityHref(profile.department_key) + "/manage"} target="_blank" rel="noopener noreferrer">최신 정보 확인 (새 탭)</a> : null}
          {profile.publication_status === "published" ? <Link prefetch={false} className={universityButton} href={universityHref(profile.department_key)}>공개 학과 미리 보기</Link> : null}
        </div>
      </section>
    </fieldset>
  </form>;
}
