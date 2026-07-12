"use client";

import { CommunityPageHero } from "@/components/community/CommunityPageHero";
import { Card } from "@/components/ui/Card";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { InfoModal } from "@/components/ui/InfoModal";
import { SoftBadge, type SoftBadgeTone } from "@/components/ui/SoftBadge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COMMUNITY_PAGE_COPY,
  LATEST_POST_MOBILE_PREVIEW,
  LATEST_POST_PC_PREVIEW,
  LOST_FOUND_MOBILE_PREVIEW,
  LOST_FOUND_PC_PREVIEW,
  MENU_LINK_MOBILE_PREVIEW,
  MENU_LINK_PC_PREVIEW,
  NOTICE_MOBILE_PREVIEW,
  NOTICE_PC_PREVIEW,
  PENDING_QUESTION_MOBILE_PREVIEW,
  PENDING_QUESTION_PC_PREVIEW,
  POPULAR_POST_MOBILE_PREVIEW,
  POPULAR_POST_PC_PREVIEW,
  QUESTION_MOBILE_PREVIEW,
  QUESTION_PC_PREVIEW,
  REVIEW_MOBILE_PREVIEW,
  REVIEW_PC_PREVIEW,
  categoryScrollTargets,
  communityBoardShortcuts,
  communityCategoryLabels,
  communityCategoryTabs,
  communityLostFoundItems,
  communityMenuLinks,
  communityNotices,
  communityPendingQuestions,
  communityPosts,
  communityQuestions,
  communityReviews,
  filterCommunityPosts,
  getPopularPosts,
  lostFoundKindLabels,
  lostFoundStatusLabels,
  noticeTypeLabels,
  questionResolveLabels,
  questionTypeLabels,
  reviewTypeLabels,
  sortCommunityPosts,
  type CommunityCategory,
  type CommunityCategoryFilter,
  type CommunityLostFound,
  type CommunityMenuLink,
  type CommunityNotice,
  type CommunityPost,
  type CommunityQuestion,
  type CommunityReview,
  type CommunitySortOrder,
  type QuestionResolveStatus,
} from "@/data/communityData";

const CARD_BASE =
  "flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:p-4";
const SECTION_GAP = "space-y-2 lg:space-y-5";
const SECTION_TITLE = "text-base font-bold text-foreground lg:text-xl";
const SECTION_DESC = "mt-1 text-xs text-pul-muted lg:mt-2 lg:text-sm";
const SUBSECTION_TITLE = "text-sm font-bold text-foreground lg:text-base";
const MORE_BUTTON_CLASS =
  "mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light lg:mt-4";
const DETAIL_BUTTON_CLASS =
  "inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-pul-point text-[11px] font-bold text-white hover:bg-pul-deep lg:min-h-10 lg:text-xs";

function handleDetail(section: string, id: string, title: string) {
  console.log(`[community] ${section} 자세히 보기:`, id, title);
}

function handleSectionMore(section: string) {
  console.log("[community] 더보기:", section);
}

function SectionMoreButton({ label, section }: { label: string; section: string }) {
  return (
    <button type="button" onClick={() => handleSectionMore(section)} className={MORE_BUTTON_CLASS}>
      {label}
    </button>
  );
}

function CategoryBadge({ category }: { category: CommunityCategory }) {
  return (
    <span className="inline-flex rounded-full border border-pul-point/30 bg-pul-light px-2 py-0.5 text-[10px] font-bold text-pul-deep lg:text-[11px]">
      {communityCategoryLabels[category]}
    </span>
  );
}

function DetailButton({
  id,
  title,
  section,
  label = "자세히 보기",
}: {
  id: string;
  title: string;
  section: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => handleDetail(section, id, title)}
      className={DETAIL_BUTTON_CLASS}
    >
      {label}
    </button>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <p className="mt-1 text-xs font-semibold text-amber-600 lg:text-sm" aria-label={`별점 ${rating}점`}>
      {"★".repeat(rating)}
      {"☆".repeat(Math.max(0, 5 - rating))}
      <span className="ml-1 font-normal text-pul-muted">{rating}.0</span>
    </p>
  );
}

function resolveTone(status: QuestionResolveStatus): SoftBadgeTone {
  if (status === "resolved") return "point";
  if (status === "waiting") return "warn";
  if (status === "needsAdmin") return "warn";
  return "muted";
}

