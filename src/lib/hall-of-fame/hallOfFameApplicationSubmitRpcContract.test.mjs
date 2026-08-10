import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260810000100_pul_hall_of_fame_application_submit_rpc.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function functionBlock(qualifiedName) {
  const createMarkers = [
    `create function ${qualifiedName}(`,
    `create or replace function ${qualifiedName}(`,
  ];
  const start = createMarkers
    .map((marker) => migration.indexOf(marker))
    .find((index) => index >= 0);
  assert.ok(start >= 0, `missing function ${qualifiedName}`);
  const end = migration.indexOf("\n$$;", start);
  assert.ok(end > start, `unterminated function ${qualifiedName}`);
  return migration.slice(start, end + 4);
}

test("submit RPC has the exact authenticated-only surface", () => {
  const block = functionBlock("public.submit_hall_of_fame_application");
  const header = block.split("returns table", 1)[0];
  assert.match(
    header,
    /p_application_batch_id uuid,\s*p_expected_batch_version integer,\s*p_request_id uuid/,
  );
  assert.doesNotMatch(header, /actor_user_id/);
  assert.match(block, /security definer/);
  assert.match(block, /set search_path = ''/);
  assert.match(block, /v_actor_user_id uuid := auth\.uid\(\)/);
  assert.match(
    migration,
    /revoke all on function public\.submit_hall_of_fame_application\(\s*uuid,\s*integer,\s*uuid\s*\) from public, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.submit_hall_of_fame_application\(\s*uuid,\s*integer,\s*uuid\s*\) to authenticated;/,
  );
});

test("request and batch serialization precede claim and authorization", () => {
  const block = functionBlock("public.submit_hall_of_fame_application");
  const actor = block.indexOf("lock_active_hall_of_fame_actor(");
  const request = block.indexOf("lock_hall_of_fame_mutation_request(");
  const batchEdit = block.indexOf("8608");
  const batchEvidence = block.indexOf("8610");
  const claim = block.indexOf("hall_of_fame_claim_request(");
  const boundary = block.indexOf("lock_hall_of_fame_authorization_boundary(");
  const rowLock = block.indexOf("for update;", boundary);
  assert.ok(actor >= 0);
  assert.ok(request > actor);
  assert.ok(batchEdit > request);
  assert.ok(batchEvidence > batchEdit);
  assert.ok(claim > batchEvidence);
  assert.ok(boundary > claim);
  assert.ok(rowLock > boundary);
});

