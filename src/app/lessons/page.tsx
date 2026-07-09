import { LessonsPageContent } from "@/components/lessons/LessonsPageContent";
import { LessonsPageHero } from "@/components/lessons/LessonsPageHero";
import { Container } from "@/components/ui/Container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "레슨·교육",
  description:
    "파크골프를 처음 시작하는 분부터 기존 골프 경험자까지, 입문 가이드와 무료 영상 강의, 유료 레슨 정보를 한곳에서 확인하세요.",
};

export default function LessonsPage() {
  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <LessonsPageHero />
      </Container>
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <LessonsPageContent />
      </Container>
    </div>
  );
}
