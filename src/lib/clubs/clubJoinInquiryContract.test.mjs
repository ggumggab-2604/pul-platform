import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read(
  "../../../supabase/migrations/20260726000100_pul_club_join_inquiry_foundation.sql",
);
const client = read("./clubJoinInquiry.ts");
const provider = read(
  "../../components/clubs/detail/ClubJoinInquiryProvider.tsx",
);
const content = read(
  "../../components/clubs/detail/ClubDetailContent.tsx",
);
const normalized = migration.replace(/\s+/g, " ").trim();

test("reuses the approved applicant RPC and RPC-only table contract", () => {
  for (const signature of [
    "submit_club_join_inquiry\\( uuid, text, text, text\\[\\], text, uuid \\)",
    "withdraw_club_join_inquiry\\(uuid, uuid\\)",
    "list_my_club_join_inquiries\\( uuid, integer, timestamptz, uuid \\)",
    "get_my_club_join_inquiry\\(uuid\\)",
    "list_my_club_join_inquiry_history\\(uuid\\)",
  ]) {
    assert.match(normalized, new RegExp(`grant execute on function public\\.${signature} to authenticated`));
  }
  assert.match(normalized, /alter table public\.club_join_inquiries enable row level security/);
  assert.match(normalized, /alter table public\.club_join_inquiries force row level security/);
  assert.match(
    normalized,
    /revoke all on table public\.club_join_inquiries from public, anon, authenticated, service_role/,
  );
});

test("submission remains atomic, idempotent, and limited to one active inquiry", () => {
  const submitBlock = migration.slice(
    migration.indexOf("create function private.execute_club_join_inquiry_submit"),
    migration.indexOf("create function private.execute_club_join_inquiry_withdraw"),
  );
  assert.match(submitBlock, /private\.club_mutation_requests/);
  assert.match(submitBlock, /이미 처리 중인 가입 문의가 있습니다/);
  assert.match(submitBlock, /club_join_inquiry_status_history/);
  assert.match(submitBlock, /insert into public\.audit_logs/);
  assert.match(submitBlock, /ledger_completed/);
  assert.match(
    normalized,
    /where inquiry_status in \('received', 'reviewing'\)/,
  );
});

test("client uses exact applicant read and mutation RPCs without direct table DML", () => {
  for (const rpc of [
    "list_my_club_join_inquiries",
    "get_my_club_join_inquiry",
    "list_my_club_join_inquiry_history",
    "submit_club_join_inquiry",
    "withdraw_club_join_inquiry",
  ]) {
    assert.match(client, new RegExp(`"${rpc}"`));
  }
  assert.doesNotMatch(client, /\.from\("club_join_inquiries"\)/);
  assert.doesNotMatch(client, /console\.(?:log|warn|error)/);
  assert.match(client, /hasExactKeys/);
  assert.match(client, /expected\.requestId/);
  assert.match(client, /expected\.clubId/);
});

test("runtime replaces the preparing button with authenticated live state", () => {
  assert.match(content, /identity=\{applicationIdentity\}/);
  assert.match(provider, /useAuthSessionStatus/);
  assert.match(provider, /loadMyClubJoinInquirySnapshot/);
  assert.match(provider, /로그인하고 문의하기/);
  assert.match(provider, /가입 문의 보내기/);
  assert.match(provider, /가입 문의 철회/);
  assert.match(provider, /동호회 운영자 답변/);
  assert.match(provider, /처리 이력/);
  assert.doesNotMatch(provider, /가입 문의 기능 준비 중/);
  assert.doesNotMatch(provider, /입력한 내용은 저장되거나 전송되지 않습니다/);
});

test("auth changes and stale requests cannot expose the previous applicant state", () => {
  assert.match(provider, /key=\{authStatus\}/);
  assert.match(provider, /loadSequenceRef/);
  assert.match(provider, /loadSequenceRef\.current !== sequence/);
  assert.match(provider, /submitRequestRef/);
  assert.match(provider, /withdrawRequestRef/);
  assert.match(provider, /preserveRequestId/);
  assert.match(provider, /busyRef/);
});

test("UI keeps privacy, validation, login return, and accessible dialog behavior", () => {
  assert.match(provider, /role="dialog"/);
  assert.match(provider, /aria-modal="true"/);
  assert.match(provider, /event\.key === "Escape"/);
  assert.match(provider, /querySelectorAll<HTMLElement>/);
  assert.match(provider, /\/login\?next=/);
  assert.match(provider, /민감한 개인정보는 작성하지 마세요/);
  assert.match(provider, /maxLength=\{500\}/);
  assert.doesNotMatch(provider, /전화번호.*(?:input|required)/);
  assert.doesNotMatch(provider, /email|계좌번호.*required/i);
});

test("the applicant DTO omits operator internals and actor identifiers", () => {
  const detailType = client.slice(
    client.indexOf("export type ClubJoinInquiryDetail"),
    client.indexOf("export type ClubJoinInquiryHistoryEntry"),
  );
  assert.doesNotMatch(
    detailType,
    /applicantId|clubId|assignedOperatorId|internalNote|lastProcessedBy|email/,
  );
  const historyType = client.slice(
    client.indexOf("export type ClubJoinInquiryHistoryEntry"),
    client.indexOf("export type ClubJoinInquirySnapshot"),
  );
  assert.doesNotMatch(historyType, /historyId|inquiryId|actorId|email/);
});
