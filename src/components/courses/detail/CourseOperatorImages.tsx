"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthSessionStatus } from "@/hooks/useAuthSessionStatus";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import { COURSE_OPERATOR_IMAGE_LIMIT, getCourseOperatorImages, operatorImageUrl, type CourseOperatorSnapshot, type CourseOperatorImage, parseCourseOperatorUnfinished, type CourseOperatorUnfinishedImage } from "@/lib/courses/courseOperatorImages";
import { photoUploadForm } from "@/lib/images/preparePhoto";
import { validatePhotoInput, type PhotoPurpose } from "@/lib/images/photoPolicy";
import { PhotoUploadStatus, usePhotoUploadProgress } from "@/components/ui/PhotoUploadStatus";
import { CourseImageViewer } from "./CourseImageViewer";
import { fittingPhotoCount, memberPhotoCellSize } from "./coursePhotoLayout";

const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-3 py-2 text-sm font-bold text-pul-deep hover:bg-pul-light disabled:opacity-50";
async function post(courseKey: string, body: FormData | Record<string, unknown>) {
  const response = await fetch(`/courses/${encodeURIComponent(courseKey)}/operator-images`, { method: "POST", ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "이미지를 저장하지 못했습니다. 다시 시도해 주세요.");
  return result as { id?: string; width?: number; height?: number; cleanupDelayed?: boolean };
}
async function readUnfinished(courseKey: string) {
  const response = await fetch(`/courses/${encodeURIComponent(courseKey)}/operator-images`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "저장하지 않은 사진을 확인하지 못했습니다.");
  return parseCourseOperatorUnfinished(result).items;
}

type Draft = { key: string; id?: string; file?: File; src: string; purpose: PhotoPurpose; caption: string; width?: number; height?: number };
function OperatorEditor({ courseKey, initial, onClose, onSaved }: { courseKey: string; initial: CourseOperatorSnapshot; onClose: () => void; onSaved: (snapshot: CourseOperatorSnapshot, delayed: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), fileInput = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>()), uploaded = useRef(new Set<string>());
  const attempt = useRef<{ signature: string; id: string } | null>(null), operation = useRef(false);
  const [items, setItems] = useState<Draft[]>(() => initial.items.map(item => ({ ...item, key: item.id, src: operatorImageUrl(item.id) })));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const { begin, message } = usePhotoUploadProgress();
  const [unfinished, setUnfinished] = useState<CourseOperatorUnfinishedImage[]>([]);
  const [selected, setSelected] = useState<string[]>([]), [checking, setChecking] = useState(true);
  const [recoveryError, setRecoveryError] = useState(""), [recoveryMessage, setRecoveryMessage] = useState("");
  useEffect(() => {
    let active = true;
    readUnfinished(courseKey).then(rows => { if (active) setUnfinished(rows); }).catch(cause => { if (active) setRecoveryError((cause as Error).message); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [courseKey]);
  const refreshUnfinished = async () => {
    setChecking(true); setRecoveryError("");
    try { const rows = await readUnfinished(courseKey); setUnfinished(rows); setSelected(current => current.filter(id => rows.some(row => row.id === id))); }
    catch (cause) { setRecoveryError((cause as Error).message); throw cause; }
    finally { setChecking(false); }
  };
  useBodyScrollLock(true);
  useEffect(() => { const trigger = document.activeElement as HTMLElement | null; const node = dialog.current; const currentUrls = urls.current; node?.showModal(); return () => { node?.close(); currentUrls.forEach(url => URL.revokeObjectURL(url)); requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); }); }; }, []);
  const discard = async (ids: string[]) => { for (let offset = 0; offset < ids.length; offset += 8) await post(courseKey, { action: "discard", ids: ids.slice(offset, offset + 8) }); };
  const cleanupSelected = async () => {
    if (operation.current || !selected.length) return;
    operation.current = true; setBusy(true); setRecoveryError(""); setRecoveryMessage("");
    const ids = [...selected];
    try {
      await discard(ids);
      ids.forEach(id => uploaded.current.delete(id));
      setItems(current => current.filter(item => !ids.includes(item.id || item.key)));
      await refreshUnfinished();
      setRecoveryMessage("선택한 미저장 사진을 정리했습니다.");
    } catch (cause) { setRecoveryError((cause as Error).message); }
    finally { operation.current = false; setBusy(false); }
  };
  const close = async () => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError("");
    try { await discard([...uploaded.current]); onClose(); } catch (cause) { setError((cause as Error).message); }
    finally { operation.current = false; setBusy(false); }
  };
  const add = (files: File[]) => {
    try {
      if (items.length + files.length > COURSE_OPERATOR_IMAGE_LIMIT) throw Error(`이미지는 최대 ${COURSE_OPERATOR_IMAGE_LIMIT}장까지 등록할 수 있습니다.`);
      files.forEach(file => validatePhotoInput(file));
      const next = files.map(file => { const src = URL.createObjectURL(file); urls.current.add(src); return { key: crypto.randomUUID(), file, src, purpose: "photo" as const, caption: "" }; });
      setItems(current => [...current, ...next]); setError("");
    } catch (cause) { setError((cause as Error).message); }
    if (fileInput.current) fileInput.current.value = "";
  };
  const move = (index: number, delta: number) => setItems(current => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  const save = async () => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); const progress = begin();
    const working = items.map(item => ({ ...item }));
    try {
      const retained = new Set(working.map(item => item.id || item.key));
      const abandoned = [...uploaded.current].filter(id => !retained.has(id));
      await discard(abandoned); abandoned.forEach(id => uploaded.current.delete(id));
      const remaining = working.filter(item => item.file && !item.id); let position = 0;
      for (const item of working) {
        if (!item.file || item.id) continue;
        position++;
        const form = await photoUploadForm(item.file, { requestId: item.key, purpose: item.purpose }, { purpose: item.purpose, onProcessing: () => progress.processing(position, remaining.length) });
        if (!progress.isCurrent()) return;
        progress.uploading();
        uploaded.current.add(item.key); // Keep the stable request even if the upload response is lost.
        const response = await post(courseKey, form);
        if (response.id !== item.key) throw Error("저장 응답을 확인하지 못했습니다. 같은 사진으로 다시 시도해 주세요.");
        item.id = response.id; item.width = response.width; item.height = response.height; uploaded.current.add(response.id);
        setItems(working.map(value => ({ ...value })));
      }
      progress.clear();
      const images = working.map(item => ({ id: item.id, caption: item.caption }));
      const signature = JSON.stringify({ version: initial.version, images });
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
      const result = await post(courseKey, { action: "save", version: initial.version, requestId: attempt.current.id, images });
      const selected = new Set(working.map(item => item.id));
      selected.forEach(id => { if (id) uploaded.current.delete(id); });
      await discard([...uploaded.current].filter(id => !selected.has(id)));
      const fresh = await getCourseOperatorImages(createClient(), courseKey);
      uploaded.current.clear(); onSaved(fresh, !!result.cleanupDelayed);
    } catch (cause) { setError((cause as Error).message || "이미지를 저장하지 못했습니다. 입력과 완료 파일은 유지됩니다."); void refreshUnfinished().catch(() => {}); }
    finally { if (progress.isCurrent()) { progress.clear(); operation.current = false; setBusy(false); } }
  };
  return <dialog ref={dialog} aria-labelledby="course-operator-editor-title" className="course-operator-editor" onCancel={event => { event.preventDefault(); void close(); }}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pul-border p-4"><h2 id="course-operator-editor-title" className="text-xl font-bold text-pul-deep">구장 이미지 관리</h2><button type="button" className={button} disabled={busy} onClick={() => void close()}>닫기</button></div>
    <div className="space-y-4 p-4">
      <p className="text-sm leading-6 text-pul-muted">원하는 이미지를 자유롭게 올려주세요. 최대 {COURSE_OPERATOR_IMAGE_LIMIT}장 · 순서대로 표시하며 상세에는 공간에 들어가는 만큼 한 줄로 보여줍니다. 설명은 선택 사항입니다.</p>
      <p className="text-sm leading-6 text-pul-muted">일반 사진 800px · 글자 중심 자료 2560px. 파일마다 규격만 선택하세요. JPG·PNG·WebP, 원본 32MB 이하 · 처리 후 4MB 이하.</p>
      {checking || unfinished.length || recoveryError || recoveryMessage ? <section aria-label="저장하지 않은 사진" className="space-y-2 rounded-lg border border-pul-border bg-pul-light p-3 text-sm">
        {checking ? <p role="status">저장하지 않은 사진 확인 중…</p> : null}
        {unfinished.length ? <>
          <p className="font-bold text-pul-deep">저장하지 않은 사진이 있습니다 · {unfinished.length}장</p>
          <p className="leading-6 text-pul-muted">다른 탭에서 전송 중인지 확인한 뒤 정리할 사진만 선택해 주세요. 저장된 사진은 유지됩니다.</p>
          <ul className="space-y-2">{unfinished.map((row, index) => <li key={row.id}><label className="flex min-h-11 items-start gap-2"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-pul-point" checked={selected.includes(row.id)} disabled={busy || checking} onChange={event => setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} /><span>미저장 사진 {index + 1} · {row.status === "uploaded" ? "전송 완료" : row.status === "removed" ? "정리 재시도 필요" : "전송 확인 필요"}<span className="block text-xs text-pul-muted">{row.purpose === "document" ? "글자 중심 자료" : "일반 사진"} · {new Date(row.createdAt).toLocaleString("ko-KR")}</span></span></label></li>)}</ul>
          <button type="button" className={button} disabled={busy || checking || !selected.length} onClick={() => void cleanupSelected()}>선택한 미저장 사진 정리{selected.length ? ` · ${selected.length}장` : ""}</button>
        </> : null}
        {recoveryError ? <p role="alert" className="text-rose-800">{recoveryError}</p> : null}
        {recoveryMessage ? <p role="status">{recoveryMessage}</p> : null}
        <button type="button" className="min-h-11 font-bold text-pul-point underline disabled:opacity-50" disabled={busy || checking} onClick={() => void refreshUnfinished().catch(() => {})}>미저장 사진 다시 확인</button>
      </section> : null}
      <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={event => add(Array.from(event.target.files ?? []))} className="block w-full min-w-0 text-sm" aria-label="구장 이미지 추가" />
      <ol className="space-y-3">{items.map((item, index) => <li key={item.key} className="course-operator-edit-row">
        <Image unoptimized width={100} height={80} src={item.src} alt={`${index + 1}번 이미지 미리보기`} className="h-20 w-24 rounded-lg bg-pul-light object-contain" />
        <div className="min-w-0 space-y-2"><label className="block text-sm">짧은 설명 (선택)<input value={item.caption} maxLength={180} disabled={busy} onChange={event => setItems(current => current.map(value => value.key === item.key ? { ...value, caption: event.target.value } : value))} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-2 text-base" /></label>
          {item.file ? <label className="block text-sm">이미지 규격<select value={item.purpose} disabled={busy || !!item.id} onChange={event => setItems(current => current.map(value => value.key === item.key ? { ...value, purpose: event.target.value as PhotoPurpose } : value))} className="ml-2 max-w-full rounded-lg border border-pul-border p-2 text-base"><option value="photo">일반 사진 · 800px</option><option value="document">글자 중심 자료 · 2560px</option></select></label> : null}
          <div className="flex flex-wrap gap-2"><span className="self-center text-xs text-pul-muted">{index === 0 ? "첫 표시" : `${index + 1}번째`}{item.file && item.id ? " · 전송 완료" : ""}</span><button type="button" className={button} disabled={busy || index === 0} aria-label={`${index + 1}번 위로 이동`} onClick={() => move(index, -1)}>↑ 위로</button><button type="button" className={button} disabled={busy || index === items.length - 1} aria-label={`${index + 1}번 아래로 이동`} onClick={() => move(index, 1)}>↓ 아래로</button><button type="button" className={button + " text-rose-700"} disabled={busy} onClick={() => setItems(current => current.filter(value => value.key !== item.key))}>삭제</button></div>
        </div>
      </li>)}</ol>
      <PhotoUploadStatus message={message || (busy ? "이미지 순서와 설명을 저장하고 있습니다…" : "")} />
      {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}<br />입력·선택 파일·전송 완료 파일은 유지됩니다.</p> : null}
      <div className="flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={() => void close()}>취소</button><button type="button" className={button + " bg-pul-point text-white"} disabled={busy} onClick={() => void save()}>{busy ? "저장 중…" : "저장"}</button></div>
    </div>
  </dialog>;
}