function CommunityGuideBox() {
  return (
    <aside className="rounded-lg border border-dashed border-pul-point/25 bg-pul-light/15 px-3 py-3 lg:px-4 lg:py-3.5">
      <p className="text-sm font-bold text-foreground">{COMMUNITY_PAGE_COPY.guideTitle}</p>
      <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-pul-muted lg:text-sm">
        {COMMUNITY_PAGE_COPY.guideDescription}
      </p>
      <ul className="mt-2 space-y-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
        {COMMUNITY_PAGE_COPY.guideItems.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function ActionCard({
  title,
  description,
  buttonLabel,
  onClick,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.04)] lg:p-4">
      <h3 className="text-sm font-bold text-foreground lg:text-base">{title}</h3>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted">{description}</p>
      <button
        type="button"
        onClick={onClick}
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-4 text-xs font-bold text-white hover:bg-pul-deep lg:mt-4 lg:text-sm"
      >
        {buttonLabel}
      </button>
    </article>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.04)] lg:p-4">
      <p className="text-xs font-bold text-pul-muted lg:text-sm">{label}</p>
      <p className="mt-2 text-xl font-extrabold tracking-tight text-pul-deep lg:text-2xl">{value}</p>
    </div>
  );
}

function HorizontalAdBanner({
  title,
  description,
  recommendations,
  onInquiry,
  compact = false,
}: {
  title: string;
  description: string;
  recommendations: string[];
  onInquiry: () => void;
  compact?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-dashed border-pul-border/80 bg-pul-page/50",
        compact ? "px-3 py-2" : "px-3 py-2.5 lg:px-4 lg:py-3",
      )}
    >
      <div className={cn("flex gap-2", compact ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-3")}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-xs font-bold text-pul-deep lg:text-sm">{title}</h3>
            {!compact ? <SoftBadge tone="muted">추천 정보 예정</SoftBadge> : null}
          </div>
          <p
            className={cn(
              "mt-1 text-[11px] leading-relaxed text-pul-muted lg:text-xs",
              compact && "line-clamp-2",
            )}
          >
            {description}
          </p>
          {!compact ? (
            <>
              <p className="mt-1 text-[11px] text-pul-muted/80 lg:text-xs">현재 소개 중인 정보가 없습니다.</p>
              <div className="mt-1.5 hidden flex-wrap gap-1 sm:flex">
                {recommendations.slice(0, 4).map((item) => (
                  <span
                    key={item}
                    className="inline-flex rounded-full border border-pul-border bg-white px-2 py-0.5 text-[10px] font-semibold text-pul-muted"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onInquiry}
          className="inline-flex min-h-10 w-full shrink-0 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-xs font-bold text-pul-deep hover:bg-pul-light sm:min-h-9 sm:w-auto"
        >
          광고 문의
        </button>
      </div>
    </section>
  );
}

const COMMUNITY_RULES_ITEMS = [
  "비방, 욕설, 허위 정보 금지",
  "개인정보 노출 금지",
  "반복 광고글 제한",
  "거래 유도는 장터 메뉴 이용",
  "분쟁 발생 시 운영자 확인 후 숨김 처리 가능",
  "신고 기능은 추후 제공 예정",
] as const;

const ACTIVITY_BADGES_PC = [
  "질문 답변",
  "구장 후기",
  "장비 후기",
  "분실·습득 도움",
  "시험 자료",
  "동호회 정보",
] as const;

function CommunityRulesSection({ isMobile }: { isMobile: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (!isMobile) {
    return (
      <Card title="커뮤니티 운영 기준" dense bodyClassName="py-3">
        <ul className="grid gap-1 text-xs leading-relaxed text-pul-muted sm:grid-cols-2 lg:text-sm">
          {COMMUNITY_RULES_ITEMS.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <Card title="커뮤니티 운영 기준" dense bodyClassName="py-3">
      <p className="text-xs text-pul-muted">
        안전한 커뮤니티 이용을 위해 기본 기준을 확인해주세요.
      </p>
      {expanded ? (
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-pul-muted">
          {COMMUNITY_RULES_ITEMS.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (!expanded) console.log("[community] 운영 기준 보기");
          setExpanded((prev) => !prev);
        }}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
      >
        {expanded ? "접기" : "운영 기준 보기"}
      </button>
    </Card>
  );
}

function PendingQuestionCard({
  item,
  onAnswer,
}: {
  item: CommunityQuestion;
  onAnswer: () => void;
}) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 lg:p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <SoftBadge tone="point">{questionTypeLabels[item.questionType]}</SoftBadge>
        <SoftBadge tone={resolveTone(item.resolveStatus)}>
          {questionResolveLabels[item.resolveStatus]}
        </SoftBadge>
      </div>
      <h4 className="mt-2 text-sm font-bold text-foreground">{item.title}</h4>
      <p className="mt-1.5 text-[11px] text-pul-muted">
        작성일 {item.createdAt} · 답변 {item.answerCount}개
      </p>
      <button
        type="button"
        onClick={onAnswer}
        className="mt-auto inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-pul-point pt-3 text-[11px] font-bold text-white hover:bg-pul-deep lg:min-h-9 lg:text-xs"
      >
        답변하기
      </button>
    </article>
  );
}

function CommunityCategoryTabs({
  active,
  onChange,
}: {
  active: CommunityCategoryFilter;
  onChange: (category: CommunityCategoryFilter) => void;
}) {
  return (
    <div className="scrollbar-none -mx-1 overflow-x-auto px-1 lg:mx-0 lg:overflow-visible">
      <div className="flex min-w-max gap-1.5 lg:flex-wrap lg:gap-2" role="tablist" aria-label="커뮤니티 카테고리">
        {communityCategoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition-colors lg:px-4 lg:py-2.5 lg:text-sm",
              active === tab.id
                ? "border-pul-deep bg-pul-point text-white shadow-sm"
                : "border-pul-border bg-white text-pul-muted hover:border-pul-point/40 hover:text-pul-deep",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyPostsBox({ onWrite }: { onWrite: () => void }) {
  return (
    <aside className="rounded-lg border border-dashed border-pul-point/30 bg-pul-light/20 px-4 py-5 text-center">
      <p className="text-sm font-bold text-foreground">아직 등록된 글이 없습니다.</p>
      <p className="mt-1 text-xs text-pul-muted">첫 글을 남겨보세요.</p>
      <button
        type="button"
        onClick={onWrite}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-6 text-sm font-bold text-white hover:bg-pul-deep"
      >
        글쓰기
      </button>
    </aside>
  );
}

function PostMeta({ post }: { post: CommunityPost }) {
  return (
    <p className="mt-2 text-[11px] text-pul-muted lg:text-xs">
      <span className="font-semibold text-foreground">{post.authorNickname}</span>
      {" · "}
      {post.createdAt}
      {" · 조회 "}
      {post.viewCount}
      {" · 댓글 "}
      {post.commentCount}
      {" · 좋아요 "}
      {post.likeCount}
    </p>
  );
}

function PopularPostCard({ post }: { post: CommunityPost }) {
  return (
    <article className={CARD_BASE}>
      <div className="flex flex-1 flex-col">
        <CategoryBadge category={post.category} />
        <h4 className="mt-2 text-sm font-bold text-foreground lg:text-base">{post.title}</h4>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted lg:text-sm">{post.summary}</p>
        <PostMeta post={post} />
        <div className="mt-auto pt-3 lg:pt-4">
          <DetailButton id={post.id} title={post.title} section="popular" />
        </div>
      </div>
    </article>
  );
}

function LatestPostCard({ post }: { post: CommunityPost }) {
  return (
    <article className={CARD_BASE}>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={post.category} />
          {post.isNew ? <SoftBadge tone="point">새 글</SoftBadge> : null}
          {post.isPinned ? <SoftBadge tone="warn">고정</SoftBadge> : null}
        </div>
        <h4 className="mt-2 text-sm font-bold text-foreground lg:text-base">{post.title}</h4>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted lg:text-sm">{post.summary}</p>
        <PostMeta post={post} />
        <div className="mt-auto pt-3 sm:max-w-[9rem] lg:pt-4">
          <DetailButton id={post.id} title={post.title} section="latest" />
        </div>
      </div>
    </article>
  );
}

function QuestionCard({ item }: { item: CommunityQuestion }) {
  return (
    <article className={CARD_BASE}>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-wrap gap-1.5">
          <SoftBadge tone="point">{questionTypeLabels[item.questionType]}</SoftBadge>
          <SoftBadge tone={resolveTone(item.resolveStatus)}>
            {questionResolveLabels[item.resolveStatus]}
          </SoftBadge>
        </div>
        <h4 className="mt-2 text-sm font-bold text-foreground lg:text-base">{item.title}</h4>
        <p className="mt-2 text-[11px] text-pul-muted lg:text-xs">
          답변 {item.answerCount}개 · {item.createdAt}
        </p>
        <div className="mt-auto pt-3 lg:pt-4">
          <DetailButton id={item.id} title={item.title} section="question" />
        </div>
      </div>
    </article>
  );
}

function ReviewCard({ item }: { item: CommunityReview }) {
  return (
    <article className={CARD_BASE}>
      <div className="flex flex-1 flex-col">
        <SoftBadge tone="point">{reviewTypeLabels[item.reviewType]}</SoftBadge>
        <h4 className="mt-2 text-sm font-bold text-foreground lg:text-base">{item.title}</h4>
        <StarRating rating={item.rating} />
        <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted lg:text-sm">{item.summary}</p>
        <p className="mt-2 text-[11px] text-pul-muted lg:text-xs">
          <span className="font-semibold text-foreground">{item.authorNickname}</span>
          {" · "}
          {item.createdAt}
        </p>
        <div className="mt-auto pt-3 lg:pt-4">
          <DetailButton id={item.id} title={item.title} section="review" />
        </div>
      </div>
    </article>
  );
}

function LostFoundCard({ item }: { item: CommunityLostFound }) {
  return (
    <article className={CARD_BASE}>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-wrap gap-1.5">
          <SoftBadge tone={item.kind === "lost" ? "warn" : "point"}>
            {lostFoundKindLabels[item.kind]}
          </SoftBadge>
          <SoftBadge tone="muted">{lostFoundStatusLabels[item.status]}</SoftBadge>
        </div>
        <h4 className="mt-2 text-sm font-bold text-foreground lg:text-base">{item.itemName}</h4>
        <p className="mt-2 text-xs leading-relaxed text-pul-muted lg:text-sm">
          장소: {item.place}
          <br />
          날짜: {item.date}
          <br />
          연락: {item.contactHint}
        </p>
        <div className="mt-auto pt-3 lg:pt-4">
          <DetailButton id={item.id} title={item.itemName} section="lostFound" />
        </div>
      </div>
    </article>
  );
}

function MenuLinkCard({ item }: { item: CommunityMenuLink }) {
  return (
    <article className={CARD_BASE}>
      <div className="flex flex-1 flex-col">
        <h4 className="text-sm font-bold text-foreground lg:text-base">{item.title}</h4>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          {item.description}
        </p>
        <div className="mt-auto pt-3 lg:pt-4">
          <Link href={item.href} className={cn(DETAIL_BUTTON_CLASS, "hover:bg-pul-deep")}>
            {item.buttonLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}

function NoticeRow({ item }: { item: CommunityNotice }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] sm:flex-row sm:items-center sm:justify-between lg:p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <SoftBadge tone="point">{noticeTypeLabels[item.noticeType]}</SoftBadge>
          {item.isPinned ? <SoftBadge tone="warn">고정</SoftBadge> : null}
        </div>
        <h4 className="mt-2 text-sm font-bold text-foreground lg:text-base">{item.title}</h4>
        <p className="mt-1 text-[11px] text-pul-muted lg:text-xs">{item.createdAt}</p>
      </div>
      <div className="w-full sm:w-36">
        <DetailButton id={item.id} title={item.title} section="notice" />
      </div>
    </div>
  );
}

export function CommunityPageContent() {
  const [category, setCategory] = useState<CommunityCategoryFilter>("all");
  const [sortOrder, setSortOrder] = useState<CommunitySortOrder>("latest");
  const [isMobile, setIsMobile] = useState(false);
  const [showAllMenuLinks, setShowAllMenuLinks] = useState(false);
  const [showAllPosts, setShowAllPosts] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setShowAllMenuLinks(false);
      setShowAllPosts(false);
      setShowAllReviews(false);
      setShowAllQuestions(false);
    }
  }, [isMobile]);

  useEffect(() => {
    setShowAllPosts(false);
  }, [category, sortOrder]);

  const handleCategoryChange = useCallback((next: CommunityCategoryFilter) => {
    setCategory(next);
    const scrollTarget = categoryScrollTargets[next] ?? "section-latest";
    window.setTimeout(() => {
      document.getElementById(scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  const filteredPosts = useMemo(
    () => filterCommunityPosts(communityPosts, category),
    [category],
  );

  const popularLimit = isMobile ? POPULAR_POST_MOBILE_PREVIEW : POPULAR_POST_PC_PREVIEW;
  const popularPosts = useMemo(
    () => getPopularPosts(category, popularLimit),
    [category, popularLimit],
  );

  const popularIds = useMemo(
    () => new Set(popularPosts.map((post) => post.id)),
    [popularPosts],
  );

  const latestPosts = useMemo(() => {
    const sorted = sortCommunityPosts(filteredPosts, sortOrder);
    // 모바일: 인기글과 중복 제외
    const deduped = isMobile
      ? sorted.filter((post) => !popularIds.has(post.id))
      : sorted;
    if (isMobile && showAllPosts) return deduped;
    const limit = isMobile ? LATEST_POST_MOBILE_PREVIEW : LATEST_POST_PC_PREVIEW;
    return deduped.slice(0, limit);
  }, [filteredPosts, sortOrder, isMobile, popularIds, showAllPosts]);

  const questionLimit = isMobile ? QUESTION_MOBILE_PREVIEW : QUESTION_PC_PREVIEW;
  const pendingQuestionLimit = isMobile
    ? PENDING_QUESTION_MOBILE_PREVIEW
    : PENDING_QUESTION_PC_PREVIEW;
  const reviewLimit = isMobile ? REVIEW_MOBILE_PREVIEW : REVIEW_PC_PREVIEW;
  const lostFoundLimit = isMobile ? LOST_FOUND_MOBILE_PREVIEW : LOST_FOUND_PC_PREVIEW;
  const noticeLimit = isMobile ? NOTICE_MOBILE_PREVIEW : NOTICE_PC_PREVIEW;
  const menuLinkLimit =
    isMobile && !showAllMenuLinks ? MENU_LINK_MOBILE_PREVIEW : MENU_LINK_PC_PREVIEW;
  const hiddenMenuLinkCount = isMobile
    ? Math.max(0, communityMenuLinks.length - MENU_LINK_MOBILE_PREVIEW)
    : 0;

  const activeCategoryLabel =
    category === "all" ? "전체" : communityCategoryLabels[category as CommunityCategory];

  const openWriteModal = (kind: "write" | "question" | "review" | "lostFound") => {
    const messages = {
      write: "글쓰기 기능은 추후 로그인 기반으로 제공될 예정입니다.",
      question: "질문 올리기 기능은 추후 로그인 기반으로 제공될 예정입니다.",
      review: "후기 남기기 기능은 추후 로그인 기반으로 제공될 예정입니다.",
      lostFound: "분실·습득 등록 기능은 추후 로그인 기반으로 제공될 예정입니다.",
    } as const;
    const titles = {
      write: "글쓰기",
      question: "질문 올리기",
      review: "후기 남기기",
      lostFound: "분실·습득 등록",
    } as const;
    console.log("[community]", kind);
    setModal({ title: titles[kind], message: messages[kind] });
  };

  const openGuideModal = () => {
    console.log("[community] guide");
    setModal({
      title: "커뮤니티 이용안내",
      message: [
        COMMUNITY_PAGE_COPY.guideDescription,
        "",
        ...COMMUNITY_PAGE_COPY.guideItems.map((item) => `• ${item}`),
      ].join("\n"),
    });
  };

  const openAdInquiryModal = () => {
    console.log("[community] ad inquiry");
    setModal({
      title: "광고 문의",
      message: "광고 문의 기능은 추후 제공될 예정입니다. (현재는 placeholder UI입니다.)",
    });
  };

  const openAnswerModal = () => {
    console.log("[community] answer");
    setModal({
      title: "답변하기",
      message: "답변하기 기능은 추후 로그인 기반으로 제공될 예정입니다. (현재는 placeholder UI입니다.)",
    });
  };

  const openReportModal = () => {
    console.log("[community] report");
    setModal({
      title: "건의·신고",
      message:
        "건의·신고 기능은 추후 제공될 예정입니다. 현재는 이용 안내·운영 기준을 참고해 주세요.",
    });
  };

  const handleBoardShortcut = (shortcut: (typeof communityBoardShortcuts)[number]) => {
    if (shortcut.href) {
      window.location.href = shortcut.href;
      return;
    }
    if (shortcut.id === "report") {
      openReportModal();
      return;
    }
    if (shortcut.category === "question") {
      setShowAllQuestions(true);
      setCategory("question");
      return;
    }
    if (
      shortcut.category === "equipment" ||
      shortcut.category === "course" ||
      shortcut.category === "club"
    ) {
      setShowAllReviews(true);
      setCategory(shortcut.category);
      return;
    }
    if (shortcut.category) {
      setCategory(shortcut.category);
      expandAllPosts();
      return;
    }
    if (shortcut.scrollTarget) {
      document
        .getElementById(shortcut.scrollTarget)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const expandAllPosts = () => {
    setShowAllPosts(true);
    window.setTimeout(() => {
      document
        .getElementById("section-latest")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const participationCards = [
    {
      title: "초보 질문 남기기",
      description: "처음 시작하면서 궁금한 점을 편하게 물어보세요.",
      buttonLabel: "질문하기",
      onClick: () => openWriteModal("question"),
    },
    {
      title: "우리 구장 후기 쓰기",
      description: "자주 가는 구장의 분위기, 예약, 코스 상태를 공유해주세요.",
      buttonLabel: "후기 쓰기",
      onClick: () => openWriteModal("review"),
    },
    {
      title: "장비 사용기 공유",
      description: "사용 중인 채, 공, 가방, 장갑의 느낌과 선택 팁을 남겨주세요.",
      buttonLabel: "장비 후기 쓰기",
      onClick: () => openWriteModal("review"),
    },
    {
      title: "분실·습득 글 올리기",
      description: "구장에서 잃어버리거나 습득한 물건을 공유해주세요.",
      buttonLabel: "분실·습득 등록",
      onClick: () => openWriteModal("lostFound"),
    },
  ];

  const communityStats = [
    { label: "오늘 올라온 글", value: "24개" },
    { label: "답변 필요한 질문", value: "7개" },
    { label: "이번 주 인기 후기", value: "12개" },
    { label: "도움을 많이 준 회원", value: "5명" },
  ];

  return (
    <div className={SECTION_GAP}>
      <CommunityPageHero onWrite={() => openWriteModal("write")} onGuide={openGuideModal} />

      {/* PC: 카테고리 탭 / 모바일: 하단 바로가기로 대체 */}
      <div className="hidden lg:block">
        <CommunityCategoryTabs active={category} onChange={handleCategoryChange} />
      </div>

      {/* 모바일: 이용 안내는 하단 접기로 이동 */}
      <div className="hidden lg:block">
        <CommunityGuideBox />
      </div>

      <Card title="오늘 참여해볼까요?" dense>
        <p className={SECTION_DESC}>처음 방문한 회원도 쉽게 참여할 수 있는 주제를 골라보세요.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:mt-4 lg:gap-4">
          {participationCards.slice(0, isMobile ? 2 : 4).map((card) => (
            <ActionCard key={card.title} {...card} />
          ))}
        </div>
      </Card>

      {/* PC: 활동 현황 / 모바일: 숨김 (첫 화면 축소) */}
      <div className="hidden lg:block">
        <Card title="커뮤니티 활동 현황" dense>
          <p className={SECTION_DESC}>활발한 참여가 모이면 커뮤니티가 더 빨리 성장합니다.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:mt-4">
            {communityStats.map((s) => (
              <StatCard key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
        </Card>
      </div>

      <Card title="오늘의 인기글" dense>
        <p className={SECTION_DESC}>회원들이 많이 본 커뮤니티 글입니다.</p>
        {popularPosts.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 lg:mt-4 lg:gap-4">
            {popularPosts.map((post) => (
              <PopularPostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-pul-muted">해당 카테고리의 인기글이 없습니다.</p>
        )}
        <SectionMoreButton label="인기글 더보기" section="popular" />
      </Card>

      {/* 모바일: 답변 필요 질문만 / PC: 전체 질문·답변 섹션 아래 */}
      <div className="lg:hidden">
        <Card title="답변이 필요한 질문" dense>
          <p className={SECTION_DESC}>알고 있는 내용이 있다면 답변으로 도와주세요.</p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {(showAllQuestions
              ? communityPendingQuestions
              : communityPendingQuestions.slice(0, pendingQuestionLimit)
            ).map((item) => (
              <PendingQuestionCard key={item.id} item={item} onAnswer={openAnswerModal} />
            ))}
          </div>
          {showAllQuestions ? (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {communityQuestions.map((item) => (
                <QuestionCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}
          {!showAllQuestions ? (
            <button
              type="button"
              onClick={() => setShowAllQuestions(true)}
              className={MORE_BUTTON_CLASS}
            >
              질문 더보기 →
            </button>
          ) : null}
        </Card>
      </div>

      {/* 모바일: 최근 후기 */}
      <div className="lg:hidden">
        <Card title="최근 후기" dense>
          <p className={SECTION_DESC}>구장·장비·동호회 후기를 모아 보여줍니다.</p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {(showAllReviews
              ? communityReviews
              : communityReviews.slice(0, reviewLimit)
            ).map((item) => (
              <ReviewCard key={item.id} item={item} />
            ))}
          </div>
          {!showAllReviews && communityReviews.length > reviewLimit ? (
            <button
              type="button"
              onClick={() => setShowAllReviews(true)}
              className={MORE_BUTTON_CLASS}
            >
              후기 더보기 →
            </button>
          ) : null}
        </Card>
      </div>

      {/* 모바일: 게시판 바로가기 */}
      <section className="lg:hidden">
        <h2 className={SECTION_TITLE}>게시판 바로가기</h2>
        <p className={SECTION_DESC}>관심 있는 게시판으로 바로 이동하세요.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {communityBoardShortcuts.map((shortcut) => (
            <button
              key={shortcut.id}
              type="button"
              onClick={() => handleBoardShortcut(shortcut)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-pul-border bg-white px-3 text-sm font-bold text-pul-deep hover:bg-pul-light/70"
            >
              {shortcut.label}
            </button>
          ))}
        </div>
      </section>

      {/* 모바일: 전체 글 보기 → 최신 글 섹션 펼침 */}
      {!showAllPosts ? (
        <div className="lg:hidden">
          <button
            type="button"
            onClick={expandAllPosts}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-pul-border bg-white text-base font-bold text-pul-deep hover:bg-pul-light/70"
          >
            전체 글 보기 →
          </button>
        </div>
      ) : null}

      <div
        id="section-latest"
        className={cn("scroll-mt-4", !showAllPosts && "hidden lg:block")}
      >
        <Card
          title="최신 커뮤니티 글"
          dense
          action={
            <label className="flex items-center gap-2 text-xs text-pul-muted lg:text-sm">
              <span className="sr-only">정렬</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as CommunitySortOrder)}
                className="min-h-9 rounded-lg border border-pul-border bg-white px-2 text-xs font-semibold text-pul-deep lg:min-h-10 lg:px-3 lg:text-sm"
              >
                <option value="latest">최신순</option>
                <option value="comments">댓글 많은순</option>
                <option value="views">조회순</option>
                <option value="likes">좋아요순</option>
              </select>
            </label>
          }
        >
          {category !== "all" ? (
            <p className="text-xs font-semibold text-pul-point lg:text-sm">
              {activeCategoryLabel} 글만 보는 중
            </p>
          ) : null}
          {latestPosts.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-3">
              {latestPosts.map((post) => (
                <LatestPostCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <div className="mt-3">
              <EmptyPostsBox onWrite={() => openWriteModal("write")} />
            </div>
          )}
          <SectionMoreButton label="최신 글 더보기" section="latest" />
        </Card>
      </div>

      <div id="section-questions" className="scroll-mt-4 hidden lg:block">
        <Card title="질문·답변" dense>
          <p className={SECTION_DESC}>
            초보 질문, 룰 질문, 장비 질문, 구장 이용, 예약, 동호회 질문을 함께 나누는 공간입니다.
          </p>

          <div className="mt-3 rounded-lg border border-amber-200/50 bg-amber-50/30 p-2.5 lg:mt-4 lg:p-4">
            <h3 className={SUBSECTION_TITLE}>아직 답변이 필요한 질문</h3>
            <p className="mt-0.5 text-xs text-pul-muted lg:mt-1">
              알고 있는 내용이 있다면 답변으로 도와주세요.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3 lg:mt-3 lg:gap-3">
              {communityPendingQuestions.slice(0, pendingQuestionLimit).map((item) => (
                <PendingQuestionCard key={item.id} item={item} onAnswer={openAnswerModal} />
              ))}
            </div>
          </div>

          <div className="mt-3 lg:mt-5">
            <h3 className={SUBSECTION_TITLE}>최신 질문·답변</h3>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:mt-3 lg:gap-4">
              {communityQuestions.slice(0, questionLimit).map((item) => (
                <QuestionCard key={item.id} item={item} />
              ))}
            </div>
          </div>

          <SectionMoreButton label="질문 더보기" section="question" />
        </Card>
      </div>

      <div id="section-reviews" className="scroll-mt-4 hidden lg:block">
        <Card title="후기 모아보기" dense>
          <p className={SECTION_DESC}>
            파크골프장 이용 후기, 레슨 후기, 장비 사용 후기, 동호회 활동 후기, 중고거래 후기를 모아
            보여줍니다.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3 lg:mt-4 lg:gap-4">
            {communityReviews.slice(0, reviewLimit).map((item) => (
              <ReviewCard key={item.id} item={item} />
            ))}
          </div>
          <SectionMoreButton label="후기 더보기" section="review" />
        </Card>
      </div>

      <div className="hidden lg:block">
        <HorizontalAdBanner
          title="장비·브랜드 추천 영역"
          description="파크골프채, 공, 장갑, 가방, 수리·리폼, 시타 행사 정보를 소개할 수 있는 공간입니다."
          recommendations={[
            "파크골프채 브랜드",
            "공/장갑/가방 업체",
            "장비 수리·리폼",
            "시타 행사",
            "장터 브랜드 공식관",
          ]}
          onInquiry={openAdInquiryModal}
        />
      </div>

      <div id="section-lost-found" className="scroll-mt-4 hidden lg:block">
        <Card title="분실·습득" dense>
          <p className={SECTION_DESC}>
            파크골프장이나 대회 현장에서 잃어버린 물건과 습득한 물건을 공유하는 공간입니다.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:mt-4 lg:grid-cols-3 lg:gap-4">
            {communityLostFoundItems.slice(0, lostFoundLimit).map((item) => (
              <LostFoundCard key={item.id} item={item} />
            ))}
          </div>
          <SectionMoreButton label="분실·습득 더보기" section="lostFound" />
        </Card>
      </div>

      <div className="hidden lg:block">
        <HorizontalAdBanner
          title="구장 주변 추천 영역"
          description="골프장 주변 맛집, 카페, 숙박, 지역 상권 정보를 소개할 수 있는 공간입니다."
          recommendations={["주변 맛집", "카페", "숙박", "지역 관광", "지역 상권"]}
          onInquiry={openAdInquiryModal}
        />
      </div>

      <div className="hidden lg:block">
        <Card title="메뉴별 커뮤니티 바로가기" dense>
          <p className={SECTION_DESC}>
            PUL의 각 메뉴 안에도 목적별 이야기 공간이 있습니다. 필요한 공간으로 바로 이동해보세요.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:mt-4 lg:grid-cols-3 xl:grid-cols-5 lg:gap-4">
            {communityMenuLinks.slice(0, menuLinkLimit).map((item) => (
              <MenuLinkCard key={item.id} item={item} />
            ))}
          </div>
          {hiddenMenuLinkCount > 0 && !showAllMenuLinks ? (
            <button
              type="button"
              onClick={() => {
                console.log("[community] 메뉴 더보기");
                setShowAllMenuLinks(true);
              }}
              className={MORE_BUTTON_CLASS}
            >
              메뉴 더보기
            </button>
          ) : null}
        </Card>
      </div>

      <div id="section-notices" className="scroll-mt-4 hidden lg:block">
        <Card title="이용 안내" dense>
          <p className={SECTION_DESC}>
            커뮤니티 이용 규칙, 신고 기준, 안전한 거래 안내입니다. 운영자 소식·정책·행사
            안내는{" "}
            <Link href="/news" className="font-semibold text-pul-point hover:underline">
              뉴스·정보
            </Link>
            메뉴에서 확인하세요.
          </p>
          <div className="mt-3 space-y-3 lg:mt-4">
            {communityNotices.slice(0, noticeLimit).map((item) => (
              <NoticeRow key={item.id} item={item} />
            ))}
          </div>
          <SectionMoreButton label="안내 더보기" section="notice" />
        </Card>
      </div>

      <div className="hidden lg:block">
        <Card title="활동하면 더 잘 보입니다" dense bodyClassName="py-2.5 lg:py-3.5">
          <p className="text-xs text-pul-muted lg:text-sm">
            좋은 답변, 유용한 후기, 정확한 정보 공유는 향후 PUL 활동 점수에 반영될 수 있습니다.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 lg:mt-2">
            {ACTIVITY_BADGES_PC.map((label) => (
              <SoftBadge key={label} tone="muted">
                {label}
              </SoftBadge>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] font-bold text-pul-muted lg:mt-2">향후 적용 예정</p>
        </Card>
      </div>

      <section className="hidden rounded-xl border border-pul-border bg-gradient-to-br from-pul-light via-white to-emerald-50 p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:block lg:p-6">
        <h2 className={SECTION_TITLE}>{COMMUNITY_PAGE_COPY.writeSectionTitle}</h2>
        <p className={cn(SECTION_DESC, "whitespace-pre-line")}>
          {COMMUNITY_PAGE_COPY.writeSectionDescription}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
          <button
            type="button"
            onClick={() => openWriteModal("write")}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-5 text-sm font-bold text-white hover:bg-pul-deep"
          >
            글쓰기
          </button>
          <button
            type="button"
            onClick={() => openWriteModal("question")}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-5 text-sm font-bold text-pul-deep hover:bg-pul-light"
          >
            질문 올리기
          </button>
          <button
            type="button"
            onClick={() => openWriteModal("review")}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-5 text-sm font-bold text-pul-deep hover:bg-pul-light"
          >
            후기 남기기
          </button>
        </div>
      </section>

      {/* 모바일: 이용·신고·운영 안내 접기 */}
      <div className="space-y-3 lg:hidden">
        <CollapsibleSection
          title="이용 안내"
          summary="글쓰기·후기·질문 참여 전 꼭 확인하세요."
        >
          <CommunityGuideBox />
          <div className="mt-3 space-y-2">
            {communityNotices
              .filter((item) => item.noticeType === "required" || item.noticeType === "operation")
              .map((item) => (
                <NoticeRow key={item.id} item={item} />
              ))}
          </div>
        </CollapsibleSection>
        <CollapsibleSection
          title="신고 안내"
          summary="광고·허위 정보 등 신고 기준을 확인하세요."
        >
          <div className="space-y-2">
            {communityNotices
              .filter((item) => item.noticeType === "report")
              .map((item) => (
                <NoticeRow key={item.id} item={item} />
              ))}
            {communityNotices.filter((item) => item.noticeType === "report").length === 0 ? (
              <p className="text-sm text-pul-muted">
                신고 기능은 추후 제공 예정입니다. 운영 기준을 참고해 주세요.
              </p>
            ) : null}
          </div>
        </CollapsibleSection>
        <CollapsibleSection
          title="운영 원칙"
          summary="비방·허위 정보·개인정보 노출 금지 등 기본 원칙입니다."
        >
          <ul className="space-y-1 text-sm leading-relaxed text-pul-muted">
            {COMMUNITY_RULES_ITEMS.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </CollapsibleSection>
      </div>

      <div className="hidden lg:block">
        <CommunityRulesSection isMobile={false} />
      </div>

      <aside className="rounded-lg border border-pul-border/80 bg-white px-3 py-3 text-xs leading-relaxed text-pul-muted lg:px-4 lg:py-3.5 lg:text-sm">
        <p className="whitespace-pre-line">{COMMUNITY_PAGE_COPY.disclaimer}</p>
      </aside>

      {modal ? (
        <InfoModal title={modal.title} message={modal.message} onClose={() => setModal(null)} />
      ) : null}
    </div>
  );
}
