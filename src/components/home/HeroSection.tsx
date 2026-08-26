import { QuickMenu } from "@/components/home/QuickMenu";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";
import Image from "next/image";

const HERO_IMAGE = "/images/PUL_hero_main_v4.png";

type HeroSectionProps = {
  promotion?: ActiveSlotPromotion | null;
};

export function HeroSection({ promotion }: HeroSectionProps) {
  if (promotion) {
    return <PromotionBanner promotion={promotion} variant="hero" priority />;
  }

  return (
    <div className="relative h-[250px] overflow-hidden rounded-xl sm:h-[280px] lg:h-[428px]">
      <Image
        src={HERO_IMAGE}
        alt="대한민국 파크골프의 모든 것, PUL - 즐기고, 배우고, 함께 성장하는 파크골프 플랫폼"
        fill
        priority
        unoptimized
        className="object-cover object-center"
        sizes="(max-width: 1024px) 100vw, 960px"
      />
    </div>
  );
}

export function HeroWithQuickMenu({ promotion }: HeroSectionProps) {
  return (
    <section>
      <HeroSection promotion={promotion} />
      <QuickMenu />
    </section>
  );
}

export const HeroBanner = HeroSection;
