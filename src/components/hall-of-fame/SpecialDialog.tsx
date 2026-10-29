"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import { clubButton } from "@/components/clubs/detail/ClubEditorDialog";

export function SpecialDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
 const ref = useRef<HTMLDialogElement>(null), id = useId();
 useBodyScrollLock(true);
 useEffect(() => {
  const trigger = document.activeElement as HTMLElement | null, dialog = ref.current;
  dialog?.showModal();
  return () => { dialog?.close(); trigger?.focus(); };
 }, []);
 return <dialog ref={ref} aria-labelledby={id} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} className="m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-xl border border-pul-border bg-white p-0 text-foreground shadow-xl backdrop:bg-black/45">
  <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-pul-border bg-white p-4"><h2 id={id} className="min-w-0 break-words text-xl font-bold text-pul-deep">{title}</h2><button type="button" className={clubButton} onClick={onClose} aria-label={title + " 닫기"}>닫기</button></header>
  <div className="min-w-0 break-words p-4 sm:p-6">{children}</div>
 </dialog>;
}

