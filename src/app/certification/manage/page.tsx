import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CertificationDirectoryManagementPage,
  type CertificationManagementSection,
} from "@/components/certification/manage/CertificationDirectoryManagementPage";
import { Container } from "@/components/ui/Container";
import {
  CertificationDirectoryError,
  getCertificationCourseForManagement,
  getCertificationExamScheduleForManagement,
  getCertificationJobForManagement,
  listCertificationCoursesForManagement,
  listCertificationExamSchedulesForManagement,
  listCertificationJobsForManagement,
  type CertificationPage,
  type CertificationPublicationStatus,
  type ManagedCertificationJob,
  type ManagedExamSchedule,
  type ManagedQualificationCourse,
} from "@/lib/certification/certificationDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "자격증·심판 운영 관리",
  description: "교육과정·시험 일정·심판 및 관련 구인 정보 운영",
};

type Search = {
  tab?: string | string[];
  q?: string | string[];
  status?: string | string[];
  edit?: string | string[];
  mode?: string | string[];
};

type LoadedManagementPage =
  | { section: "courses"; page: CertificationPage<ManagedQualificationCourse>; editing: ManagedQualificationCourse | null; editorError: string }
  | { section: "exams"; page: CertificationPage<ManagedExamSchedule>; editing: ManagedExamSchedule | null; editorError: string }
  | { section: "jobs"; page: CertificationPage<ManagedCertificationJob>; editing: ManagedCertificationJob | null; editorError: string };

const keyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const publicationStatuses = new Set<CertificationPublicationStatus>([
  "published", "hidden", "removed",
]);

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function section(value: string): CertificationManagementSection {
  return value === "exams" || value === "jobs" ? value : "courses";
}

function AccessMessage({ loadFailed }: { loadFailed: boolean }) {
  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-3xl px-3 py-12">
        <div className="rounded-2xl border border-pul-border bg-white p-7 text-center">
          <h1 className="text-2xl font-black text-foreground">
            {loadFailed ? "운영 정보를 불러오지 못했습니다." : "자격증·심판 정보 운영 권한이 없습니다."}
          </h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">
            {loadFailed
              ? "잠시 후 다시 시도해 주세요. 문제가 계속되면 운영 환경을 확인해 주세요."
              : "이 화면은 active 자격증·심판 정보 운영자만 이용할 수 있습니다."}
          </p>
          <Link
            href="/certification"
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-pul-deep px-5 font-bold text-white"
          >
            자격증·심판으로 돌아가기
          </Link>
        </div>
      </Container>
    </main>
  );
}

export default async function CertificationManagementRoute({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/certification/manage");

  const search = await searchParams;
  const activeSection = section(one(search.tab));
  const keyword = one(search.q).trim().slice(0, 100);
  const requestedStatus = one(search.status) as CertificationPublicationStatus;
  const publicationStatus = publicationStatuses.has(requestedStatus) ? requestedStatus : undefined;
  const requestedEdit = one(search.edit).trim();
  const editKey = keyPattern.test(requestedEdit) ? requestedEdit : null;
  const createMode = one(search.mode) === "new";
  const filters = { keyword: keyword || undefined, publicationStatus };

  let loaded: LoadedManagementPage | null = null;
  let loadFailed: boolean | null = null;
  try {
    if (activeSection === "exams") {
      const page = await listCertificationExamSchedulesForManagement(
        context.supabase,
        filters,
        30,
        0,
      );
      let editing: ManagedExamSchedule | null = null;
      let editorError = "";
      if (!createMode && editKey) {
        try {
          editing = await getCertificationExamScheduleForManagement(context.supabase, editKey);
        } catch (error) {
          editorError = error instanceof CertificationDirectoryError
            ? error.userMessage
            : "시험 일정 상세 정보를 불러오지 못했습니다.";
        }
      }
      loaded = { section: "exams", page, editing, editorError };
    } else if (activeSection === "jobs") {
      const page = await listCertificationJobsForManagement(context.supabase, filters, 30, 0);
      let editing: ManagedCertificationJob | null = null;
      let editorError = "";
      if (!createMode && editKey) {
        try {
          editing = await getCertificationJobForManagement(context.supabase, editKey);
        } catch (error) {
          editorError = error instanceof CertificationDirectoryError
            ? error.userMessage
            : "구인 상세 정보를 불러오지 못했습니다.";
        }
      }
      loaded = { section: "jobs", page, editing, editorError };
    } else {
      const page = await listCertificationCoursesForManagement(context.supabase, filters, 30, 0);
      let editing: ManagedQualificationCourse | null = null;
      let editorError = "";
      if (!createMode && editKey) {
        try {
          editing = await getCertificationCourseForManagement(context.supabase, editKey);
        } catch (error) {
          editorError = error instanceof CertificationDirectoryError
            ? error.userMessage
            : "과정 상세 정보를 불러오지 못했습니다.";
        }
      }
      loaded = { section: "courses", page, editing, editorError };
    }
  } catch (error) {
    loadFailed = !(error instanceof CertificationDirectoryError && error.code === "permission");
  }

  if (loadFailed !== null || loaded === null) {
    return <AccessMessage loadFailed={loadFailed ?? true} />;
  }

  if (loaded.section === "exams") {
    return (
      <CertificationDirectoryManagementPage
        section="exams"
        page={loaded.page}
        keyword={keyword}
        publicationStatus={publicationStatus ?? ""}
        editorMode={createMode ? "create" : loaded.editing ? "edit" : "none"}
        editing={loaded.editing}
        editorError={loaded.editorError}
      />
    );
  }
  if (loaded.section === "jobs") {
    return (
      <CertificationDirectoryManagementPage
        section="jobs"
        page={loaded.page}
        keyword={keyword}
        publicationStatus={publicationStatus ?? ""}
        editorMode={createMode ? "create" : loaded.editing ? "edit" : "none"}
        editing={loaded.editing}
        editorError={loaded.editorError}
      />
    );
  }
  return (
    <CertificationDirectoryManagementPage
      section="courses"
      page={loaded.page}
      keyword={keyword}
      publicationStatus={publicationStatus ?? ""}
      editorMode={createMode ? "create" : loaded.editing ? "edit" : "none"}
      editing={loaded.editing}
      editorError={loaded.editorError}
    />
  );
}