test("submit reuses the ledger and preserves replay, mismatch, and stale contracts", () => {
  const block = functionBlock("public.submit_hall_of_fame_application");
  assert.match(block, /hall_of_fame\.application\.submit/);
  assert.match(block, /if v_claim\.replayed then/);
  assert.match(block, /'replayed'|true;/);
  assert.match(block, /HOF_STALE_VERSION[\s\S]*errcode = 'PT409'/);
  assert.match(block, /complete_hall_of_fame_request\(/);
  assert.match(migration, /HOF_LEDGER_CONTEXT_MISMATCH/);
});

test("readiness validation covers every approved submit prerequisite", () => {
  const block = functionBlock(
    "private.validate_hall_of_fame_application_submission",
  );
  for (const marker of [
    "HOF_ELIGIBILITY_CHANGED",
    "HOF_ROUND_SNAPSHOT_REQUIRED",
    "HOF_ACTIVE_APPLICATION_RECORD_REQUIRED",
    "HOF_RECORD_SUBMISSION_REQUIREMENTS_NOT_MET",
    "application_processing",
    "evidence_review",
    "nomination_acceptance",
    "HOF_PUBLICATION_CONSENT_REQUIRED",
    "round_companion",
    "HOF_MEMBER_COMPANION_CONFIRMATION_REQUIRED",
    "scorecard",
    "available",
    "HOF_SCORECARD_EVIDENCE_REQUIRED",
    "pending_upload",
    "uploaded_unverified",
    "HOF_UNRESOLVED_EVIDENCE",
  ]) {
    assert.match(block, new RegExp(marker));
  }
  assert.doesNotMatch(
    block,
    /storage\.objects|signed.?url|http|download|original_filename/i,
  );
});

test("type eligibility is transaction-current and all vacancy clubs are checked", () => {
  const block = functionBlock(
    "private.validate_hall_of_fame_application_submission",
  );
  assert.match(block, /direct_application/);
  assert.match(block, /v_active_membership_count <> 0/);
  assert.match(block, /v_suspended_membership_count <> 0/);
  assert.match(block, /club_admin_vacancy_direct_application/);
  assert.match(block, /v_valid_admin_club_count <> 0/);
  assert.match(block, /club_nomination/);
  assert.match(block, /club_user_is_active_admin/);
  assert.match(block, /club\.achievement_applications\.manage/);
});

test("nomination submit rejects only draft self-target records", () => {
  const block = functionBlock(
    "private.validate_hall_of_fame_application_submission",
  );
  const errorIndex = block.indexOf("HOF_NOMINATION_SELF_TARGET_NOT_ALLOWED");
  assert.notEqual(errorIndex, -1);
  const guardStart = block.lastIndexOf(
    "if v_batch.application_type = 'club_nomination'",
    errorIndex,
  );
  assert.notEqual(guardStart, -1);
  const guardEnd = block.indexOf("end if;", errorIndex);
  const guard = block.slice(guardStart, guardEnd);
  assert.match(guard, /record\.review_status = 'draft'/);
  assert.match(guard, /record\.target_user_id = p_actor_user_id/);
  assert.doesNotMatch(guard, /withdrawn/);
  assert.match(guard, /using errcode = '22023'/);
});

test("submission is an atomic draft-to-submitted transition only", () => {
  const block = functionBlock("public.submit_hall_of_fame_application");
  assert.match(
    block,
    /update public\.hall_of_fame_application_batches[\s\S]*status = 'submitted'[\s\S]*submitted_at = v_submitted_at/,
  );
  assert.match(
    block,
    /update public\.hall_of_fame_application_records[\s\S]*review_status = 'submitted'/,
  );
  assert.match(block, /version = batch\.version \+ 1/);
  assert.match(block, /version = record\.version \+ 1/);
  assert.match(block, /insert into public\.hall_of_fame_application_history/);
  assert.match(block, /insert into public\.audit_logs/);
  assert.doesNotMatch(
    block,
    /application_reviews|under_review|additional_info_required|canonical|badge/i,
  );
});

test("submit-specific guards preserve earlier and evidence guard routing", () => {
  assert.match(
    migration,
    /execute function private\.enforce_guarded_hall_of_fame_submission_mutation\(\)/,
  );
  assert.match(
    migration,
    /execute function private\.enforce_hall_of_fame_submission_history_append\(\)/,
  );
  assert.match(migration, /execute function private\.reject_hall_of_fame_mutation\(\)/);
  assert.match(
    migration,
    /execute function private\.reject_hall_of_fame_append_only_mutation\(\)/,
  );
  assert.doesNotMatch(
    migration,
    /drop trigger hall_of_fame_.*_evidence_guard_before_mutation/,
  );
});

test("private submit helpers are not externally executable", () => {
  for (const name of [
    "private.enforce_guarded_hall_of_fame_submission_mutation",
    "private.enforce_hall_of_fame_submission_history_append",
    "private.validate_hall_of_fame_application_submission",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function ${name.replaceAll(".", "\\.")}\\([\\s\\S]*?from public, anon, authenticated, service_role;`,
      ),
    );
  }
});

test("privacy-minimized result, audit, and fingerprint exclude evidence internals", () => {
  const block = functionBlock("public.submit_hall_of_fame_application");
  const fingerprintStart = block.indexOf("v_payload_fingerprint :=");
  const fingerprintEnd = block.indexOf("perform private.lock_hall", fingerprintStart);
  const fingerprint = block.slice(fingerprintStart, fingerprintEnd);
  assert.match(fingerprint, /application_batch_id/);
  assert.match(fingerprint, /expected_batch_version/);
  assert.doesNotMatch(
    fingerprint,
    /storage|mime|email|phone|consent|filename/i,
  );
  assert.doesNotMatch(
    block,
    /signed_url|storage_path|original_filename|evidence bytes|email|phone|otp/i,
  );
});

test("existing public HOF mutation signatures are not replaced", () => {
  for (const name of [
    "set_hall_of_fame_round_snapshot",
    "add_hall_of_fame_application_record",
    "update_hall_of_fame_application_record",
    "withdraw_hall_of_fame_application_record",
    "withdraw_hall_of_fame_application_draft",
    "set_hall_of_fame_application_consent",
    "set_hall_of_fame_publication_consent",
    "request_hall_of_fame_record_confirmation",
    "respond_hall_of_fame_record_confirmation",
    "create_hall_of_fame_evidence_upload_intent",
    "finalize_hall_of_fame_evidence_server",
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`create (?:or replace )?function public\\.${name}\\(`),
    );
  }
});

test("migration adds no review, snapshot, or public readiness surface", () => {
  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table/i);
  assert.doesNotMatch(migration, /readiness/i);
  assert.doesNotMatch(migration, /storage\.objects/i);
});
