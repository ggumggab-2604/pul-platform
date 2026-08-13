import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260812000100_pul_hall_of_fame_final_decision_rpc.sql",
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

test("final decision RPC is actorless, versioned, typed, and authenticated-only", () => {
  const block = functionBlock("public.decide_hall_of_fame_application");
  const header = block.split("returns table", 1)[0];
  assert.match(
    header,
    /p_application_batch_id uuid,[\s\S]*p_expected_batch_version integer,[\s\S]*p_decisions jsonb,[\s\S]*p_request_id uuid/,
  );
  assert.doesNotMatch(header, /actor_user_id/);
  assert.match(block, /v_actor uuid := auth\.uid\(\)/);
  assert.match(block, /returns table \([\s\S]*approved_count integer,[\s\S]*rejected_count integer,[\s\S]*decisions jsonb,[\s\S]*replayed boolean/);
  assert.match(
    migration,
    /revoke all on function public\.decide_hall_of_fame_application\(uuid, integer, jsonb, uuid\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.decide_hall_of_fame_application\(uuid, integer, jsonb, uuid\)[\s\S]*to authenticated;/,
  );
});

test("payload parser is strict, normalized, complete, and reason-safe", () => {
  const block = functionBlock("public.decide_hall_of_fame_application");
  assert.match(block, /jsonb_object_keys\(v_item\)\) <> 4/);
  assert.match(block, /jsonb_typeof\(v_item -> 'application_record_id'\) <> 'string'/);
  assert.match(block, /jsonb_typeof\(v_item -> 'decision'\) <> 'string'/);
  assert.match(block, /jsonb_typeof\(v_item -> 'rejection_reason'\) not in \('string', 'null'\)/);
  assert.match(block, /HOF_DUPLICATE_DECISION_RECORD/);
  assert.match(block, /jsonb_agg\(value order by value ->> 'application_record_id'\)/);
  assert.match(block, /v_decision := v_item ->> 'decision'/);
  assert.doesNotMatch(
    block,
    /v_decision := pg_catalog\.(?:lower|upper|btrim)/,
  );
  assert.match(block, /v_decision not in \('approve','reject'\)/);
  assert.match(block, /v_decision = 'approve' and v_reason is not null/);
  assert.match(block, /pg_catalog\.char_length\(v_reason\) > 2000/);
  assert.doesNotMatch(block, /v_rejection_prefix/);
});

test("request identity includes batch version and canonical sorted decisions", () => {
  const block = functionBlock("public.decide_hall_of_fame_application");
  assert.match(block, /'application_batch_id', p_application_batch_id/);
  assert.match(block, /'expected_batch_version', p_expected_batch_version/);
  assert.match(block, /'decisions', v_normalized/);
  assert.match(block, /extensions\.digest[\s\S]*'sha256'/);
  assert.match(block, /private\.hall_of_fame_claim_request/);
  assert.match(block, /if v_claim\.replayed then[\s\S]*return;/);
});

test("approved lock order precedes authorization and row mutation", () => {
  const block = functionBlock("public.decide_hall_of_fame_application");
  const actorLock = block.indexOf("lock_active_hall_of_fame_actor");
  const requestLock = block.indexOf("lock_hall_of_fame_mutation_request");
  const batchLock = block.indexOf(", 8608");
  const evidenceLock = block.indexOf(", 8610");
  const claim = block.indexOf("hall_of_fame_claim_request");
  const authBoundary = block.indexOf("lock_hall_of_fame_authorization_boundary");
  const batchRow = block.indexOf("for update", authBoundary);
  const recordRows = block.indexOf("order by record.id for update", batchRow);
  assert.ok(actorLock >= 0 && requestLock > actorLock);
  assert.ok(batchLock > requestLock && evidenceLock > batchLock);
  assert.ok(claim > evidenceLock && authBoundary > claim);
  assert.ok(batchRow > authBoundary && recordRows > batchRow);
});

test("only the decide permission authorizes the final mutation", () => {
  const block = functionBlock("public.decide_hall_of_fame_application");
  assert.match(
    block,
    /require_hall_of_fame_platform_permission\(v_actor, 'hall_of_fame\.applications\.decide'\)/,
  );
  const guard = functionBlock(
    "private.enforce_guarded_hall_of_fame_final_decision_mutation",
  );
  assert.match(guard, /mapping\.permission_code = 'hall_of_fame\.applications\.decide'/);
  assert.match(guard, /auth\.uid\(\) is distinct from v_actor/);
  assert.match(guard, /hall_of_fame_mutation_context_is_valid\(\)/);
});

test("the RPC requires exact active-record coverage and stale tokens", () => {
  const block = functionBlock("public.decide_hall_of_fame_application");
  assert.match(block, /record\.review_status not in \('under_review','withdrawn'\)/);
  assert.match(block, /jsonb_array_length\(v_normalized\) <> v_active_count/);
  assert.match(block, /HOF_FINAL_DECISION_COVERAGE_MISMATCH/);
  assert.match(block, /record\.version <> \(item ->> 'expected_record_version'\)::integer/);
  assert.match(block, /HOF_STALE_RECORD_VERSION/);
  assert.match(block, /v_batch\.version <> p_expected_batch_version/);
});

test("approval readiness is factual and does not recheck current target eligibility", () => {
  const block = functionBlock("private.validate_hall_of_fame_final_approval");
  assert.match(block, /hall_of_fame_record_type_definitions/);
  assert.match(block, /HOF_SCORECARD_EVIDENCE_REQUIRED/);
  assert.match(block, /HOF_ADDITIONAL_INFO_INCOMPLETE/);
  assert.match(block, /'application_processing'::text/);
  assert.match(block, /'evidence_review'::text/);
  assert.match(block, /'nomination_acceptance'::text/);
  assert.match(block, /confirmation_role = 'round_companion'/);
  assert.doesNotMatch(block, /club_memberships|account_status|platform_role/);
  assert.doesNotMatch(block, /hall_of_fame_publication_consents/);
});

test("semantic duplicate locks and canonical uniqueness are both enforced", () => {
  const block = functionBlock("public.decide_hall_of_fame_application");
  assert.match(block, /order by pg_catalog\.encode\(record\.duplicate_fingerprint, 'hex'\), record\.id/);
  assert.match(block, /hashtextextended\([\s\S]*encode\(v_record_fingerprint, 'hex'\),[\s\S]*8611/);
  const validator = functionBlock("private.validate_hall_of_fame_final_approval");
  assert.match(validator, /hall_of_fame_records canonical[\s\S]*validity_status = 'active'/);
  assert.match(validator, /HOF_DUPLICATE_RECORD/);
  assert.match(block, /hall_of_fame_records_active_fingerprint_uidx/);
});

test("record decisions and batch aggregation are atomic and row-count checked", () => {
  const block = functionBlock("public.decide_hall_of_fame_application");
  assert.match(block, /when item\.value ->> 'decision' = 'approve' then 'approved'[\s\S]*else 'rejected'/);
  assert.match(block, /get diagnostics v_row_count = row_count/);
  assert.match(block, /v_row_count <> v_active_count/);
  assert.match(block, /when v_approved = v_active_count then 'approved'/);
  assert.match(block, /when v_rejected = v_active_count then 'rejected'/);
  assert.match(block, /else 'partially_approved'/);
  assert.match(block, /finalized_at=v_finalized_at/);
});

test("approval creates hidden canonical rows without copying Evidence", () => {
  const block = functionBlock("public.decide_hall_of_fame_application");
  assert.match(block, /insert into public\.hall_of_fame_records/);
  assert.match(block, /'active','hidden',v_actor,v_finalized_at,1/);
  assert.match(block, /insert into public\.hall_of_fame_record_history/);
  assert.match(block, /'hall_of_fame\.record\.approved'/);
  assert.doesNotMatch(block, /insert into public\.hall_of_fame_evidence_files/);
  assert.doesNotMatch(block, /update public\.hall_of_fame_evidence_files/);
});

test("final history, review, notice, audit, and ledger exclude rejection reasons", () => {
  const block = functionBlock("public.decide_hall_of_fame_application");
  assert.match(block, /insert into public\.hall_of_fame_application_history/);
  assert.match(block, /insert into public\.hall_of_fame_application_reviews/);
  assert.match(block, /insert into public\.hall_of_fame_application_messages/);
  assert.match(block, /insert into public\.audit_logs/);
  assert.match(block, /complete_hall_of_fame_request/);
  assert.match(block, /else item\.value ->> 'rejection_reason'/);
  const resultStart = block.indexOf("v_result :=");
  assert.ok(resultStart > 0);
  assert.doesNotMatch(block.slice(resultStart), /rejection_reason/);
  assert.doesNotMatch(block, /internal_note\s*,\s*item/);
});

test("final-decision guards are ledger-bound, immutable, and timestamp-bound", () => {
  const guard = functionBlock(
    "private.enforce_guarded_hall_of_fame_final_decision_mutation",
  );
  assert.match(guard, /HOF_DIRECT_DELETE_FORBIDDEN/);
  assert.match(guard, /new\.payload_fingerprint <> old\.payload_fingerprint/);
  assert.match(guard, /new\.updated_at <> pg_catalog\.now\(\)/);
  assert.match(guard, /new\.finalized_at <> pg_catalog\.now\(\)/);
  assert.match(guard, /new\.version <> old\.version \+ 1/);
});

test("canonical guards bind source, snapshots, club, fingerprint, and initial history", () => {
  const guard = functionBlock("private.enforce_hall_of_fame_canonical_insert");
  assert.match(guard, /v_source\.review_status <> 'approved'/);
  assert.match(guard, /new\.nominating_club_id is distinct from v_application\.nominating_club_id/);
  assert.match(guard, /new\.record_fingerprint <> v_source\.duplicate_fingerprint/);
  assert.match(guard, /new\.validity_status <> 'active'/);
  assert.match(guard, /new\.publication_status <> 'hidden'/);
  assert.match(guard, /new\.approved_at <> pg_catalog\.now\(\)/);
  const history = functionBlock(
    "private.enforce_hall_of_fame_canonical_history_append",
  );
  assert.match(history, /new\.action <> 'hall_of_fame\.record\.approved'/);
  assert.match(history, /new\.version <> 1/);
});

test("all new private helpers revoke every externally callable role", () => {
  for (const signature of [
    "private.enforce_guarded_hall_of_fame_final_decision_mutation()",
    "private.enforce_hall_of_fame_final_application_history_append()",
    "private.enforce_hall_of_fame_final_review_append()",
    "private.enforce_hall_of_fame_final_message_append()",
    "private.enforce_hall_of_fame_canonical_insert()",
    "private.enforce_hall_of_fame_canonical_history_append()",
    "private.validate_hall_of_fame_final_approval(uuid, uuid)",
  ]) {
    const escaped = signature.replaceAll(".", "\\.").replaceAll("(", "\\(").replaceAll(")", "\\)");
    assert.match(
      migration,
      new RegExp(`revoke all on function ${escaped}\\s*from public, anon, authenticated, service_role;`),
    );
  }
});

test("scope remains final decision and canonical creation only", () => {
  assert.doesNotMatch(migration, /create\s+policy/i);
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete)\s+on/i);
  assert.doesNotMatch(migration, /publication_status\s*=\s*'published'/);
  assert.doesNotMatch(migration, /create\s+(table|function)[\s\S]{0,120}(badge|appeal)/i);
  assert.doesNotMatch(migration, /corrected_from_record_id\s*=|revoked_at\s*=/i);
});
