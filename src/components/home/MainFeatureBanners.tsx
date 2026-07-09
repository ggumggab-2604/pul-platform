import { featureBanners } from "@/data/homeData";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

const variantImages = {
  course: "/images/banner-course.jpg",
  equipment: "/images/banner-equipment.jpg",
  community: "/images/banner-community.jpg",
} as const;

const textAreaOverlay: Record<
  (typeof featureBanners)[number]["variant"],
  string
> = {
  course: "from-black/50 via-black/22 to-transparent",
  equipment: "from-black/48 via-black/20 to-transparent",
  community: "from-black/58 via-black/28 to-transparent",
};

export function MainFeatureBanners() {
  return (
    <section className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-4">
      {featureBanners.map((banner) => (
        <Link
          key={banner.id}
          href={banner.href}
          className="group relative flex h-[168px] overflow-hidden rounded-xl border border-black/10 shadow-[0_4px_16px_rgba(6,78,59,0.12)] transition-transform hover:scale-[1.01] lg:h-[200px]"
        >
          <Image
            src={variantImages[banner.variant]}
            alt=""
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 1024px) 100vw, 480px"
          />
          <div
            className={cn(
              "absolute inset-y-0 left-0 w-[78%] bg-gradient-to-r",
              textAreaOverlay[banner.variant],
            )}
            aria-hidden="true"
          />

          <div className="relative z-10 flex h-full max-w-[90%] flex-col justify-end px-4 py-4 lg:max-w-[88%] lg:px-6 lg:py-6">
            <h3 className="text-base font-bold leading-snug text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.55)] lg:text-xl">
              {banner.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-white/95 [text-shadow:0_1px_4px_rgba(0,0,0,0.45)]">
              {banner.description}
            </p>
            <span className="mt-2 inline-block shrink-0 text-sm font-bold text-pul-gold-light group-hover:underline lg:mt-2.5">
              바로가기 →
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}
