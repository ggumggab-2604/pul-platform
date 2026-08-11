import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260811000200_pul_hall_of_fame_withdrawal_rpc.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function functionBlock(qualifiedName) {
  const markers = [
    `create function ${qualifiedName}(`,
    `create or replace function ${qualifiedName}(`,
  ];
  const start = markers
    .map((marker) => migration.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  assert.ok(Number.isInteger(start), `missing function ${qualifiedName}`);
  const end = migration.indexOf("\n$$;", start);
  assert.ok(end > start, `unterminated function ${qualifiedName}`);
  return migration.slice(start, end + 4);
}

function assertAuthenticatedOnly(name, identityArguments) {
  const escapedName = name.replaceAll(".", "\\.");
  const escapedArguments = identityArguments
    .split(",")
    .map((argument) => argument.trim().replaceAll(" ", "\\s*"))
    .join(",\\s*");
  assert.match(
    migration,
    new RegExp(
      `revoke all on function ${escapedName}\\(\\s*${escapedArguments}\\s*\\)\\s*from public, anon, authenticated, service_role;`,
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `grant execute on function ${escapedName}\\(\\s*${escapedArguments}\\s*\\)\\s*to authenticated;`,
    ),
  );
}

test("whole withdrawal is actorless, authenticated-only, and creator-bound", () => {
  const block = functionBlock("public.withdraw_hall_of_fame_application");
  const header = block.split("returns table", 1)[0];
  assert.match(
    header,
    /p_application_batch_id uuid,[\s\S]*p_expected_batch_version integer,[\s\S]*p_request_id uuid/,
  );
  assert.doesNotMatch(header, /actor_user_id/);
  assert.match(block, /v_actor_user_id uuid := auth\.uid\(\)/);
  assert.match(block, /v_batch\.created_by_user_id <> v_actor_user_id/);
  assert.doesNotMatch(block, /club_user_has_permission/);
  assertAuthenticatedOnly(
    "public.withdraw_hall_of_fame_application",
    "uuid, integer, uuid",
  );
});

test("target withdrawal is exact-record self authorization only", () => {
  const block = functionBlock(
    "public.withdraw_hall_of_fame_nomination_participation",
  );
  const header = block.split("returns table", 1)[0];
  assert.match(
    header,
    /p_application_batch_id uuid,[\s\S]*p_application_record_id uuid,[\s\S]*p_expected_batch_version integer,[\s\S]*p_expected_record_version integer,[\s\S]*p_request_id uuid/,
  );
  assert.doesNotMatch(header, /actor_user_id/);
  assert.match(block, /v_record\.target_user_id <> v_actor_user_id/);
  assert.match(block, /record\.id = p_application_record_id/);
  assert.match(block, /record\.application_batch_id = p_application_batch_id/);
  assert.match(block, /v_batch\.application_type <> 'club_nomination'/);
  assertAuthenticatedOnly(
    "public.withdraw_hall_of_fame_nomination_participation",
    "uuid, uuid, integer, integer, uuid",
  );
});

test("both RPCs are pre-final, versioned, and account-lock first", () => {
  for (const name of [
    "public.withdraw_hall_of_fame_application",
    "public.withdraw_hall_of_fame_nomination_participation",
  ]) {
    const block = functionBlock(name);
    assert.match(
      block,
      /'submitted', 'under_review', 'additional_info_required'/,
    );
    assert.doesNotMatch(block, /'approved'\s*,\s*'rejected'/);
    assert.match(block, /private\.lock_active_hall_of_fame_actor\(v_actor_user_id\)/);
    assert.match(block, /private\.lock_hall_of_fame_mutation_request/);
    assert.match(block, /private\.hall_of_fame_claim_request/);
    assert.match(block, /private\.complete_hall_of_fame_request/);
    assert.ok(
      block.indexOf("lock_active_hall_of_fame_actor") <
        block.indexOf("hall_of_fame_claim_request"),
      `${name} must lock the active actor before request replay`,
    );
  }
});

test("lock order shares approved batch and workflow advisory namespaces", () => {
  for (const name of [
    "public.withdraw_hall_of_fame_application",
    "public.withdraw_hall_of_fame_nomination_participation",
  ]) {
    const block = functionBlock(name);
    const requestLock = block.indexOf("lock_hall_of_fame_mutation_request");
    const batchLock = block.indexOf(", 8608");
    const workflowLock = block.indexOf(", 8610");
    const claim = block.indexOf("hall_of_fame_claim_request");
    const rowLock = block.indexOf("for update", claim);
    assert.ok(requestLock >= 0 && batchLock > requestLock);
    assert.ok(workflowLock > batchLock && claim > workflowLock);
    assert.ok(rowLock > claim);
  }
});

test("whole withdrawal atomically terminates active records and batch", () => {
  const block = functionBlock("public.withdraw_hall_of_fame_application");
  assert.match(block, /review_status = 'withdrawn'/);
  assert.match(block, /version = record\.version \+ 1/);
  assert.match(block, /status = 'withdrawn'/);
  assert.match(block, /version = batch\.version \+ 1/);
  assert.match(block, /finalized_at = v_withdrawn_at/);
  assert.match(block, /v_updated_record_count <> v_active_record_count/);
  assert.match(block, /'batch'[\s\S]*v_operation, p_request_id/);
  assert.match(block, /'record'[\s\S]*v_operation, p_request_id/);
  assert.match(block, /insert into public\.audit_logs/);
  assert.doesNotMatch(block, /delete\s+from/i);
});

test("target withdrawal preserves acceptance and appends consent history", () => {
  const block = functionBlock(
    "public.withdraw_hall_of_fame_nomination_participation",
  );
  assert.match(block, /consent_purpose = 'nomination_acceptance'/);
  assert.match(block, /status = 'withdrawn'/);
  assert.match(block, /granted_at = consent\.granted_at/);
  assert.match(block, /withdrawn_at = v_withdrawn_at/);
  assert.match(block, /version = consent\.version \+ 1/);
  assert.match(
    block,
    /insert into public\.hall_of_fame_application_consent_history/,
  );
  assert.match(block, /'granted', 'withdrawn'/);
  assert.doesNotMatch(block, /delete\s+from/i);
});

test("partial withdrawal bumps batch version without fake status history", () => {
  const block = functionBlock(
    "public.withdraw_hall_of_fame_nomination_participation",
  );
  assert.match(
    block,
    /v_new_batch_status := case[\s\S]*when v_remaining_active = 0 then 'withdrawn'[\s\S]*else v_batch\.status/,
  );
  assert.match(block, /version = batch\.version \+ 1/);
  assert.match(
    block,
    /if v_remaining_active = 0 then[\s\S]*insert into public\.hall_of_fame_application_history/,
  );
  const conditional = block.indexOf("if v_remaining_active = 0 then");
  const batchHistory = block.indexOf("'batch'", conditional);
  assert.ok(conditional >= 0 && batchHistory > conditional);
});

test("last active target withdrawal aggregates the batch to withdrawn", () => {
  const block = functionBlock(
    "public.withdraw_hall_of_fame_nomination_participation",
  );
  assert.match(block, /when v_remaining_active = 0 then 'withdrawn'/);
  assert.match(
    block,
    /when v_remaining_active = 0 then v_withdrawn_at/,
  );
  assert.match(
    block,
    /'batch', p_application_batch_id, null,[\s\S]*v_batch\.status, 'withdrawn'/,
  );
});

test("request identity covers every stale token and exact target", () => {
  const whole = functionBlock("public.withdraw_hall_of_fame_application");
  assert.match(
    whole,
    /'expected_batch_version', p_expected_batch_version/,
  );
  const target = functionBlock(
    "public.withdraw_hall_of_fame_nomination_participation",
  );
  assert.match(target, /'application_record_id', p_application_record_id/);
  assert.match(
    target,
    /'expected_batch_version', p_expected_batch_version/,
  );
  assert.match(
    target,
    /'expected_record_version', p_expected_record_version/,
  );
  assert.match(target, /p_application_record_id,[\s\S]*v_actor_user_id,[\s\S]*v_payload_fingerprint/);
});

test("withdrawal DML guards bind every changed row to ledger context", () => {
  const guard = functionBlock(
    "private.enforce_guarded_hall_of_fame_withdrawal_mutation",
  );
  assert.match(guard, /HOF_MUTATION_RPC_REQUIRED/);
  assert.match(guard, /HOF_LEDGER_CONTEXT_MISMATCH/);
  assert.match(guard, /auth\.uid\(\) is distinct from v_actor/);
  assert.match(guard, /private\.hall_of_fame_mutation_context_is_valid\(\)/);
  assert.match(guard, /HOF_DIRECT_DELETE_FORBIDDEN/);
  assert.match(guard, /new\.version <> old\.version \+ 1/);
  assert.match(guard, /v_remaining_active/);
});

test("withdrawal consent and history helpers remain private", () => {
  for (const name of [
    "private.enforce_guarded_hall_of_fame_withdrawal_mutation",
    "private.enforce_guarded_hall_of_fame_withdrawal_consent_mutation",
    "private.enforce_hall_of_fame_withdrawal_consent_history_append",
    "private.enforce_hall_of_fame_post_submit_history_append",
  ]) {
    const escaped = name.replaceAll(".", "\\.");
    assert.match(
      migration,
      new RegExp(
        `revoke all on function ${escaped}\\(\\)\\s*from public, anon, authenticated, service_role;`,
      ),
    );
  }
});

test("post-submit history accepts audited version gaps but verifies status chain", () => {
  const guard = functionBlock(
    "private.enforce_hall_of_fame_post_submit_history_append",
  );
  assert.match(guard, /previous_history\.version < new\.version/);
  assert.match(guard, /order by previous_history\.version desc/);
  assert.match(guard, /v_previous_status <> new\.from_status/);
  assert.match(guard, /HOF_APPLICATION_HISTORY_CHAIN_MISMATCH/);
  assert.doesNotMatch(
    guard,
    /previous_history\.version\s*=\s*new\.version\s*-\s*1/,
  );
});

test("readiness ignores unresolved Evidence only for withdrawn records", () => {
  const readiness = functionBlock(
    "private.validate_hall_of_fame_application_readiness",
  );
  assert.match(
    readiness,
    /evidence\.status in \('pending_upload', 'uploaded_unverified'\)/,
  );
  assert.match(readiness, /evidence\.application_record_id is null/);
  assert.match(
    readiness,
    /evidence_record\.review_status <> 'withdrawn'/,
  );
  assert.match(readiness, /HOF_UNRESOLVED_EVIDENCE/);
});

test("existing resubmit, review, and AIR predicates cannot resurrect withdrawn rows", () => {
  const readiness = functionBlock(
    "private.validate_hall_of_fame_application_readiness",
  );
  assert.match(
    readiness,
    /record\.review_status not in \(p_required_status, 'withdrawn'\)/,
  );
  assert.match(
    readiness,
    /record\.review_status = p_required_status/,
  );
  const history = functionBlock(
    "private.enforce_hall_of_fame_post_submit_history_append",
  );
  assert.match(history, /hall_of_fame\.application\.resubmit/);
  assert.match(history, /hall_of_fame\.application\.review\.start/);
  assert.match(history, /hall_of_fame\.application\.additional_info\.request/);
});

test("migration does not implement final decisions or destructive cleanup", () => {
  for (const forbidden of [
    /create function public\.(approve|reject|finalize)_hall_of_fame/i,
    /insert into public\.hall_of_fame_badges/i,
    /insert into public\.hall_of_fame_records/i,
    /delete\s+from public\.hall_of_fame_evidence_files/i,
    /delete\s+from public\.hall_of_fame_application_messages/i,
    /storage\.objects/i,
  ]) {
    assert.doesNotMatch(migration, forbidden);
  }
});
