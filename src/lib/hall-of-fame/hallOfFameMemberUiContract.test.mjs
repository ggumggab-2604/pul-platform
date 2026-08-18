import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const client = source("./hallOfFameMemberUi.ts");
const page = source("../../app/hall-of-fame/page.tsx");
const actions = source("../../app/hall-of-fame/actions.ts");
const content = source("../../components/hall-of-fame/HallOfFamePageContent.tsx");
const disputeDialog = source("../../components/hall-of-fame/HallOfFameDisputeDialog.tsx");
const detailDialog = source("../../components/hall-of-fame/HallOfFameRequestDetailDialog.tsx");
const dialog = source("../../components/hall-of-fame/HallOfFameDialog.tsx");
const home = source("../../components/home/HallOfFameSection.tsx");
const mobileHome = source("../../components/home/MobileHallOfFameCard.tsx");
const course = source("../../components/courses/CourseDetailContent.tsx");
const navigation = source("../../data/homeData.ts");

test("route uses only the approved public and member read RPC adapters", () => {
  assert.match(page, /listHallOfFamePublicRecords/);
  assert.match(page, /listMyHallOfFameApplications/);
  assert.match(page, /listMyHallOfFameRecords/);
  assert.match(page, /listMyHallOfFameDisputes/);
  assert.doesNotMatch(page, /\.from\s*\(/);
});

test("member reads are gated by an authenticated server context", () => {
  assert.match(page, /supabase\.auth\.getClaims\(\)/);
  assert.match(page, /if \(signedIn\)/);
  assert.match(page, /authenticatedUserId=\{signedIn \? authenticatedUserId : undefined\}/);
  assert.match(content, /로그인 후 내 기록을 확인할 수 있습니다/);
});

test("private DTO rendering is gated by the exact browser and server identity", () => {
  assert.match(content, /supabase\.auth\s*\.getSession\(\)/);
  assert.match(content, /supabase\.auth\.onAuthStateChange/);
  assert.match(content, /session\?\.user\.id/);
  assert.match(
    content,
    /getHallOfFamePrivateIdentityState\(authenticatedUserId, browserUserId\)/s,
  );
  assert.match(content, /showPrivate && disputeTarget/);
  assert.match(content, /showPrivate && requestDetail/);
  assert.match(content, /refreshedIdentityMismatch\.current === mismatchKey/);
  assert.doesNotMatch(content, /initialSignedIn|browserSignedIn/);
});

test("mutations are authenticated Server Actions with server request IDs", () => {
  assert.match(actions, /^"use server";/);
  assert.match(actions, /getAuthenticatedSupabaseContext/);
  assert.match(actions, /randomUUID\(\)/);
  assert.doesNotMatch(disputeDialog + detailDialog, /randomUUID|p_request_id/);
});

test("approved RPC surface is exact and raw table access is absent", () => {
  const rpcNames = [...client.matchAll(/runRpc\(supabase,\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(rpcNames.sort(), [
    "get_my_hall_of_fame_dispute",
    "list_hall_of_fame_public_records",
    "list_my_hall_of_fame_applications",
    "list_my_hall_of_fame_disputes",
    "list_my_hall_of_fame_records",
    "submit_hall_of_fame_dispute",
    "withdraw_hall_of_fame_dispute",
  ]);
  assert.doesNotMatch(client + page + actions, /\.from\s*\(/);
});

test("no service-role client or secret access is introduced", () => {
  const all = client + page + actions + content + disputeDialog + detailDialog;
  assert.doesNotMatch(all, /service[_-]?role|SUPABASE_SERVICE|process\.env/iu);
});

test("member UI exposes only allowed DTO actions", () => {
  assert.match(disputeDialog, /target\.allowedDisputeTypes\.map/);
  assert.match(content, /canSubmitDispute/);
  assert.match(detailDialog, /\["open", "under_review"\]\.includes\(detail\.status\)/);
  assert.doesNotMatch(content, /platform_admin|platform_moderator|internal_note/);
});

test("technical identifiers stay internal to controls and are not rendered as labels", () => {
  const allUi = content + disputeDialog + detailDialog;
  assert.doesNotMatch(allUi, />\s*(UUID|application_id|record_id|dispute_id|request_id)\s*</i);
  assert.doesNotMatch(allUi, /name=["'](?:application|record|dispute|request)[_-]?id["']/i);
});

test("dialogs provide accessible semantics and keyboard focus management", () => {
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(disputeDialog, /htmlFor=/);
  assert.match(disputeDialog, /aria-describedby/);
  assert.match(disputeDialog, /initialFocusRef=\{statementRef\}/);
  assert.match(content, /ArrowRight/);
  assert.match(content, /ArrowLeft/);
});

test("withdrawal confirmation moves focus in and restores it to its trigger", () => {
  assert.match(detailDialog, /withdrawalTriggerRef/);
  assert.match(detailDialog, /withdrawalKeepRef/);
  assert.match(detailDialog, /confirmWithdrawal\s*\? withdrawalKeepRef\.current/);
  assert.match(detailDialog, /restoreWithdrawalFocus\.current\s*=\s*true/);
  assert.match(detailDialog, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(detailDialog, /ref=\{withdrawalKeepRef\}/);
  assert.match(detailDialog, /ref=\{withdrawalTriggerRef\}/);
  assert.match(detailDialog, /\["open", "under_review"\]\.includes\(detail\.status\)/);
});

test("member submit form is limited to type, category and statement", () => {
  assert.match(disputeDialog, /요청 종류/);
  assert.match(disputeDialog, /요청 사유/);
  assert.match(disputeDialog, /요청 내용/);
  assert.doesNotMatch(disputeDialog, /type="file"|Evidence|evidence/);
});

test("existing hall-of-fame entry points target the real route", () => {
  assert.match(home, /href="\/hall-of-fame"/);
  assert.match(mobileHome, /HOF_VIEW_HREF = "\/hall-of-fame"/);
  assert.match(course, /router\.push\("\/hall-of-fame"\)/);
  assert.match(navigation, /명예의 전당", href: "\/hall-of-fame"/);
});