export function CourseOperatorThumbnails({ items }: { items: CourseOperatorImage[] }) {
  const [viewer, setViewer] = useState<number | null>(null);
  const thumbnails = useRef<HTMLDivElement>(null), viewerTrigger = useRef<HTMLButtonElement | null>(null);
  const [layout, setLayout] = useState({ cellSize: 0, capacity: 0 });
  const hasImages = items.length > 0;
  useEffect(() => {
    const row = thumbnails.current;
    const memberSection = document.getElementById("course-activity-photo-title")?.closest("section");
    if (!hasImages || !row || !memberSection) return;
    let availableWidth = 0, memberWidth = 0;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === row) availableWidth = entry.contentRect.width;
        if (entry.target === memberSection) memberWidth = entry.contentRect.width;
      }
      const memberRow = memberSection.querySelector(".course-member-photo-row");
      const memberGap = memberRow ? parseFloat(getComputedStyle(memberRow).columnGap) : 6;
      const gap = parseFloat(getComputedStyle(row).columnGap);
      const cellSize = memberPhotoCellSize(memberWidth, memberGap);
      const capacity = fittingPhotoCount(availableWidth, cellSize, gap);
      setLayout(current => current.cellSize === cellSize && current.capacity === capacity ? current : { cellSize, capacity });
    });
    observer.observe(row); observer.observe(memberSection);
    return () => observer.disconnect();
  }, [hasImages]);
  const visibleCount = Math.min(items.length, layout.capacity);
  const hiddenCount = items.length - visibleCount;
  if (!items.length) return null;
  return <>
    {items.length ? <div ref={thumbnails} className="course-operator-thumbnails" style={{ "--course-operator-cell": `${layout.cellSize}px` } as CSSProperties}>{items.slice(0, visibleCount).map((image, index) => <button key={image.id} type="button" className="course-operator-thumbnail" onClick={event => { viewerTrigger.current = event.currentTarget; setViewer(index); }} aria-label={`운영자 이미지 ${index + 1}${image.caption ? ` · ${image.caption}` : ""} 확대${index === visibleCount - 1 && hiddenCount > 0 ? ` · 추가 ${hiddenCount}장` : ""}`}><Image unoptimized src={operatorImageUrl(image.id)} width={image.width} height={image.height} alt={image.caption || `구장 이미지 ${index + 1}`} />{index === visibleCount - 1 && hiddenCount > 0 ? <span className="course-operator-more">+{hiddenCount}</span> : null}</button>)}</div> : null}
    {viewer !== null ? <CourseImageViewer title="구장 이미지" images={items.map(item => ({ ...item, src: operatorImageUrl(item.id) }))} initialIndex={viewer} onClose={() => { setViewer(null); if (!viewerTrigger.current?.isConnected) requestAnimationFrame(() => thumbnails.current?.querySelector("button")?.focus({ preventScroll: true })); }} /> : null}
  </>;
}

