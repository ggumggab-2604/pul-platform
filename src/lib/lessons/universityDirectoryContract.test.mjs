import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260924000100_pul_lesson_university_directory_foundation.sql");
const correction = read("../../../supabase/migrations/20260924000200_pul_lesson_university_management_read_volatility_fix.sql");
const lessonFoundation = read("../../../supabase/migrations/20260827000100_pul_lesson_directory_foundation.sql");
const publicPage = read("../../app/lessons/page.tsx");
const publicTab = read("../../components/lessons/LessonsUniversityDepartmentsTab.tsx");
const content = read("../../components/lessons/LessonsPageContent.tsx");
const managementPage = read("../../app/lessons/manage/university-departments/page.tsx");
const managementActions = read("../../app/lessons/manage/university-departments/actions.ts");
const managementComponent = read("../../components/lessons/manage/UniversityDepartmentManagementPage.tsx");

const functionBlock = (source, signature) => {
  const start = source.indexOf(`create function ${signature}`);
  assert.notEqual(start, -1, `missing function ${signature}`);
  const end = source.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `unterminated function ${signature}`);
  return source.slice(start, end + 4);
};

test("one forward foundation creates directory and private requests without seed data", () => {
  assert.match(migration, /create table public\.lesson_university_departments/);
  assert.match(migration, /create table public\.lesson_university_department_submission_requests/);
  assert.match(migration, /publication_status in \('published', 'hidden'\)/);
  assert.match(migration, /request_status in \('pending', 'completed', 'closed'\)/);
  assert.doesNotMatch(migration, /insert into public\.lesson_university_departments[\s\S]*?values\s*\([^)]*대학교/i);
  assert.doesNotMatch(migration, /drop table|truncate table/i);
});

