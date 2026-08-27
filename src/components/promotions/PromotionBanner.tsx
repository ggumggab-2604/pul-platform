import { getImageProps } from "next/image";
import Link from "next/link";

import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";
import {
  getPromotionContentKindLabel,
  getPromotionMediaPublicUrl,
  isSponsoredPromotion,
  shouldBypassPromotionImageOptimization,
} from "@/lib/promotions/promotionRuntime";
import { cn } from "@/lib/utils";

export type PromotionBannerVariant =
  | "hero"
  | "rail"
  | "railShort"
  | "horizontal"
  | "mobileFeed";

type PromotionBannerProps = {
  promotion: ActiveSlotPromotion;
  variant: PromotionBannerVariant;
  className?: string;
  priority?: boolean;
};

const frameClasses: Record<PromotionBannerVariant, string> = {
  hero: "h-[250px] sm:h-[280px] lg:h-[428px]",
  rail: "aspect-[2/5] w-[172px]",
  railShort: "aspect-[5/4] w-[172px]",
  horizontal: "aspect-[18/5] w-full sm:aspect-[8/1]",
  mobileFeed: "aspect-[9/4] w-full",
};

const imageSizes: Record<PromotionBannerVariant, string> = {
  hero: "(max-width: 1024px) 100vw, 960px",
  rail: "172px",
  railShort: "172px",
  horizontal: "(max-width: 640px) 100vw, 1200px",
  mobileFeed: "100vw",
};

export function PromotionBanner({
  promotion,
  variant,
  className,
  priority = false,
}: PromotionBannerProps) {
  const desktopUrl = getPromotionMediaPublicUrl(promotion.desktopMedia);
  const isDesktopRail = variant === "rail" || variant === "railShort";
  const mobileMedia = isDesktopRail
    ? promotion.desktopMedia
    : promotion.mobileMedia ?? promotion.desktopMedia;
  const mobileUrl = getPromotionMediaPublicUrl(mobileMedia);
  const commonImageProps = {
    alt: promotion.desktopMedia.alt,
    sizes: imageSizes[variant],
    loading: priority ? "eager" as const : "lazy" as const,
  };
  const {
    props: { alt: desktopAlt, srcSet: desktopSrcSet, ...desktopImageProps },
  } = getImageProps({
    ...commonImageProps,
    src: desktopUrl,
    width: promotion.desktopMedia.width,
    height: promotion.desktopMedia.height,
    unoptimized: shouldBypassPromotionImageOptimization(desktopUrl),
  });
  const {
    props: { srcSet: mobileSrcSet },
  } = getImageProps({
    ...commonImageProps,
    src: mobileUrl,
    width: mobileMedia.width,
    height: mobileMedia.height,
    unoptimized: shouldBypassPromotionImageOptimization(mobileUrl),
  });
  const badge = isSponsoredPromotion(promotion.contentKind)
    ? getPromotionContentKindLabel(promotion.contentKind)
    : null;
  const frame = (
    <span
      className={cn(
        "relative block overflow-hidden rounded-xl bg-pul-light shadow-[0_2px_12px_rgba(6,78,59,0.12)]",
        frameClasses[variant],
      )}
    >
      <picture className="absolute inset-0 block">
        {!isDesktopRail ? (
          <source media="(max-width: 639px)" srcSet={mobileSrcSet ?? mobileUrl} />
        ) : null}
        {/* getImageProps keeps Next image optimization while picture handles art direction. */}
        <img
          {...desktopImageProps}
          alt={desktopAlt}
          srcSet={desktopSrcSet}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      </picture>
      {badge ? (
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
          {badge}
        </span>
      ) : null}
    </span>
  );
  const baseClass = cn(
    "block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-pul-point focus-visible:ring-offset-2",
    className,
  );

  if (promotion.linkType === "external" && promotion.externalUrl) {
    return (
      <a
        href={promotion.externalUrl}
        target="_blank"
        rel={isSponsoredPromotion(promotion.contentKind)
          ? "noopener noreferrer sponsored"
          : "noopener noreferrer"}
        aria-label={`${promotion.title} (새 창에서 열림)`}
        className={baseClass}
      >
        {frame}
        <span className="sr-only">새 창에서 열림</span>
      </a>
    );
  }

  if (promotion.linkType === "internal_detail" && promotion.detailSlug) {
    return (
      <Link
        href={`/promotions/${promotion.detailSlug}`}
        aria-label={`${promotion.title} 자세히 보기`}
        className={baseClass}
      >
        {frame}
      </Link>
    );
  }

  return (
    <div className={cn("rounded-xl", className)} aria-label={promotion.title}>
      {frame}
    </div>
  );
}
