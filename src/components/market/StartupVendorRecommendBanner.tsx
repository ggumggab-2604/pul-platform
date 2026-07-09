"use client";

import { startupVendorRecommendTags } from "@/data/marketData";
import { cn } from "@/lib/utils";

type StartupVendorRecommendBannerProps = {
  onInquiry: () => void;
  compact?: boolean;
};

export function StartupVendorRecommendBanner({
  onInquiry,
  compact = false,
}: StartupVendorRecommendBannerProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-dashed border-orange-200/80 bg-orange-50/30",
        compact ? "px-3 py-2.5" : "px-3 py-3 lg:px-4 lg:py-3.5",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-bold text-orange-900 lg:text-sm">
            창업·시설 업체 추천 영역
          </h3>
          <p
            className={cn(
              "mt-1 text-[11px] leading-relaxed text-pul-muted lg:text-xs",
              compact && "line-clamp-2",
            )}
          >
            스크린 시스템 업체, 창업 컨설팅, 인조잔디, 안전망, 조명, 설계·시공
            업체를 소개할 수 있는 공간입니다.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {startupVendorRecommendTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-orange-200/80 bg-white px-2 py-0.5 text-[10px] font-semibold text-pul-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onInquiry}
          className="inline-flex min-h-10 w-full shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-white px-4 text-xs font-bold text-orange-800 hover:bg-orange-50 sm:min-h-9 sm:w-auto"
        >
          광고 문의
        </button>
      </div>
    </section>
  );
}
