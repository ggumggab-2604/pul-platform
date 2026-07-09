import { NewsPageContent } from "@/components/news/NewsPageContent";
import { Container } from "@/components/ui/Container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "뉴스·정보",
  description:
    "전국 파크골프 소식, 구장·예약 변경, 대회·행사, 자격증·심판, 대학·학과, 장비·브랜드, 초보 가이드를 한곳에서 확인하세요.",
};

export default function NewsPage() {
  return (
    <div className="bg-pul-page">
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <NewsPageContent />
      </Container>
    </div>
  );
}
