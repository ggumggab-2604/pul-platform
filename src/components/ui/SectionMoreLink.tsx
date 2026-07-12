import { cn } from "@/lib/utils";
import Link from "next/link";

type SectionMoreLinkProps = {
  href: string;
  /** 기본: 전체보기 */
  label?: string;
  className?: string;
  /** true면 모바일에서만 표시 (PC는 숨김) */
  mobileOnly?: boolean;
};

/**
 * 목록 섹션 하단 통일 버튼 — 전체보기 / 더보기
 */
export function SectionMoreLink({
  href,
  label = "전체보기",
  className,
  mobileOnly = false,
}: SectionMoreLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl",
        "border border-pul-border bg-white text-base font-bold text-pul-deep",
        "hover:bg-pul-light/70",
        mobileOnly && "lg:hidden",
        className,
      )}
    >
      {label} →
    </Link>
  );
}

type SectionTitleRowProps = {
  title: string;
  moreHref?: string;
  moreLabel?: string;
  className?: string;
};

/** 섹션 제목 + (선택) 우측 전체보기 링크 — 페이지 간 위치 통일 */
export function SectionTitleRow({
  title,
  moreHref,
  moreLabel = "전체보기",
  className,
}: SectionTitleRowProps) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-xl font-bold text-pul-deep">{title}</h2>
      {moreHref ? (
        <Link
          href={moreHref}
          className="shrink-0 text-base font-bold text-pul-point hover:underline"
        >
          {moreLabel}
        </Link>
      ) : null}
    </div>
  );
}
