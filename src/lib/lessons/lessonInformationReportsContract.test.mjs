import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const migration = read("supabase/migrations/20260903000100_pul_lesson_information_reports.sql");
const action = read("src/app/lessons/actions.ts");
const content = read("src/components/lessons/LessonsPageContent.tsx");
const detail = read("src/components/lessons/LessonDetailModal.tsx");
const dialog = read("src/components/lessons/LessonInformationReportDialog.tsx");
const managementRoute = read("src/app/lessons/manage/reports/page.tsx");
const managementAction = read("src/app/lessons/manage/reports/actions.ts");

test("small report table has only four types and three terminal states", () => {
  assert.match(migration, /create table public\.lesson_information_reports/);
  assert.match(migration, /report_type in \(\s*'incorrect_information',\s*'operation_changed',\s*'inappropriate_content',\s*'other'\s*\)/);
  assert.match(migration, /report_status in \('pending', 'resolved', 'dismissed'\)/);
  assert.match(migration, /report_key ~ '\^\[0-9a-f\]\{32\}\$'/);
  assert.doesNotMatch(migration, /reviewer|evidence|ledger|artificial|moderation|appeal/i);
});

test("report table is RPC-only under forced RLS", () => {
  assert.match(migration, /alter table public\.lesson_information_reports enable row level security/);
  assert.match(migration, /alter table public\.lesson_information_reports force row level security/);
  assert.match(migration, /revoke all on table public\.lesson_information_reports\s+from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /create policy .*lesson_information_reports/i);
});

test("all narrow SECURITY DEFINER RPCs use explicit ACLs and management helper", () => {
  for (const signature of [
    "submit_lesson_information_report(text, text, text)",
    "list_lesson_information_reports_for_management(text, integer, integer)",
    "resolve_lesson_information_report(text, text)",
  ]) {
    const escaped = signature.replace(/[()[\]]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped}[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}[\\s\\S]*?to authenticated`));
  }
  assert.equal((migration.match(/security definer\s+set search_path = ''/g) ?? []).length, 3);
  const management = migration.split("create function public.list_lesson_information_reports_for_management")[1];
  assert.match(management, /private\.require_lesson_directory_manager\(\)/);
  assert.match(management, /create function public\.resolve_lesson_information_report[\s\S]*?private\.require_lesson_directory_manager\(\)/);
});

test("member submit validates active account and published general lesson without exposing UUIDs", () => {
  const submit = migration.split("create function public.submit_lesson_information_report")[1]
    .split("create function public.list_lesson_information_reports_for_management")[0];
  assert.match(submit, /account\.account_status[\s\S]*?for share/);
  assert.match(submit, /v_account_status is distinct from 'active'/);
  assert.match(submit, /lesson\.publication_status = 'published'/);
  assert.match(submit, /lesson\.lesson_type in \('beginner', 'improvement', 'group', 'online'\)/);
  assert.match(submit, /'report_key', v_report\.report_key[\s\S]*?'report_status', v_report\.report_status/);
  assert.doesNotMatch(submit, /jsonb_build_object\([\s\S]*?'(?:id|lesson_id|reporter_user_id|resolved_by)'/);
});

test("management DTO is privacy-minimized and resolution never mutates lessons", () => {
  const list = migration.split("create function public.list_lesson_information_reports_for_management")[1]
    .split("create function public.resolve_lesson_information_report")[0];
  for (const forbidden of ["'id'", "'lesson_id'", "'reporter_user_id'", "'resolved_by'"]) {
    assert.doesNotMatch(list, new RegExp(forbidden));
  }
  const resolution = migration.split("create function public.resolve_lesson_information_report")[1];
  assert.match(resolution, /report\.report_status <> 'pending'/);
  assert.match(resolution, /update public\.lesson_information_reports/);
  assert.doesNotMatch(resolution, /mutate_lesson|update public\.lessons|publication_status/);
});

test("lesson detail opens the real accessible report dialog and preserves login return query", () => {
  assert.match(detail, /onReport\(lesson, event\.currentTarget\)/);
  assert.match(detail, /inert=\{isCovered \|\| undefined\}/);
  assert.match(detail, /if \(isCoveredRef\.current\) return/);
  assert.match(content, /LessonInformationReportDialog/);
  assert.match(content, /currentLessonsPath/);
  assert.doesNotMatch(content, /infoModal === "report"/);
  assert.doesNotMatch(content, /신고 기능은 후속 단계/);
  assert.match(dialog, /레슨 정보 제보하기/);
  assert.match(dialog, /minLength=\{10\}/);
  assert.match(dialog, /maxLength=\{3000\}/);
  assert.match(dialog, /개인 전화번호·주민번호 등 불필요한 개인정보/);
  assert.match(dialog, /\/login\?next=\$\{encodeURIComponent\(nextPath\)\}/);
  assert.match(dialog, /disabled=\{pending\}/);
  assert.match(action, /submitLessonInformationReport/);
});

test("operator route authenticates, permission-gates, and offers only simple terminal actions", () => {
  assert.match(managementRoute, /getAuthenticatedSupabaseContext/);
  assert.match(managementRoute, /redirect\(`\/login\?next=\$\{encodeURIComponent\("\/lessons\/manage\/reports"\)\}`\)/);
  assert.match(managementRoute, /listLessonInformationReportsForManagement/);
  assert.match(managementAction, /resolveLessonInformationReport/);
  assert.match(managementAction, /row\.resolution !== "resolved" && row\.resolution !== "dismissed"/);
});
