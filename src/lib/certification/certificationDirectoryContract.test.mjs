import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260828000100_pul_certification_directory_foundation.sql");
const page = read("../../app/certification/page.tsx");
const content = read("../../components/certification/CertificationPageContent.tsx");
const courseCard = read("../../components/certification/CertificationCourseCard.tsx");
const courses = read("../../components/certification/CertificationCoursesTab.tsx");
const exams = read("../../components/certification/CertificationExamScheduleSection.tsx");
const jobCard = read("../../components/certification/CertificationJobCard.tsx");
const jobs = read("../../components/certification/CertificationActivityTab.tsx");
const modal = read("../../components/certification/CertificationDirectoryModal.tsx");
const prep = read("../../components/certification/CertificationExamPrepTab.tsx");

test("directory tables keep stable keys, publication state, and no unverified product seed", () => {
  for (const table of ["certification_courses", "certification_exam_schedules", "certification_jobs"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
  }
  assert.match(migration, /constraint certification_courses_course_key_uidx unique \(course_key\)/);
  assert.match(migration, /constraint certification_exam_schedules_schedule_key_uidx unique \(schedule_key\)/);
  assert.match(migration, /constraint certification_jobs_job_key_uidx unique \(job_key\)/);
  assert.match(migration, /publication_status in \('published', 'hidden', 'removed'\)/);
  const beforeMutations = migration.split("create function public.mutate_certification_course")[0];
  assert.doesNotMatch(beforeMutations, /insert into public\.(certification_courses|certification_exam_schedules|certification_jobs)/i);
});

test("public read contracts are security-definer, paginated, and published-only", () => {
  for (const signature of [
    "list_public_certification_courses(text, text, text, text, text, text, integer, integer)",
    "get_public_certification_course(text)",
    "list_public_certification_exam_schedules(text, text, integer, integer)",
    "list_public_certification_jobs(text, text, text, integer, integer)",
    "get_public_certification_job(text)",
  ]) {
    const name = signature.slice(0, signature.indexOf("("));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?\\)[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?\\)[\\s\\S]*?to anon, authenticated`));
  }
  assert.equal((migration.match(/publication_status = 'published'/g) ?? []).length >= 6, true);
  assert.equal((migration.match(/p_limit not between 1 and 50 or p_offset < 0/g) ?? []).length, 3);
});

test("operator mutations reuse active platform permission and close raw DML", () => {
  assert.match(migration, /values \(\s*'certification\.manage'/);
  assert.match(migration, /values \('platform_admin', 'certification\.manage'\)/);
  assert.match(migration, /mapping\.permission_code = 'certification\.manage'/);
  assert.match(migration, /for share of account/);
  assert.equal((migration.match(/for update/g) ?? []).length >= 3, true);
  for (const table of ["certification_courses", "certification_exam_schedules", "certification_jobs"]) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`));
  }
  for (const name of ["mutate_certification_course", "mutate_certification_exam_schedule", "mutate_certification_job"]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(text, text, integer, jsonb\\)[\\s\\S]*?to authenticated`));
  }
});

test("official links use HTTPS validation and public job DTO excludes member-private fields", () => {
  assert.equal(migration.includes("and p_url ~ '^https://[A-Za-z0-9][^[:space:]]*$'"), true);
  assert.match(migration, /private\.valid_certification_external_url\(official_url\)/);
  const jobDto = migration.slice(
    migration.indexOf("create function private.public_certification_job_json"),
    migration.indexOf("revoke all on function private.public_certification_job_json"),
  );
  assert.doesNotMatch(jobDto, /auth_user_id|email|phone|profile_metadata/);
  assert.match(jobDto, /organizer_name/);
  assert.match(jobDto, /application_url/);
});

test("certification runtime reads RPC data and does not consume course, schedule, job, or talent mocks", () => {
  assert.match(page, /listPublicCertificationCourses/);
  assert.match(page, /listPublicCertificationExamSchedules/);
  assert.match(page, /listPublicCertificationJobs/);
  for (const source of [page, content, courses, exams, jobs]) {
    assert.doesNotMatch(source, /qualificationCourses|examSchedules|refereeJobPosts|refereeTalentProfiles/);
  }
  assert.match(courses, /현재 등록된 교육과정이 없습니다/);
  assert.match(exams, /현재 등록된 공식 시험 일정이 없습니다/);
  assert.match(jobs, /현재 등록된 심판·강사 모집 공고가 없습니다/);
  assert.match(jobs, /구직 프로필 기능은 준비 중입니다/);
  assert.match(jobs, /자격을 인증하거나 활동점수를 운영하지 않습니다/);
});

test("UI keeps accessible modal and honest external-only directory semantics", () => {
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /previousFocus\?\.focus/);
  assert.match(modal, /target="_blank"/);
  assert.match(modal, /rel="noopener noreferrer"/);
  assert.match(content, /주관기관 사이트에서 확인/);
  assert.match(content, /공식 모집 페이지에서 확인/);
  assert.match(prep, /시험 준비 이야기방은 실제 회원 글입니다/);
  assert.doesNotMatch(prep, /학습용 예시|examPrepBoardPosts|ViewModalDialog|TODO/);
  assert.doesNotMatch([page, content, courses, exams, jobs, modal].join("\n"), /결제하기|PUL 신청 완료|자격 인증 완료|PUL 활동 점수/);
});

test("public UI supplements existing schedule text with strict typed-date fields", () => {
  assert.match(courseCard, /course\.schedule/);
  assert.match(courseCard, /course\.startsOn/);
  assert.match(courseCard, /course\.endsOn/);
  assert.match(courseCard, /확정 일정/);
  assert.match(exams, /schedule\.applicationStartsOn/);
  assert.match(exams, /schedule\.applicationEndsOn/);
  assert.match(exams, /schedule\.examOn/);
  assert.match(exams, /schedule\.resultOn/);
  assert.match(exams, /schedule\.applicationPeriod/);
  assert.match(exams, /schedule\.examDate/);
  assert.match(jobCard, /job\.schedule/);
  assert.match(jobCard, /job\.applicationStartsOn/);
  assert.match(jobCard, /job\.applicationEndsOn/);
  assert.match(content, /selectedCourse\.schedule/);
  assert.match(content, /selectedJob\.schedule/);
  assert.doesNotMatch([courseCard, exams, jobCard, content].join("\n"), /new Date|Date\.parse|toISOString/);
});
