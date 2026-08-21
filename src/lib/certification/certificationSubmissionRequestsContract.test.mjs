import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const migration = read("supabase/migrations/20260905000100_pul_certification_submission_requests.sql");
const action = read("src/app/certification/actions.ts");
const content = read("src/components/certification/CertificationPageContent.tsx");
const courses = read("src/components/certification/CertificationCoursesTab.tsx");
const activity = read("src/components/certification/CertificationActivityTab.tsx");
const dialog = read("src/components/certification/CertificationSubmissionRequestDialog.tsx");
const managementRoute = read("src/app/certification/manage/requests/page.tsx");
const managementAction = read("src/app/certification/manage/requests/actions.ts");

test("small certification request table has two types and three simple states", () => {
  assert.match(migration, /create table public\.certification_submission_requests/);
  assert.match(migration, /request_type in \('course_registration', 'job_registration'\)/);
  assert.match(migration, /request_status in \('pending', 'resolved', 'dismissed'\)/);
  assert.match(migration, /request_key ~ '\^\[0-9a-f\]\{32\}\$'/);
  assert.doesNotMatch(migration, /reviewer|evidence|ledger|appeal|assignment/i);
});

test("request table is RPC-only under forced RLS", () => {
  assert.match(migration, /alter table public\.certification_submission_requests enable row level security/);
  assert.match(migration, /alter table public\.certification_submission_requests force row level security/);
  assert.match(migration, /revoke all on table public\.certification_submission_requests\s+from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /create policy .*certification_submission_requests/i);
});

test("all narrow SECURITY DEFINER RPCs use explicit ACLs and the existing manager helper", () => {
  for (const signature of [
    "submit_certification_submission_request(text, text, text, text, text, text)",
    "list_certification_submission_requests_for_management(text, integer, integer)",
    "resolve_certification_submission_request(text, text)",
  ]) {
    const escaped = signature.replace(/[()[\]]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped}[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}[\\s\\S]*?to authenticated`));
  }
  assert.equal((migration.match(/security definer\s+set search_path = ''/g) ?? []).length, 3);
  assert.match(migration, /list_certification_submission_requests_for_management[\s\S]*?private\.require_certification_directory_manager\(\)/);
  assert.match(migration, /resolve_certification_submission_request[\s\S]*?private\.require_certification_directory_manager\(\)/);
});

test("member submit validates active account and returns no internal UUID", () => {
  const submit = migration.split("create function public.submit_certification_submission_request")[1]
    .split("create function public.list_certification_submission_requests_for_management")[0];
  assert.match(submit, /account\.account_status[\s\S]*?for share/);
  assert.match(submit, /v_account_status is distinct from 'active'/);
  assert.match(submit, /'request_key', v_request\.request_key[\s\S]*?'request_status', v_request\.request_status/);
  assert.doesNotMatch(submit, /jsonb_build_object\([\s\S]*?'(?:id|requester_user_id|resolved_by)'/);
});

test("management DTO is privacy-minimized and resolution never mutates the directory", () => {
  const list = migration.split("create function public.list_certification_submission_requests_for_management")[1]
    .split("create function public.resolve_certification_submission_request")[0];
  for (const forbidden of ["'id'", "'requester_user_id'", "'resolved_by'"]) {
    assert.doesNotMatch(list, new RegExp(forbidden));
  }
  const resolution = migration.split("create function public.resolve_certification_submission_request")[1];
  assert.match(resolution, /v_request\.request_status <> 'pending'/);
  assert.match(resolution, /update public\.certification_submission_requests/);
  assert.doesNotMatch(resolution, /mutate_certification_|update public\.certification_(?:courses|jobs)|insert into public\.certification_(?:courses|jobs)/);
});

test("both visible registration actions open the real accessible type-aware dialog", () => {
  assert.match(courses, /onRegister\(event\.currentTarget\)/);
  assert.match(activity, /onJobRegister\(event\.currentTarget\)/);
  assert.match(content, /CertificationSubmissionRequestDialog/);
  assert.match(content, /requestType: "course_registration"/);
  assert.match(content, /requestType: "job_registration"/);
  assert.doesNotMatch(content, /등록 기능은 준비 중입니다/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /minLength=\{10\}/);
  assert.match(dialog, /maxLength=\{3000\}/);
  assert.match(dialog, /pattern="https:\/\/\.\*"/);
  assert.match(dialog, /개인 전화번호·주민번호 등 불필요한 개인정보/);
  assert.match(dialog, /trigger\?\.isConnected/);
  assert.match(dialog, /교육과정이나 구인 공고로 자동 게시되지 않습니다/);
  assert.match(action, /submitCertificationSubmissionRequest/);
});

test("operator route authenticates, permission-gates, and offers only simple terminal actions", () => {
  assert.match(managementRoute, /getAuthenticatedSupabaseContext/);
  assert.match(managementRoute, /redirect\(`\/login\?next=\$\{encodeURIComponent\("\/certification\/manage\/requests"\)\}`\)/);
  assert.match(managementRoute, /listCertificationSubmissionRequestsForManagement/);
  assert.match(managementAction, /resolveCertificationSubmissionRequest/);
  assert.match(managementAction, /row\.resolution !== "resolved" && row\.resolution !== "dismissed"/);
});
