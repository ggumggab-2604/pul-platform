import { CourseMapExplorer } from "@/components/courses/CourseMapExplorer";
import { CoursePageHero } from "@/components/courses/CoursePageHero";
import { Container } from "@/components/ui/Container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "파크골프장 찾기",
  description: "전국 파크골프장 정보를 한눈에 확인하세요.",
};

export default function CoursesPage() {
  return (
    <div className="bg-pul-page lg:flex lg:min-h-[calc(100vh-9rem)] lg:flex-col">
      <CoursePageHero />
      <Container className="flex flex-1 flex-col py-3 lg:min-h-0 lg:py-5">
        <CourseMapExplorer />
      </Container>
    </div>
  );
}
