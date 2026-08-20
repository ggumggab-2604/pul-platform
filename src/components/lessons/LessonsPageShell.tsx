"use client";

import { LessonsPageContent } from "@/components/lessons/LessonsPageContent";
import { LessonsPageHero } from "@/components/lessons/LessonsPageHero";
import { Container } from "@/components/ui/Container";
import { InfoModal } from "@/components/ui/InfoModal";
import { LESSON_REGISTER_FORM_URL } from "@/data/lessonData";
import type {
  LessonDirectoryFilters,
  PublicLesson,
  PublicLessonPage,
  PublicLessonVideoPage,
} from "@/lib/lessons/lessonDirectory";
import type { VideoLessonCategory } from "@/types";
import { useState } from "react";

type LessonsPageShellProps = {
  lessonPage: PublicLessonPage;
  featuredLessons: PublicLesson[];
  videoPage: PublicLessonVideoPage;
  initialFilters: LessonDirectoryFilters;
  initialVideoCategory?: VideoLessonCategory;
  lessonError: string | null;
  videoError: string | null;
};

export function LessonsPageShell(props: LessonsPageShellProps) {
  const [showRegister, setShowRegister] = useState(false);

  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <LessonsPageHero onRegister={() => setShowRegister(true)} />
      </Container>
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <LessonsPageContent {...props} />
      </Container>
      {showRegister && (
        <InfoModal
          title="레슨 강사 등록 문의"
          message="PUL 레슨 강사·교육기관 홍보 등록 기능은 준비 중입니다. 운영자 확인 후 공식 정보만 등록합니다."
          actionLabel="등록 문의 양식"
          actionHref={LESSON_REGISTER_FORM_URL}
          onClose={() => setShowRegister(false)}
        />
      )}
    </div>
  );
}
