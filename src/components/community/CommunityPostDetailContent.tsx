"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  getCommunityPostAction,
  listCommunityCommentsAction,
  mutateCommunityCommentAction,
  mutateCommunityPostAction,
} from "@/app/community/actions";
import { CommunityConfirmDialog, CommunityPostDialog } from "@/components/community/CommunityPostDialog";
import {
  communityCategoryLabels,
  lostFoundKindLabels,
  lostFoundStatusLabels,
  questionResolveLabels,
  questionTypeLabels,
  reviewTypeLabels,
} from "@/data/communityData";
import type { CommunityComment, CommunityPage, CommunityPostDetail, CommunityPostInput } from "@/lib/community/community";

type Props = {
  initialPost: CommunityPostDetail;
  initialComments: CommunityPage<CommunityComment>;
  commentsLoadFailed?: boolean;
};

type ConfirmAction = { kind: "removePost" } | { kind: "resolveQuestion" } | { kind: "lostFound"; status: "searching" | "holding" | "resolved" } | { kind: "removeComment"; comment: CommunityComment };

function messageOf(error: unknown) {
  return error instanceof Error && error.message ? error.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function CommunityPostDetailContent({ initialPost, initialComments, commentsLoadFailed = false }: Props) {
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [commentPage, setCommentPage] = useState(initialComments);
  const [commentBody, setCommentBody] = useState("");
  const [editingComment, setEditingComment] = useState<CommunityComment | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [error, setError] = useState(commentsLoadFailed ? "댓글을 불러오지 못했습니다. 다시 시도해 주세요." : "");
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const comments = commentPage.items;

  const focusNotice = () => requestAnimationFrame(() => noticeRef.current?.focus({ preventScroll: true }));
  const closeOverlay = () => {
    setShowEdit(false);
    setConfirm(null);
    setDialogError("");
    requestAnimationFrame(() => actionTriggerRef.current?.focus({ preventScroll: true }));
  };

  const refresh = async () => {
    const [nextPost, nextComments] = await Promise.all([getCommunityPostAction(post.id), listCommunityCommentsAction(post.id, 100, 0)]);
    setPost(nextPost);
    setCommentPage(nextComments);
  };

  const loadMoreComments = () => {
    setError("");
    startTransition(async () => {
      try {
        const next = await listCommunityCommentsAction(post.id, 100, comments.length);
        setCommentPage({ ...next, items: [...comments, ...next.items] });
      } catch (loadError) {
        setError(messageOf(loadError));
      }
    });
  };

  const savePost = (input: CommunityPostInput) => {
    setDialogError("");
    startTransition(async () => {
      try {
        const mutation = await mutateCommunityPostAction({ operation: "update", postId: post.id, expectedVersion: post.version, payload: input });
        if (!mutation.ok) throw new Error(mutation.error);
        await refresh();
        setShowEdit(false);
        setNotice("게시글을 수정했습니다.");
        focusNotice();
      } catch (mutationError) {
        setDialogError(messageOf(mutationError));
        if (mutationError instanceof Error && /최신|변경/.test(mutationError.message)) await refresh().catch(() => undefined);
      }
    });
  };

  const runConfirmed = () => {
    if (!confirm) return;
    const selected = confirm;
    startTransition(async () => {
      try {
        if (selected.kind === "removePost") {
          const mutation = await mutateCommunityPostAction({ operation: "remove", postId: post.id, expectedVersion: post.version });
          if (!mutation.ok) throw new Error(mutation.error);
          router.replace("/community");
          return;
        }
        if (selected.kind === "resolveQuestion") {
          const mutation = await mutateCommunityPostAction({ operation: "resolve_question", postId: post.id, expectedVersion: post.version });
          if (!mutation.ok) throw new Error(mutation.error);
          setNotice("질문을 해결됨으로 표시했습니다.");
        } else if (selected.kind === "lostFound") {
          const mutation = await mutateCommunityPostAction({ operation: "update_lost_found", postId: post.id, expectedVersion: post.version, payload: { lostFoundStatus: selected.status } });
          if (!mutation.ok) throw new Error(mutation.error);
          setNotice(selected.status === "resolved" ? "분실·습득 글을 해결됨으로 표시했습니다." : "분실·습득 상태를 다시 진행 중으로 변경했습니다.");
        } else {
          const mutation = await mutateCommunityCommentAction({ operation: "remove", postId: post.id, commentId: selected.comment.id, expectedVersion: selected.comment.version });
          if (!mutation.ok) throw new Error(mutation.error);
          setNotice("댓글을 삭제했습니다.");
        }
        setConfirm(null);
        await refresh();
        focusNotice();
      } catch (mutationError) {
        setError(messageOf(mutationError));
        setConfirm(null);
        await refresh().catch(() => undefined);
      }
    });
  };

  const submitComment = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        const mutation = await mutateCommunityCommentAction({ operation: "create", postId: post.id, commentId: null, expectedVersion: null, body: commentBody });
        if (!mutation.ok) throw new Error(mutation.error);
        setCommentBody("");
        await refresh();
        setNotice("댓글을 등록했습니다.");
        focusNotice();
      } catch (mutationError) {
        setError(messageOf(mutationError));
      }
    });
  };

  const updateComment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingComment) return;
    startTransition(async () => {
      try {
        const mutation = await mutateCommunityCommentAction({ operation: "update", postId: post.id, commentId: editingComment.id, expectedVersion: editingComment.version, body: editingBody });
        if (!mutation.ok) throw new Error(mutation.error);
        setEditingComment(null);
        setEditingBody("");
        await refresh();
        setNotice("댓글을 수정했습니다.");
        focusNotice();
      } catch (mutationError) {
        setError(messageOf(mutationError));
        await refresh().catch(() => undefined);
      }
    });
  };

  const openConfirm = (event: React.MouseEvent<HTMLButtonElement>, action: ConfirmAction) => {
    actionTriggerRef.current = event.currentTarget;
    setError("");
    setConfirm(action);
  };

  const confirmCopy = confirm?.kind === "removePost"
    ? { title: "게시글을 삭제할까요?", message: "삭제한 글은 공개 목록과 상세에서 보이지 않습니다.", label: "게시글 삭제" }
    : confirm?.kind === "resolveQuestion"
      ? { title: "질문을 해결됨으로 표시할까요?", message: "답변을 충분히 확인한 뒤 상태를 변경해 주세요.", label: "해결됨 표시" }
      : confirm?.kind === "removeComment"
        ? { title: "댓글을 삭제할까요?", message: "삭제한 댓글은 다시 표시되지 않습니다.", label: "댓글 삭제" }
        : { title: "분실·습득 상태를 변경할까요?", message: "현재 물건의 처리 상황에 맞는 상태인지 확인해 주세요.", label: "상태 변경" };

  return (
    <div className="space-y-5">
      <Link href="/community" className="inline-flex min-h-11 items-center font-bold text-pul-point">← 커뮤니티 목록</Link>
      <article className="rounded-xl border border-pul-border bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-pul-light px-3 py-1 text-pul-deep">{communityCategoryLabels[post.category]}</span>
          {post.questionType ? <span className="rounded-full bg-slate-100 px-3 py-1">{questionTypeLabels[post.questionType]}</span> : null}
          {post.questionStatus ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">{questionResolveLabels[post.questionStatus]}</span> : null}
          {post.reviewType && post.rating ? <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">{reviewTypeLabels[post.reviewType]} · {post.rating}점</span> : null}
          {post.lostFoundKind ? <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">{lostFoundKindLabels[post.lostFoundKind]}</span> : null}
          {post.lostFoundStatus ? <span className="rounded-full bg-slate-100 px-3 py-1">{lostFoundStatusLabels[post.lostFoundStatus]}</span> : null}
        </div>
        <h1 className="mt-3 break-words text-2xl font-bold text-pul-deep sm:text-3xl">{post.title}</h1>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-pul-muted"><span>{post.authorDisplayName}</span><time>{post.createdAt}</time><span>댓글 {post.commentCount}</span></p>
        {post.category === "lostFound" ? <dl className="mt-4 grid gap-2 rounded-lg bg-amber-50 p-4 text-sm sm:grid-cols-3"><div><dt className="font-bold">물건</dt><dd>{post.lostFoundItemName}</dd></div><div><dt className="font-bold">장소</dt><dd>{post.lostFoundPlace}</dd></div><div><dt className="font-bold">날짜</dt><dd>{post.lostFoundDate}</dd></div></dl> : null}
        <div className="mt-6 whitespace-pre-wrap break-words border-t border-pul-border pt-6 text-base leading-8 text-slate-800">{post.body}</div>
        {post.canEdit ? <div className="mt-6 flex flex-wrap gap-2 border-t border-pul-border pt-4">
          <button type="button" disabled={isPending} onClick={(event) => { actionTriggerRef.current = event.currentTarget; setShowEdit(true); }} className="min-h-11 rounded-lg border border-pul-border px-4 font-bold">수정</button>
          {post.questionStatus && post.questionStatus !== "resolved" ? <button type="button" disabled={isPending} onClick={(event) => openConfirm(event, { kind: "resolveQuestion" })} className="min-h-11 rounded-lg border border-emerald-300 bg-emerald-50 px-4 font-bold text-emerald-900">해결됨 표시</button> : null}
          {post.lostFoundStatus ? <button type="button" disabled={isPending} onClick={(event) => openConfirm(event, { kind: "lostFound", status: post.lostFoundStatus === "resolved" ? (post.lostFoundKind === "lost" ? "searching" : "holding") : "resolved" })} className="min-h-11 rounded-lg border border-amber-300 bg-amber-50 px-4 font-bold text-amber-900">{post.lostFoundStatus === "resolved" ? "다시 진행 중" : "해결됨 표시"}</button> : null}
          <button type="button" disabled={isPending} onClick={(event) => openConfirm(event, { kind: "removePost" })} className="min-h-11 rounded-lg border border-rose-300 px-4 font-bold text-rose-800">삭제</button>
        </div> : null}
      </article>

      <section className="rounded-xl border border-pul-border bg-white p-4 shadow-sm sm:p-6" aria-labelledby="community-comments-title">
        <h2 id="community-comments-title" className="text-xl font-bold text-pul-deep">댓글 {commentPage.total}</h2>
        {notice ? <p ref={noticeRef} tabIndex={-1} className="mt-3 rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-900 outline-none" role="status">{notice}</p> : null}
        {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800" role="alert">{error}</p> : null}
        <form onSubmit={submitComment} className="mt-4">
          <label htmlFor="community-comment" className="text-sm font-bold">댓글 작성</label>
          <textarea id="community-comment" required maxLength={2000} rows={3} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="서로 존중하는 댓글을 남겨주세요." className="mt-1 w-full rounded-lg border border-pul-border p-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20" />
          <div className="mt-2 text-right"><button type="submit" disabled={isPending || !commentBody.trim()} className="min-h-11 rounded-lg bg-pul-point px-5 font-bold text-white disabled:opacity-50">댓글 등록</button></div>
        </form>
        {comments.length === 0 ? <p className="mt-6 rounded-lg bg-slate-50 p-6 text-center text-sm text-pul-muted">아직 댓글이 없습니다.</p> : <ul className="mt-5 divide-y divide-pul-border">
          {comments.map((comment) => <li key={comment.id} className="py-4">
            {editingComment?.id === comment.id ? <form onSubmit={updateComment}><label className="sr-only" htmlFor={`comment-edit-${comment.id}`}>댓글 수정 내용</label><textarea id={`comment-edit-${comment.id}`} required maxLength={2000} rows={3} autoFocus value={editingBody} onChange={(event) => setEditingBody(event.target.value)} className="w-full rounded-lg border border-pul-border p-3 text-base" /><div className="mt-2 flex justify-end gap-2"><button type="button" disabled={isPending} onClick={() => setEditingComment(null)} className="min-h-11 rounded-lg border border-pul-border px-4 font-bold">취소</button><button type="submit" disabled={isPending || !editingBody.trim()} className="min-h-11 rounded-lg bg-pul-point px-4 font-bold text-white">저장</button></div></form> : <>
              <p className="flex flex-wrap gap-x-3 text-sm text-pul-muted"><strong className="text-slate-800">{comment.authorDisplayName}</strong><time>{comment.createdAt}</time></p>
              <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{comment.body}</p>
              {comment.canEdit ? <div className="mt-2 flex gap-2"><button type="button" disabled={isPending} onClick={() => { setEditingComment(comment); setEditingBody(comment.body); }} className="min-h-11 px-2 text-sm font-bold text-pul-point">수정</button><button type="button" disabled={isPending} onClick={(event) => openConfirm(event, { kind: "removeComment", comment })} className="min-h-11 px-2 text-sm font-bold text-rose-700">삭제</button></div> : null}
            </>}
          </li>)}
        </ul>}
        {commentPage.hasMore ? <div className="mt-4 text-center"><button type="button" disabled={isPending} onClick={loadMoreComments} className="min-h-11 rounded-lg border border-pul-border px-5 font-bold text-pul-deep disabled:opacity-50">댓글 더 보기</button></div> : null}
      </section>

      {showEdit ? <CommunityPostDialog post={post} busy={isPending} error={dialogError} onClose={closeOverlay} onSubmit={savePost} /> : null}
      {confirm ? <CommunityConfirmDialog title={confirmCopy.title} message={confirmCopy.message} confirmLabel={confirmCopy.label} busy={isPending} onClose={closeOverlay} onConfirm={runConfirmed} /> : null}
    </div>
  );
}
