import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260816000100_pul_hall_of_fame_member_own_read_contract.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function functionBlock(qualifiedName) {
  const start = migration.indexOf(`create function ${qualifiedName}(`);
  assert.ok(start >= 0, `missing function ${qualifiedName}`);
  const end = migration.indexOf("\n$$;", start);
  assert.ok(end > start, `unterminated function ${qualifiedName}`);
  return migration.slice(start, end + 4);
}

test("member own-read RPCs are typed authenticated-only security boundaries", () => {
  for (const name of [
    "public.list_my_hall_of_fame_applications",
    "public.list_my_hall_of_fame_records",
  ]) {
    const block = functionBlock(name);
    assert.match(block, /p_limit integer default 50/);
    assert.match(block, /p_offset integer default 0/);
    assert.match(block, /security definer[\s\S]*set search_path = ''/);
    assert.match(block, /v_actor_user_id uuid := auth\.uid\(\)/);
    assert.match(block, /HOF_AUTHENTICATION_REQUIRED/);
    assert.match(block, /HOF_INVALID_PAGINATION/);
    assert.doesNotMatch(block.split("returns table", 1)[0], /user_id uuid/);
  }

  assert.match(
    migration,
    /revoke all on function public\.list_my_hall_of_fame_applications\(integer, integer\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute[\s\S]*to authenticated;/,
  );
  assert.match(
    migration,
    /revoke all on function public\.list_my_hall_of_fame_records\(integer, integer\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute[\s\S]*to authenticated;/,
  );
});

test("application DTO uses submitter-or-subject ownership and safe action targets", () => {
  const block = functionBlock("public.list_my_hall_of_fame_applications");
  assert.match(block, /application_record_id uuid/);
  assert.match(block, /application_type text/);
  assert.match(block, /batch_status text/);
  assert.match(block, /record_status text/);
  assert.match(block, /record_type_name text/);
  assert.match(block, /allowed_dispute_types text\[\]/);
  assert.match(block, /can_submit_dispute boolean/);
  assert.match(
    block,
    /where batch\.created_by_user_id = v_actor_user_id[\s\S]*or application_record\.target_user_id = v_actor_user_id/,
  );
  assert.match(block, /'application_record'/);
  assert.doesNotMatch(
    block,
    /reviewer|resolver|internal_note|audit_logs|mutation_requests|evidence_files/,
  );
});

test("canonical DTO keeps terminal state and badge status explicit without private reasons", () => {
  const block = functionBlock("public.list_my_hall_of_fame_records");
  assert.match(block, /canonical_record_id uuid/);
  assert.match(block, /validity_status text/);
  assert.match(block, /publication_status text/);
  assert.match(block, /badges jsonb/);
  assert.match(block, /badge_source\.status/);
  assert.match(
    block,
    /where canonical\.target_user_id = v_actor_user_id[\s\S]*or batch\.created_by_user_id = v_actor_user_id/,
  );
  assert.match(block, /'canonical_record'/);
  assert.doesNotMatch(
    block,
    /suppression_reason|revocation_reason|approved_by_user_id|revoked_by_user_id|internal_note|audit_logs|mutation_requests/,
  );
});

test("action availability mirrors dispute submit eligibility and open duplicate rules", () => {
  const helper = functionBlock("private.hall_of_fame_allowed_dispute_types");
  assert.match(helper, /account\.account_status = 'active'/);
  assert.match(helper, /p_target_status = 'rejected'/);
  assert.match(helper, /p_batch_status in \('rejected', 'partially_approved'\)/);
  assert.match(helper, /p_target_status in \('active', 'corrected', 'revoked'\)/);
  assert.match(helper, /p_target_status = 'revoked'/);
  for (const type of [
    "correction_request",
    "decision_appeal",
    "subject_objection",
    "fraud_report",
  ]) {
    assert.match(helper, new RegExp(`'${type}'`));
  }
  assert.match(helper, /dispute\.status in \('open', 'under_review'\)/);
  assert.match(helper, /dispute\.application_record_id = p_target_id/);
  assert.match(helper, /dispute\.canonical_record_id = p_target_id/);
  assert.match(
    migration,
    /revoke all on function private\.hall_of_fame_allowed_dispute_types\([\s\S]*from public, anon, authenticated, service_role;/,
  );
});

test("migration preserves raw table ACLs, public projection, and mutation workflows", () => {
  assert.doesNotMatch(migration, /grant select on/);
  assert.doesNotMatch(migration, /create or replace function public\.list_hall_of_fame_public_records/);
  assert.doesNotMatch(migration, /create or replace function public\.submit_hall_of_fame_dispute/);
  assert.doesNotMatch(migration, /create table/);
  assert.doesNotMatch(
    migration,
    /insert into|update public\.|delete from|audit_logs|hall_of_fame_mutation_requests/,
  );
});
