"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PhotoUploadStatus, usePhotoUploadProgress } from "@/components/ui/PhotoUploadStatus";
import { photoUploadForm } from "@/lib/images/preparePhoto";
import { universityPrimary, universityButton } from "./universityStyles";

export function UniversityUploadForm({ endpoint, viewer, button, children, doneHref, reset = false }: {
  endpoint: string; viewer: string; button: string; children?: ReactNode; doneHref?: string; reset?: boolean;
}) {
  const lock = useRef(false);
  const attempt = useRef<{ id: string; request: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; existing?: { key: string; name: string; school: string }; id?: string }>();
  const progress = usePhotoUploadProgress();
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setResult(undefined);
    const element = event.currentTarget;
    const data = new FormData(element);
    const identity = attempt.current ??= { id: crypto.randomUUID(), request: crypto.randomUUID() };
    data.set("id", String(data.get("id") || identity.id));
    data.set("requestKey", identity.request);
    data.set("viewerId", viewer);
    const file = data.get("file");
    const phase = progress.begin();
    try {
      const upload = file instanceof File && file.size > 0;
      const body = upload ? await photoUploadForm(file, Object.fromEntries(
        [...data].filter((item): item is [string, string] => typeof item[1] === "string"),
      ), { onProcessing: () => phase.processing() }) : data;
      if (!phase.isCurrent()) return;
      if (upload) phase.uploading();
      const response = await fetch(endpoint, { method: "POST", body });
      const value = await response.json();
      setResult(value);
      if (response.ok && value.ok) {
        attempt.current = null;
        if (doneHref) router.push(doneHref + (value.id ? "?id=" + encodeURIComponent(value.id) : ""));
        else {
          if (reset) element.reset();
          router.refresh();
        }
      } else if (response.status < 500) attempt.current = null;
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error && /[가-힣]/.test(error.message) ? error.message : "처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요." });
    } finally { phase.clear(); lock.current = false; setBusy(false); }
  }
  return <form method="post" encType="multipart/form-data" onSubmit={submit} className="space-y-3">
    <fieldset disabled={busy || Boolean(doneHref && result?.ok)} className="min-w-0 space-y-3">
      {children}
      <button className={universityPrimary} type="submit">{busy ? "처리 중…" : button}</button>
    </fieldset>
    <PhotoUploadStatus message={progress.message} />
    {result && <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-pul-deep" : "text-rose-800"}>{result.message}</p>}
    {result?.existing && <div className="flex flex-wrap items-center gap-2">
      <Link className={universityButton} href={"/lessons/university-departments/" + result.existing.key}>{result.existing.school} · {result.existing.name}</Link>
      <Link className={universityButton} href={"/lessons/university-applications?department=" + encodeURIComponent(result.existing.key)}>학과 담당자 신청</Link>
    </div>}
  </form>;
}

