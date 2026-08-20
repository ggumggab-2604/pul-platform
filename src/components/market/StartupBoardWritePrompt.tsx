"use client";

type StartupBoardWritePromptProps = {
  onStartupInquiry: (trigger: HTMLButtonElement) => void;
  onResalePost: (trigger: HTMLButtonElement) => void;
  onFieldInquiry: (trigger: HTMLButtonElement) => void;
};

export function StartupBoardWritePrompt({
  onStartupInquiry,
  onResalePost,
  onFieldInquiry,
}: StartupBoardWritePromptProps) {
  return (
    <section className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5">
      <h2 className="text-base font-bold text-foreground lg:text-lg">
        창업·매매 문의를 남겨보세요
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-pul-muted">
        스크린 창업, 매장 매매, 필드 구장 조성, 유휴지 활용이 궁금하다면 문의
        글을 남겨보세요. 공개 게시글에는 연락처나 상세 주소를 적지 않는 것이
        안전합니다.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={(event) => onStartupInquiry(event.currentTarget)}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
        >
          창업 문의하기
        </button>
        <button
          type="button"
          onClick={(event) => onResalePost(event.currentTarget)}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
        >
          매장 매매 올리기
        </button>
        <button
          type="button"
          onClick={(event) => onFieldInquiry(event.currentTarget)}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
        >
          필드 신설 문의하기
        </button>
      </div>
    </section>
  );
}
