"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBodyScrollLock } from "@/components/ui/InfoModal";

export type CourseViewImage = { id: string; src: string; caption?: string | null; createdAt?: string; width?: number; height?: number };
export function CourseImageViewer({ images, initialIndex, title, onClose, actions, hasMore = false, onLoadMore, total, lockScroll = true }: {
  images: CourseViewImage[]; initialIndex: number; title: string; onClose: () => void;
  lockScroll?: boolean; total?: number; actions?: (index: number) => ReactNode; hasMore?: boolean; onLoadMore?: () => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex), [large, setLarge] = useState(false), [loading, setLoading] = useState(false);
  useBodyScrollLock(lockScroll);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const node = dialog.current; node?.showModal();
    return () => { node?.close(); requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); }); };
  }, []);
  const previous = () => { if (loading) return; setIndex(i => Math.max(0, i - 1)); setLarge(false); };
  const next = async () => {
    if (loading) return;
    if (index < images.length - 1) setIndex(i => i + 1);
    else if (hasMore && onLoadMore) { setLoading(true); try { if (await onLoadMore()) setIndex(i => i + 1); } finally { setLoading(false); } }
    setLarge(false);
  };
  const image = images[index];
  return <dialog ref={dialog} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key === "ArrowLeft") { event.preventDefault(); previous(); }
    if (event.key === "ArrowRight") { event.preventDefault(); void next(); }
  }} className="course-image-dialog">
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/30 p-3">
        <span className="mr-auto text-sm" aria-live="polite">{title} · {index + 1} / {total ?? images.length}</span>
        <button type="button" className="course-view-button" onClick={() => setLarge(!large)}>{large ? "화면에 맞춤" : "더 크게"}</button>
        <button type="button" autoFocus className="course-view-button" onClick={onClose}>닫기</button>
      </div>
      <div className={`course-image-viewport ${large ? "is-large" : ""}`}>
        {image ? <Image unoptimized src={image.src} alt={image.caption || `${title} ${index + 1}`} width={image.width ?? 800} height={image.height ?? 800} /> : null}
      </div>
      <div className="shrink-0 space-y-2 p-3">
        {image?.caption ? <p className="whitespace-pre-wrap break-words text-sm">{image.caption}</p> : null}
        {image?.createdAt ? <p className="text-xs text-white/75">{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul" }).format(new Date(image.createdAt))}</p> : null}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" className="course-view-button" disabled={index === 0 || loading} onClick={previous}>이전 이미지</button>
          <button type="button" className="course-view-button" disabled={loading || index === images.length - 1 && !hasMore} onClick={() => void next()}>{loading ? "불러오는 중…" : "다음 이미지"}</button>
          {actions?.(index)}
        </div>
      </div>
    </div>
  </dialog>;
}
