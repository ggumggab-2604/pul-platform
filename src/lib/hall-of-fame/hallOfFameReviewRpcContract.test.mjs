import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260810000200_pul_hall_of_fame_review_read_start_rpc.sql",
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

test("review action CHECK adds only the approved internal-note action", () => {
  const actions = [
    "review_started",
    "review_note_added",
    "additional_info_requested",
    "approval_recommended",
    "rejection_recommended",
    "final_approved",
    "final_rejected",
    "cancelled",
  ];
  for (const action of actions) {
    assert.match(migration, new RegExp(`'${action}'`));
  }
  assert.doesNotMatch(migration, /create table/i);
});

test("queue and detail RPCs have exact authenticated-only surfaces", () => {
  const queue = functionBlock("public.list_hall_of_fame_review_queue");
  const detail = functionBlock("public.get_hall_of_fame_review_detail");
  assert.match(queue, /p_limit integer default 50,\s*p_offset integer default 0/);
  assert.match(detail, /p_application_batch_id uuid/);
  for (const block of [queue, detail]) {
    assert.match(block, /security definer/);
    assert.match(block, /set search_path = ''/);
    assert.match(block, /auth\.uid\(\)/);
    assert.match(block, /hall_of_fame\.applications\.read/);
  }
  assertAuthenticatedOnly(
    "public.list_hall_of_fame_review_queue",
    "integer, integer",
  );
  assertAuthenticatedOnly("public.get_hall_of_fame_review_detail", "uuid");
});

test("queue is bounded and limited to reviewable states", () => {
  const block = functionBlock("public.list_hall_of_fame_review_queue");
  assert.match(block, /p_limit > 100/);
  assert.match(block, /p_offset > 10000/);
  for (const state of ["submitted", "under_review", "additional_info_required"]) {
    assert.match(block, new RegExp(`'${state}'`));
  }
  assert.doesNotMatch(
    block,
    /internal_note|storage_path|sha256|signed_url|email|phone|token/i,
  );
});

test("detail returns review DTOs without private Storage or contact fields", () => {
  const block = functionBlock("public.get_hall_of_fame_review_detail");
  for (const marker of [
    "application_batch",
    "round_snapshot",
    "application_records",
    "review_events",
    "application_consents",
    "publication_consent",
    "valid_companion_count",
    "confirmation_status_summary",
    "verified_mime_type",
    "verified_size_bytes",
    "internal_note",
  ]) {
    assert.match(block, new RegExp(marker));
  }
  assert.doesNotMatch(
    block,
    /storage_path|sha256|signed_url|access_token|refresh_token|email|phone|original_filename/i,
  );
});

test("review start has the exact actorless authenticated mutation surface", () => {
  const block = functionBlock("public.start_hall_of_fame_application_review");
  const header = block.split("returns table", 1)[0];
  assert.match(
    header,
    /p_application_batch_id uuid,\s*p_expected_batch_version integer,\s*p_request_id uuid/,
  );
  assert.doesNotMatch(header, /actor_user_id/);
  assert.match(block, /security definer/);
  assert.match(block, /set search_path = ''/);
  assert.match(block, /v_actor_user_id uuid := auth\.uid\(\)/);
  assert.match(block, /hall_of_fame\.applications\.review/);
  assertAuthenticatedOnly(
    "public.start_hall_of_fame_application_review",
    "uuid, integer, uuid",
  );
});

test("review start lock order is request then batch then claim then permission and rows", () => {
  const block = functionBlock("public.start_hall_of_fame_application_review");
  const actor = block.indexOf("lock_active_hall_of_fame_actor(");
  const request = block.indexOf("lock_hall_of_fame_mutation_request(");
  const batchAdvisory = block.indexOf("8608", request);
  const claim = block.indexOf("hall_of_fame_claim_request(", batchAdvisory);
  const permission = block.indexOf(
    "require_hall_of_fame_platform_permission(",
    claim,
  );
  const batchRow = block.indexOf("for update;", permission);
  const recordRows = block.indexOf("order by record.id\n  for update;", batchRow);
  assert.ok(actor >= 0);
  assert.ok(request > actor);
  assert.ok(batchAdvisory > request);
  assert.ok(claim > batchAdvisory);
  assert.ok(permission > claim);
  assert.ok(batchRow > permission);
  assert.ok(recordRows > batchRow);
});

