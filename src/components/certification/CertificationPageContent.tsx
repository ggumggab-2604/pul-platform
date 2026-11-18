"use client";

import { CertificationActivityTab } from "@/components/certification/CertificationActivityTab";
import { CertificationCoursesTab } from "@/components/certification/CertificationCoursesTab";
import { CertificationExamPrepTab } from "@/components/certification/CertificationExamPrepTab";
import { CertificationGuideTab } from "@/components/certification/CertificationGuideTab";
import {
  CertificationPageTabs,
  type CertificationPageTab,
} from "@/components/certification/CertificationPageTabs";
import { CertificationSubmissionRequestDialog } from "@/components/certification/CertificationSubmissionRequestDialog";
import {
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
import type { CertificationSubmissionRequestType } from "@/lib/certification/certificationSubmissionRequests";
import type { CertificationStudyPage } from "@/lib/certification/certificationStudyPosts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ComponentProps, type ReactNode } from "react";

type CertificationPageContentProps = {
  activeTab: CertificationPageTab;
  examResources: Pick<ComponentProps<typeof CertificationExamPrepTab>, "courseKey" | "courseMaterials" | "materialsError" | "universityKeys" | "oral" | "oralError">;
  banner: ReactNode;
  talentList: ReactNode;
  coursePage: CertificationPage<PublicQualificationCourse>;
  examPage: CertificationPage<PublicExamSchedule>;
  jobPage: CertificationPage<PublicCertificationJob>;
  studyPage: CertificationStudyPage;
  courseFilters: CertificationCourseFilters;
  examFilters: CertificationExamFilters;
  jobFilters: CertificationJobFilters;
  courseError: string | null;
  examError: string | null;
  jobError: string | null;
  studyError: string | null;
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

export function CertificationPageContent({
  activeTab,
  examResources,
  banner,
  talentList,
  coursePage,
  examPage,
  jobPage,
  studyPage,
  courseFilters,
  examFilters,
  jobFilters,
  courseError,
  examError,
  jobError,
  studyError,
}: CertificationPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [submissionRequest, setSubmissionRequest] = useState<{
    requestType: CertificationSubmissionRequestType;
    trigger: HTMLElement | null;
  } | null>(null);

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

  const openCourse = (course: PublicQualificationCourse) => router.push(`/certification/courses/${encodeURIComponent(course.courseKey)}`);
  const openJob = (job: PublicCertificationJob) => router.push(`/certification/jobs/${encodeURIComponent(job.jobKey)}`);
  const query = searchParams.toString();
  const returnPath = `${pathname}${query ? `?${query}` : ""}`;

  return (
    <div className="space-y-3 lg:space-y-4" aria-busy={isPending}>
      <CertificationPageTabs activeTab={activeTab} onChange={selectTab} />
      {banner}
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
            {...examResources}
            studyPage={studyPage}
            studyError={studyError}
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
            onInquiry={openCourse}
            onDetail={openCourse}
            onRegister={(trigger) => setSubmissionRequest({
              requestType: "course_registration",
              trigger,
            })}
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
            onJobInquiry={openJob}
            talentList={talentList}
            onJobRegister={(trigger) => setSubmissionRequest({
              requestType: "job_registration",
              trigger,
            })}
          />
        )}
      </div>

      {submissionRequest ? (
        <CertificationSubmissionRequestDialog
          requestType={submissionRequest.requestType}
          trigger={submissionRequest.trigger}
          returnPath={returnPath}
          onClose={() => setSubmissionRequest(null)}
        />
      ) : null}
    </div>
  );
}
