import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const operatorLibrary = source("./hallOfFameOperatorUi.ts");
const resolver = source("./resolveHallOfFameOperatorManagement.ts");
const actions = source("../../app/hall-of-fame/manage/actions.ts");
const provider = source("../../components/hall-of-fame/manage/HallOfFameOperatorProvider.tsx");
const operatorActions = source("../../components/hall-of-fame/manage/HallOfFameOperatorActions.tsx");
const operatorQueue = source("../../components/hall-of-fame/manage/HallOfFameOperatorQueue.tsx");
const operatorDetail = source("../../components/hall-of-fame/manage/HallOfFameOperatorDetail.tsx");
const page = source("../../app/hall-of-fame/manage/page.tsx");

test("operator route gates authentication and disputes.read permission", () => {
  assert.match(page, /redirect\("\/login\?next=\/hall-of-fame\/manage"\)/);
  assert.match(page, /!management\.permissions\.canRead/);
  assert.match(resolver, /hall_of_fame\.disputes\.read/);
  assert.match(resolver, /hall_of_fame\.disputes\.review/);
  assert.match(resolver, /hall_of_fame\.disputes\.resolve/);
  assert.match(resolver, /hall_of_fame\.records\.correct/);
  assert.match(resolver, /hall_of_fame\.records\.revoke/);
});

test("operator client uses only approved RPCs and never reads raw HOF tables", () => {
  for (const rpc of [
    "list_hall_of_fame_dispute_review_queue",
    "get_hall_of_fame_dispute_for_review",
    "list_hall_of_fame_dispute_internal_notes",
    "get_hall_of_fame_dispute_resolution_context",
    "start_hall_of_fame_dispute_review",
    "add_hall_of_fame_dispute_internal_note",
    "resolve_hall_of_fame_dispute",
    "resolve_hall_of_fame_dispute_with_correction",
    "resolve_hall_of_fame_dispute_with_revoke",
  ]) {
    assert.match(operatorLibrary, new RegExp(`"${rpc}"`));
  }
  assert.doesNotMatch(
    operatorLibrary + provider + actions,
    /\.from\(["']hall_of_fame_(disputes|records|dispute_reviews|mutation_requests)["']\)/,
  );
  assert.doesNotMatch(operatorLibrary + provider + actions, /service[_-]?role/i);
});

test("server actions generate request IDs and recheck correction or revoke context", () => {
  assert.match(actions, /randomUUID\(\)/);
  assert.match(actions, /getHallOfFameDisputeResolutionContext/);
  assert.match(actions, /actual\.disputeVersion !== expected\.disputeVersion/);
  assert.match(actions, /actual\.canonicalRecordVersion !== expected\.recordVersion/);
  assert.match(actions, /revalidatePath\("\/hall-of-fame"\)/);
});

test("correction context is fetched only from the final action dialog path", () => {
  assert.match(operatorActions, /nextMode === "no_action" \|\| context/);
  assert.match(operatorActions, /await loadResolutionContext\(\)/);
  assert.doesNotMatch(provider, /loadResolutionContext\(\).*useEffect/s);
});

test("privacy and identity boundaries remain explicit", () => {
  assert.match(provider, /clearSensitiveState/);
  assert.match(provider, /sessionUserId|userId === authenticatedUserId/);
  assert.doesNotMatch(
    page + provider + operatorActions,
    /submittedByUserId|subjectUserId|actorUserId|email/i,
  );
  assert.match(operatorActions, /회원에게 보이는 처리 안내/);
  assert.match(operatorActions, /운영자 내부 메모/);
});

test("role capabilities and lifecycle state gate every mutation control", () => {
  assert.match(operatorActions, /detail\.status === "open" && permissions\.canReview/);
  assert.match(operatorActions, /detail\.status === "under_review" && permissions\.canReview/);
  assert.match(operatorActions, /detail\.status === "under_review" && permissions\.canResolve/);
  assert.match(operatorActions, /permissions\.canCorrect/);
  assert.match(operatorActions, /permissions\.canRevoke/);
  assert.match(operatorActions, /required[\s\S]*minLength=\{2\}/);
});

test("queue and detail provide loading, empty, error, privacy, and responsive states", () => {
  assert.match(operatorQueue, /listLoading/);
  assert.match(operatorQueue, /listError/);
  assert.match(operatorQueue, /조건에 맞는 요청이 없습니다/);
  assert.match(operatorQueue, /요청 더 보기/);
  assert.match(operatorDetail, /회원에게 비공개/);
  assert.match(operatorDetail, /lg:hidden/);
  assert.match(operatorDetail, /lg:static/);
});

test("dialogs reuse keyboard focus handling and revoke needs explicit confirmation", () => {
  assert.match(operatorActions, /HallOfFameDialog/);
  assert.match(operatorActions, /returnFocus=\{returnFocus\}/);
  assert.match(operatorActions, /initialFocusRef=\{reviewConfirmRef\}/);
  assert.match(operatorActions, /type="checkbox" required checked=\{revokeConfirmed\}/);
  assert.match(operatorDetail, /statusFocusRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});