test("public read is published-only, paginated, and grants only explicit Data API roles", () => {
  assert.match(migration, /department\.publication_status = 'published'/);
  assert.match(migration, /p_limit not between 1 and 50 or p_offset < 0/);
  assert.match(migration, /revoke all on table public\.lesson_university_departments[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on function public\.list_public_lesson_university_departments\(text, text, integer, integer\)[\s\S]*?grant execute[\s\S]*?to anon, authenticated/);
  assert.match(migration, /security definer\s+set search_path = ''/i);
});

test("operator mutations reuse lessons.manage and keep direct DML closed", () => {
  assert.match(migration, /private\.require_lesson_directory_manager\(\)/);
  assert.doesNotMatch(migration, /insert into public\.platform_permission_definitions|insert into public\.platform_role_permissions/i);
  assert.match(migration, /revoke all on table public\.lesson_university_department_submission_requests[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.mutate_lesson_university_department\(text, text, integer, jsonb\)[\s\S]*?to authenticated/);
  assert.match(migration, /for update/);
  assert.match(migration, /v_department\.version <> p_expected_version/);
});

test("member request is active-account-only, replay-safe, duplicate-safe, and never auto-creates", () => {
  assert.match(migration, /account\.account_status = 'active'/);
  assert.match(migration, /client_request_id uuid not null/);
  assert.match(migration, /request_fingerprint/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /lesson_university_department_requests_pending_duplicate_uidx/);
  const resolver = migration.slice(migration.indexOf("create function public.resolve_lesson_university_department_request"));
  assert.doesNotMatch(resolver, /insert into public\.lesson_university_departments/);
  assert.match(resolver, /request_status = p_resolution/);
});

test("public university tab uses real RPC data and removes runtime mock board and banner dependency", () => {
  assert.match(publicPage, /listPublicUniversityDepartments/);
  assert.match(content, /universityDepartmentPage/);
  assert.match(publicTab, /현재 공개된 대학·학과 정보가 없습니다/);
  assert.match(publicTab, /submitUniversityDepartmentRequestAction/);
  const runtime = [publicPage, publicTab, content].join("\n");
  assert.doesNotMatch(runtime, /universityDepartmentData|departmentBoardPosts|universityRecruitmentBanners|universityDepartments\b/);
  assert.doesNotMatch(publicTab, /게시판|학생 인증|랭킹|구인 배너/);
});

test("management routes expose create-edit-publish-hide and request completion separately", () => {
  assert.match(managementPage, /listUniversityDepartmentsForManagement/);
  assert.match(managementActions, /mutateUniversityDepartmentAction/);
  assert.match(managementActions, /resolveUniversityDepartmentRequestAction/);
  assert.match(managementActions, /"create", "update", "publish", "hide"/);
  assert.match(managementActions, /"completed" && row\.resolution !== "closed"/);
  assert.match(managementActions, /revalidatePath\("\/lessons"\)/);
});

test("management editor stays closed until requested and cancel restores a clean draft without mutation", () => {
  const cancelBlock = managementComponent.slice(
    managementComponent.indexOf("const cancel ="),
    managementComponent.indexOf("const payload ="),
  );
  assert.match(managementComponent, /const \[isEditorOpen, setIsEditorOpen\] = useState\(false\)/);
  assert.match(managementComponent, /ref=\{createTriggerRef\}[\s\S]*?aria-expanded=\{isEditorOpen\}[\s\S]*?aria-controls="university-department-editor"/);
  assert.match(managementComponent, /const create = \(\) => \{ setIsEditorOpen\(true\); setSelectedKey\(null\); setDraft\(emptyDraft\);/);
  assert.match(managementComponent, /const choose = \(item:[\s\S]*?setIsEditorOpen\(true\);[\s\S]*?setDraft\(\{ departmentKey: item\.departmentKey/);
  assert.match(managementComponent, /const cancel = \(\) => \{ setIsEditorOpen\(false\); setSelectedKey\(null\); setDraft\(emptyDraft\); setNotice\(null\); requestAnimationFrame\(\(\) => createTriggerRef\.current\?\.focus\(\{ preventScroll: true \}\)\); \};/);
  assert.match(managementComponent, /\{isEditorOpen \? <section id="university-department-editor"/);
  assert.match(managementComponent, /<button type="button" disabled=\{isPending\} onClick=\{cancel\}[\s\S]*?>취소<\/button>/);
  assert.match(managementComponent, /result\.ok && operation === "create"[\s\S]*?router\.refresh\(\);[\s\S]*?setIsEditorOpen\(false\);[\s\S]*?setDraft\(emptyDraft\)/);
  assert.doesNotMatch(cancelBlock, /mutateUniversityDepartmentAction|run\(/);
});

test("locking management reads are volatile while the public read remains stable", () => {
  const affected = [
    "public.list_lesson_university_departments_for_management(",
    "public.get_lesson_university_department_for_management(",
    "public.list_lesson_university_department_requests_for_management(",
  ];
  for (const signature of affected) {
    const block = functionBlock(migration, signature);
    assert.match(block, /stable\s+security definer/);
    assert.match(block, /private\.require_lesson_directory_manager\(\)/);
  }

  const publicRead = functionBlock(migration, "public.list_public_lesson_university_departments(");
  assert.match(publicRead, /stable\s+security definer/);
  assert.doesNotMatch(publicRead, /private\.require_lesson_directory_manager\(\)/);
  assert.match(
    functionBlock(lessonFoundation, "private.require_lesson_directory_manager()"),
    /for share of account/,
  );
});

test("correction changes exactly the three locking management read signatures to volatile", () => {
  const altered = [...correction.matchAll(/alter function\s+([\s\S]*?\))\s+volatile;/gi)]
    .map((match) => match[1].replace(/\s+/g, " ").trim());
  assert.deepEqual(altered, [
    "public.list_lesson_university_departments_for_management( text, text, integer, integer )",
    "public.get_lesson_university_department_for_management(text)",
    "public.list_lesson_university_department_requests_for_management( text, integer, integer )",
  ]);
  assert.doesNotMatch(correction, /create(?: or replace)? function|\btable\b|\bpolicy\b|\bgrant\b|\brevoke\b/i);
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "d473a3db6c0b1b6b08193733502cee0dbc8ed4ba88e4cf86dc222889d2d61b21",
  );
});
