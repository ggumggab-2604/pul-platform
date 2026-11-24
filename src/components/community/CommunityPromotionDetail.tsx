"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { mutateCommunityPostAction } from "@/app/community/actions";
import { saveCommunityPromotionAction } from "@/app/community/promotion-actions";
import type { PublishedPromotion } from "@/lib/community/communityPromotions";
import { emptyFilters, fields, regionLabel } from "@/lib/community/communityPromotionsPreview";
import { CommunityReportForm } from "./CommunityReportForm";
import { Destination } from "./CommunityPromotionBoardUI";
import { PostForm, PreviewDialog, primary, secondary } from "./CommunityPromotionForms";

export function CommunityPromotionDetail({ post }: { post: PublishedPromotion }) {
  const router = useRouter();
  const [panel, setPanel] = useState<"edit" | "remove" | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const submitting = useRef(false);

  function open(value: typeof panel) {
    if (submitting.current) return;
    setError("");
    setPanel(value);
  }

  return <div className="space-y-3">
    <Link href="/community" className="inline-flex min-h-11 items-center font-bold text-pul-point">← 홍보·광고 목록</Link>
    <article className="space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6">
      <p className="text-sm font-bold text-pul-point">{regionLabel(post)} · {post.trade || fields[post.field].label}</p>
      <h1 className="text-2xl font-extrabold text-pul-deep [overflow-wrap:anywhere]">{post.title}</h1>
      <p className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{post.body}</p>
      {post.deadline ? <p className="text-sm text-pul-muted">모집 마감 {post.deadline}</p> : null}
      {post.address || post.contact ? <dl className="space-y-2 rounded-xl border border-pul-border bg-pul-page p-4 text-sm [overflow-wrap:anywhere]">
        {post.address ? <div><dt className="font-bold text-pul-deep">주소</dt><dd>{post.address}</dd><dd><a className="inline-flex min-h-11 items-center font-bold text-pul-point underline" href={`https://map.kakao.com/?q=${encodeURIComponent(post.address)}`} target="_blank" rel="noreferrer">지도에서 주소 보기</a></dd></div> : null}
        {post.contact ? <div><dt className="font-bold text-pul-deep">문의 방법</dt><dd>{post.contact}</dd></div> : null}
      </dl> : null}
      <div className="flex flex-wrap gap-2">
        {post.source ? <Destination source={post.source} className={secondary}>원본 상세 보기</Destination> : null}
        {post.nearbyCourse ? <Destination source={post.nearbyCourse} className={secondary}>가까운 구장 보기</Destination> : null}
        {post.relatedSale ? <Destination source={post.relatedSale} className={secondary}>관련 판매 글 보기</Destination> : null}
      </div>
      {post.owner ? <div className="flex flex-wrap gap-2 border-t border-pul-border pt-4">
        <button className={secondary} type="button" onClick={() => open("edit")}>수정</button>
        <button className={secondary} type="button" onClick={() => open("remove")}>글 내리기</button>
        <Link className={secondary} href={`/community/banner?post=${post.id}`}>이 글에 배너 연결</Link>
      </div> : <CommunityReportForm targetType="post" postId={post.id} targetId={post.id} />}
    </article>
    {panel === "edit" ? <PreviewDialog title="홍보 글 수정" onClose={() => open(null)}>
      <PostForm post={post} filters={emptyFilters} busy={pending} saveError={error} onSave={(draft) => {
        if (submitting.current) return;
        submitting.current = true;
        setError("");
        start(async () => {
          try {
            const saved = await saveCommunityPromotionAction(draft, true);
            if (!saved.ok) { setError(saved.error); return; }
            setPanel(null);
            router.refresh();
          } catch { setError("홍보 글을 수정하지 못했습니다."); }
          finally { submitting.current = false; }
        });
      }} />
    </PreviewDialog> : null}
    {panel === "remove" ? <PreviewDialog title="홍보 글 내리기" onClose={() => open(null)}>
      <p className="text-sm">공개 목록과 상단 공지에서 글을 내립니다. 연결 배너도 일시 중지됩니다.</p>
      {error ? <p className="mt-2 text-sm text-red-800" role="alert">{error}</p> : null}
      <button className={`${primary} mt-3`} type="button" disabled={pending} onClick={() => {
        if (submitting.current) return;
        submitting.current = true;
        start(async () => {
          try {
            const result = await mutateCommunityPostAction({ operation: "remove", postId: post.id, expectedVersion: post.version });
            if (!result.ok) { setError(result.error); return; }
            router.replace("/community");
          } catch { setError("홍보 글을 내리지 못했습니다."); }
          finally { submitting.current = false; }
        });
      }}>글 내리기 확인</button>
    </PreviewDialog> : null}
  </div>;
}