test("review start is a single submitted-to-under-review transition", () => {
  const block = functionBlock("public.start_hall_of_fame_application_review");
  assert.match(block, /v_batch\.status <> 'submitted'/);
  assert.match(block, /v_batch\.version <> p_expected_batch_version/);
  assert.match(
    block,
    /update public\.hall_of_fame_application_batches[\s\S]*status = 'under_review'[\s\S]*version = batch\.version \+ 1/,
  );
  assert.match(
    block,
    /update public\.hall_of_fame_application_records[\s\S]*review_status = 'under_review'[\s\S]*version = record\.version \+ 1/,
  );
  assert.match(block, /review_status <> 'withdrawn'/);
  assert.match(block, /review_action[\s\S]*'review_started'/);
  assert.match(block, /insert into public\.hall_of_fame_application_history/);
  assert.match(block, /insert into public\.audit_logs/);
  assert.match(block, /complete_hall_of_fame_request\(/);
  assert.doesNotMatch(
    block,
    /canonical|badge|additional_info_requested|final_approved|final_rejected/i,
  );
});

test("review start replay and stale paths use approved ledger contracts", () => {
  const block = functionBlock("public.start_hall_of_fame_application_review");
  assert.match(block, /hall_of_fame\.application\.review\.start/);
  assert.match(block, /if v_claim\.replayed then/);
  assert.match(block, /HOF_STALE_VERSION[\s\S]*errcode = 'PT409'/);
  assert.match(block, /HOF_APPLICATION_NOT_SUBMITTED[\s\S]*errcode = 'PT409'/);
});

test("internal note is append-only, normalized, bounded, and version-neutral", () => {
  const block = functionBlock("public.add_hall_of_fame_internal_review_note");
  const header = block.split("returns table", 1)[0];
  assert.match(
    header,
    /p_application_batch_id uuid,\s*p_expected_batch_version integer,\s*p_note text,\s*p_request_id uuid/,
  );
  assert.doesNotMatch(header, /actor_user_id/);
  assert.match(block, /hall_of_fame\.applications\.review/);
  assert.match(block, /review_note_added/);
  assert.match(block, /pg_catalog\.btrim\(p_note\)/);
  assert.match(block, /char_length\(v_note\) > 2000/);
  assert.match(block, /under_review', 'additional_info_required/);
  assert.match(block, /HOF_INTERNAL_REVIEW_NOTE_SECRET_FORBIDDEN/);
  assert.match(block, /if v_claim\.replayed then/);
  assert.doesNotMatch(
    block,
    /update public\.hall_of_fame_application_(?:batches|records)|insert into public\.hall_of_fame_application_history/,
  );
  assertAuthenticatedOnly(
    "public.add_hall_of_fame_internal_review_note",
    "uuid, integer, text, uuid",
  );
});

test("review guards are ledger-bound and preserve submit/evidence routing", () => {
  for (const helper of [
    "private.enforce_guarded_hall_of_fame_review_mutation",
    "private.enforce_hall_of_fame_review_history_append",
    "private.enforce_hall_of_fame_review_append",
  ]) {
    const block = functionBlock(helper);
    assert.match(block, /security definer/);
    assert.match(block, /set search_path = ''/);
    assert.match(block, /auth\.uid\(\)/);
    assert.match(block, /hall_of_fame_mutation_context_is_valid\(\)/);
  }
  assert.match(migration, /not like 'hall_of_fame\.evidence\.%'/);
  assert.match(migration, /<> 'hall_of_fame\.application\.submit'/);
  assert.doesNotMatch(
    migration,
    /drop trigger hall_of_fame_.*_(?:evidence|submit)_guard_before_mutation/,
  );
});

test("review history guard enforces the monotonic submitted chain", () => {
  const block = functionBlock(
    "private.enforce_hall_of_fame_review_history_append",
  );
  assert.match(block, /new\.from_status <> 'submitted'/);
  assert.match(block, /new\.to_status <> 'under_review'/);
  assert.match(block, /previous_history\.version = new\.version - 1/);
  assert.match(block, /previous_history\.to_status = 'submitted'/);
  assert.match(block, /new\.actor_platform_role <> v_platform_role/);
  assert.match(block, /new\.actor_membership_id is not null/);
});

test("Evidence server signature and owner paths are preserved with bounded moderator access", () => {
  const block = functionBlock(
    "public.get_hall_of_fame_evidence_read_context_server",
  );
  assert.match(
    block,
    /p_actor_user_id uuid,\s*p_evidence_id uuid[\s\S]*returns table \(\s*evidence_id uuid,\s*storage_bucket text,\s*storage_path text,\s*mime_type text,\s*byte_size bigint,\s*sha256_hex text/,
  );
  assert.match(block, /require_hall_of_fame_service_role\(\)/);
  assert.match(block, /v_evidence\.status <> 'available'/);
  assert.match(block, /p_actor_user_id = v_batch\.created_by_user_id/);
  assert.match(block, /p_actor_user_id = v_record\.target_user_id/);
  assert.match(block, /club\.achievement_applications\.manage/);
  assert.match(block, /hall_of_fame\.evidence\.read/);
  for (const state of ["submitted", "under_review", "additional_info_required"]) {
    assert.match(block, new RegExp(`'${state}'`));
  }
  assert.doesNotMatch(block, /'draft'|'approved'|'rejected'|'cancelled'/);
  assert.match(
    migration,
    /grant execute on function public\.get_hall_of_fame_evidence_read_context_server\(uuid, uuid\)\s*to service_role;/,
  );
});

test("private helpers are not externally executable", () => {
  for (const name of [
    "private.require_hall_of_fame_platform_permission",
    "private.enforce_guarded_hall_of_fame_review_mutation",
    "private.enforce_hall_of_fame_review_history_append",
    "private.enforce_hall_of_fame_review_append",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function ${name.replaceAll(".", "\\.")}\\([\\s\\S]*?from public, anon, authenticated, service_role;`,
      ),
    );
  }
});

test("migration does not broaden tables or implement deferred workflows", () => {
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|all) on table/i);
  assert.doesNotMatch(migration, /storage\.objects/);
  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(
    migration,
    /create (?:or replace )?function public\.(?:request_hall_of_fame_additional_info|resubmit_hall_of_fame|withdraw_submitted_hall_of_fame|decide_hall_of_fame|create_hall_of_fame_badge)/,
  );
});
