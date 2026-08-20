"use client";

import { CertificationActivityTab } from "@/components/certification/CertificationActivityTab";
import { CertificationCoursesTab } from "@/components/certification/CertificationCoursesTab";
import { CertificationDirectoryModal } from "@/components/certification/CertificationDirectoryModal";
import { CertificationExamPrepTab } from "@/components/certification/CertificationExamPrepTab";
import { CertificationGuideTab } from "@/components/certification/CertificationGuideTab";
import {
  CertificationPageTabs,
  type CertificationPageTab,
} from "@/components/certification/CertificationPageTabs";
import {
  courseCategoryLabels,
  courseMethodLabels,
  courseStatusLabels,
  refereeRoleTypeLabels,
  type CourseCategory,
  type ExamType,
  type QualificationGuide,
} from "@/data/certificationData";
import type {
  CertificationCourseFilters,
  CertificationExamFilters,
  CertificationJobFilters,
  CertificationPage,
  PublicCertificationJob,
  PublicExamSchedule,
  PublicQualificationCourse,
} from "@/lib/certification/certificationDirectory";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type CertificationPageContentProps = {
  activeTab: CertificationPageTab;
  coursePage: CertificationPage<PublicQualificationCourse>;
  examPage: CertificationPage<PublicExamSchedule>;
  jobPage: CertificationPage<PublicCertificationJob>;
  courseFilters: CertificationCourseFilters;
  examFilters: CertificationExamFilters;
  jobFilters: CertificationJobFilters;
  courseError: string | null;
  examError: string | null;
  jobError: string | null;
};

function setOptional(params: URLSearchParams, key: string, value?: string) {
  if (value) params.set(key, value);
  else params.delete(key);
}

function getGuideCourseCategory(guide: QualificationGuide): CourseCategory | undefined {
  switch (guide.id) {
    case "guide-instructor":
      return "instructor";
    case "guide-referee":
      return "referee";
    case "guide-private":
      return "private_instructor";
    default:
      return undefined;
  }
}

function getGuideExamType(guide: QualificationGuide): ExamType | undefined {
  switch (guide.id) {
    case "guide-national":
      return "life_sports";
    case "guide-instructor":
      return "park_instructor";
    case "guide-referee":
      return "park_referee";
    case "guide-private":
      return "private_instructor";
    default:
      return undefined;
  }
}

const validExamTypes = new Set<ExamType>([
  "life_sports",
  "disabled_sports",
  "park_instructor",
  "park_referee",
  "private_instructor",
  "private_referee",
]);

function parsePrepExamType(value: string | null): ExamType | "all" {
  return value && validExamTypes.has(value as ExamType) ? (value as ExamType) : "all";
}

