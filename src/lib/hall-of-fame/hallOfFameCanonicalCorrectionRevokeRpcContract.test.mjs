import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260813000200_pul_hall_of_fame_canonical_correction_revoke_rpc.sql",
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

test("source uniqueness becomes active-only while successor cardinality remains unique", () => {
  assert.match(
    migration,
    /drop constraint hall_of_fame_records_source_application_record_id_key/,
  );
  assert.match(
    migration,
    /create unique index hall_of_fame_records_source_application_record_id_key[\s\S]*source_application_record_id[\s\S]*where validity_status = 'active'/,
  );
  assert.doesNotMatch(
    migration,
    /drop index(?: if exists)? public\.hall_of_fame_records_correction_successor_uidx/,
  );
});

test("lineage guard enforces same source, same target, predecessor state, and acyclicity", () => {
  const block = functionBlock(
    "private.enforce_hall_of_fame_canonical_lineage",
  );
  assert.match(block, /source_application_record_id[\s\S]*new\.source_application_record_id/);
  assert.match(block, /target_user_id <> new\.target_user_id/);
  assert.match(block, /validity_status <> 'corrected'/);
  assert.match(block, /publication_status <> 'suppressed'/);
  assert.match(block, /with recursive lineage/);
  assert.match(block, /HOF_CORRECTION_LINEAGE_CYCLE/);
});

test("structured correction and revocation reasons are schema-enforced", () => {
  assert.match(migration, /add column revocation_reason_code text/);
  assert.match(migration, /add column reason_code text/);
  for (const code of [
    "factual_error",
    "wrong_record_type",
    "administrative_error",
    "evidence_clarification",
    "insufficient_or_invalid_evidence",
    "duplicate_record",
    "wrong_subject",
    "fraud_confirmed",
  ]) {
    assert.match(migration, new RegExp(`'${code}'`));
  }
  assert.match(migration, /char_length\(revocation_reason\) between 2 and 1000/);
  assert.match(migration, /char_length\(reason\) between 2 and 1000/);
});

