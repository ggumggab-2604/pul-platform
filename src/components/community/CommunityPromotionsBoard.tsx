"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Pin } from "lucide-react";
import Link from "next/link";
import { saveCommunityPromotionAction } from "@/app/community/promotion-actions";
import { promotionBoardHref, type CommunityPromotionPage } from "@/lib/community/communityPromotions";
import { matchesPromotionFilters, type Filters } from "@/lib/community/communityPromotionsPreview";
import { PostCard, PromotionFilters } from "./CommunityPromotionBoardUI";
import { PostForm, PreviewDialog, secondary } from "./CommunityPromotionForms";

export function CommunityPromotionsBoard({ initialFilters, results, page, loggedIn, now }: {
  initialFilters: Filters; results: CommunityPromotionPage | null; page: number; loggedIn: boolean; now: number;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [writing, setWriting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, startSave] = useTransition();
  const [updating, startUpdate] = useTransition();
  const submitting = useRef(false);
  const href = promotionBoardHref(filters);
  const notices = results?.items.filter((post) => post.paid) ?? [];
  const regular = results?.items.filter((post) => !post.paid) ?? [];

  return <div className="min-w-0 space-y-4 sm:space-y-5">
    <PromotionFilters filters={filters} districtOptions={results?.districts ?? []} setFilters={(value) => {
      setFilters(value);
      setNotice("");
      startUpdate(() => router.replace(promotionBoardHref(value), { scroll: false }));
    }} onWrite={() => {
      if (!loggedIn) { router.push(`/login?next=${encodeURIComponent(href)}`); return; }
      setError("");
      setWriting(true);
    }} onBanner={() => router.push("/community/banner")} />

    {notice ? <p role="status" className="rounded-lg border border-emerald-200 bg-pul-light px-4 py-3 text-sm font-semibold text-pul-deep">{notice}</p> : null}
    {!results ? <p role="alert" className="rounded-xl border border-pul-border bg-white p-4">홍보 글을 불러오지 못했습니다. <button type="button" className={secondary} onClick={() => router.refresh()}>다시 불러오기</button></p> : null}
    <div aria-busy={updating} className="space-y-4 sm:space-y-5">
      {notices.length ? <section className="rounded-2xl border border-amber-200 bg-amber-50/65 p-3.5 sm:p-5" aria-labelledby="notice-title">
        <h2 id="notice-title" className="flex items-center gap-2 text-lg font-extrabold text-pul-deep"><Pin size={19} className="text-amber-800" aria-hidden="true" /> 상단 유료 공지</h2>
        <ul className="mt-3 grid gap-2.5 md:grid-cols-2">{notices.map((post) => <PostCard key={post.id} post={post} now={now} paid href={`/community/${post.id}`} />)}</ul>
      </section> : null}
      {results ? <section aria-labelledby="regular-title">
        <h2 id="regular-title" className="text-xl font-extrabold text-pul-deep">일반 게시글</h2>
        {regular.length ? <ul className="mt-3 grid gap-2.5 md:grid-cols-2">{regular.map((post) => <PostCard key={post.id} post={post} now={now} href={`/community/${post.id}`} />)}</ul>
          : <p className="mt-3 rounded-xl border border-pul-border bg-white p-5 text-sm text-pul-muted">조건에 맞는 일반 게시글이 없습니다.</p>}
      </section> : null}
    </div>
    {page > 1 || results?.hasMore ? <nav aria-label="홍보 글 페이지" className="flex gap-2">
      {page > 1 ? <Link className={secondary} href={promotionBoardHref(filters, page - 1)}>이전</Link> : null}
      {results?.hasMore ? <Link className={secondary} href={promotionBoardHref(filters, page + 1)}>다음</Link> : null}
    </nav> : null}

    {writing ? <PreviewDialog title="홍보 글쓰기" description="회원 글은 무료이며 게시 즉시 공개됩니다." onClose={() => { if (!submitting.current) setWriting(false); }}>
      <PostForm filters={filters} busy={saving} saveError={error} onSave={(post) => {
        if (submitting.current) return;
        submitting.current = true;
        setError("");
        startSave(async () => {
          try {
            const saved = await saveCommunityPromotionAction(post, false);
            if (!saved.ok) { setError(saved.error); return; }
            setWriting(false);
            setNotice(matchesPromotionFilters(saved.post, filters) ? "홍보 글이 공개되었습니다." : "홍보 글이 공개되었습니다. 현재 필터에서 보이지 않습니다.");
            if (page > 1) router.replace(href, { scroll: false });
            else router.refresh();
          } catch {
            setError("홍보 글을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
          } finally {
            submitting.current = false;
          }
        });
      }} />
    </PreviewDialog> : null}
  </div>;
}