export function CertificationPageContent({
  activeTab,
  coursePage,
  examPage,
  jobPage,
  courseFilters,
  examFilters,
  jobFilters,
  courseError,
  examError,
  jobError,
}: CertificationPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selectedCourse, setSelectedCourse] = useState<PublicQualificationCourse | null>(null);
  const [selectedJob, setSelectedJob] = useState<PublicCertificationJob | null>(null);
  const [notice, setNotice] = useState<"course-register" | "job-register" | null>(null);

  const navigate = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  const selectTab = (tab: CertificationPageTab) => {
    navigate((params) => setOptional(params, "tab", tab === "guide" ? undefined : tab));
  };

  const handleGuideSelect = (guide: QualificationGuide) => {
    const nextTab = guide.linkTab ?? "courses";
    navigate((params) => {
      setOptional(params, "tab", nextTab === "guide" ? undefined : nextTab);
      if (nextTab === "courses") {
        setOptional(params, "courseCategory", getGuideCourseCategory(guide));
        params.delete("coursePage");
      }
      if (nextTab === "exam-prep") {
        setOptional(params, "prepExamType", getGuideExamType(guide));
      }
    });
  };

  const courseMessage = selectedCourse
    ? [
        selectedCourse.description,
        "",
        `구분: ${courseCategoryLabels[selectedCourse.category]}`,
        `주관기관: ${selectedCourse.provider}`,
        `지역: ${selectedCourse.region}`,
        `교육 방식: ${courseMethodLabels[selectedCourse.method]}`,
        `일정: ${selectedCourse.schedule}`,
        `대상: ${selectedCourse.target}`,
        `비용: ${selectedCourse.price}`,
        `모집 상태: ${courseStatusLabels[selectedCourse.status]}`,
      ].join("\n")
    : "";

  const jobMessage = selectedJob
    ? [
        `역할: ${refereeRoleTypeLabels[selectedJob.roleType]}`,
        `지역: ${selectedJob.region}`,
        `일정: ${selectedJob.schedule}`,
        `업무: ${selectedJob.role}`,
        `조건: ${selectedJob.condition}`,
        `보수/활동비: ${selectedJob.payInfo}`,
        `모집 주체: ${selectedJob.organizerName} (${selectedJob.organizerType})`,
        `모집 상태: ${courseStatusLabels[selectedJob.status]}`,
      ].join("\n")
    : "";

  const prepExamType = parsePrepExamType(searchParams.get("prepExamType"));

  return (
    <div className="space-y-3 lg:space-y-4" aria-busy={isPending}>
      <CertificationPageTabs activeTab={activeTab} onChange={selectTab} />
      <span className="sr-only" aria-live="polite">
        {isPending ? "자격증·심판 정보를 불러오는 중입니다." : "자격증·심판 정보를 불러왔습니다."}
      </span>

      <div
        id={`certification-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`certification-tab-${activeTab}`}
      >
        {activeTab === "guide" && (
          <CertificationGuideTab
            onGuideSelect={handleGuideSelect}
            examPage={examPage}
            filters={examFilters}
            error={examError}
            onFilterChange={(key, value) =>
              navigate((params) => {
                setOptional(params, key, value);
                params.delete("examPage");
              })
            }
            onPageChange={(page) =>
              navigate((params) => setOptional(params, "examPage", page > 1 ? String(page) : undefined))
            }
          />
        )}
        {activeTab === "exam-prep" && (
          <CertificationExamPrepTab
            key={prepExamType}
            initialExamType={prepExamType}
          />
        )}
        {activeTab === "courses" && (
          <CertificationCoursesTab
            coursePage={coursePage}
            filters={courseFilters}
            error={courseError}
            onFilterChange={(key, value) =>
              navigate((params) => {
                setOptional(params, key, value);
                params.delete("coursePage");
              })
            }
            onPageChange={(page) =>
              navigate((params) => setOptional(params, "coursePage", page > 1 ? String(page) : undefined))
            }
            onInquiry={setSelectedCourse}
            onDetail={setSelectedCourse}
            onRegister={() => setNotice("course-register")}
          />
        )}
        {activeTab === "activity" && (
          <CertificationActivityTab
            jobPage={jobPage}
            filters={jobFilters}
            error={jobError}
            onFilterChange={(key, value) =>
              navigate((params) => {
                setOptional(params, key, value);
                params.delete("jobPage");
              })
            }
            onPageChange={(page) =>
              navigate((params) => setOptional(params, "jobPage", page > 1 ? String(page) : undefined))
            }
            onJobInquiry={setSelectedJob}
            onJobRegister={() => setNotice("job-register")}
          />
        )}
      </div>

      {selectedCourse ? (
        <CertificationDirectoryModal
          title={selectedCourse.title}
          message={courseMessage}
          actionLabel="주관기관 사이트에서 확인"
          actionUrl={selectedCourse.applicationUrl ?? selectedCourse.officialUrl}
          onClose={() => setSelectedCourse(null)}
        />
      ) : null}
      {selectedJob ? (
        <CertificationDirectoryModal
          title={selectedJob.title}
          message={jobMessage}
          actionLabel="공식 모집 페이지에서 확인"
          actionUrl={selectedJob.applicationUrl ?? selectedJob.officialUrl}
          onClose={() => setSelectedJob(null)}
        />
      ) : null}
      {notice ? (
        <CertificationDirectoryModal
          title={notice === "course-register" ? "교육과정 등록 문의" : "구인 공고 등록 문의"}
          message={
            notice === "course-register"
              ? "공식 교육과정 등록 기능은 준비 중입니다. 현재는 PUL 운영자가 주관기관의 공개 정보를 확인한 뒤 등록합니다."
              : "공식 모집 공고 등록 기능은 준비 중입니다. 현재는 PUL 운영자가 모집 주체의 공개 정보를 확인한 뒤 등록합니다."
          }
          onClose={() => setNotice(null)}
        />
      ) : null}
    </div>
  );
}
