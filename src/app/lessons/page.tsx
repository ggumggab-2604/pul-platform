import { LessonsPageShell } from "@/components/lessons/LessonsPageShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "레슨·교육",
  description:
    "파크골프를 처음 시작하는 분부터 기존 골프 경험자까지, 입문 가이드와 무료 영상 강의, 유료 레슨 정보를 한곳에서 확인하세요.",
};

export default function LessonsPage() {
  return <LessonsPageShell />;
}
