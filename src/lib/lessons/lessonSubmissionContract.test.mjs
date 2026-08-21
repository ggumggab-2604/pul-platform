import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const migration = read("supabase/migrations/20260901000100_pul_lesson_submission_request_foundation.sql");
const client = read("src/lib/lessons/lessonSubmission.ts");
const submitPage = read("src/app/lessons/submit/page.tsx");
const submitAction = read("src/app/lessons/submit/actions.ts");
const submitUi = read("src/components/lessons/submit/LessonSubmissionPage.tsx");
const managePage = read("src/app/lessons/manage/requests/page.tsx");
const manageAction = read("src/app/lessons/manage/requests/actions.ts");
const manageUi = read("src/components/lessons/manage/LessonSubmissionManagementPage.tsx");
const lessonPageSources = [
  read("src/components/lessons/LessonsPageShell.tsx"),
  read("src/components/lessons/LessonsPageContent.tsx"),
  read("src/components/lessons/LessonRegisterGuide.tsx"),
  read("src/components/lessons/VideoLessonRegisterGuide.tsx"),
  read("src/data/lessonData.ts"),
  read("src/data/videoLessonData.ts"),
].join("\n");

test("single private request table keeps a deliberately small status model", () => {
  assert.match(migration, /create table public\.lesson_submission_requests/);
  assert.match(migration, /request_type in \('lesson', 'video'\)/);
  assert.match(migration, /request_status in \('pending', 'completed', 'rejected'\)/);
  assert.match(migration, /unique \(requester_user_id, client_request_id\)/);
  assert.doesNotMatch(migration, /history table|reviewer_assignment|evidence|attachment|scoring|approval_level/i);
});

test("raw DML is closed while four narrow security-definer RPCs are authenticated-only", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.lesson_submission_requests[\s\S]*?from public, anon, authenticated, service_role/);
  for (const signature of [
    "submit_lesson_submission_request(uuid, text, jsonb)",
    "list_my_lesson_submission_requests(integer, integer)",
    "list_lesson_submission_requests_for_management(text, integer, integer)",
    "resolve_lesson_submission_request(text, integer, text, text, jsonb, text)",
  ]) {
    const escaped = signature.replace(/[()]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped}[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}[\\s\\S]*?to authenticated`));
  }
  assert.match(migration, /security definer\s+set search_path = ''/);
});

test("submit locks the active actor and provides request UUID replay protection", () => {
  assert.match(migration, /account\.account_status = 'active'[\s\S]*?for share/);
  assert.match(migration, /where request\.requester_user_id = v_actor_id[\s\S]*?request\.client_request_id = p_request_id[\s\S]*?for update/);
  assert.match(migration, /request_fingerprint <> v_fingerprint/);
  assert.match(migration, /on conflict \(requester_user_id, client_request_id\) do nothing/);
  assert.match(client, /data\.replayed/);
  assert.match(submitUi, /requestIdRef\.current \?\? crypto\.randomUUID\(\)/);
});

test("requester DTO excludes identity and processing internals", () => {
  const requesterHelper = migration.split("create function private.lesson_submission_requester_json")[1].split("create function private.lesson_submission_manager_json")[0];
  for (const hidden of ["requester_user_id", "client_request_id", "request_fingerprint", "processed_by", "version"]) {
    assert.doesNotMatch(requesterHelper, new RegExp(`'${hidden}'`));
  }
  assert.match(migration, /where request\.requester_user_id = v_actor_id/);
  assert.match(client, /requesterDisplayName/);
  assert.doesNotMatch(client, /requesterUserId|processedBy|clientRequestId|fingerprint/);
});

test("lesson and video URL rules reuse the existing validators", () => {
  assert.match(migration, /private\.valid_lesson_external_url\(v_source_url\)/);
  assert.match(migration, /private\.valid_lesson_youtube_url\(v_source_url\)/);
  assert.match(submitAction, /isSafeLessonExternalUrl/);
  assert.match(submitAction, /isLessonYoutubeUrl/);
  assert.match(submitUi, /youtube\.com 또는 youtu\.be/);
});

test("operator completion atomically reuses existing hidden directory mutations", () => {
  const resolver = migration.split("create function public.resolve_lesson_submission_request")[1];
  assert.match(resolver, /public\.mutate_lesson\([\s\S]*?'create'/);
  assert.match(resolver, /public\.mutate_lesson_video\([\s\S]*?'create'/);
  assert.match(resolver, /publication_status' <> 'hidden'/);
  assert.match(resolver, /request_status <> 'pending'/);
  assert.match(manageAction, /resolveLessonSubmissionRequest/);
  assert.match(manageUi, /hidden 초안 생성·요청 완료/);
  assert.match(manageUi, /자동 공개되지 않습니다/);
});

test("routes enforce login and operator permission with normal empty and error UX", () => {
  assert.match(submitPage, /redirect\(`\/login\?next=\$\{encodeURIComponent\(nextPath\)\}`\)/);
  assert.match(managePage, /redirect\(`\/login\?next=\$\{encodeURIComponent/);
  assert.match(managePage, /listLessonSubmissionRequestsForManagement/);
  assert.match(submitUi, /아직 등록 요청이 없습니다/);
  assert.match(manageUi, /처리할 등록 요청이 없습니다/);
  assert.match(submitUi, /role=\{notice\.type === "error" \? "alert" : "status"\}/);
});

test("runtime registration CTAs use internal routes and old Google Form placeholders are gone", () => {
  assert.match(lessonPageSources, /\/lessons\/submit\?type=lesson/);
  assert.match(lessonPageSources, /\/lessons\/submit\?type=video/);
  assert.doesNotMatch(lessonPageSources, /LESSON_REGISTER_FORM_URL|VIDEO_LESSON_REGISTER_FORM_URL/);
  assert.doesNotMatch(lessonPageSources, /placeholder-lesson\/viewform|placeholder-video-lesson/);
  assert.doesNotMatch(lessonPageSources, /레슨 강사·교육기관 홍보 등록 기능은 준비 중/);
  assert.doesNotMatch(lessonPageSources, /영상은 YouTube 링크로 연결되며 운영자 확인 후 수동 등록됩니다/);
});
