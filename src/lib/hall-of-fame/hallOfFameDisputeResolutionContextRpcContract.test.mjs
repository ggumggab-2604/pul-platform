import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260818000100_pul_hall_of_fame_dispute_resolution_context_rpc.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function functionBlock(name) {
  const start = migration.indexOf(`create function ${name}(`);
  assert.ok(start >= 0, `${name} function not found`);
  const end = migration.indexOf("\n$$;", start);
  assert.ok(end > start, `${name} function terminator not found`);
  return migration.slice(start, end + 4);
}

test("resolution context is an authenticated-only stable security boundary", () => {
  const block = functionBlock(
    "public.get_hall_of_fame_dispute_resolution_context",
  );

  assert.match(block, /language plpgsql\s+stable\s+security definer/);
  assert.match(block, /set search_path = ''/);
  assert.match(block, /'hall_of_fame\.disputes\.resolve'/);
  assert.match(
    migration,
    /revoke all on function public\.get_hall_of_fame_dispute_resolution_context\(uuid\)\s+from public, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_hall_of_fame_dispute_resolution_context\(uuid\)\s+to authenticated;/,
  );
});

test("resolution context returns only correction and revocation input fields", () => {
  const block = functionBlock(
    "public.get_hall_of_fame_dispute_resolution_context",
  );
  const returnHeader = block.slice(
    block.indexOf("returns table"),
    block.indexOf("language plpgsql"),
  );

  for (const field of [
    "dispute_id uuid",
    "dispute_type text",
    "dispute_version integer",
    "canonical_record_id uuid",
    "canonical_record_version integer",
    "record_type_code text",
    "played_on date",
    "course_name_snapshot text",
    "course_region_snapshot text",
    "course_environment text",
    "course_layout_snapshot text",
    "course_segment_snapshot text",
    "hole_number integer",
    "hole_par integer",
    "strokes integer",
    "nominating_club_id uuid",
  ]) {
    assert.match(returnHeader, new RegExp(field));
  }
  assert.doesNotMatch(
    returnHeader,
    /email|credential|internal_note|resolution_message|audit|ledger|evidence|storage|target_user_id|submitted_by_user_id/i,
  );
});

test("resolution context is exact-target, active-only, conflict-free, and state bounded", () => {
  const block = functionBlock(
    "public.get_hall_of_fame_dispute_resolution_context",
  );

  assert.match(block, /where dispute\.id = p_dispute_id/);
  assert.match(
    block,
    /v_actor in \(\s*v_dispute\.submitted_by_user_id,\s*v_dispute\.subject_user_id\s*\)/,
  );
  assert.match(block, /HOF_DISPUTE_REVIEW_CONFLICT_OF_INTEREST/);
  assert.match(block, /v_dispute\.status <> 'under_review'/);
  assert.match(block, /v_dispute\.canonical_record_id is null/);
  for (const disputeType of [
    "correction_request",
    "subject_objection",
    "fraud_report",
  ]) {
    assert.match(block, new RegExp(`'${disputeType}'`));
  }
  assert.doesNotMatch(block, /'decision_appeal'/);
  assert.match(block, /canonical\.id = v_dispute\.canonical_record_id/);
  assert.match(
    block,
    /v_canonical\.target_user_id <> v_dispute\.subject_user_id/,
  );
  assert.match(block, /v_canonical\.validity_status <> 'active'/);
  assert.match(block, /HOF_DISPUTE_RESOLUTION_CONTEXT_UNAVAILABLE/);
});

test("resolution context is read-only and does not widen table access", () => {
  const executableSql = migration.replace(/^\s*--.*$/gm, "");

  assert.doesNotMatch(executableSql, /\b(insert into|update|delete from|merge into)\b/i);
  assert.doesNotMatch(executableSql, /grant\s+(select|insert|update|delete)\s+on/i);
  assert.doesNotMatch(executableSql, /create table|alter table|create policy/i);
  assert.doesNotMatch(
    executableSql,
    /audit_logs|hall_of_fame_mutation_requests|hall_of_fame_dispute_reviews|storage\.objects/i,
  );
  assert.doesNotMatch(
    executableSql,
    /create or replace function public\.(resolve_hall_of_fame_dispute_with_correction|resolve_hall_of_fame_dispute_with_revoke)/,
  );
});
