"use client";

import { getClubBannerPriorityLabel } from "@/data/clubData";
import type { ClubPartnerBannerItem } from "@/types";

type ClubPartnerBannerProps = {
  banner: ClubPartnerBannerItem;
  onInquiry: () => void;
  showPriority?: boolean;
};

export function ClubPartnerBanner({
  banner,
  onInquiry,
  showPriority = true,
}: ClubPartnerBannerProps) {
  return (
    <aside
      data-ad-slot={`club-partner-${banner.bannerType}`}
      data-banner-id={banner.id}
      className="rounded-lg border border-dashed border-pul-point/20 bg-gradient-to-r from-pul-light/50 via-white to-emerald-50/60 px-2.5 py-2 shadow-[0_1px_8px_rgba(6,78,59,0.04)] lg:rounded-xl lg:px-5 lg:py-4 lg:shadow-[0_2px_10px_rgba(6,78,59,0.04)]"
    >
      {/* 모바일: 한 줄 안내형 */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="min-w-0 flex-1">
          {showPriority && (
            <p className="text-[9px] font-bold tracking-wide text-pul-point">
              {getClubBannerPriorityLabel(banner)}
            </p>
          )}
          <p className="truncate text-xs font-bold text-pul-deep">{banner.title}</p>
          <p className="truncate text-[10px] text-pul-muted">{banner.description}</p>
        </div>
        <button
          type="button"
          onClick={onInquiry}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-pul-point/30 bg-white px-2.5 text-[11px] font-bold text-pul-deep transition-colors hover:bg-pul-light"
        >
          {banner.ctaText}
        </button>
      </div>

      {/* PC: 기존 배너 */}
      <div className="hidden lg:block">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {showPriority && (
              <p className="text-[11px] font-bold tracking-[0.12em] text-pul-point">
                {getClubBannerPriorityLabel(banner)}
              </p>
            )}
            <h3 className="mt-0.5 text-base font-bold leading-snug text-pul-deep">
              {banner.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-pul-muted">
              {banner.description}
            </p>
            {(banner.province !== "전체" || banner.district) && (
              <p className="mt-1 text-xs text-pul-muted">
                노출 지역:{" "}
                {banner.district
                  ? `${banner.province} > ${banner.district}`
                  : banner.province}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onInquiry}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-pul-point/30 bg-white px-4 text-sm font-bold text-pul-deep transition-colors hover:border-pul-point/50 hover:bg-pul-light"
          >
            {banner.ctaText}
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs font-medium text-pul-deep ring-1 ring-pul-border/60">
            {banner.category}
          </span>
          <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs font-medium text-pul-muted ring-1 ring-pul-border/60">
            {banner.bannerType === "local"
              ? "기초지역 제휴"
              : banner.bannerType === "province"
                ? "광역 제휴"
                : "PUL 기본"}
          </span>
        </div>
      </div>
    </aside>
  );
}
