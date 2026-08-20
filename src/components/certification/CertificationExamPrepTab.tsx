"use client";

import {
  EXAM_PREP_DISCLAIMER,
  ORAL_ANSWER_CAUTION,
  TRAINING_INFO_CAUTION,
  WRITTEN_PREP_CAUTION,
  examPrepBoardCategoryFilters,
  examPrepBoardCategoryLabels,
  examPrepBoardPosts,
  examPrepBoardStatusLabels,
  examTypeLabels,
  filterExamPrepPosts,
  trainingInfoCategoryLabels,
  type ExamPrepBoardCategory,
  type ExamPrepBoardPost,
  type TrainingInfoCategory,
  type ExamType,
} from "@/data/certificationData";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

const MOBILE_PREVIEW = {
  generalTalk: 4,
  writtenExam: 3,
  practicalGuide: 3,
  oralQuestion: 3,
  trainingInfo: 2,
} as const;

const PC_PREVIEW = {
  generalTalk: 5,
  writtenExam: 4,
  practicalGuide: 3,
  oralQuestion: 4,
  trainingInfo: 3,
} as const;

const MOBILE_EXPAND_LABELS: Record<keyof typeof MOBILE_PREVIEW, string> = {
  generalTalk: "이야기방 더 보기",
  writtenExam: "필기 자료 더 보기",
  practicalGuide: "실기 공략 더 보기",
  oralQuestion: "구술 문제 더 보기",
  trainingInfo: "연수 정보 더 보기",
};

const QUICK_NAV = [
  { label: "이야기방", sectionKey: "generalTalk" as const, sectionId: "exam-prep-talk" },
  { label: "필기", sectionKey: "writtenExam" as const, sectionId: "exam-prep-written" },
  { label: "실기", sectionKey: "practicalGuide" as const, sectionId: "exam-prep-practical" },
  { label: "구술", sectionKey: "oralQuestion" as const, sectionId: "exam-prep-oral" },
  { label: "연수", sectionKey: "trainingInfo" as const, sectionId: "exam-prep-training" },
] as const;

type CertificationExamPrepTabProps = {
  initialExamType?: ExamType | "all";
};

type SectionKey = keyof typeof MOBILE_PREVIEW;

type ViewModal =
  | { kind: "post"; post: ExamPrepBoardPost }
  | { kind: "action"; title: string; message: string }
  | null;

