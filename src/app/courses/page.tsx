import { CoursesPageClient } from "@/components/courses/CoursesPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "골프장",
  description: "실제 필드와 스크린 파크골프장 정보를 확인하세요.",
};

export default function CoursesPage() {
  return <CoursesPageClient />;
}
