"use client";

import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  communityCategoryTabs,
  questionTypeLabels,
  reviewTypeLabels,
  type QuestionType,
  type ReviewType,
} from "@/data/communityData";
import type { CommunityPostDetail, CommunityPostInput, CommunityWritableCategory } from "@/lib/community/community";
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  post?: CommunityPostDetail;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: CommunityPostInput) => void;
};

const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20";
const writableCategories = communityCategoryTabs.filter((item): item is { id: CommunityWritableCategory; label: string } => item.id !== "all" && item.id !== "notice");

export function CommunityPostDialog({ post, busy, error, onClose, onSubmit }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [category, setCategory] = useState<CommunityWritableCategory>(post?.category ?? "free");
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [questionType, setQuestionType] = useState<QuestionType>(post?.questionType ?? "beginner");
  const [reviewType, setReviewType] = useState<ReviewType>(post?.category === "marketReview" ? "market" : post?.reviewType ?? "course");
  const [rating, setRating] = useState(post?.rating ?? 5);
  const [lostFoundKind, setLostFoundKind] = useState<"lost" | "found">(post?.lostFoundKind ?? "lost");
  const [lostFoundItemName, setLostFoundItemName] = useState(post?.lostFoundItemName ?? "");
  const [lostFoundPlace, setLostFoundPlace] = useState(post?.lostFoundPlace ?? "");
  const [lostFoundDate, setLostFoundDate] = useState(post?.lostFoundDate ?? "");
  useBodyScrollLock(true);

  useEffect(() => { firstRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (error) errorRef.current?.focus({ preventScroll: true }); }, [error]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const changeCategory = (next: CommunityWritableCategory) => {
    setCategory(next);
    if (next === "marketReview") setReviewType("market");
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const input: CommunityPostInput = { category, title, body };
    if (category === "question") input.questionType = questionType;
    if (category === "review" || category === "marketReview") { input.reviewType = category === "marketReview" ? "market" : reviewType; input.rating = rating; }
    if (category === "lostFound") {
      input.lostFoundKind = lostFoundKind;
      input.lostFoundItemName = lostFoundItemName;
      input.lostFoundPlace = lostFoundPlace;
      input.lostFoundDate = lostFoundDate;
      input.lostFoundStatus = post?.lostFoundStatus === "resolved" ? "resolved" : lostFoundKind === "lost" ? "searching" : "holding";
    }
    onSubmit(input);
  };

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
    <div ref={panelRef} className="flex max-h-[calc(100dvh-16px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-pul-border px-4 py-3 sm:px-5">
        <div><h2 id={titleId} className="text-xl font-bold">{post ? "게시글 수정" : "커뮤니티 글쓰기"}</h2><p id={descriptionId} className="mt-1 text-sm text-pul-muted">경험과 질문을 다른 회원과 나눠보세요.</p></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="닫기" className="min-h-11 min-w-11 rounded-full bg-pul-page text-2xl font-bold text-pul-muted disabled:opacity-50">×</button>
      </header>
      <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="text-sm font-bold">카테고리</span><select value={category} onChange={(event) => changeCategory(event.target.value as CommunityWritableCategory)} className={fieldClass}>{writableCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="sm:col-span-2"><span className="text-sm font-bold">제목</span><input ref={firstRef} required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} /></label>
          {category === "question" ? <label><span className="text-sm font-bold">질문 종류</span><select value={questionType} onChange={(event) => setQuestionType(event.target.value as QuestionType)} className={fieldClass}>{Object.entries(questionTypeLabels).filter(([key]) => key !== "needsAdmin").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label> : null}
          {category === "review" ? <label><span className="text-sm font-bold">후기 종류</span><select value={reviewType} onChange={(event) => setReviewType(event.target.value as ReviewType)} className={fieldClass}>{Object.entries(reviewTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label> : null}
          {(category === "review" || category === "marketReview") ? <label><span className="text-sm font-bold">별점</span><select value={rating} onChange={(event) => setRating(Number(event.target.value))} className={fieldClass}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value}점</option>)}</select></label> : null}
          {category === "lostFound" ? <>
            <label><span className="text-sm font-bold">구분</span><select value={lostFoundKind} onChange={(event) => setLostFoundKind(event.target.value as "lost" | "found")} className={fieldClass}><option value="lost">분실</option><option value="found">습득</option></select></label>
            <label><span className="text-sm font-bold">물건 이름</span><input required minLength={2} maxLength={100} value={lostFoundItemName} onChange={(event) => setLostFoundItemName(event.target.value)} className={fieldClass} /></label>
            <label><span className="text-sm font-bold">장소</span><input required minLength={2} maxLength={200} value={lostFoundPlace} onChange={(event) => setLostFoundPlace(event.target.value)} className={fieldClass} /></label>
            <label><span className="text-sm font-bold">발생일</span><input required type="date" value={lostFoundDate} onChange={(event) => setLostFoundDate(event.target.value)} className={fieldClass} /></label>
          </> : null}
          <label className="sm:col-span-2"><span className="text-sm font-bold">본문</span><textarea required minLength={10} maxLength={5000} rows={9} value={body} onChange={(event) => setBody(event.target.value)} className={`${fieldClass} py-3 leading-relaxed`} /></label>
        </div>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">전화번호·주소 등 개인정보는 게시글에 직접 올리지 마세요.</p>
        {error ? <p ref={errorRef} tabIndex={-1} className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800 outline-none" role="alert">{error}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-pul-border pt-4"><button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-lg border border-pul-border font-bold disabled:opacity-50">취소</button><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-pul-point font-bold text-white disabled:opacity-50">{busy ? "저장 중…" : post ? "수정 저장" : "게시하기"}</button></div>
      </form>
    </div>
  </div>;
}

export function CommunityConfirmDialog({ title, message, confirmLabel, busy, onClose, onConfirm }: { title: string; message: string; confirmLabel: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useBodyScrollLock(true);
  useEffect(() => { cancelRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);
  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div ref={panelRef} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 id={titleId} className="text-xl font-bold">{title}</h2><p className="mt-3 text-base leading-relaxed text-pul-muted">{message}</p><div className="mt-5 grid grid-cols-2 gap-2"><button ref={cancelRef} type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-lg border border-pul-border font-bold">취소</button><button type="button" onClick={onConfirm} disabled={busy} className="min-h-11 rounded-lg bg-rose-700 font-bold text-white">{busy ? "처리 중…" : confirmLabel}</button></div></div>
  </div>;
}