test("correction RPC is typed, actorless, versioned, and authenticated-only", () => {
  const block = functionBlock(
    "public.correct_hall_of_fame_canonical_record",
  );
  const header = block.split("returns table", 1)[0];
  assert.match(header, /p_record_id uuid/);
  assert.match(header, /p_expected_record_version integer/);
  assert.match(header, /p_record_type_code text/);
  assert.match(header, /p_correction_reason_code text/);
  assert.match(header, /p_correction_reason text/);
  assert.match(header, /p_request_id uuid/);
  assert.doesNotMatch(header, /actor_user_id/);
  assert.match(block, /v_actor uuid := auth\.uid\(\)/);
  assert.match(block, /returns table \([\s\S]*successor_record_id uuid[\s\S]*active_badge_count integer[\s\S]*changed boolean[\s\S]*replayed boolean/);
  assert.match(
    migration,
    /grant execute on function public\.correct_hall_of_fame_canonical_record\([\s\S]*\) to authenticated;/,
  );
});

test("correction reuses the existing factual fingerprint algorithm", () => {
  const block = functionBlock(
    "public.correct_hall_of_fame_canonical_record",
  );
  for (const key of [
    "target_user_id",
    "record_type_code",
    "played_on",
    "course_name",
    "course_region",
    "course_environment",
    "course_segment",
    "hole_number",
  ]) {
    assert.match(block, new RegExp(`'${key}'`));
  }
  assert.match(block, /fingerprint_version,[\s\S]*record_fingerprint/);
  assert.match(block, /HOF_CORRECTION_NO_FACTUAL_CHANGE/);
  assert.match(block, /hashtextextended\([\s\S]*8611/);
});

test("correction preserves predecessor facts and creates a linked successor", () => {
  const block = functionBlock(
    "public.correct_hall_of_fame_canonical_record",
  );
  assert.match(block, /update public\.hall_of_fame_records as canonical[\s\S]*validity_status = 'corrected'/);
  assert.match(block, /publication_status = 'suppressed'/);
  assert.match(block, /insert into public\.hall_of_fame_records/);
  assert.match(block, /v_record\.source_application_record_id/);
  assert.match(block, /v_record\.target_user_id/);
  assert.match(block, /v_record\.id,[\s\S]*1[\s\S]*\)\s*returning/);
  assert.doesNotMatch(
    block,
    /update public\.hall_of_fame_records[\s\S]{0,500}record_type_code\s*=/,
  );
});

test("correction publication is fail-closed", () => {
  const block = functionBlock(
    "public.correct_hall_of_fame_canonical_record",
  );
  assert.match(block, /when v_pre_record\.publication_status = 'suppressed' then 'suppressed'/);
  assert.match(block, /else 'hidden'/);
  assert.doesNotMatch(block, /v_successor_publication[^;]*published/);
});

test("correction rotates an exact badge pair without deleting provenance", () => {
  const block = functionBlock(
    "public.correct_hall_of_fame_canonical_record",
  );
  assert.match(block, /update public\.hall_of_fame_badge_sources/);
  assert.match(block, /status = 'inactive'/);
  assert.match(block, /Canonical record corrected\./);
  assert.match(block, /insert into public\.hall_of_fame_badge_sources/);
  assert.match(block, /hall_of_fame_inductee/);
  assert.match(block, /v_badge_count <> 2/);
  assert.doesNotMatch(block, /delete from public\.hall_of_fame_badge_sources/);
});

test("revocation RPC is typed, permissioned, terminal, and authenticated-only", () => {
  const block = functionBlock(
    "public.revoke_hall_of_fame_canonical_record",
  );
  assert.match(block, /p_expected_record_version integer/);
  assert.match(block, /hall_of_fame\.records\.revoke/);
  assert.match(block, /validity_status = 'revoked'/);
  assert.match(block, /publication_status = 'suppressed'/);
  assert.match(block, /revoked_by_user_id = v_actor/);
  assert.match(block, /HOF_CANONICAL_TERMINAL_STATE/);
  assert.match(
    migration,
    /grant execute on function public\.revoke_hall_of_fame_canonical_record\([\s\S]*\) to authenticated;/,
  );
});

test("same-state revoked requests complete as ledger-only no-ops", () => {
  const block = functionBlock(
    "public.revoke_hall_of_fame_canonical_record",
  );
  const branch = block.slice(block.indexOf("if v_record.validity_status = 'revoked'"));
  assert.match(branch, /revocation_reason_code <> v_reason_code/);
  assert.match(branch, /complete_hall_of_fame_request/);
  assert.match(branch, /'changed', false/);
  const beforeActive = branch.slice(0, branch.indexOf("if v_record.validity_status = 'corrected'"));
  assert.doesNotMatch(beforeActive, /insert into public\.hall_of_fame_record_history/);
  assert.doesNotMatch(beforeActive, /insert into public\.audit_logs/);
});

test("both RPCs claim and replay before permission and row mutation", () => {
  for (const name of [
    "public.correct_hall_of_fame_canonical_record",
    "public.revoke_hall_of_fame_canonical_record",
  ]) {
    const block = functionBlock(name);
    const requestLock = block.indexOf("lock_hall_of_fame_mutation_request");
    const entityLock = block.indexOf(", 8612");
    const claim = block.indexOf("hall_of_fame_claim_request");
    const replay = block.indexOf("if v_claim.replayed");
    const permission = block.indexOf("require_hall_of_fame_platform_permission");
    const rowLock = block.indexOf("for update", permission);
    assert.ok(requestLock >= 0);
    assert.ok(entityLock > requestLock);
    assert.ok(claim > entityLock);
    assert.ok(replay > claim);
    assert.ok(permission > replay);
    assert.ok(rowLock > permission);
  }
});

test("lifecycle writes are history, audit, and ledger atomic", () => {
  for (const name of [
    "public.correct_hall_of_fame_canonical_record",
    "public.revoke_hall_of_fame_canonical_record",
  ]) {
    const block = functionBlock(name);
    assert.match(block, /insert into public\.hall_of_fame_record_history/);
    assert.match(block, /insert into public\.audit_logs/);
    assert.match(block, /complete_hall_of_fame_request/);
    assert.match(block, /version = canonical\.version \+ 1/);
  }
});

test("projection guards resolve the unique active canonical after correction", () => {
  for (const name of [
    "private.enforce_guarded_hall_of_fame_projection_mutation",
    "private.enforce_hall_of_fame_projection_history_append",
  ]) {
    const block = functionBlock(name);
    assert.match(
      block,
      /source_application_record_id = v_application_record[\s\S]{0,120}validity_status = 'active'/,
    );
  }
});

test("lifecycle guards keep direct DML closed and append-only history intact", () => {
  const mutationGuard = functionBlock(
    "private.enforce_guarded_hall_of_fame_canonical_lifecycle_mutation",
  );
  const historyGuard = functionBlock(
    "private.enforce_hall_of_fame_canonical_lifecycle_history_append",
  );
  assert.match(mutationGuard, /HOF_DIRECT_DELETE_FORBIDDEN/);
  assert.match(mutationGuard, /hall_of_fame_mutation_context_is_valid\(\)/);
  assert.match(mutationGuard, /auth\.uid\(\) is distinct from v_actor/);
  assert.match(historyGuard, /tg_op <> 'INSERT'/);
  assert.match(historyGuard, /previous_history\.version = new\.version - 1/);
  assert.match(migration, /hall_of_fame_records_canonical_lifecycle_guard/);
  assert.match(migration, /hall_of_fame_badge_sources_canonical_lifecycle_guard/);
  assert.match(migration, /hall_of_fame_record_history_canonical_lifecycle_guard/);
});

test("public projection shape and existing application decisions are not expanded", () => {
  assert.doesNotMatch(migration, /create or replace function public\.list_hall_of_fame_public_records/);
  assert.doesNotMatch(migration, /create or replace function public\.list_hall_of_fame_public_badges/);
  assert.doesNotMatch(migration, /create or replace function public\.decide_hall_of_fame_application/);
  assert.doesNotMatch(migration, /hall_of_fame_evidence_files|storage\.objects/);
});
