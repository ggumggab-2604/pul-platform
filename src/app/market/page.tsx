import { MarketPageContent } from "@/components/market/MarketPageContent";
import { MarketPageHero } from "@/components/market/MarketPageHero";
import { Container } from "@/components/ui/Container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "중고장터",
  description: "파크골프 용품을 안전하게 사고팔 수 있는 공간입니다.",
};

export default function MarketPage() {
  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <MarketPageHero />
      </Container>
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <MarketPageContent />
      </Container>
    </div>
  );
}
