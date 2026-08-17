import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260815000100_pul_hall_of_fame_dispute_intake_foundation.sql",
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

test("unified current and append-only history tables have bounded contracts", () => {
  assert.match(migration, /create table public\.hall_of_fame_disputes/);
  assert.match(migration, /create table public\.hall_of_fame_dispute_history/);
  for (const value of [
    "correction_request",
    "decision_appeal",
    "subject_objection",
    "fraud_report",
  ]) {
    assert.match(migration, new RegExp(`'${value}'`));
  }
  assert.match(migration, /status in \('open', 'under_review', 'resolved', 'withdrawn'\)/);
  assert.match(migration, /unique \(dispute_id, version\)/);
  assert.match(migration, /unique \(actor_user_id, request_id\)/);
});

test("target XOR and composite subject binding are DB-enforced", () => {
  assert.match(
    migration,
    /hall_of_fame_disputes_target_xor_check[\s\S]*application_record_id is not null[\s\S]*canonical_record_id is not null[\s\S]*= 1/,
  );
  assert.match(
    migration,
    /foreign key \(application_record_id, subject_user_id\)[\s\S]*hall_of_fame_application_records \(id, target_user_id\)/,
  );
  assert.match(
    migration,
    /foreign key \(canonical_record_id, subject_user_id\)[\s\S]*hall_of_fame_records \(id, target_user_id\)/,
  );
  assert.match(
    migration,
    /application_record_id is not null[\s\S]*dispute_type = 'decision_appeal'/,
  );
});

