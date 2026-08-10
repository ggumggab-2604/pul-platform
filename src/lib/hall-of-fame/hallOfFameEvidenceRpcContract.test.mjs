import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260808000200_pul_hall_of_fame_evidence_storage_rpc.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function functionBlock(qualifiedName) {
  const start = migration.indexOf("create function " + qualifiedName + "(");
  assert.ok(start >= 0, "missing function " + qualifiedName);
  const end = migration.indexOf("\n$$;", start);
  assert.ok(end > start, "unterminated function " + qualifiedName);
  return migration.slice(start, end + 4);
}

test("evidence lifecycle schema remains private and ledger-bound", () => {
  assert.match(migration, /create table public\.hall_of_fame_evidence_file_history/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /hall_of_fame_evidence_file_history_ledger_fkey/);
  assert.match(migration, /unique \(evidence_id, evidence_version\)/);
  assert.match(migration, /original_filename is null/);
  assert.match(migration, /declared_byte_size between 1 and 10485760/);
  assert.match(migration, /applications\/.*application_batch_id.*original/s);
  assert.doesNotMatch(migration, /create policy[\s\S]*storage\.objects/i);
});

test("authenticated and service-only RPC surfaces are separated", () => {
  for (const name of [
    "create_hall_of_fame_evidence_upload_intent",
    "create_hall_of_fame_evidence_replacement_intent",
    "withdraw_hall_of_fame_evidence",
  ]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to authenticated;`));
  }
  for (const name of [
    "finalize_hall_of_fame_evidence_server",
    "mark_hall_of_fame_evidence_failed_server",
    "expire_hall_of_fame_evidence_server",
    "get_hall_of_fame_evidence_upload_context_server",
    "get_hall_of_fame_evidence_read_context_server",
    "list_hall_of_fame_evidence_cleanup_candidates_server",
    "mark_hall_of_fame_evidence_storage_deleted_server",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role;`));
  }
});

test("replacement, actual finalize metadata, cleanup and early request locks are explicit", () => {
  assert.match(migration, /lock_hall_of_fame_mutation_request\(p_actor,\s*p_request\)/);
  assert.match(migration, /p_verified_sha256_hex text/);
  assert.match(migration, /sha256 = pg_catalog\.decode\(v_sha, 'hex'\)/);
  assert.match(migration, /v_old\.status <> 'available'/);
  assert.match(migration, /set status = 'replaced'/);
  assert.match(migration, /status in \('failed', 'expired', 'replaced', 'deleted'\)/);
  assert.match(migration, /evidence\.status = 'pending_upload'[\s\S]*upload_expires_at <= pg_catalog\.now\(\)/);
});

test("system cleanup derives its subject without impersonating the uploader", () => {
  const terminal = functionBlock(
    "private.execute_hall_of_fame_evidence_system_terminal_transition",
  );
  const marker = functionBlock(
    "public.mark_hall_of_fame_evidence_storage_deleted_server",
  );
  assert.match(terminal, /v_subject := v_evidence\.uploaded_by_user_id/);
  assert.match(marker, /v_subject := v_evidence\.uploaded_by_user_id/);
  assert.doesNotMatch(terminal, /lock_active_hall_of_fame_actor/);
  assert.doesNotMatch(terminal, /authorize_hall_of_fame_evidence_edit/);
  assert.doesNotMatch(marker, /lock_active_hall_of_fame_actor/);
  assert.match(migration, /null, 'system', v_operation/);
  assert.match(
    migration,
    /execution_actor_type[\s\S]*service_role_system/,
  );
  assert.match(
    migration,
    /execution_actor_type text not null default 'user'/,
  );
});

test("batch serialization precedes new ledger claims without weakening request locks", () => {
  for (const name of [
    "private.execute_hall_of_fame_evidence_mutation",
    "private.execute_hall_of_fame_evidence_system_terminal_transition",
    "public.mark_hall_of_fame_evidence_storage_deleted_server",
  ]) {
    const block = functionBlock(name);
    const requestLock = block.indexOf("lock_hall_of_fame_mutation_request(");
    const batchLock = block.indexOf("pg_advisory_xact_lock(");
    const claim = block.indexOf("hall_of_fame_claim_request(");
    assert.ok(requestLock >= 0, name + " request lock missing");
    assert.ok(batchLock > requestLock, name + " batch lock must follow request lock");
    assert.ok(claim > batchLock, name + " claim must follow batch serialization");
  }
});

test("service cleanup RPC signatures cannot accept an uploader actor", () => {
  assert.match(
    migration,
    /create function public\.mark_hall_of_fame_evidence_failed_server\(\s*p_evidence_id uuid,/,
  );
  assert.match(
    migration,
    /create function public\.expire_hall_of_fame_evidence_server\(\s*p_evidence_id uuid,/,
  );
  assert.match(
    migration,
    /create function public\.mark_hall_of_fame_evidence_storage_deleted_server\(\s*p_evidence_id uuid,/,
  );
  for (const name of [
    "public.mark_hall_of_fame_evidence_failed_server",
    "public.expire_hall_of_fame_evidence_server",
    "public.mark_hall_of_fame_evidence_storage_deleted_server",
  ]) {
    const header = functionBlock(name).split("returns table", 1)[0];
    assert.doesNotMatch(header, /p_actor_user_id/);
  }
});

test("previous HOF consent RPC signatures are not replaced", () => {
  assert.doesNotMatch(migration, /create or replace function public\.set_hall_of_fame_application_consent/);
  assert.doesNotMatch(migration, /create or replace function public\.set_hall_of_fame_publication_consent/);
  assert.doesNotMatch(migration, /create or replace function public\.respond_hall_of_fame_record_confirmation/);
});
