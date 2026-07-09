"use client";

import { cn } from "@/lib/utils";

// TODO: 상단 "자격증·심판" 메뉴 페이지(/certification) 오픈 후 Link로 교체
const CERTIFICATION_MENU_PATH = "/certification";

type CertificationLinkBannerProps = {
  variant?: "full" | "compact" | "paid-footer";
  onViewCertification?: () => void;
  className?: string;
};

export function CertificationLinkBanner({
  variant = "full",
  onViewCertification,
  className,
}: CertificationLinkBannerProps) {
  const isPaidFooter = variant === "paid-footer";
  const isCompact = variant === "compact" || isPaidFooter;

  return (
    <aside
      className={cn(
        "rounded-lg border border-dashed border-amber-300/50 bg-gradient-to-r from-amber-50/60 via-white to-pul-light/40",
        isPaidFooter
          ? "px-2.5 py-2 lg:px-3 lg:py-2.5"
          : isCompact
            ? "px-2.5 py-2"
            : "px-3 py-3 lg:px-4 lg:py-4",
        className,
      )}
    >
      <div
        className={cn(
          "flex gap-2",
          isCompact ? "flex-col" : "flex-col lg:flex-row lg:items-center lg:justify-between lg:gap-4",
        )}
      >
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-bold text-pul-deep",
              isCompact ? "text-xs" : "text-sm lg:text-base",
            )}
          >
            {isPaidFooter
              ? "지도자 자격증, 심판 자격증, 생활스포츠지도사 정보는 상단 「자격증·심판」 메뉴에서 별도로 확인하세요."
              : isCompact
                ? "자격증·심판 정보는 별도 메뉴에서 확인하세요."
                : "지도자 자격증이나 심판 자격증이 궁금하신가요?"}
          </p>
          {!isPaidFooter && (
            <p
              className={cn(
                "mt-1 text-pul-muted",
                isCompact
                  ? "line-clamp-2 text-[11px] leading-snug"
                  : "text-xs leading-relaxed lg:text-sm",
              )}
            >
              {variant === "compact"
                ? "생활스포츠지도사, 지도자·심판 과정, 교육기관 정보는 상단 「자격증·심판」 메뉴에서 다룰 예정입니다."
                : "자격증 종류, 심판 과정, 교육기관 정보는 상단 「자격증·심판」 메뉴에서 확인하세요."}
            </p>
          )}
          {!isCompact && !isPaidFooter && (
            <p className="mt-1.5 hidden text-[11px] leading-snug text-pul-muted lg:block">
              생활스포츠지도사, 장애인스포츠지도사, 지도자 과정, 심판 과정, 민간
              교육과정, 심판 구인구직 정보는 별도 메뉴에서 제공될 예정입니다.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onViewCertification}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-300/60 bg-white font-bold text-pul-deep transition-colors hover:bg-amber-50",
            isCompact
              ? "min-h-10 w-full text-xs"
              : "min-h-11 w-full text-sm lg:w-auto lg:px-5",
          )}
          data-href={CERTIFICATION_MENU_PATH}
        >
          {isPaidFooter ? "자격증·심판 정보 보기" : "자격증·심판 메뉴 보기"}
        </button>
      </div>
    </aside>
  );
}