function BoardPostRow({
  post,
  onClick,
  className,
}: {
  post: ExamPrepBoardPost;
  onClick: (post: ExamPrepBoardPost) => void;
  className?: string;
}) {
  const categoryLabel =
    post.boardType === "generalTalk" && post.category in examPrepBoardCategoryLabels
      ? examPrepBoardCategoryLabels[post.category as ExamPrepBoardCategory]
      : post.boardType === "trainingInfo" && post.category in trainingInfoCategoryLabels
        ? trainingInfoCategoryLabels[post.category as TrainingInfoCategory]
        : post.materialType;

  return (
    <button
      type="button"
      onClick={() => onClick(post)}
      className={cn(
        "flex w-full items-center gap-2 px-2 py-2.5 text-left transition-colors hover:bg-pul-light/30 sm:gap-3 sm:px-3",
        className,
      )}
    >
      {categoryLabel && (
        <span className="hidden w-16 shrink-0 truncate rounded bg-pul-light px-1.5 py-0.5 text-center text-[10px] font-bold text-pul-deep sm:block">
          {categoryLabel}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {post.status === "pinned" && (
          <span className="mr-1 text-[10px] font-bold text-amber-700">
            [{examPrepBoardStatusLabels[post.status]}]
          </span>
        )}
        {post.title}
      </span>
      <span className="hidden shrink-0 text-[11px] text-pul-muted md:inline">
        {post.author}
      </span>
      <span className="hidden shrink-0 text-[11px] text-pul-muted lg:inline">
        댓글 {post.commentCount}
      </span>
      <span className="hidden shrink-0 text-[11px] text-pul-muted xl:inline">
        조회 {post.viewCount}
      </span>
      <span className="shrink-0 text-[11px] text-pul-muted">{post.createdAt}</span>
      <span className="shrink-0 text-xs font-medium text-pul-point">보기</span>
    </button>
  );
}

function BoardSection({
  id,
  title,
  description,
  caution,
  posts,
  sectionKey,
  expanded,
  onExpand,
  onPostClick,
  actions,
  categoryFilter,
  category,
  onCategoryChange,
}: {
  id: string;
  title: string;
  description: string;
  caution?: string;
  posts: ExamPrepBoardPost[];
  sectionKey: SectionKey;
  expanded: boolean;
  onExpand: () => void;
  onPostClick: (post: ExamPrepBoardPost) => void;
  actions: { label: string; onClick: () => void; primary?: boolean }[];
  categoryFilter?: boolean;
  category?: ExamPrepBoardCategory | "all";
  onCategoryChange?: (category: ExamPrepBoardCategory | "all") => void;
}) {
  const mobile = MOBILE_PREVIEW[sectionKey];
  const pc = PC_PREVIEW[sectionKey];
  const mobileExpandLabel = MOBILE_EXPAND_LABELS[sectionKey];

  return (
    <section
      id={id}
      className="scroll-mt-20 rounded-xl border border-pul-border bg-white p-2.5 lg:p-4"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-foreground lg:text-lg">{title}</h3>
          <p className="mt-0.5 text-xs leading-snug text-pul-muted lg:text-sm">
            {description}
          </p>
          {caution && (
            <p className="mt-1 text-[11px] leading-snug text-amber-800">{caution}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={cn(
                "inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg px-2.5 text-[11px] font-bold sm:text-xs",
                action.primary
                  ? "bg-pul-point text-white hover:bg-pul-deep"
                  : "border border-pul-border text-pul-deep hover:bg-pul-light",
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {categoryFilter && onCategoryChange && (
        <div className="mb-2 flex gap-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {examPrepBoardCategoryFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onCategoryChange(item.value)}
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                category === item.value
                  ? "border-pul-point bg-pul-light text-pul-deep"
                  : "border-pul-border bg-[#fafbfa] text-pul-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {posts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-pul-border px-4 py-6 text-center text-sm text-pul-muted">
          최근 게시글이 없습니다.
        </p>
      ) : (
        <div className="divide-y divide-pul-border/70 rounded-lg border border-pul-border">
          {posts.map((post, index) => (
            <BoardPostRow
              key={post.id}
              post={post}
              onClick={onPostClick}
              className={cn(
                !expanded && index >= mobile && "hidden lg:flex",
                !expanded && index >= pc && "lg:hidden",
              )}
            />
          ))}
        </div>
      )}

      {!expanded && posts.length > mobile && (
        <button
          type="button"
          onClick={onExpand}
          className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-pul-border text-xs font-bold text-pul-deep hover:bg-pul-light lg:hidden"
        >
          {mobileExpandLabel}
        </button>
      )}
    </section>
  );
}

function ViewModalDialog({ modal, onClose }: { modal: ViewModal; onClose: () => void }) {
  if (!modal) return null;

  const title = modal.kind === "post" ? modal.post.title : modal.title;
  const message =
    modal.kind === "post"
      ? [
          `작성자: ${modal.post.author}`,
          modal.post.examType
            ? `시험 유형: ${examTypeLabels[modal.post.examType]}`
            : "",
          modal.post.venue ? `시험장: ${modal.post.venue}` : "",
          modal.post.materialType ? `자료 유형: ${modal.post.materialType}` : "",
          `댓글 ${modal.post.commentCount} · 조회 ${modal.post.viewCount}`,
          "",
          "MVP 단계에서는 게시글 상세·댓글 기능이 제공되지 않습니다.",
          "TODO: 회원 로그인 후 글쓰기 · 댓글 · 신고/블라인드",
        ]
          .filter(Boolean)
          .join("\n")
      : modal.message;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-pul-border bg-white p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-pul-muted">
          {message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

export function CertificationExamPrepTab({
  initialExamType = "all",
}: CertificationExamPrepTabProps) {
  const [talkCategory, setTalkCategory] = useState<ExamPrepBoardCategory | "all">("all");
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    generalTalk: false,
    writtenExam: false,
    practicalGuide: false,
    oralQuestion: false,
    trainingInfo: false,
  });
  const [viewModal, setViewModal] = useState<ViewModal>(null);

  const talkPosts = useMemo(
    () => filterExamPrepPosts(examPrepBoardPosts, "generalTalk", initialExamType, talkCategory),
    [initialExamType, talkCategory],
  );
  const writtenPosts = useMemo(
    () => filterExamPrepPosts(examPrepBoardPosts, "writtenExam", initialExamType),
    [initialExamType],
  );
  const practicalPosts = useMemo(
    () => filterExamPrepPosts(examPrepBoardPosts, "practicalGuide", initialExamType),
    [initialExamType],
  );
  const oralPosts = useMemo(
    () => filterExamPrepPosts(examPrepBoardPosts, "oralQuestion", initialExamType),
    [initialExamType],
  );
  const trainingPosts = useMemo(
    () => filterExamPrepPosts(examPrepBoardPosts, "trainingInfo", initialExamType),
    [initialExamType],
  );

  const openAction = (title: string, message: string) => {
    setViewModal({ kind: "action", title, message });
  };

  const expand = (key: SectionKey) => {
    setExpanded((prev) => ({ ...prev, [key]: true }));
  };

  const jumpToBoard = (sectionKey: SectionKey, sectionId: string) => {
    expand(sectionKey);
    // TODO: 각 게시판 전체글 전용 페이지 라우팅 (/certification/exam-prep/{boardType})
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const boardFullViewMessage: Record<SectionKey, string> = {
    generalTalk: "TODO: 시험 준비 이야기방 전체글 페이지",
    writtenExam: "TODO: 필기 자료 게시판 전체글 페이지",
    practicalGuide: "TODO: 실기 공략 게시판 전체글 페이지",
    oralQuestion: "TODO: 구술 문제·모범답변 게시판 전체글 페이지",
    trainingInfo: "TODO: 연수 정보 게시판 전체글 페이지",
  };

  return (
    <div className="space-y-3 lg:space-y-4">
      <aside className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm leading-relaxed text-blue-950">
        시험 준비 게시글은 화면 구성을 위한 학습용 예시입니다. 실제 회원 게시글이나 실시간 시험 공지가 아니며, 공식 일정은 자격증 안내 탭의 공개 일정과 주관기관 링크에서 확인하세요.
      </aside>
      <section className="rounded-xl border border-pul-border bg-white p-2.5 lg:p-4">
        <h2 className="text-base font-bold text-foreground lg:text-xl">시험 준비 바로가기</h2>
        <p className="mt-0.5 text-xs text-pul-muted lg:text-sm">
          필요한 준비 게시판으로 바로 이동하세요.
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK_NAV.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => jumpToBoard(item.sectionKey, item.sectionId)}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-[#fafbfa] text-sm font-bold text-pul-deep transition-colors hover:border-pul-point hover:bg-pul-light"
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <BoardSection
        id="exam-prep-talk"
        title="시험 준비 이야기방"
        description="필기·실기·구술을 준비하면서 궁금한 점을 묻고, 실기장 정보와 연습 동료를 찾을 수 있는 시험 준비 미니게시판입니다."
        posts={talkPosts}
        sectionKey="generalTalk"
        expanded={expanded.generalTalk}
        onExpand={() => expand("generalTalk")}
        onPostClick={(post) => setViewModal({ kind: "post", post })}
        categoryFilter
        category={talkCategory}
        onCategoryChange={setTalkCategory}
        actions={[
          {
            label: "전체 보기",
            onClick: () =>
              openAction("전체 보기", boardFullViewMessage.generalTalk),
          },
          {
            label: "글쓰기",
            primary: true,
            onClick: () =>
              openAction("글쓰기", "TODO: 회원 로그인 후 글쓰기"),
          },
        ]}
      />

      <BoardSection
        id="exam-prep-written"
        title="필기 자료 게시판"
        description="공개 기출, 기출복원, 예상문제, 요약노트, 해설 자료를 최근 게시글로 확인합니다."
        caution={WRITTEN_PREP_CAUTION}
        posts={writtenPosts}
        sectionKey="writtenExam"
        expanded={expanded.writtenExam}
        onExpand={() => expand("writtenExam")}
        onPostClick={(post) => setViewModal({ kind: "post", post })}
        actions={[
          {
            label: "필기 자료 전체 보기",
            onClick: () =>
              openAction("필기 자료 전체 보기", boardFullViewMessage.writtenExam),
          },
          {
            label: "필기 질문하기",
            primary: true,
            onClick: () =>
              openAction("필기 질문하기", "TODO: 회원 로그인 후 필기 질문 등록"),
          },
        ]}
      />

      <BoardSection
        id="exam-prep-practical"
        title="실기 공략 게시판"
        description="시험장별 공략 영상, 코스별·홀별 공략, 야디지북, 연습 후기를 최근 게시글로 확인합니다."
        posts={practicalPosts}
        sectionKey="practicalGuide"
        expanded={expanded.practicalGuide}
        onExpand={() => expand("practicalGuide")}
        onPostClick={(post) => setViewModal({ kind: "post", post })}
        actions={[
          {
            label: "실기 공략 전체 보기",
            onClick: () =>
              openAction("실기 공략 전체 보기", boardFullViewMessage.practicalGuide),
          },
          {
            label: "공략글 등록",
            primary: true,
            onClick: () =>
              openAction("공략글 등록", "TODO: 회원 로그인 후 공략글 등록"),
          },
        ]}
      />

      <BoardSection
        id="exam-prep-oral"
        title="구술 문제·모범답변 게시판"
        description="규정 문제, 경기 방법, 안전수칙, 심판 역할 등 구술 문제와 모범답변을 공유하고 연습합니다."
        caution={ORAL_ANSWER_CAUTION}
        posts={oralPosts}
        sectionKey="oralQuestion"
        expanded={expanded.oralQuestion}
        onExpand={() => expand("oralQuestion")}
        onPostClick={(post) => setViewModal({ kind: "post", post })}
        actions={[
          {
            label: "구술 문제 전체 보기",
            onClick: () =>
              openAction("구술 문제 전체 보기", boardFullViewMessage.oralQuestion),
          },
          {
            label: "구술 질문하기",
            primary: true,
            onClick: () =>
              openAction("구술 질문하기", "TODO: 회원 로그인 후 구술 질문 등록"),
          },
        ]}
      />

      <BoardSection
        id="exam-prep-training"
        title="연수 정보 게시판"
        description="필기·실기·구술 합격 후 필요한 연수 신청, 연수기관, 현장실습, 준비물, 후기를 공유하는 게시판입니다."
        caution={TRAINING_INFO_CAUTION}
        posts={trainingPosts}
        sectionKey="trainingInfo"
        expanded={expanded.trainingInfo}
        onExpand={() => expand("trainingInfo")}
        onPostClick={(post) => setViewModal({ kind: "post", post })}
        actions={[
          {
            label: "연수 정보 전체 보기",
            onClick: () =>
              openAction("연수 정보 전체 보기", boardFullViewMessage.trainingInfo),
          },
          {
            label: "연수 질문하기",
            primary: true,
            onClick: () =>
              openAction("연수 질문하기", "TODO: 회원 로그인 후 연수 질문 등록"),
          },
        ]}
      />

      <aside className="rounded-lg border border-pul-border/80 bg-[#fafbfa] px-2.5 py-2 lg:px-3 lg:py-2.5">
        <p className="text-[10px] leading-[1.45] text-pul-muted lg:text-xs lg:leading-relaxed">
          {EXAM_PREP_DISCLAIMER}
        </p>
      </aside>

      <ViewModalDialog modal={viewModal} onClose={() => setViewModal(null)} />
    </div>
  );
}
