import { CertificationPageContent } from "@/components/certification/CertificationPageContent";
import { CertificationPageHero } from "@/components/certification/CertificationPageHero";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { Container } from "@/components/ui/Container";
import type {
  CourseCategory,
  CourseMethod,
  CourseStatus,
  ExamScheduleStatus,
  ExamType,
  ProviderType,
  RefereeJobRoleType,
} from "@/data/certificationData";
import {
  CertificationDirectoryError,
  listPublicCertificationCourses,
  listPublicCertificationExamSchedules,
  listPublicCertificationJobs,
  type CertificationCourseFilters,
  type CertificationExamFilters,
  type CertificationJobFilters,
  type CertificationPage,
  type PublicCertificationJob,
  type PublicExamSchedule,
  type PublicQualificationCourse,
} from "@/lib/certification/certificationDirectory";
import {
  CertificationStudyPostError,
  listPublicCertificationStudyPosts,
  type CertificationStudyPage,
} from "@/lib/certification/certificationStudyPosts";
import { findPromotionForSlot } from "@/lib/promotions/promotionRuntime";
import { loadActivePromotionsForSlots } from "@/lib/promotions/promotionRuntime.server";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "자격증·심판",
  description:
    "파크골프 지도자·심판 교육과정, 공식 시험 일정, 심판·강사 모집 정보를 확인하세요.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type CertificationTab = "guide" | "exam-prep" | "courses" | "activity";
const STUDY_PREVIEW_LIMIT = 3;

const emptyPage = <T,>(offset: number): CertificationPage<T> => ({
  items: [],
  total: 0,
  limit: 24,
  offset,
  hasMore: false,
});

const emptyStudyPage = (): CertificationStudyPage => ({
  items: [],
  total: 0,
  limit: STUDY_PREVIEW_LIMIT,
  offset: 0,
  hasMore: false,
});

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positivePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function activeTab(value: string | undefined): CertificationTab {
  return value === "exam-prep" || value === "courses" || value === "activity"
    ? value
    : "guide";
}

function message(reason: unknown) {
  return reason instanceof CertificationDirectoryError
    ? reason.userMessage
    : "자격증·심판 정보를 불러오지 못했습니다.";
}

function studyMessage(reason: unknown) {
  return reason instanceof CertificationStudyPostError
    ? reason.userMessage
    : "시험 준비 게시글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export default async function CertificationPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selectedTab = activeTab(first(params.tab));
  const coursePageNumber = positivePage(first(params.coursePage));
  const examPageNumber = positivePage(first(params.examPage));
  const jobPageNumber = positivePage(first(params.jobPage));
  const courseFilters: CertificationCourseFilters = {
    keyword: first(params.courseKeyword),
    category: first(params.courseCategory) as CourseCategory | undefined,
    providerType: (first(params.courseProviderType) ?? first(params.courseProvider)) as ProviderType | undefined,
    region: first(params.courseRegion),
    method: first(params.courseMethod) as CourseMethod | undefined,
    status: first(params.courseStatus) as CourseStatus | undefined,
  };
  const examFilters: CertificationExamFilters = {
    examType: first(params.examType) as ExamType | undefined,
    status: first(params.examStatus) as ExamScheduleStatus | undefined,
  };
  const jobFilters: CertificationJobFilters = {
    roleType: (first(params.jobRoleType) ?? first(params.jobRole)) as RefereeJobRoleType | undefined,
    region: first(params.jobRegion),
    status: first(params.jobStatus) as CourseStatus | "planned" | undefined,
  };
  const client = await createClient();
  const [coursesResult, examsResult, jobsResult, studyResult, promotionResult] = await Promise.allSettled([
    selectedTab === "courses"
      ? listPublicCertificationCourses(client, courseFilters, 24, (coursePageNumber - 1) * 24)
      : Promise.resolve(emptyPage<PublicQualificationCourse>((coursePageNumber - 1) * 24)),
    selectedTab === "guide"
      ? listPublicCertificationExamSchedules(client, examFilters, 24, (examPageNumber - 1) * 24)
      : Promise.resolve(emptyPage<PublicExamSchedule>((examPageNumber - 1) * 24)),
    selectedTab === "activity"
      ? listPublicCertificationJobs(client, jobFilters, 24, (jobPageNumber - 1) * 24)
      : Promise.resolve(emptyPage<PublicCertificationJob>((jobPageNumber - 1) * 24)),
    selectedTab === "exam-prep"
      ? listPublicCertificationStudyPosts(client, STUDY_PREVIEW_LIMIT, 0)
      : Promise.resolve(emptyStudyPage()),
    loadActivePromotionsForSlots(client, ["certification.top.01"]),
  ]);

  const coursePage: CertificationPage<PublicQualificationCourse> =
    coursesResult.status === "fulfilled"
      ? coursesResult.value
      : emptyPage((coursePageNumber - 1) * 24);
  const examPage: CertificationPage<PublicExamSchedule> =
    examsResult.status === "fulfilled"
      ? examsResult.value
      : emptyPage((examPageNumber - 1) * 24);
  const jobPage: CertificationPage<PublicCertificationJob> =
    jobsResult.status === "fulfilled"
      ? jobsResult.value
      : emptyPage((jobPageNumber - 1) * 24);
  const studyPage = studyResult.status === "fulfilled"
    ? studyResult.value
    : emptyStudyPage();
  const promotion = findPromotionForSlot(
    promotionResult.status === "fulfilled" ? promotionResult.value : [],
    "certification.top.01",
  );

  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <CertificationPageHero />
      </Container>
      {promotion ? (
        <Container className="px-3 pt-3 lg:pt-5">
          <PromotionBanner promotion={promotion} variant="horizontal" />
        </Container>
      ) : null}
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <CertificationPageContent
          activeTab={selectedTab}
          coursePage={coursePage}
          examPage={examPage}
          jobPage={jobPage}
          studyPage={studyPage}
          courseFilters={courseFilters}
          examFilters={examFilters}
          jobFilters={jobFilters}
          courseError={coursesResult.status === "rejected" ? message(coursesResult.reason) : null}
          examError={examsResult.status === "rejected" ? message(examsResult.reason) : null}
          jobError={jobsResult.status === "rejected" ? message(jobsResult.reason) : null}
          studyError={studyResult.status === "rejected" ? studyMessage(studyResult.reason) : null}
        />
      </Container>
    </div>
  );
}