export function CourseOperatorImages({ courseKey, initial }: { courseKey: string; initial: CourseOperatorSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial), [editing, setEditing] = useState(false), [message, setMessage] = useState("");
  const status = useAuthSessionStatus();
  useEffect(() => { const client = createClient(); let active = true; const { data: { subscription } } = client.auth.onAuthStateChange((event) => { if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return; setEditing(false); if (event === "SIGNED_OUT") setSnapshot(current => ({ ...current, canManage: false })); queueMicrotask(() => { void getCourseOperatorImages(client, courseKey).then(data => { if (active) setSnapshot(data); }).catch(() => { if (active) setSnapshot(current => ({ ...current, canManage: false })); }); }); }); return () => { active = false; subscription.unsubscribe(); }; }, [courseKey]);
  const canManage = status === "signedIn" && snapshot.canManage;
  if (!snapshot.items.length && !canManage) return null;
  return <div className="course-operator-inline" aria-label="구장 운영자 이미지">
    <CourseOperatorThumbnails items={snapshot.items}/>
    {canManage ? <button type="button" className="mt-1 min-h-9 text-xs font-bold text-pul-point underline" onClick={() => { setMessage(""); setEditing(true); }}>이미지 관리</button> : null}
    {message ? <p role="status" className="mt-1 text-xs text-pul-muted">{message}</p> : null}
    {editing && canManage ? <OperatorEditor courseKey={courseKey} initial={snapshot} onClose={() => setEditing(false)} onSaved={(data, delayed) => { setSnapshot(data); setEditing(false); setMessage(delayed ? "저장했습니다. 삭제 파일의 저장소 정리가 지연되고 있습니다." : "이미지를 저장했습니다."); }} /> : null}
  </div>;
}
