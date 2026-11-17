import Link from "next/link";
import { hancheon, trainingInstitutions } from "@/data/certificationSources";
import { listCourseResources } from "@/lib/courses/courseContent";
import { listPublicCourses } from "@/lib/courses/courseDirectory";
import { listPublicUniversityDepartments } from "@/lib/lessons/universityDirectory";
import { isPracticalCourseMaterial, type OralSubmission, type PracticalMaterials, type TalentProfile } from "@/lib/certification/certificationPhaseOne";
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
import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";
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

async function loadPracticalMaterials(client: Awaited<ReturnType<typeof createClient>>, courseKey: string, course: "A" | "B") {
  const matches: PracticalMaterials = {};
  for (let offset = 0; offset <= 120000; offset += 12) {
    const page = await listCourseResources(client, courseKey, null, offset);
    for (const resource of page.items) {
      if (!matches[resource.kind] && isPracticalCourseMaterial(resource.scope, resource.title, course)) {
        matches[resource.kind] = resource.id;
      }
    }
    if ((matches.video && matches.yardage) || offset + page.items.length >= page.total || !page.items.length) break;
  }
  return matches;
}

async function renderCertificationPromotion(client: Awaited<ReturnType<typeof createClient>>, promotion: ActiveSlotPromotion | null) {
  if (!promotion) return null;

  let courseHref: string | undefined;
  if (promotion.contentKind === "advertisement" && promotion.detailSlug) {
    const { data, error } = await client.rpc("certification_promotion_course", { p_slug: promotion.detailSlug });
    if (error) return null;
    if (data !== null) {
      if (typeof data?.course_key !== "string") return null;
      courseHref = `/certification/courses/${encodeURIComponent(data.course_key)}`;
    }
  }
  return <PromotionBanner promotion={promotion} variant="horizontal" internalHref={courseHref} badgeLabel={courseHref ? "유료 광고" : undefined} />;
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
  const stage = first(params.stage);
  const talentPage = Math.min(1000, positivePage(first(params.talentPage)));
  const [coursesResult, examsResult, jobsResult, studyResult, promotionResult, venues, universities, oralResult, talentResult] = await Promise.allSettled([
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
    loadActivePromotionsForSlots(client, ["certification.top.01", "certification.after_content.01"]),
    selectedTab === "exam-prep" && stage === "practical" ? listPublicCourses(client, { keyword: "한천", courseType: "field" }) : undefined,
    selectedTab === "exam-prep" && stage === "training" ? Promise.all(trainingInstitutions.map(async (institution) => {
      const name = institution.name.replace("(서울)", "");
      const departments = await listPublicUniversityDepartments(client, name).catch(() => null);
      const matches = departments?.items.filter((item) => item.universityName === name || item.universityName === institution.name);
      return [institution.key, matches?.length === 1 ? matches[0].departmentKey : ""];
    })) : [],
    selectedTab === "exam-prep" && stage === "oral" ? client.rpc("certification_oral", { p_manage: false }) : null,
    selectedTab === "activity" ? client.rpc("certification_profiles", { p_id: null, p_own: false, p_offset: (talentPage - 1) * 24 }) : null,
  ]);
  const courseKey = venues.status === "fulfilled" ? venues.value?.items.find((course) =>
    [hancheon.name, "한천파크골프장", "한천예천파크골프장", "예천한천파크골프장"].includes(course.name)
    && course.address.includes("예천"))?.courseKey : undefined;
  const oral = oralResult.status === "fulfilled" && oralResult.value?.data ? oralResult.value.data as OralSubmission[] : [];
  const talent = talentResult.status === "fulfilled" && talentResult.value?.data ? talentResult.value.data as TalentProfile[] : [];
  const talentError = talentResult.status === "rejected" || Boolean(talentResult.value?.error);
  const oralError = oralResult.status === "rejected" || Boolean(oralResult.value?.error);

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
  const afterContentPromotion = findPromotionForSlot(
    promotionResult.status === "fulfilled" ? promotionResult.value : [],
    "certification.after_content.01",
  );

  const [topPromotion, secondPromotion, courseMaterials] = await Promise.all([
    renderCertificationPromotion(client, promotion),
    renderCertificationPromotion(client, afterContentPromotion),
    courseKey ? loadPracticalMaterials(client, courseKey, first(params.course) === "B" ? "B" : "A").catch(() => undefined) : undefined,
  ]);

  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <CertificationPageHero />
      </Container>
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <CertificationPageContent
          activeTab={selectedTab}
          examResources={{
            courseKey,
            courseMaterials,
            universityKeys: Object.fromEntries(universities.status === "fulfilled" ? universities.value : []),
            oral, oralError,
          }}
          banner={topPromotion}
          talentList={selectedTab === "activity" ? <section className="space-y-3 rounded-xl border border-pul-border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold">구직 프로필</h3>
              <Link prefetch={false} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border px-3 font-bold text-pul-point" href="/certification/talent/edit">내 구직 프로필 등록·수정</Link>
            </div>
            {talentError ? <p role="alert">공개 구직 프로필을 불러오지 못했습니다.</p> : talent.length ? <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {talent.slice(0,24).map((profile) => <li key={profile.id} className="min-w-0 rounded-lg border border-pul-border p-3">
                <Link href={`/certification/talent/${profile.id}`} className="inline-flex min-h-11 items-center break-all font-bold text-pul-point underline">{profile.nickname}</Link>
                <p className="break-words text-sm">{profile.qualification} · {profile.issuer} · {profile.grade}</p>
                <p className="break-words text-sm text-pul-muted">{profile.region} · 본인 등록 자격</p>
              </li>)}
            </ul> : <p className="text-sm text-pul-muted">공개된 구직 프로필이 없습니다.</p>}
            {(talentPage > 1 || talent.length > 24) && <nav aria-label="구직 프로필 페이지" className="flex gap-3 text-sm font-bold text-pul-point">
              {talentPage > 1 && <Link className="inline-flex min-h-11 items-center" href={`/certification?tab=activity&talentPage=${talentPage - 1}`}>이전</Link>}
              {talent.length > 24 && <Link className="inline-flex min-h-11 items-center" href={`/certification?tab=activity&talentPage=${talentPage + 1}`}>다음</Link>}
            </nav>}
          </section> : null}
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
        {secondPromotion ? (
          <div className="mt-5 lg:mt-8">
            {secondPromotion}
          </div>
        ) : null}
      </Container>
    </div>
  );
}
