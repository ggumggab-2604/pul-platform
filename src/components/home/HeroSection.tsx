import { QuickMenu } from "@/components/home/QuickMenu";
import Image from "next/image";

const HERO_IMAGE = "/images/PUL_hero_main_v4.png";

export function HeroSection() {
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

export function HeroWithQuickMenu() {
  return (
    <section>
      <HeroSection />
      <QuickMenu />
    </section>
  );
}

export const HeroBanner = HeroSection;
