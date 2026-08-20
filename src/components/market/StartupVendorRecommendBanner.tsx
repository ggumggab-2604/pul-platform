"use client";

import { startupVendorRecommendTags } from "@/data/marketData";
import { cn } from "@/lib/utils";

type StartupVendorRecommendBannerProps = {
  compact?: boolean;
};

export function StartupVendorRecommendBanner({
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
            창업·시설 분야 안내
          </h3>
          <p
            className={cn(
              "mt-1 text-[11px] leading-relaxed text-pul-muted lg:text-xs",
              compact && "line-clamp-2",
            )}
          >
            스크린 시스템 업체, 창업 컨설팅, 인조잔디, 안전망, 조명, 설계·시공
            분야를 확인할 때 참고할 수 있는 항목입니다. PUL이 특정 업체를
            인증하거나 추천한다는 의미는 아닙니다.
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
      </div>
    </section>
  );
}
