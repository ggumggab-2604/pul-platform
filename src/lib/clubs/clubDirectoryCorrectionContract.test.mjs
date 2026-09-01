import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260925000100_pul_club_directory_correction_requests.sql");
const hardeningMigration = read("../../../supabase/migrations/20260926000100_pul_club_directory_correction_request_hardening.sql");
const provider = read("../../components/clubs/detail/ClubParticipationRequestProvider.tsx");
const actions = read("../../app/clubs/actions.ts");
const inbox = read("../../components/clubs/manage/ClubDirectoryCorrectionInbox.tsx");
const managementHome = read("../../app/manage/page.tsx");
const detailPage = read("../../app/clubs/[id]/page.tsx");
const normalized = migration.replace(/\s+/g, " ").trim();
const normalizedHardening = hardeningMigration.replace(/\s+/g, " ").trim();

test("migration is RPC-only, FORCE RLS, and authenticated-execute only", () => {
  assert.match(normalized, /alter table public\.club_directory_correction_requests enable row level security/);
  assert.match(normalized, /alter table public\.club_directory_correction_requests force row level security/);
  assert.match(normalized, /revoke all on table public\.club_directory_correction_requests from public, anon, authenticated, service_role/);
  for (const signature of [
    "submit_club_directory_correction_request\\(uuid, text, jsonb\\)",
    "list_club_directory_correction_requests_for_management\\(text, text, integer, integer\\)",
    "get_club_directory_correction_request_for_management\\(text\\)",
    "resolve_club_directory_correction_request\\(text, integer, text, text, uuid\\)",
  ]) {
    assert.match(normalized, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated, service_role`));
    assert.match(normalized, new RegExp(`grant execute on function public\\.${signature} to authenticated`));
  }
});

test("permissions reuse club settings management and isolate platform-wide Inbox", () => {
  assert.match(normalized, /private\.club_user_has_permission\( p_actor_id, p_club_id, 'club\.settings\.manage' \)/);
  assert.match(normalized, /'clubs\.directory_corrections\.manage'/);
  assert.match(normalized, /'platform_admin', 'clubs\.directory_corrections\.manage'/);
  assert.doesNotMatch(normalized, /'club_manager', 'clubs\.directory_corrections\.manage'/);
});

test("mutations are idempotent, audited, optimistic, and never edit clubs", () => {
  for (const marker of [
    "pg_advisory_xact_lock",
    "private.club_mutation_requests",
    "insert into public.audit_logs",
    "input_fingerprint",
    "completed_at",
  ]) assert.match(migration, new RegExp(marker.replace(".", "\\.")));
  assert.match(normalized, /request\.version = p_expected_version/);
  assert.match(normalized, /request_status in \('pending', 'completed', 'closed'\)/);
  assert.match(normalized, /where request_status = 'pending'/);
  assert.doesNotMatch(normalized, /update public\.clubs/);
  assert.doesNotMatch(normalized, /insert into public\.clubs/);
});

test("public form submits only information correction and keeps other preparations unchanged", () => {
  assert.match(provider, /submitClubDirectoryCorrectionRequestAction/);
  assert.match(provider, /crypto\.randomUUID\(\)/);
  assert.match(provider, /제보 접수/);
  assert.match(provider, /동호회 정보가 자동 변경되지는 않습니다/);
  assert.match(provider, /requestType === "representativePhoto"/);
  assert.match(provider, /requestType === "operatorVerification"/);
  assert.match(provider, /요청 접수 기능 준비 중/);
  assert.match(actions, /revalidatePath\("\/manage\/club-directory-corrections"\)/);
});

test("management Inbox is linked lazily without public initial-render report lookup", () => {
  assert.match(managementHome, /\/manage\/club-directory-corrections/);
  assert.match(detailPage, /resolveClubDirectoryCorrectionManagement/);
  assert.doesNotMatch(detailPage, /listClubDirectoryCorrectionRequestsForManagement/);
  assert.match(inbox, /resolveClubDirectoryCorrectionRequestAction/);
  assert.match(inbox, /제보 상태만 변경합니다/);
  assert.match(inbox, /expectedVersion: detail\.version/);
  assert.match(inbox, /key=\{detail\.requestKey\}/);
  assert.match(inbox, /activeRequestKeyRef\.current !== requestKey/);
  assert.match(inbox, /activeRequestKeyRef\.current = null/);
});

test("management DTO and UI avoid raw account identifiers", () => {
  for (const source of [inbox, actions]) {
    assert.doesNotMatch(source, /requester_user_id|resolved_by|access_token|refresh_token/);
  }
  assert.match(normalized, /'requester_label', '로그인 회원'/);
  assert.doesNotMatch(normalized, /'requester_user_id'/);
  assert.doesNotMatch(normalized, /'resolved_by'/);
});

test("hardening migration preserves grants while fixing payload, fingerprint, and resolver contracts", () => {
  assert.match(
    normalizedHardening,
    /jsonb_typeof\(p_payload -> 'target'\) <> 'string'/,
  );
  assert.match(
    normalizedHardening,
    /jsonb_typeof\(p_payload -> 'displayed_value'\) not in \('string', 'null'\)/,
  );
  assert.match(
    normalizedHardening,
    /jsonb_build_object\( 'action', 'club\.directory_correction\.submit'/,
  );
  assert.doesNotMatch(normalizedHardening, /concat_ws\( E'\\x1f'/);
  assert.match(
    normalizedHardening,
    /request_status in \('completed', 'closed'\) and resolved_at is not null and resolution_note is not null/,
  );
  assert.match(
    normalizedHardening,
    /revoke all on function public\.submit_club_directory_correction_request\(uuid, text, jsonb\) from public, anon, authenticated, service_role/,
  );
  assert.match(
    normalizedHardening,
    /grant execute on function public\.submit_club_directory_correction_request\(uuid, text, jsonb\) to authenticated/,
  );
  assert.doesNotMatch(normalizedHardening, /update public\.clubs|insert into public\.clubs/);
});
