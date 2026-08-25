"use client";

import { CertificationStudyBoardSection } from "@/components/certification/CertificationStudyBoardSection";
import { EXAM_PREP_DISCLAIMER, type ExamType } from "@/data/certificationData";
import type { CertificationStudyPage } from "@/lib/certification/certificationStudyPosts";

type CertificationExamPrepTabProps = {
  initialExamType?: ExamType | "all";
  studyPage: CertificationStudyPage;
  studyError: string | null;
  returnPath: string;
};

export function CertificationExamPrepTab({
  studyPage,
  studyError,
  returnPath,
}: CertificationExamPrepTabProps) {
  return (
    <div className="space-y-3 lg:space-y-4">
      <aside className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm leading-relaxed text-blue-950">
        시험 준비 이야기방은 실제 회원 글입니다. 공식 기출문제, 시험 일정, 응시
        조건과 연수 일정은 자격증 안내 탭의 공개 일정과 주관기관 링크에서 확인해
        주세요.
      </aside>

      <CertificationStudyBoardSection
        page={studyPage}
        error={studyError}
        returnPath={returnPath}
      />

      <aside className="rounded-lg border border-pul-border/80 bg-[#fafbfa] px-2.5 py-2 lg:px-3 lg:py-2.5">
        <p className="text-[10px] leading-[1.45] text-pul-muted lg:text-xs lg:leading-relaxed">
          {EXAM_PREP_DISCLAIMER}
        </p>
      </aside>
    </div>
  );
}
