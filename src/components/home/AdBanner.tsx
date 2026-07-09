import { cn } from "@/lib/utils";
import type { AdBannerData } from "@/types";
import Image from "next/image";
import Link from "next/link";

type AdBannerProps = {
  data: AdBannerData;
  className?: string;
  compact?: boolean;
};

const variantImages: Record<AdBannerData["variant"], string> = {
  club: "/images/ad-club.jpg",
  ball: "/images/ad-ball.jpg",
  academy: "/images/ad-academy.jpg",
  apparel: "/images/ad-wear.jpg",
  shoes: "/images/ad-shoes.jpg",
  uv: "/images/ad-wear-blue.jpg",
};

const variantImageClass: Record<AdBannerData["variant"], string> = {
  club: "object-cover object-[center_top]",
  ball: "object-cover object-[center_top]",
  academy: "object-cover object-[center_top]",
  apparel: "object-cover object-[center_top]",
  shoes: "object-cover object-center",
  uv: "object-cover object-[center_top]",
};

const mobileImageClass: Record<AdBannerData["variant"], string> = {
  club: "object-cover object-[center_38%]",
  ball: "object-cover object-[center_42%]",
  academy: "object-cover object-center",
  apparel: "object-cover object-[center_35%]",
  shoes: "object-cover object-center",
  uv: "object-cover object-[center_40%]",
};

const AD_HEIGHT = "h-[300px]";
const MOBILE_AD_HEIGHT = "h-[108px]";

function MobileHorizontalAd({ data, className }: { data: AdBannerData; className?: string }) {
  const isAcademy = data.variant === "academy";

  return (
    <Link
      href="/ads"
      className={cn(
        "flex w-full shrink-0 overflow-hidden rounded-lg shadow-[0_2px_10px_rgba(6,78,59,0.12)]",
        MOBILE_AD_HEIGHT,
        className,
      )}
    >
      <div
        className={cn(
          "relative h-full w-[38%] shrink-0 sm:w-[34%]",
          isAcademy ? "bg-emerald-900" : "bg-[#eef3f0]",
        )}
      >
        <Image
          src={isAcademy ? "/images/banner-course.jpg" : variantImages[data.variant]}
          alt={data.title}
          fill
          unoptimized
          className={mobileImageClass[data.variant]}
          sizes="40vw"
        />
        {isAcademy && (
          <div className="absolute inset-0 bg-gradient-to-r from-pul-deep/50 to-transparent" />
        )}
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col justify-center px-3 py-2",
          isAcademy
            ? "bg-gradient-to-r from-pul-deep to-emerald-800 text-white"
            : "bg-white",
        )}
      >
        {data.badge && (
          <p
            className={cn(
              "text-[10px] font-bold leading-none",
              isAcademy ? "text-pul-gold" : "text-pul-point",
            )}
          >
            {data.badge}
          </p>
        )}
        <p
          className={cn(
            "mt-0.5 line-clamp-1 text-sm font-bold leading-tight",
            isAcademy ? "text-white" : "text-pul-deep",
          )}
        >
          {data.title}
        </p>
        {(data.subtitle || data.discount) && (
          <p
            className={cn(
              "mt-0.5 line-clamp-1 text-xs leading-snug",
              isAcademy ? "text-white/90" : "text-pul-muted",
            )}
          >
            {data.subtitle ?? data.discount}
          </p>
        )}
        <p
          className={cn(
            "mt-1 text-[11px] font-semibold",
            isAcademy ? "text-pul-gold-light" : "text-pul-point",
          )}
        >
          {data.cta} →
        </p>
      </div>
    </Link>
  );
}

function AcademyAdCard({
  data,
  className,
}: {
  data: AdBannerData;
  className?: string;
}) {
  return (
    <Link
      href="/ads"
      className={cn(
        "relative flex w-full shrink-0 flex-col overflow-hidden rounded-lg bg-gradient-to-b from-pul-deep via-emerald-800 to-pul-deep shadow-[0_2px_12px_rgba(6,78,59,0.14)]",
        AD_HEIGHT,
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 70% 30%, white 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
        aria-hidden="true"
      />
      <div className="relative flex flex-1 flex-col px-3.5 pb-2 pt-3.5 text-white">
        <p className="text-[10px] font-semibold tracking-wide text-white/80">
          {data.badge ?? "PUL Academy"}
        </p>
        <p className="mt-1.5 text-[15px] font-bold leading-tight">{data.title}</p>
        <p className="mt-1 text-[11px] leading-snug text-white/90">{data.subtitle}</p>
        <div
          className="mt-3 min-h-0 flex-1 rounded-md bg-cover bg-center ring-1 ring-white/15"
          style={{
            backgroundImage:
              "linear-gradient(rgba(6,78,59,0.35), rgba(6,78,59,0.55)), url('/images/banner-course.jpg')",
          }}
          aria-hidden="true"
        />
      </div>
      <span className="relative shrink-0 bg-pul-point py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-emerald-600">
        {data.cta}
      </span>
    </Link>
  );
}

export function AdBanner({ data, className, compact = false }: AdBannerProps) {
  if (compact) {
    return <MobileHorizontalAd data={data} className={className} />;
  }

  if (data.variant === "academy") {
    return <AcademyAdCard data={data} className={className} />;
  }

  return (
    <Link
      href="/ads"
      className={cn(
        "relative block w-full shrink-0 overflow-hidden rounded-lg shadow-[0_2px_12px_rgba(6,78,59,0.14)]",
        AD_HEIGHT,
        className,
      )}
    >
      <Image
        src={variantImages[data.variant]}
        alt={data.title}
        fill
        unoptimized
        className={cn(variantImageClass[data.variant])}
        sizes="172px"
      />
    </Link>
  );
}