test("type-specific categories and private statement boundaries are constrained", () => {
  for (const value of [
    "factual_error",
    "wrong_record_type",
    "administrative_error",
    "evidence_clarification",
    "decision_error",
    "overlooked_evidence",
    "procedural_error",
    "wrong_subject",
    "false_record",
    "invalid_evidence",
    "duplicate",
    "impersonation",
  ]) {
    assert.match(migration, new RegExp(`'${value}'`));
  }
  assert.match(
    migration,
    /statement = pg_catalog\.regexp_replace\([\s\S]*\^\[\[:space:\]\]\+\|\[\[:space:\]\]\+\$[\s\S]*statement ~ '\[\^\[:space:\]\]'[\s\S]*char_length\(statement\) between 2 and 2000/,
  );
  const submit = functionBlock("public.submit_hall_of_fame_dispute");
  assert.match(submit, /v_statement text := pg_catalog\.regexp_replace\(/);
  assert.match(submit, /or v_statement !~ '\[\^\[:space:\]\]'/);
  assert.match(submit, /or v_dispute_type is null/);
  assert.match(submit, /or v_category is null/);
});

test("open business duplicates are protected separately for both target kinds", () => {
  assert.match(
    migration,
    /hall_of_fame_disputes_open_application_target_uidx[\s\S]*submitted_by_user_id[\s\S]*dispute_type[\s\S]*application_record_id[\s\S]*status in \('open', 'under_review'\)/,
  );
  assert.match(
    migration,
    /hall_of_fame_disputes_open_canonical_target_uidx[\s\S]*submitted_by_user_id[\s\S]*dispute_type[\s\S]*canonical_record_id[\s\S]*status in \('open', 'under_review'\)/,
  );
  const submit = functionBlock("public.submit_hall_of_fame_dispute");
  assert.match(submit, /hashtextextended\([\s\S]*8613/);
  assert.match(submit, /HOF_OPEN_DISPUTE_ALREADY_EXISTS/);
  assert.match(submit, /hall_of_fame_claim_request/);
});

test("submit derives subjects and enforces the four eligibility boundaries", () => {
  const submit = functionBlock("public.submit_hall_of_fame_dispute");
  assert.doesNotMatch(submit.split("returns table", 1)[0], /subject_user_id/);
  assert.match(submit, /application_record\.target_user_id/);
  assert.match(submit, /canonical\.target_user_id/);
  assert.match(submit, /application_record\.review_status/);
  assert.match(submit, /batch\.status/);
  assert.match(submit, /v_target_status <> 'rejected'/);
  assert.match(submit, /v_batch_status not in \('rejected', 'partially_approved'\)/);
  assert.match(submit, /v_target_status <> 'revoked'/);
  assert.match(submit, /v_actor <> v_source_submitter_user_id/);
  assert.match(submit, /v_actor <> v_subject_user_id/);
  assert.match(submit, /v_actor = v_subject_user_id/);
});

test("submit and withdrawal are typed authenticated-only SECURITY DEFINER RPCs", () => {
  const submit = functionBlock("public.submit_hall_of_fame_dispute");
  const withdraw = functionBlock("public.withdraw_hall_of_fame_dispute");
  assert.match(submit, /security definer[\s\S]*set search_path = ''/);
  assert.match(withdraw, /p_expected_version integer/);
  assert.match(withdraw, /security definer[\s\S]*set search_path = ''/);
  for (const block of [submit, withdraw]) {
    assert.match(block, /returns table \([\s\S]*dispute_id uuid[\s\S]*changed boolean[\s\S]*replayed boolean/);
    assert.match(block, /private\.lock_active_hall_of_fame_actor/);
    assert.match(block, /private\.hall_of_fame_claim_request/);
    assert.match(block, /private\.complete_hall_of_fame_request/);
  }
  assert.match(
    migration,
    /grant execute on function public\.submit_hall_of_fame_dispute\([\s\S]*\) to authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.withdraw_hall_of_fame_dispute\([\s\S]*\) to authenticated;/,
  );
});

test("withdrawal is versioned, history-bound, replayable, and supports ledger-only no-op", () => {
  const withdraw = functionBlock("public.withdraw_hall_of_fame_dispute");
  assert.match(withdraw, /v_dispute\.version <> p_expected_version/);
  assert.match(withdraw, /HOF_STALE_DISPUTE_VERSION/);
  assert.match(withdraw, /if v_dispute\.status = 'withdrawn'/);
  const noOp = withdraw.slice(withdraw.indexOf("if v_dispute.status = 'withdrawn'"));
  const beforeTerminal = noOp.slice(0, noOp.indexOf("if v_dispute.status = 'resolved'"));
  assert.match(beforeTerminal, /'changed', false/);
  assert.doesNotMatch(beforeTerminal, /insert into public\.hall_of_fame_dispute_history/);
  assert.doesNotMatch(beforeTerminal, /insert into public\.audit_logs/);
  assert.match(withdraw, /version = dispute\.version \+ 1/);
  assert.match(withdraw, /hall_of_fame\.dispute\.withdrawn/);
});

test("own list and detail expose sanitized submitter-only DTOs", () => {
  for (const name of [
    "public.list_my_hall_of_fame_disputes",
    "public.get_my_hall_of_fame_dispute",
  ]) {
    const block = functionBlock(name);
    assert.match(block, /security definer[\s\S]*set search_path = ''/);
    assert.match(block, /submitted_by_user_id = v_actor/);
    assert.doesNotMatch(block, /select\s+dispute\.submitted_by_user_id/);
    assert.doesNotMatch(block, /audit_logs|mutation_requests|evidence|storage\.objects/);
  }
});

test("RLS, FORCE RLS, table ACL, and exact ledger-bound guards stay closed", () => {
  for (const table of [
    "hall_of_fame_disputes",
    "hall_of_fame_dispute_history",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}`));
  }
  const currentGuard = functionBlock(
    "private.enforce_guarded_hall_of_fame_dispute_mutation",
  );
  const historyGuard = functionBlock(
    "private.enforce_hall_of_fame_dispute_history_append",
  );
  assert.match(currentGuard, /HOF_DIRECT_DELETE_FORBIDDEN/);
  assert.match(currentGuard, /hall_of_fame_dispute_context_is_valid\(\)/);
  assert.match(currentGuard, /old\.status not in \('open', 'under_review'\)/);
  assert.match(historyGuard, /tg_op <> 'INSERT'/);
  assert.match(historyGuard, /previous_history\.version = new\.version - 1/);
  assert.match(migration, /hall_of_fame_mutation_requests_dispute_guard/);
});

test("history, audit, and shared ledger complete atomically without copying statements", () => {
  for (const name of [
    "public.submit_hall_of_fame_dispute",
    "public.withdraw_hall_of_fame_dispute",
  ]) {
    const block = functionBlock(name);
    assert.match(block, /insert into public\.hall_of_fame_dispute_history/);
    assert.match(block, /insert into public\.audit_logs/);
    assert.match(block, /complete_hall_of_fame_request/);
  }
  const auditSections = migration
    .split("insert into public.audit_logs")
    .slice(1)
    .map((section) => section.slice(0, section.indexOf("v_result :=")));
  for (const section of auditSections) {
    assert.doesNotMatch(section, /v_statement|\.statement/);
  }
  assert.doesNotMatch(migration, /create table private\.hall_of_fame_dispute.*request/);
});

test("public projection and deferred 6B domains are not expanded", () => {
  assert.doesNotMatch(migration, /create or replace function public\.list_hall_of_fame_public_records/);
  assert.doesNotMatch(migration, /create table public\.hall_of_fame_dispute_(messages|reviews|evidence)/);
  assert.doesNotMatch(migration, /storage\.objects|hall_of_fame\.records\.(correct|revoke)/);
  assert.doesNotMatch(migration, /hall_of_fame\.disputes\.(read|review|resolve)/);
  assert.doesNotMatch(migration, /update public\.hall_of_fame_records|update public\.hall_of_fame_badge_sources/);
});
