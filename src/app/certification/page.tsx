import Link from "next/link";
import { examVenues, trainingInstitutions } from "@/data/certificationSources";
import { listPracticalMaterials } from "@/lib/certification/practicalMaterials";
import { getPublicCourse, listPublicCourses } from "@/lib/courses/courseDirectory";
import { listPublicUniversityDepartments } from "@/lib/lessons/universityDirectory";
import type { OralSubmission, TalentProfile } from "@/lib/certification/certificationPhaseOne";
import { certificationActivityDetailHref, certificationActivityListHref, certificationActivityPage, readCertificationActivityFilters, type CertificationJobActivity } from "@/lib/certification/certificationJobActivity";
import { readExamPrep } from "@/lib/certification/examPrepSelection";
import { certificationCourseDetailHref, certificationCourseListHref, certificationCoursePage } from "@/lib/certification/certificationCourseComparison";
import { CertificationPageContent } from "@/components/certification/CertificationPageContent";
import { CertificationRefereeBoard } from "@/components/certification/CertificationRefereeBoard";
import { refereeTopic } from "@/lib/certification/refereeGuide";
import { CertificationPageHero } from "@/components/certification/CertificationPageHero";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { Container } from "@/components/ui/Container";
import type {
  CourseCategory,
  CourseMethod,
  CourseStatus,
  ProviderType,
} from "@/data/certificationData";
import {
  CertificationDirectoryError,
  listPublicCertificationCourseComparisons,
  listPublicCertificationExamSchedules,
  listPublicCertificationJobActivity,
  type CertificationCourseFilters,
  type CertificationPage,
  type PublicExamSchedule,
  type PublicCertificationCourseComparison,
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

async function findExamCourse(client: Awaited<ReturnType<typeof createClient>>, venue: (typeof examVenues)[keyof typeof examVenues]) {
  const matchesVenue = (course: { name: string; address: string; courseType: string }) =>
    course.courseType === "field" && course.address.includes(venue.locality)
    && venue.names.some((name) => name.replace(/\s+/g, "") === course.name.replace(/\s+/g, ""));

  if (venue.courseKey) {
    const course = await getPublicCourse(client, venue.courseKey).catch(() => null);
    if (course && matchesVenue(course)) return course;
  }

  const { items } = await listPublicCourses(client, { keyword: venue.keyword, courseType: "field" });
  const matches = items.filter(matchesVenue);
  return matches.length === 1 ? matches[0] : undefined;
}

async function loadCourseComparisonPage(client: Awaited<ReturnType<typeof createClient>>, filters: CertificationCourseFilters, page: number) {
  const result = await listPublicCertificationCourseComparisons(client, filters, 24, (page - 1) * 24);
  if (!result.page.items.length && result.page.total > 0 && page > 1) {
    return listPublicCertificationCourseComparisons(client, filters, 24, Math.floor((result.page.total - 1) / 24) * 24);
  }
  return result;
}

async function renderCertificationPromotion(
  client: Awaited<ReturnType<typeof createClient>>,
  promotion: ActiveSlotPromotion | null,
  courseReturn?: string,
) {
  if (!promotion) return null;

  let courseHref: string | undefined;
  if (promotion.contentKind === "advertisement" && promotion.detailSlug) {
    const { data, error } = await client.rpc("certification_promotion_course", { p_slug: promotion.detailSlug });
    if (error) return null;
    if (data !== null) {
      if (typeof data?.course_key !== "string") return null;
      courseHref = certificationCourseDetailHref(data.course_key, courseReturn);
    }
  }
  if (courseReturn && promotion.contentKind === "advertisement") {
    const captionAction = courseHref ? "광고 과정 보기"
      : promotion.linkType === "external" ? "광고 사이트 열기"
      : promotion.linkType === "internal_detail" ? "광고 자세히 보기" : "";
    return (
      <aside aria-label="유료 광고" data-slot="certification.top.01" className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 sm:p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">유료 광고</span>
          {!courseHref && promotion.linkType === "external" && promotion.externalUrl && (
            <span className="text-xs text-pul-muted">새 탭에서 열림</span>
          )}
        </div>
        <PromotionBanner promotion={promotion} variant="horizontal" internalHref={courseHref} captionAction={captionAction} />
      </aside>
    );
  }
  return <PromotionBanner promotion={promotion} variant="horizontal" internalHref={courseHref} badgeLabel={courseHref ? "유료 광고" : undefined} />;
}

export default async function CertificationPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selectedTab = activeTab(first(params.tab));
  const coursePageNumber = certificationCoursePage(first(params.coursePage));
  const examPageNumber = Math.min(100000, positivePage(first(params.examPage)));
  const topic = refereeTopic(first(params.refereeTopic));
  const refereePageNumber = Math.min(100000, positivePage(first(params.refereePage)));
  const readParam = (key: string) => first(params[key]);
  const jobPageNumber = certificationActivityPage(readParam("jobPage"));
  const courseFilters: CertificationCourseFilters = {
    keyword: first(params.courseKeyword),
    category: first(params.courseCategory) as CourseCategory | undefined,
    providerType: (first(params.courseProviderType) ?? first(params.courseProvider)) as ProviderType | undefined,
    region: first(params.courseRegion),
    method: first(params.courseMethod) as CourseMethod | undefined,
    status: first(params.courseStatus) as CourseStatus | undefined,
  };
  const jobFilters = readCertificationActivityFilters(readParam);
  const client = await createClient();
  const exam = readExamPrep({ get: (key) => first(params[key]) ?? null });
  const { stage } = exam;
  const venue = selectedTab === "exam-prep" && stage === "practical" && exam.venue ? examVenues[exam.venue] : undefined;
  const talentPage = certificationActivityPage(readParam("talentPage"), 1000);
  const loadJobs = async () => {
    const result = await listPublicCertificationJobActivity(client, jobFilters, 24, (jobPageNumber - 1) * 24);
    const lastPage = Math.max(1, Math.ceil(result.page.total / result.page.limit));
    return jobPageNumber <= lastPage ? result
      : result.page.total > 0 ? listPublicCertificationJobActivity(client, jobFilters, 24, (lastPage - 1) * 24)
      : { ...result, page: emptyPage<CertificationJobActivity>(0) };
  };
  const [coursesResult, examsResult, jobsResult, studyResult, promotionResult, venues, universities, oralResult, talentResult] = await Promise.allSettled([
    selectedTab === "courses"
      ? loadCourseComparisonPage(client, courseFilters, coursePageNumber)
      : null,
    selectedTab === "guide"
      ? listPublicCertificationExamSchedules(client, { examType: "park_referee" }, 24, (examPageNumber - 1) * 24)
      : Promise.resolve(emptyPage<PublicExamSchedule>((examPageNumber - 1) * 24)),
    selectedTab === "activity"
      ? loadJobs()
      : null,
    selectedTab === "exam-prep"
      ? listPublicCertificationStudyPosts(client, STUDY_PREVIEW_LIMIT, 0)
      : Promise.resolve(emptyStudyPage()),
    loadActivePromotionsForSlots(client, ["certification.top.01", "certification.after_content.01"]),
    venue ? findExamCourse(client, venue) : undefined,
    selectedTab === "exam-prep" && stage === "training" && exam.year === "2026" && exam.key === "life2" ? Promise.all(trainingInstitutions.map(async (institution) => {
      const name = institution.name.replace("(서울)", "");
      const departments = await listPublicUniversityDepartments(client, name).catch(() => null);
      const matches = departments?.items.filter((item) => item.universityName === name || item.universityName === institution.name);
      return [institution.key, matches?.length === 1 ? matches[0].departmentKey : ""];
    })) : [],
    selectedTab === "exam-prep" && stage === "oral" ? client.rpc("certification_oral", { p_manage: false }) : null,
    selectedTab === "activity" ? client.rpc("certification_profiles", { p_id: null, p_own: false, p_offset: (talentPage - 1) * 24 }) : null,
  ]);
  const courseKey = venues.status === "fulfilled" ? venues.value?.courseKey : undefined;
  const oral = oralResult.status === "fulfilled" && oralResult.value?.data ? oralResult.value.data as OralSubmission[] : [];
  const talent = talentResult.status === "fulfilled" && talentResult.value?.data ? talentResult.value.data as TalentProfile[] : [];
  const talentError = talentResult.status === "rejected" || Boolean(talentResult.value?.error);
  const oralError = oralResult.status === "rejected" || Boolean(oralResult.value?.error);

  const courseComparison = coursesResult.status === "fulfilled" ? coursesResult.value : null;
  const coursePage = courseComparison?.page ?? emptyPage<PublicCertificationCourseComparison>(0);
  const courseReturn = certificationCourseListHref(
    (key) => first(params[key]),
    Math.min(Math.floor(coursePage.offset / 24) + 1, Math.max(1, Math.ceil(coursePage.total / 24))),
  );
  const examPage: CertificationPage<PublicExamSchedule> =
    examsResult.status === "fulfilled"
      ? examsResult.value
      : emptyPage((examPageNumber - 1) * 24);
  const activity = jobsResult.status === "fulfilled" ? jobsResult.value : null;
  const jobPage = activity?.page ?? emptyPage<CertificationJobActivity>(0);
  const currentJobPage = Math.floor(jobPage.offset / jobPage.limit) + 1;
  const activityReturn = certificationActivityListHref(readParam, currentJobPage, talentPage);
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

  const [topPromotion, secondPromotion, materialsResult] = await Promise.all([
    renderCertificationPromotion(client, promotion, selectedTab === "courses" ? courseReturn : undefined),
    renderCertificationPromotion(client, afterContentPromotion),
    courseKey ? listPracticalMaterials(client, courseKey, exam.course, Number(exam.materialPage), exam.materialKind).then((data) => ({ data, error: false })).catch(() => ({ data: undefined, error: true })) : undefined,
  ]);

  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <CertificationPageHero showProfileAction={selectedTab === "activity"} />
      </Container>
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <CertificationPageContent
          activeTab={selectedTab}
          examResources={{
            courseKey,
            courseMaterials: materialsResult?.data,
            materialsError: materialsResult?.error ?? false,
            universityKeys: Object.fromEntries(universities.status === "fulfilled" ? universities.value : []),
            oral, oralError,
          }}
          banner={topPromotion}
          talentList={selectedTab === "activity" ? <section id="certification-talent" aria-labelledby="certification-talent-title" className="scroll-mt-40 space-y-3 rounded-xl border border-pul-border bg-white p-4">
            <h2 id="certification-talent-title" className="text-lg font-bold text-pul-deep">공개 구직 프로필</h2>
            {talentError ? <p role="alert">공개 구직 프로필을 불러오지 못했습니다.</p> : talent.length ? <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {talent.slice(0,24).map((profile) => <li key={profile.id} className="min-w-0 rounded-lg border border-pul-border p-3">
                <Link prefetch={false} href={certificationActivityDetailHref("talent", profile.id, activityReturn)} className="inline-flex min-h-11 items-center break-all font-bold text-pul-point underline">{profile.nickname}</Link>
                <p className="break-words text-sm">{profile.qualification} · {profile.issuer} · {profile.grade}</p>
                <p className="break-words text-sm text-pul-muted">{profile.region} · 본인 등록 자격</p>
              </li>)}
            </ul> : <p className="rounded-lg border border-dashed border-pul-border px-3 py-6 text-center text-sm text-pul-muted">{talentPage > 1 ? "이 페이지에 공개 구직 프로필이 없습니다." : "공개된 구직 프로필이 없습니다."}</p>}
            {(talentPage > 1 || talent.length > 24) && <nav aria-label="구직 프로필 페이지" className="flex gap-3 text-sm font-bold text-pul-point">
              {talentPage > 1 && <Link className="inline-flex min-h-11 items-center" href={certificationActivityListHref(readParam, currentJobPage, talentPage - 1) + "#certification-talent"}>이전</Link>}
              {talent.length > 24 && <Link className="inline-flex min-h-11 items-center" href={certificationActivityListHref(readParam, currentJobPage, talentPage + 1) + "#certification-talent"}>다음</Link>}
            </nav>}
          </section> : null}
          coursePage={coursePage}
          courseReturn={courseReturn}
          hasPublicCourses={courseComparison?.hasPublicCourses ?? false}
          examPage={examPage}
          jobPage={jobPage}
          activityReturn={activityReturn}
          hasPublicJobs={activity?.hasPublicJobs ?? false}
          studyPage={studyPage}
          courseFilters={courseFilters}
          refereeBoard={selectedTab === "guide" ? <CertificationRefereeBoard client={client} topic={topic} pageNumber={refereePageNumber} /> : null}
          today={new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short" }).format()}
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
