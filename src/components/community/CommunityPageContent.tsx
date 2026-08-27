"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { listCommunityPostsAction, mutateCommunityPostAction } from "@/app/community/actions";
import { CommunityPageHero } from "@/components/community/CommunityPageHero";
import { CommunityPostDialog } from "@/components/community/CommunityPostDialog";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import {
  COMMUNITY_PAGE_COPY,
  communityCategoryLabels,
  communityCategoryTabs,
  communityMenuLinks,
  lostFoundKindLabels,
  lostFoundStatusLabels,
  questionResolveLabels,
  reviewTypeLabels,
} from "@/data/communityData";
import type {
  CommunityPage,
  CommunityPostInput,
  CommunityPostListItem,
  CommunitySortOrder,
  CommunityWritableCategory,
} from "@/lib/community/community";
import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";

type Props = {
  initialPage: CommunityPage<CommunityPostListItem>;
  initialLoadFailed?: boolean;
  promotion: ActiveSlotPromotion | null;
  secondPromotion: ActiveSlotPromotion | null;
};

type CategoryFilter = "all" | CommunityWritableCategory;

function messageOf(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function statusLabel(post: CommunityPostListItem) {
  if (post.questionStatus) return questionResolveLabels[post.questionStatus];
  if (post.lostFoundStatus) return lostFoundStatusLabels[post.lostFoundStatus];
  if (post.reviewType && post.rating) return `${reviewTypeLabels[post.reviewType]} · ${post.rating}점`;
  return null;
}

export function CommunityPageContent({ initialPage, initialLoadFailed = false, promotion, secondPromotion }: Props) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sortOrder, setSortOrder] = useState<CommunitySortOrder>("latest");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [showWrite, setShowWrite] = useState(false);
  const [error, setError] = useState(initialLoadFailed ? "게시글을 불러오지 못했습니다. 다시 시도해 주세요." : "");
  const [notice, setNotice] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [isPending, startTransition] = useTransition();
  const writeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const availableCategories = useMemo(
    () => communityCategoryTabs.filter((item) => item.id !== "notice") as Array<{ id: CategoryFilter; label: string }>,
    [],
  );

  const load = (nextCategory: CategoryFilter, nextKeyword: string, nextSort: CommunitySortOrder, append = false) => {
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const next = await listCommunityPostsAction(nextCategory, nextKeyword, nextSort, 24, append ? page.items.length : 0);
        setPage(append ? { ...next, items: [...page.items, ...next.items] } : next);
      } catch (loadError) {
        setError(messageOf(loadError));
      }
    });
  };

  const selectCategory = (next: CategoryFilter) => {
    setCategory(next);
    load(next, keyword, sortOrder);
  };

  const selectSort = (next: CommunitySortOrder) => {
    setSortOrder(next);
    load(category, keyword, next);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = keywordInput.trim();
    setKeyword(normalized);
    load(category, normalized, sortOrder);
  };

  const closeWrite = () => {
    setShowWrite(false);
    setDialogError("");
    requestAnimationFrame(() => writeTriggerRef.current?.focus({ preventScroll: true }));
  };

  const createPost = (input: CommunityPostInput) => {
    setDialogError("");
    startTransition(async () => {
      try {
        const mutation = await mutateCommunityPostAction({ operation: "create", postId: null, expectedVersion: null, payload: input });
        if (!mutation.ok) throw new Error(mutation.error);
        setShowWrite(false);
        setNotice("게시글을 등록했습니다.");
        router.push(`/community/${mutation.data.postId}`);
      } catch (mutationError) {
        setDialogError(messageOf(mutationError));
      }
    });
  };

  return (
    <div className="space-y-5">
      <CommunityPageHero
        onWrite={() => {
          writeTriggerRef.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
          setDialogError("");
          setShowWrite(true);
        }}
        onGuide={() => setShowGuide((value) => !value)}
      />

      {promotion ? <PromotionBanner promotion={promotion} variant="horizontal" /> : null}

      {showGuide ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5" aria-labelledby="community-guide-title">
          <h2 id="community-guide-title" className="text-lg font-bold text-pul-deep">{COMMUNITY_PAGE_COPY.guideTitle}</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-pul-muted">{COMMUNITY_PAGE_COPY.guideDescription}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-pul-muted">
            {COMMUNITY_PAGE_COPY.guideItems.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-pul-border bg-white p-3 shadow-sm sm:p-5" aria-labelledby="community-posts-title">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="community-posts-title" className="text-xl font-bold text-pul-deep">회원 게시글</h2>
            <p className="mt-1 text-sm text-pul-muted">총 {page.total.toLocaleString("ko-KR")}개의 공개 글</p>
          </div>
          <form onSubmit={submitSearch} className="flex w-full max-w-xl gap-2" role="search">
            <label className="sr-only" htmlFor="community-keyword">게시글 검색어</label>
            <input id="community-keyword" value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} maxLength={120} placeholder="제목과 본문 검색" className="min-h-11 min-w-0 flex-1 rounded-lg border border-pul-border px-3 text-base outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20" />
            <button type="submit" disabled={isPending} className="min-h-11 rounded-lg bg-pul-deep px-5 font-bold text-white disabled:opacity-50">검색</button>
          </form>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="게시글 카테고리">
          {availableCategories.map((item) => (
            <button key={item.id} type="button" onClick={() => selectCategory(item.id)} aria-pressed={category === item.id} disabled={isPending} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold ${category === item.id ? "border-pul-point bg-pul-point text-white" : "border-pul-border bg-white text-pul-muted"}`}>{item.label}</button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-b border-pul-border pb-3">
          <p className="min-w-0 truncate text-sm text-pul-muted">{keyword ? `‘${keyword}’ 검색 결과` : "최근 등록된 공개 게시글"}</p>
          <label className="flex shrink-0 items-center gap-2 text-sm font-semibold"><span>정렬</span><select value={sortOrder} onChange={(event) => selectSort(event.target.value as CommunitySortOrder)} disabled={isPending} className="min-h-11 rounded-lg border border-pul-border bg-white px-3"><option value="latest">최신순</option><option value="comments">댓글순</option></select></label>
        </div>

        {error ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4" role="alert"><p className="font-semibold text-rose-800">{error}</p><button type="button" onClick={() => load(category, keyword, sortOrder)} className="mt-3 min-h-11 rounded-lg border border-rose-300 bg-white px-4 font-bold text-rose-800">다시 시도</button></div> : null}
        {notice ? <p className="mt-4 rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-900" role="status">{notice}</p> : null}

        {!error && page.items.length === 0 ? (
          <div className="py-14 text-center"><p className="font-bold text-pul-deep">조건에 맞는 게시글이 없습니다.</p><p className="mt-1 text-sm text-pul-muted">다른 검색어나 카테고리를 선택해 보세요.</p></div>
        ) : (
          <ul className="divide-y divide-pul-border" aria-busy={isPending}>
            {page.items.map((post) => {
              const state = statusLabel(post);
              return <li key={post.id} className="py-4">
                <Link href={`/community/${post.id}`} className="group block rounded-lg p-1 outline-none focus:ring-2 focus:ring-pul-point/30">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-pul-light px-2.5 py-1 text-pul-deep">{communityCategoryLabels[post.category]}</span>
                    {post.lostFoundKind ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-900">{lostFoundKindLabels[post.lostFoundKind]}</span> : null}
                    {state ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{state}</span> : null}
                  </div>
                  <h3 className="mt-2 break-words text-lg font-bold text-pul-deep group-hover:text-pul-point">{post.title}</h3>
                  <p className="mt-1 line-clamp-2 break-words text-sm leading-relaxed text-pul-muted">{post.summary}</p>
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-pul-muted"><span>{post.authorDisplayName}</span><time>{post.createdAt}</time><span>댓글 {post.commentCount}</span></p>
                </Link>
              </li>;
            })}
          </ul>
        )}

        {page.hasMore ? <div className="mt-4 text-center"><button type="button" disabled={isPending} onClick={() => load(category, keyword, sortOrder, true)} className="min-h-11 rounded-lg border border-pul-border bg-white px-6 font-bold text-pul-deep disabled:opacity-50">{isPending ? "불러오는 중…" : "게시글 더 보기"}</button></div> : null}
      </section>

      {secondPromotion ? <PromotionBanner promotion={secondPromotion} variant="horizontal" /> : null}

      <section className="grid gap-3 sm:grid-cols-2" aria-label="관련 커뮤니티 메뉴">
        {communityMenuLinks.slice(0, 4).map((item) => <article key={item.id} className="rounded-xl border border-pul-border bg-white p-4"><h2 className="font-bold text-pul-deep">{item.title}</h2><p className="mt-1 text-sm leading-relaxed text-pul-muted">{item.description}</p><Link href={item.href} className="mt-3 inline-flex min-h-11 items-center font-bold text-pul-point">{item.buttonLabel} →</Link></article>)}
      </section>

      <p className="whitespace-pre-line rounded-xl bg-slate-100 p-4 text-xs leading-relaxed text-slate-600">{COMMUNITY_PAGE_COPY.disclaimer}</p>
      {showWrite ? <CommunityPostDialog busy={isPending} error={dialogError} onClose={closeWrite} onSubmit={createPost} /> : null}
    </div>
  );
}
