"use client";

import { CourseMapExplorer } from "@/components/courses/CourseMapExplorer";
import { CoursePageHero } from "@/components/courses/CoursePageHero";
import { Container } from "@/components/ui/Container";
import { InfoModal } from "@/components/ui/InfoModal";
import { useState } from "react";

export function CoursesPageClient() {
  const [showReportModal, setShowReportModal] = useState(false);

  return (
    <div className="bg-pul-page lg:flex lg:min-h-[calc(100vh-9rem)] lg:flex-col">
      <CoursePageHero onReport={() => setShowReportModal(true)} />
      <Container className="flex flex-1 flex-col py-3 lg:min-h-0 lg:py-5">
        <CourseMapExplorer />
      </Container>
      {showReportModal ? (
        <InfoModal
          title="골프장 정보 제보하기"
          message="골프장 신규 오픈, 운영 방식 변경, 연락처 수정 정보는 PUL 운영팀이 확인 후 반영할 예정입니다. MVP 단계에서는 안내 UI만 제공합니다."
          onClose={() => setShowReportModal(false)}
        />
      ) : null}
    </div>
  );
}
