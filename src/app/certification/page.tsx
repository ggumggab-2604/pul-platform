import { CertificationPageContent } from "@/components/certification/CertificationPageContent";
import { CertificationPageHero } from "@/components/certification/CertificationPageHero";
import { Container } from "@/components/ui/Container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "자격증·심판",
  description:
    "파크골프 지도자 자격증, 심판 자격증, 생활스포츠지도사, 장애인스포츠지도사, 협회·민간 교육과정, 심판·강사 활동 정보를 한곳에서 확인하세요.",
};

export default function CertificationPage() {
  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <CertificationPageHero />
      </Container>
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <CertificationPageContent />
      </Container>
    </div>
  );
}
