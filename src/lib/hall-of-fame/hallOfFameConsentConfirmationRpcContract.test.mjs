import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260808000100_pul_hall_of_fame_consent_confirmation_rpc.sql",
  import.meta.url,
);
const migration = readFileSync(fileURLToPath(migrationUrl), "utf8");
const normalized = migration
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*--.*$/gm, " ")
  .replace(/\s+/g, " ")
  .trim();

function functionBlock(name) {
  const qualifiedName = name.includes(".") ? name : `public.${name}`;
  const start = Math.max(
    normalized.indexOf(`create function ${qualifiedName}(`),
    normalized.indexOf(`create or replace function ${qualifiedName}(`),
  );
  assert.notEqual(start, -1, `${name} must exist`);
  const end = normalized.indexOf("$$;", start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return normalized.slice(start, end + 3);
}

test("creates separate current and append-only application-consent tables", () => {
  assert.match(normalized, /create table public\.hall_of_fame_application_consents \(/);
  assert.match(normalized, /create table public\.hall_of_fame_application_consent_history \(/);
  assert.match(normalized, /unique \(application_record_id, consent_purpose\)/);
  assert.match(normalized, /unique \(application_consent_id, version\)/);
  assert.match(normalized, /on delete restrict/);
});

test("keeps the three consent purposes and four current statuses distinct", () => {
  for (const purpose of [
    "application_processing",
    "evidence_review",
    "nomination_acceptance",
  ]) assert.match(normalized, new RegExp(`'${purpose}'`));
  assert.match(
    normalized,
    /status in \('pending', 'granted', 'declined', 'withdrawn'\)/,
  );
});

test("bounds policy versions and persists them in both consent histories", () => {
  assert.match(normalized, /\^\[A-Za-z0-9\]\[A-Za-z0-9\._:-\]\{0,63\}\$/);
  assert.ok((normalized.match(/policy_version text/g) ?? []).length >= 4);
  assert.match(
    functionBlock("set_hall_of_fame_application_consent"),
    /'policy_version', v_policy_version/,
  );
  assert.match(
    functionBlock("set_hall_of_fame_publication_consent"),
    /'policy_version', v_policy_version/,
  );
});

test("uses a server-derived fourteen-day nomination and confirmation window", () => {
  assert.ok((normalized.match(/interval '14 days'/g) ?? []).length >= 6);
  assert.match(
    functionBlock("set_hall_of_fame_application_consent"),
    /v_expires_at := v_record\.created_at \+ interval '14 days'/,
  );
  assert.match(
    functionBlock("request_hall_of_fame_record_confirmation"),
    /v_requested_at \+ interval '14 days'/,
  );
});

test("extends publication consent without exposing evidence or companion identity", () => {
  for (const column of [
    "policy_version",
    "masked_display_name_consent",
    "full_display_name_consent",
    "badge_consent",
    "last_actor_user_id",
    "last_request_id",
  ]) assert.match(normalized, new RegExp(`add column ${column}`));
  const block = functionBlock("set_hall_of_fame_publication_consent");
  assert.doesNotMatch(block, /evidence|external_contact|email|phone|storage_path/);
});

test("models member confirmation request, response, cancellation, and withdrawal history", () => {
  assert.match(normalized, /create table public\.hall_of_fame_record_confirmation_history \(/);
  for (const action of ["request", "confirm", "decline", "cancel", "withdraw"]) {
    assert.match(normalized, new RegExp(`'hall_of_fame\\.confirmation\\.${action}'`));
  }
  assert.match(normalized, /unique \(confirmation_id, version\)/);
});

test("public confirmation RPCs never accept external contact data", () => {
  for (const name of [
    "request_hall_of_fame_record_confirmation",
    "respond_hall_of_fame_record_confirmation",
    "withdraw_hall_of_fame_record_confirmation",
  ]) {
    const block = functionBlock(name);
    assert.doesNotMatch(block.slice(0, block.indexOf("returns table")), /external|hmac|email|phone|token/);
  }
  assert.match(normalized, /new\.external_contact_hmac is not null/);
  assert.match(normalized, /new\.external_contact_masked is not null/);
});

test("enforces target-only consent and blocks self and nominator confirmation", () => {
  assert.match(
    functionBlock("set_hall_of_fame_application_consent"),
    /v_record\.target_user_id <> v_actor_user_id/,
  );
  assert.match(
    functionBlock("set_hall_of_fame_publication_consent"),
    /v_record\.target_user_id <> v_actor_user_id/,
  );
  const request = functionBlock("request_hall_of_fame_record_confirmation");
  assert.match(request, /HOF_SELF_CONFIRMATION_FORBIDDEN/);
  assert.match(request, /HOF_NOMINATOR_CONFIRMATION_FORBIDDEN/);
});

test("reuses the existing batch lock, authorization boundary, and request ledger", () => {
  for (const name of [
    "set_hall_of_fame_application_consent",
    "reissue_hall_of_fame_nomination_consent_request",
    "set_hall_of_fame_publication_consent",
    "request_hall_of_fame_record_confirmation",
    "respond_hall_of_fame_record_confirmation",
    "withdraw_hall_of_fame_record_confirmation",
  ]) {
    const block = functionBlock(name);
    assert.match(block, /hashtextextended\([^)]*8608\)/);
    assert.match(block, /private\.hall_of_fame_claim_request\(/);
    assert.match(block, /private\.lock_hall_of_fame_authorization_boundary\(\)/);
    assert.match(block, /private\.audit_and_complete_hall_of_fame_consent_confirmation\(/);
  }
});

test("checks optimistic batch versions after completed-request replay", () => {
  for (const name of [
    "set_hall_of_fame_application_consent",
    "reissue_hall_of_fame_nomination_consent_request",
    "set_hall_of_fame_publication_consent",
    "request_hall_of_fame_record_confirmation",
    "respond_hall_of_fame_record_confirmation",
    "withdraw_hall_of_fame_record_confirmation",
  ]) {
    const block = functionBlock(name);
    assert.ok(block.indexOf("if v_claim.replayed then") < block.indexOf("v_batch.version <> p_expected_batch_version"));
    assert.match(block, /HOF_STALE_APPLICATION_VERSION' using errcode = 'PT409'/);
  }
});

test("keeps no-op consent changes out of versions, history, and audit", () => {
  const application = functionBlock("set_hall_of_fame_application_consent");
  const publication = functionBlock("set_hall_of_fame_publication_consent");
  for (const block of [application, publication]) {
    const noOp = block.indexOf("'changed', false");
    const bump = block.indexOf("private.bump_hall_of_fame_consent_confirmation_versions(");
    assert.ok(noOp > 0 && bump > noOp);
    assert.match(block.slice(noOp, bump), /private\.complete_hall_of_fame_request\(/);
    assert.doesNotMatch(block.slice(noOp, bump), /insert into public\.audit_logs/);
  }
});

test("advances batch and record versions and appends both histories atomically", () => {
  const blockStart = normalized.indexOf(
    "create function private.bump_hall_of_fame_consent_confirmation_versions(",
  );
  const blockEnd = normalized.indexOf("$$;", blockStart);
  const block = normalized.slice(blockStart, blockEnd + 3);
  assert.match(block, /update public\.hall_of_fame_application_batches/);
  assert.match(block, /update public\.hall_of_fame_application_records/);
  assert.match(block, /insert into public\.hall_of_fame_application_history/);
  assert.match(block, /version = batch\.version \+ 1/);
  assert.match(block, /version = record\.version \+ 1/);
});

test("keeps all current/history tables RLS-forced with no direct app-role DML", () => {
  for (const table of [
    "hall_of_fame_application_consents",
    "hall_of_fame_application_consent_history",
    "hall_of_fame_record_confirmation_history",
  ]) {
    assert.match(normalized, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(normalized, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(normalized, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`));
  }
  assert.doesNotMatch(normalized, /create policy/i);
});

test("exposes only authenticated SECURITY DEFINER public mutations", () => {
  for (const name of [
    "set_hall_of_fame_application_consent",
    "reissue_hall_of_fame_nomination_consent_request",
    "set_hall_of_fame_publication_consent",
    "request_hall_of_fame_record_confirmation",
    "respond_hall_of_fame_record_confirmation",
    "withdraw_hall_of_fame_record_confirmation",
  ]) {
    const block = functionBlock(name);
    assert.match(block, /security definer set search_path = ''/);
    assert.match(normalized, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?\\) to authenticated`));
    assert.match(normalized, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?\\) from public, anon, service_role`));
  }
});

test("revokes every new private helper from all external roles", () => {
  for (const name of [
    "normalize_hall_of_fame_policy_version",
    "lock_active_hall_of_fame_actor",
    "bump_hall_of_fame_consent_confirmation_versions",
    "audit_and_complete_hall_of_fame_consent_confirmation",
    "guard_hall_of_fame_consent_confirmation_current",
  ]) {
    assert.match(normalized, new RegExp(`revoke all on function private\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`));
  }
});

test("backfills legacy publication consent before validating stronger checks", () => {
  const currentBackfill = normalized.indexOf("update public.hall_of_fame_publication_consents as consent set policy_version = 'hof-publication-legacy-v1'");
  const currentCheck = normalized.indexOf("add constraint hall_of_fame_publication_consents_name_scope_check");
  const historyBackfill = normalized.indexOf("update public.hall_of_fame_publication_consent_history as history set policy_version = 'hof-publication-legacy-v1'");
  const historyCheck = normalized.indexOf("add constraint hall_of_fame_publication_consent_history_name_scope_check");
  assert.ok(currentBackfill > 0 && currentBackfill < currentCheck);
  assert.ok(historyBackfill > 0 && historyBackfill < historyCheck);
  assert.match(normalized, /masked_display_name_consent = consent\.display_name_consent/);
  assert.match(normalized, /full_display_name_consent = false, badge_consent = false/);
});

test("makes application consent transitions explicit and preserves target withdrawal", () => {
  const block = functionBlock("set_hall_of_fame_application_consent");
  assert.match(block, /p_decision = 'grant' and v_current\.status <> 'pending'/);
  assert.match(block, /p_decision = 'decline' and v_current\.status <> 'pending'/);
  assert.match(block, /HOF_INVALID_CONSENT_TRANSITION' using errcode = 'PT409'/);
  assert.match(block, /application_type = 'club_nomination' then if p_decision <> 'withdraw'/);
  assert.doesNotMatch(block, /application_type = 'club_nomination' and p_decision <> 'withdraw'/);
  assert.match(block, /when p_decision = 'withdraw' then consent\.granted_at/);
});

test("locks an actor/request pair before any request-ledger row wait", () => {
  const helper = functionBlock("private.lock_hall_of_fame_mutation_request");
  assert.match(helper, /pg_try_advisory_xact_lock\(/);
  assert.match(helper, /p_actor_user_id::text \|\| ':' \|\| p_request_id::text/);
  assert.match(helper, /hashtextextended\([\s\S]*8609/);
  assert.match(helper, /errcode = 'PT409', message = 'HOF_REQUEST_IN_PROGRESS'/);

  const claim = functionBlock("private.hall_of_fame_claim_request");
  const earlyLock = claim.indexOf("private.lock_hall_of_fame_mutation_request(");
  const ledgerWait = claim.indexOf("select ledger.*");
  assert.ok(earlyLock > 0 && ledgerWait > earlyLock);
  assert.doesNotMatch(claim, /pg_try_advisory_xact_lock\(/);
});

test("puts the request lock before every new-RPC batch lock and ledger claim", () => {
  for (const name of [
    "set_hall_of_fame_application_consent",
    "reissue_hall_of_fame_nomination_consent_request",
    "set_hall_of_fame_publication_consent",
    "request_hall_of_fame_record_confirmation",
    "respond_hall_of_fame_record_confirmation",
    "withdraw_hall_of_fame_record_confirmation",
  ]) {
    const block = functionBlock(name);
    const earlyLock = block.indexOf("private.lock_hall_of_fame_mutation_request(");
    const batchLock = block.indexOf("pg_advisory_xact_lock(");
    const claim = block.indexOf("private.hall_of_fame_claim_request(");
    assert.ok(earlyLock > 0, `${name} must call the early request lock`);
    assert.ok(batchLock > earlyLock, `${name} must request-lock before its batch lock`);
    assert.ok(claim > batchLock, `${name} must claim the ledger after its batch lock`);
  }
});

test("wraps every previously batch-first B-2A mutation without changing its public signature", () => {
  for (const [publicName, privateName] of [
    ["set_hall_of_fame_round_snapshot", "b2a_set_round_snapshot_impl"],
    ["add_hall_of_fame_application_record", "b2a_add_application_record_impl"],
    ["update_hall_of_fame_application_record", "b2a_update_application_record_impl"],
    ["withdraw_hall_of_fame_application_record", "b2a_withdraw_application_record_impl"],
    ["withdraw_hall_of_fame_application_draft", "b2a_withdraw_application_draft_impl"],
  ]) {
    const block = functionBlock(publicName);
    const actorLock = block.indexOf("private.lock_active_hall_of_fame_actor(");
    const requestLock = block.indexOf("private.lock_hall_of_fame_mutation_request(");
    const implementation = block.indexOf(`private.${privateName}(`);
    assert.ok(actorLock > 0 && requestLock > actorLock && implementation > requestLock);
    assert.match(normalized, new RegExp(`revoke all on function private\\.${privateName}\\([\\s\\S]*?from public, anon, authenticated, service_role`));
  }
});

test("implements an authorized and idempotent nomination consent reissue", () => {
  const block = functionBlock("reissue_hall_of_fame_nomination_consent_request");
  assert.match(block, /v_batch\.application_type <> 'club_nomination'/);
  assert.match(block, /v_batch\.created_by_user_id <> v_actor_user_id/);
  assert.match(block, /private\.lock_and_authorize_hall_of_fame_batch_edit\(/);
  assert.match(block, /membership\.membership_status = 'active'/);
  assert.match(block, /v_from_status := v_consent\.status/);
  assert.match(block, /v_effective_status not in \('declined', 'withdrawn', 'expired'\)/);
  assert.match(block, /status = 'pending'/);
  assert.match(block, /expires_at = v_requested_at \+ interval '14 days'/);
  assert.match(block, /private\.hall_of_fame_claim_request\(/);
  assert.match(block, /private\.lock_hall_of_fame_mutation_request\(/);
  assert.ok(block.indexOf("private.lock_hall_of_fame_mutation_request") < block.indexOf("pg_advisory_xact_lock"));
  assert.match(block, /private\.audit_and_complete_hall_of_fame_consent_confirmation\(/);
});

test("enforces previous-version chains for every new consent and confirmation history", () => {
  for (const table of [
    "hall_of_fame_application_consent_history",
    "hall_of_fame_publication_consent_history",
    "hall_of_fame_record_confirmation_history",
  ]) {
    assert.match(normalized, new RegExp(`from public\\.${table} as previous_history`));
  }
  assert.ok((normalized.match(/previous_history\.version = new\.version - 1/g) ?? []).length >= 4);
  assert.ok((normalized.match(/previous_history\.to_status = new\.from_status/g) ?? []).length >= 4);
  assert.ok((normalized.match(/new\.from_status is not null/g) ?? []).length >= 4);
});
test("keeps compatibility backfills trigger-guarded and restores final guards", () => {
  const currentBackfill = normalized.indexOf("update public.hall_of_fame_publication_consents as consent");
  const historyBackfill = normalized.indexOf("update public.hall_of_fame_publication_consent_history as history");
  const finalCurrentGuard = normalized.lastIndexOf("create or replace function private.reject_hall_of_fame_mutation(");
  const finalHistoryGuard = normalized.lastIndexOf("create or replace function private.reject_hall_of_fame_append_only_mutation(");
  assert.ok(currentBackfill > 0 && finalCurrentGuard > currentBackfill);
  assert.ok(historyBackfill > currentBackfill && finalHistoryGuard > historyBackfill);
  assert.match(normalized, /pg_catalog\.to_jsonb\(new\) - 'policy_version'/);
  assert.doesNotMatch(normalized, /disable trigger|session_replication_role/);
});
test("contains no deferred Storage, evidence, submit, review, canonical, badge mutation, or destructive SQL", () => {
  assert.doesNotMatch(normalized, /create function public\.[a-z0-9_]*(?:evidence|submit|review|canonical|badge)/);
  assert.doesNotMatch(normalized, /storage\.objects/);
  assert.doesNotMatch(normalized, /drop table|truncate table|alter table .* disable row level security/);
});
