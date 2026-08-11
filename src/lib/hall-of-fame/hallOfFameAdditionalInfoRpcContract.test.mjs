import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260811000100_pul_hall_of_fame_additional_info_resubmit_rpc.sql",
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

test("message schema has explicit recipient, reply, record, and typed request shape", () => {
  for (const marker of [
    "recipient_user_id",
    "reply_to_message_id",
    "request_kind",
    "requested_evidence_type",
    "hall_of_fame_application_messages_workflow_shape_check",
    "hall_of_fame_application_messages_response_uidx",
  ]) {
    assert.match(migration, new RegExp(marker));
  }
  assert.match(
    migration,
    /request_kind in \(\s*'text_response',\s*'supplemental_evidence',\s*'text_and_evidence'/,
  );
  assert.match(
    migration,
    /message_type = 'applicant_response'[\s\S]*reply_to_message_id is not null/,
  );
});

test("supplemental evidence has a same-batch same-record request foreign key", () => {
  assert.match(
    migration,
    /foreign key \(\s*additional_info_request_message_id,\s*application_batch_id,\s*application_record_id\s*\)[\s\S]*references public\.hall_of_fame_application_messages/,
  );
  const guard = functionBlock(
    "private.enforce_hall_of_fame_evidence_request_link",
  );
  assert.match(guard, /HOF_EVIDENCE_REQUEST_LINK_IMMUTABLE/);
  assert.match(guard, /request_message\.recipient_user_id = v_actor/);
  assert.match(guard, /request_message\.requested_evidence_type = new\.evidence_type/);
});

test("request RPC surface is actorless, authenticated-only, and permission-bound", () => {
  const block = functionBlock("public.request_hall_of_fame_additional_info");
  const header = block.split("returns table", 1)[0];
  assert.match(
    header,
    /p_application_batch_id uuid,[\s\S]*p_expected_batch_version integer,[\s\S]*p_recipient_user_id uuid,[\s\S]*p_application_record_id uuid,[\s\S]*p_request_kind text,[\s\S]*p_requested_evidence_type text,[\s\S]*p_message text,[\s\S]*p_request_id uuid/,
  );
  assert.doesNotMatch(header, /actor_user_id/);
  assert.match(block, /v_actor_user_id uuid := auth\.uid\(\)/);
  assert.match(block, /hall_of_fame\.applications\.request_additional_info/);
  assertAuthenticatedOnly(
    "public.request_hall_of_fame_additional_info",
    "uuid, integer, uuid, uuid, text, text, text, uuid",
  );
});

test("recipient validation is application-type and record scoped", () => {
  const block = functionBlock("public.request_hall_of_fame_additional_info");
  assert.match(block, /p_recipient_user_id <> v_batch\.created_by_user_id/);
  assert.match(block, /p_recipient_user_id = v_record\.target_user_id/);
  assert.match(block, /p_application_record_id is not null/);
  assert.match(block, /record\.application_batch_id = p_application_batch_id/);
  assert.match(block, /HOF_ADDITIONAL_INFO_RECIPIENT_INVALID/);
  const batchLock = block.indexOf("8608");
  const exactRecordCheck = block.indexOf(
    "and record.application_batch_id = p_application_batch_id",
    batchLock,
  );
  const claim = block.indexOf("hall_of_fame_claim_request(", exactRecordCheck);
  assert.ok(exactRecordCheck > batchLock, "record scope check must follow lock");
  assert.ok(claim > exactRecordCheck, "record scope check must precede claim");
});

test("recipient and readiness account state checks hold deterministic row locks", () => {
  const request = functionBlock("public.request_hall_of_fame_additional_info");
  assert.match(
    request,
    /select account\.account_status[\s\S]*where account\.id = p_recipient_user_id[\s\S]*for share;/,
  );
  const recipientLock = request.indexOf("select account.account_status");
  const recipientScope = request.indexOf(
    "if v_batch.application_type in (",
    recipientLock,
  );
  const mutation = request.indexOf(
    "update public.hall_of_fame_application_batches",
    recipientScope,
  );
  assert.ok(recipientLock >= 0, "recipient account lock missing");
  assert.ok(recipientScope > recipientLock, "recipient scope must follow lock");
  assert.ok(mutation > recipientScope, "mutation must follow recipient validation");

  const lock = functionBlock(
    "private.lock_hall_of_fame_readiness_accounts",
  );
  assert.match(lock, /from public\.user_accounts as account/);
  assert.match(lock, /select record\.target_user_id/);
  assert.match(lock, /select confirmation\.confirmer_user_id/);
  assert.match(lock, /confirmation\.confirmation_role = 'round_companion'/);
  assert.match(lock, /confirmation\.status = 'confirmed'/);
  assert.match(lock, /order by account\.id[\s\S]*for share;/);

  const readiness = functionBlock(
    "private.validate_hall_of_fame_application_readiness",
  );
  const accountLock = readiness.indexOf(
    "private.lock_hall_of_fame_readiness_accounts(",
  );
  const targetCheck = readiness.indexOf(
    "left join public.user_accounts as account",
    accountLock,
  );
  const confirmerCheck = readiness.indexOf(
    "join public.user_accounts as confirmer",
    targetCheck,
  );
  assert.ok(accountLock >= 0, "readiness account lock missing");
  assert.ok(targetCheck > accountLock, "target check must follow account lock");
  assert.ok(
    confirmerCheck > targetCheck,
    "confirmer check must follow account lock",
  );
});

test("first request transitions every active record while repeated AIR does not bump", () => {
  const block = functionBlock("public.request_hall_of_fame_additional_info");
  assert.match(block, /v_batch\.status = 'under_review'/);
  assert.match(
    block,
    /status = 'additional_info_required',[\s\S]*version = batch\.version \+ 1/,
  );
  assert.match(
    block,
    /review_status = 'additional_info_required',[\s\S]*version = record\.version \+ 1/,
  );
  assert.match(block, /v_new_batch_version := v_batch\.version/);
  assert.match(block, /'additional_info_requested'/);
});

test("response is exact-recipient, reply-linked, canonical, and version neutral", () => {
  const block = functionBlock("public.respond_to_hall_of_fame_additional_info");
  assert.match(block, /request_message\.recipient_user_id = v_actor_user_id/);
  assert.match(block, /reply_to_message_id/);
  assert.match(block, /HOF_ADDITIONAL_INFO_ALREADY_RESPONDED/);
  assert.match(block, /v_batch\.status <> 'additional_info_required'/);
  assert.doesNotMatch(block, /update public\.hall_of_fame_application_batches/);
  assert.doesNotMatch(block, /insert into public\.hall_of_fame_application_history/);
  assertAuthenticatedOnly(
    "public.respond_to_hall_of_fame_additional_info",
    "uuid, integer, text, uuid",
  );
});

test("supplemental intent is recipient-only and does not broaden draft intent", () => {
  const block = functionBlock(
    "private.execute_hall_of_fame_supplemental_evidence_intent",
  );
  assert.match(block, /request_message\.recipient_user_id = p_actor_user_id/);
  assert.match(block, /v_batch\.status <> 'additional_info_required'/);
  assert.match(block, /v_record\.review_status <> 'additional_info_required'/);
  assert.match(block, /additional_info_request_message_id/);
  assert.doesNotMatch(block, /replacement_intent/);
  assertAuthenticatedOnly(
    "public.create_hall_of_fame_supplemental_evidence_upload_intent",
    "uuid, text, text, bigint, integer, uuid",
  );
});

test("supplemental finalize keeps service-role-only public contract", () => {
  const block = functionBlock("public.finalize_hall_of_fame_evidence_server");
  assert.match(block, /private\.require_hall_of_fame_service_role\(\)/);
  assert.match(block, /v_is_supplemental/);
  assert.match(
    block,
    /private\.execute_hall_of_fame_supplemental_evidence_finalize/,
  );
  assert.match(
    migration,
    /revoke all on function public\.finalize_hall_of_fame_evidence_server\([\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.finalize_hall_of_fame_evidence_server\([\s\S]*to service_role;/,
  );
});

test("request satisfaction counts only canonical response and available linked evidence", () => {
  const block = functionBlock(
    "private.assert_hall_of_fame_additional_info_satisfied",
  );
  assert.match(block, /response\.reply_to_message_id = request_message\.id/);
  assert.match(
    block,
    /evidence\.additional_info_request_message_id = request_message\.id/,
  );
  assert.match(block, /evidence\.status = 'available'/);
  assert.doesNotMatch(block, /pending_upload[^)]*satisfied/i);
});

test("resubmit is creator-only, preserves submitted_at, and stops at submitted", () => {
  const block = functionBlock("public.resubmit_hall_of_fame_application");
  assert.match(block, /v_batch\.created_by_user_id <> v_actor_user_id/);
  assert.match(block, /v_batch\.status <> 'additional_info_required'/);
  assert.match(block, /validate_hall_of_fame_application_readiness\(/);
  assert.match(block, /assert_hall_of_fame_additional_info_satisfied\(/);
  assert.match(block, /status = 'submitted'/);
  assert.doesNotMatch(block, /submitted_at\s*=/);
  assert.doesNotMatch(block, /status = 'under_review'/);
  assertAuthenticatedOnly(
    "public.resubmit_hall_of_fame_application",
    "uuid, integer, uuid",
  );
});

test("submit readiness is shared without changing the public submit signature", () => {
  const shared = functionBlock(
    "private.validate_hall_of_fame_application_readiness",
  );
  const wrapper = functionBlock(
    "private.validate_hall_of_fame_application_submission",
  );
  assert.match(shared, /p_required_status text/);
  assert.match(shared, /'draft', 'additional_info_required'/);
  assert.match(wrapper, /'draft'/);
  assert.doesNotMatch(migration, /drop function public\.submit_hall_of_fame_application/);
});

test("request, response, and resubmit lock request before batch and use compatible namespaces", () => {
  for (const name of [
    "public.request_hall_of_fame_additional_info",
    "public.respond_to_hall_of_fame_additional_info",
    "public.resubmit_hall_of_fame_application",
  ]) {
    const block = functionBlock(name);
    const requestLock = block.indexOf("lock_hall_of_fame_mutation_request(");
    const batchLock = block.indexOf("8608", requestLock);
    const evidenceLock = block.indexOf("8610", batchLock);
    const claim = block.indexOf("hall_of_fame_claim_request(", evidenceLock);
    assert.ok(requestLock >= 0, `${name}: missing request lock`);
    assert.ok(batchLock > requestLock, `${name}: batch lock order`);
    assert.ok(evidenceLock > batchLock, `${name}: evidence lock order`);
    assert.ok(claim > evidenceLock, `${name}: claim order`);
  }
});

test("all new helpers are SECURITY DEFINER with explicit search path and no external ACL", () => {
  for (const name of [
    "private.enforce_guarded_hall_of_fame_additional_info_mutation",
    "private.enforce_hall_of_fame_additional_info_history_append",
    "private.enforce_hall_of_fame_additional_info_review_append",
    "private.enforce_hall_of_fame_additional_info_message_append",
    "private.lock_hall_of_fame_readiness_accounts",
    "private.validate_hall_of_fame_application_readiness",
    "private.assert_hall_of_fame_additional_info_satisfied",
    "private.lock_and_authorize_hall_of_fame_supplemental_evidence",
    "private.execute_hall_of_fame_supplemental_evidence_intent",
    "private.execute_hall_of_fame_supplemental_evidence_finalize",
  ]) {
    const block = functionBlock(name);
    assert.match(block, /security definer/);
    assert.match(block, /set search_path = ''/);
  }
  assert.doesNotMatch(migration, /grant execute on function private\./);
});

test("table ACLs and FORCE RLS are not broadened", () => {
  assert.doesNotMatch(
    migration,
    /grant\s+(select|insert|update|delete|all)[\s\S]*on\s+(table\s+)?public\.hall_of_fame_/i,
  );
  assert.doesNotMatch(migration, /no force row level security/i);
  assert.doesNotMatch(migration, /create policy/i);
});

test("B-3-2B withdrawal and final-decision scope is absent", () => {
  assert.doesNotMatch(
    migration,
    /create (or replace )?function public\..*(withdraw.*application|final.*decision|approve|reject)/i,
  );
  assert.doesNotMatch(
    migration,
    /hall_of_fame_canonical|badge_source|public_projection/i,
  );
});
