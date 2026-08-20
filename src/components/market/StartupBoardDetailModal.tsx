"use client";

import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  startupBoardCategoryLabels,
  startupBoardCategoryStyles,
  startupBoardConsultationLabels,
  startupBoardStatusLabels,
  startupBoardStatusStyles,
} from "@/data/marketData";
import { cn } from "@/lib/utils";
import type { StartupBoardPostDetail } from "@/types";
import { useEffect, useId, useRef } from "react";

type Props = {
  post: StartupBoardPostDetail | null;
  busy: boolean;
  onClose: () => void;
  onEdit: (post: StartupBoardPostDetail) => void;
  onClosePost: (post: StartupBoardPostDetail) => void;
  onRemove: (post: StartupBoardPostDetail) => void;
};

export function StartupBoardDetailModal({ post, busy, onClose, onEdit, onClosePost, onRemove }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useBodyScrollLock(Boolean(post));

  useEffect(() => {
    if (!post) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, post]);

  if (!post) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <article ref={panelRef} className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-pul-border bg-white shadow-[0_12px_40px_rgba(6,78,59,0.2)] sm:max-w-lg sm:rounded-xl">
        <div className="border-b border-pul-border bg-gradient-to-r from-orange-50/80 to-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-bold", startupBoardCategoryStyles[post.category])}>{startupBoardCategoryLabels[post.category]}</span>
              <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-bold", startupBoardStatusStyles[post.status])}>{startupBoardStatusLabels[post.status]}</span>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} disabled={busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-pul-muted shadow-sm disabled:opacity-50" aria-label="닫기">×</button>
          </div>
          <h2 id={titleId} className="mt-3 text-xl font-bold leading-snug text-foreground">{post.title}</h2>
        </div>

        <div className="space-y-4 p-5">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">{post.body}</p>
          <dl className="grid gap-3 rounded-lg bg-[#fafbfa] p-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="font-semibold text-foreground">지역</dt><dd className="text-right text-pul-muted">{post.region}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-semibold text-foreground">희망 규모</dt><dd className="text-right text-pul-muted">{post.desiredScale}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-semibold text-foreground">상담 유형</dt><dd className="text-right text-pul-muted">{startupBoardConsultationLabels[post.consultationType]}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-semibold text-foreground">작성자</dt><dd className="text-right text-pul-muted">{post.authorNickname}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-semibold text-foreground">작성일</dt><dd className="text-right text-pul-muted">{post.createdAt}</dd></div>
          </dl>

          {post.canEdit ? (
            <div className="grid grid-cols-2 gap-2 border-t border-pul-border pt-4">
              {post.status === "open" ? <><button type="button" onClick={() => onEdit(post)} disabled={busy} className="min-h-11 rounded-lg border border-pul-border text-sm font-bold disabled:opacity-50">수정</button><button type="button" onClick={() => onClosePost(post)} disabled={busy} className="min-h-11 rounded-lg bg-pul-point text-sm font-bold text-white disabled:opacity-50">게시글 종료</button></> : null}
              <button type="button" onClick={() => onRemove(post)} disabled={busy} className="min-h-11 rounded-lg border border-rose-200 text-sm font-bold text-rose-700 disabled:opacity-50">삭제</button>
            </div>
          ) : null}

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">본 게시글은 참고용이며, 실제 계약·매매·창업 비용·수익성은 반드시 당사자와 전문가에게 확인해야 합니다.</p>
        </div>
      </article>
    </div>
  );
}
