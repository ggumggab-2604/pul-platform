import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const storage = read("src/lib/hall-of-fame/hallOfFameEvidenceStorage.ts");
const actions = read("src/app/hall-of-fame/manage/evidence-cleanup/actions.ts");
const page = read("src/app/hall-of-fame/manage/evidence-cleanup/page.tsx");
const panel = read(
  "src/components/hall-of-fame/manage/HallOfFameEvidenceCleanupPanel.tsx",
);
const dashboard = read("src/lib/operations/operationsDashboard.ts");
const managePage = read("src/app/manage/page.tsx");

test("cleanup route reuses only the canonical service-side evidence lifecycle", () => {
  assert.match(storage, /^import "server-only";/);
  assert.match(storage, /list_hall_of_fame_evidence_cleanup_candidates_server/);
  assert.match(storage, /get_hall_of_fame_evidence_cleanup_context_server/);
  assert.match(storage, /expire_hall_of_fame_evidence_server/);
  assert.match(storage, /mark_hall_of_fame_evidence_storage_deleted_server/);
  assert.match(storage, /\.storage\.from\(candidate\.storage_bucket\)/);
  assert.match(storage, /\.remove\(\[candidate\.storage_path\]\)/);
  assert.doesNotMatch(panel, /\.storage\.|SUPABASE_SERVICE_ROLE_KEY|storage_path/);
  assert.doesNotMatch(actions, /\.storage\.|SUPABASE_SERVICE_ROLE_KEY|storage_path/);
});

test("page and action independently enforce the destructive platform permission", () => {
  assert.match(storage, /hall_of_fame\.records\.revoke/);
  assert.match(storage, /current_user_has_platform_permission/);
  assert.match(storage, /requireEvidenceCleanupPermission\(\)/);
  assert.match(page, /!management\.canManage/);
  assert.match(page, /\/login\?next=\/hall-of-fame\/manage\/evidence-cleanup/);
  assert.match(actions, /cleanupHallOfFameEvidenceForOperator/);
});

test("stale state and retries preserve expected versions and stable request IDs", () => {
  assert.match(storage, /candidate\.evidence_version !== input\.expectedEvidenceVersion/);
  assert.match(storage, /candidate\.batch_version !== input\.expectedBatchVersion/);
  assert.match(storage, /p_expected_evidence_version: input\.expectedEvidenceVersion/);
  assert.match(storage, /p_expected_batch_version: input\.expectedBatchVersion/);
  assert.match(storage, /p_request_id: input\.expireRequestId/);
  assert.match(storage, /input\.storageRequestId/);
  assert.match(panel, /submittingRef\.current/);
  assert.match(panel, /expireRequestId: crypto\.randomUUID\(\)/);
  assert.match(panel, /storageRequestId: crypto\.randomUUID\(\)/);
  assert.match(actions, /Storage 정리에 실패했습니다[\s\S]*다시 시도할 수 있습니다/);
  assert.match(actions, /if \(result\.shouldRefresh\)[\s\S]*revalidatePath/);
  assert.match(panel, /서버 연결을 확인할 수 없습니다/);
});

test("candidate response and UI minimize private evidence information", () => {
  assert.match(storage, /candidates: candidates\.map/);
  for (const allowed of ["evidenceId", "status", "evidenceVersion", "batchVersion"]) {
    assert.match(storage, new RegExp(`${allowed}: candidate`));
  }
  for (const forbidden of [
    "actor_user_id",
    "application_batch_id",
    "application_record_id",
    "storage_bucket",
    "storage_path",
    "email",
    "phone",
    "signedUrl",
  ]) {
    assert.doesNotMatch(panel, new RegExp(forbidden, "i"));
    assert.doesNotMatch(page, new RegExp(forbidden, "i"));
  }
  assert.doesNotMatch(panel, /<img|next\/image|createSignedUrl/);
});

test("UI has an empty state, one-at-a-time confirmation, failure retry and responsive layout", () => {
  assert.match(panel, /현재 canonical cleanup 후보가 0건입니다/);
  assert.match(panel, /candidates\.map/);
  assert.match(panel, /증빙 Storage 객체를 정리할까요/);
  assert.match(panel, /initialFocusRef=\{cancelRef\}/);
  assert.match(panel, /returnFocus=\{dialog\.trigger\}/);
  assert.match(panel, /Storage 객체 정리/);
  assert.match(panel, /md:grid-cols-2/);
  assert.match(panel, /min-h-12 w-full/);
  assert.doesNotMatch(panel, /모두 정리|일괄 정리|batch cleanup/i);
});

test("operations dashboard and manage home deep-link to the cleanup route", () => {
  const route = "/hall-of-fame/manage/evidence-cleanup";
  assert.match(dashboard, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(managePage, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(managePage, /명예의 전당 증빙 정리/);
});

test("implementation adds no scheduler, AI, bucket, batch deletion, or migration dependency", () => {
  const combined = `${storage}\n${actions}\n${page}\n${panel}`;
  assert.doesNotMatch(combined, /pg_cron|cron\.schedule|openai|gemini|vision model/i);
  assert.doesNotMatch(combined, /createBucket|create bucket|모두 정리|일괄 정리/i);
});
