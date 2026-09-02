import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260825000100_pul_course_directory_foundation.sql");
const hardening = read("../../../supabase/migrations/20260927000100_pul_course_information_report_hardening.sql");
const client = read("./courseDirectory.ts");
const listPage = read("../../app/courses/page.tsx");
const detailPage = read("../../app/courses/[id]/page.tsx");
const explorer = read("../../components/courses/CourseMapExplorer.tsx");
const reportDialog = read("../../components/courses/CourseInformationReportDialog.tsx");
const fieldDetail = read("../../components/courses/detail/FieldCourseDetailContent.tsx");
const screenDetail = read("../../components/courses/detail/ScreenCourseDetailContent.tsx");
const clubSections = read("../../components/clubs/detail/ClubDetailSections.tsx");
const normalized = migration.replace(/\s+/g, " ").trim();

test("creates the minimal course directory and private report intake", () => {
  for (const table of ["courses", "course_information_reports"]) {
    assert.match(normalized, new RegExp(`create table public\\.${table} \\(`));
    assert.match(normalized, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(normalized, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`));
  }
  assert.match(normalized, /constraint courses_course_key_uidx unique \(course_key\)/);
  assert.match(normalized, /course_type in \('field', 'screen'\)/);
  assert.match(normalized, /operation_code in \('reservation', 'phone', 'walkIn'\)/);
  assert.match(normalized, /course_status in \('active', 'inactive', 'removed'\)/);
  assert.match(normalized, /report_type in \('new_course', 'correction'\)/);
  assert.match(normalized, /report_status in \('received', 'handled', 'dismissed'\)/);
  assert.doesNotMatch(migration, /insert into public\.courses/);
});

test("public reads expose active courses only and reports remain authenticated-only", () => {
  assert.match(normalized, /create policy courses_public_active_select on public\.courses for select to anon, authenticated using \(course_status = 'active'\)/);
  assert.match(normalized, /grant execute on function public\.list_public_courses\(text, text, text, text, text, text\[\], integer, integer\) to anon, authenticated/);
  assert.match(normalized, /grant execute on function public\.get_public_course\(text\) to anon, authenticated/);
  assert.match(hardening.replace(/\s+/g, " "), /grant execute on function public\.submit_course_information_report\( uuid, text, text, text, text, text, text, text, text \) to authenticated/);
  assert.match(migration, /where course\.course_status = 'active'/);
  assert.doesNotMatch(migration.slice(migration.indexOf("create function public.list_public_courses"), migration.indexOf("create function public.submit_course_information_report")), /reporter_user_id|email|user_id/);
});

test("report hardening uses structured targets, canonical replay, and received-only deduplication", () => {
  const sql = hardening.replace(/\s+/g, " ").trim();
  assert.match(sql, /add column correction_target text, add column submit_request_id uuid/);
  assert.match(sql, /unique \(reporter_user_id, submit_request_id\)/);
  assert.match(sql, /create unique index course_information_reports_one_received_correction_target_idx on public\.course_information_reports \( reporter_user_id, target_course_id, correction_target \) where report_type = 'correction' and report_status = 'received'/);
  assert.match(sql, /private\.course_claim_request\( v_actor_id, p_request_id, 'course\.information_report\.submit', v_payload \)/);
  assert.match(sql, /private\.course_complete_request\(v_actor_id, p_request_id, v_result\)/);
  assert.match(sql, /on delete set null/);
  assert.match(sql, /report_status in \('handled', 'dismissed'\) and resolved_at is not null/);
  assert.doesNotMatch(hardening, /update\s+public\.courses|insert\s+into\s+public\.courses|delete\s+from\s+public\.courses/i);
});

test("list contract implements server filters and bounded pagination", () => {
  for (const parameter of ["p_keyword", "p_course_type", "p_region", "p_operation_code", "p_holes", "p_feature_codes", "p_limit", "p_offset"]) assert.match(migration, new RegExp(parameter));
  assert.match(migration, /p_limit not between 1 and 50/);
  assert.match(migration, /course\.feature_codes @> array_remove\(p_feature_codes, 'parking'\)/);
  assert.match(migration, /p_offset \+ p_limit < v_total/);
  assert.match(client, /exactKeys\(value, courseKeys\)/);
  assert.match(client, /p_feature_codes: valid\.features/);
});

test("actual course routes no longer use static course content sources", () => {
  for (const source of [listPage, detailPage, explorer, fieldDetail, screenDetail]) {
    assert.doesNotMatch(source, /courseMapItems|getCourseDetailPageData|courseDetailPageData/);
  }
  assert.match(listPage, /listPublicCourses/);
  assert.match(detailPage, /getPublicCourse/);
  assert.match(detailPage, /course\.courseType === "screen"/);
  assert.match(fieldDetail, /expectedType="field"/);
  assert.match(screenDetail, /expectedType="screen"/);
});

test("stable public keys preserve detail and club linked-course routes", () => {
  assert.match(detailPage, /getCourseByKey\(id\)/);
  assert.match(explorer, /`\/courses\/\$\{course\.courseKey\}`/);
  assert.match(clubSections, /getHomeCourseHref\(event\.linkedCourseId\)/);
  assert.match(clubSections, /getHomeCourseHref\(club\.homeCourseId\)/);
});

test("report dialog has privacy guidance, login gate, and accessible modal behavior", () => {
  assert.match(reportDialog, /role="dialog"/);
  assert.match(reportDialog, /aria-modal="true"/);
  assert.match(reportDialog, /event\.key === "Escape"/);
  assert.match(reportDialog, /event\.key !== "Tab"/);
  assert.match(reportDialog, /firstRef\.current\?\.focus/);
  assert.match(reportDialog, /trigger\?\.isConnected/);
  assert.match(reportDialog, /개인 전화번호·주민번호/);
  assert.match(reportDialog, /\/login\?next=\/courses/);
  assert.match(reportDialog, /수정 대상/);
  assert.match(reportDialog, /crypto\.randomUUID\(\)/);
  assert.match(reportDialog, /requestIdRef\.current/);
  assert.match(reportDialog, /requestGenerationRef\.current/);
  assert.match(reportDialog, /submittingRef\.current/);
  assert.doesNotMatch(reportDialog, /SUPABASE_SERVICE_ROLE_KEY/);
});
