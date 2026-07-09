import { ClubsPageContent } from "@/components/clubs/ClubsPageContent";
import { ClubsPageHero } from "@/components/clubs/ClubsPageHero";
import { Container } from "@/components/ui/Container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "동호회 찾기",
  description:
    "가까운 파크골프 동호회를 찾고, 가입 정보와 월례회·친선전·정기 라운드 일정을 확인하세요.",
};

export default function ClubsPage() {
  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <ClubsPageHero />
      </Container>
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <ClubsPageContent />
      </Container>
    </div>
  );
}
