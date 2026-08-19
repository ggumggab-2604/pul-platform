import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260820000100_pul_hall_of_fame_member_achievement_badge_read_contract.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function functionBlock() {
  const start = migration.indexOf(
    "create function public.list_hall_of_fame_public_achievements_for_club_members(",
  );
  assert.ok(start >= 0, "missing member achievement read function");
  const end = migration.indexOf("\n$$;", start);
  assert.ok(end > start, "unterminated member achievement read function");
  return migration.slice(start, end + 4);
}

test("bulk achievement read is bounded, stable, security-definer, and authenticated-only", () => {
  const block = functionBlock();
  assert.match(block, /p_club_id uuid,[\s\S]*p_membership_ids uuid\[\]/);
  assert.match(block, /stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.match(block, /cardinality\(p_membership_ids\) > 100/);
  assert.match(
    migration,
    /revoke all on function public\.list_hall_of_fame_public_achievements_for_club_members\(uuid, uuid\[\]\)[\s\S]*from public, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.list_hall_of_fame_public_achievements_for_club_members\(uuid, uuid\[\]\)[\s\S]*to authenticated;/,
  );
});

test("caller must be an active account with club member read permission", () => {
  const block = functionBlock();
  assert.match(block, /v_actor_id uuid := auth\.uid\(\)/);
  assert.match(block, /actor_account\.account_status = 'active'/);
  assert.match(block, /club\.club_status = 'active'/);
  assert.match(block, /private\.club_user_has_permission\([\s\S]*'club\.members\.read'/);
});

test("membership identity is club-scoped and duplicate inputs are deduplicated in first-input order", () => {
  const block = functionBlock();
  assert.match(block, /v_matched_count <> v_requested_count/);
  assert.match(block, /CLUB_MEMBER_NOT_FOUND_OR_FORBIDDEN/);
  assert.match(block, /unnest\(p_membership_ids\) with ordinality/);
  assert.match(block, /min\(requested_id\.ordinality\) as first_ordinality/);
  assert.match(block, /membership\.club_id = p_club_id/);
  assert.match(block, /order by requested\.first_ordinality/);
});

test("only active public consented badge sources are aggregated", () => {
  const block = functionBlock();
  assert.match(block, /source\.status = 'active'/);
  assert.match(block, /definition\.is_active/);
  assert.match(block, /canonical\.validity_status = 'active'/);
  assert.match(block, /canonical\.publication_status = 'published'/);
  assert.match(block, /consent\.status = 'granted'/);
  assert.match(block, /consent\.policy_version = pg_catalog\.btrim\(consent\.policy_version\)/);
  assert.match(block, /consent\.masked_display_name_consent/);
  assert.match(block, /consent\.record_date_consent/);
  assert.match(block, /consent\.course_detail_consent/);
  assert.match(block, /consent\.badge_consent/);
  assert.match(block, /consent\.consented_at is not null/);
  assert.match(block, /consent\.withdrawn_at is null/);
});

test("response exposes only membership identity and public achievement summary", () => {
  const block = functionBlock();
  const header = block.split("language plpgsql", 1)[0];
  assert.match(header, /membership_id uuid,[\s\S]*achievements jsonb/);
  assert.doesNotMatch(
    header,
    /user_id|email|record_id|application_record_id|evidence|dispute|audit|ledger/,
  );
  assert.match(block, /'code'[\s\S]*'name'[\s\S]*'source_count'/);
  assert.match(block, /count\(\*\)::integer as source_count/);
});

test("read contract grants no raw table access and performs no mutations", () => {
  const block = functionBlock();
  assert.doesNotMatch(block, /\b(insert|update|delete|merge|truncate)\b/i);
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete)\s+on/i);
  assert.doesNotMatch(migration, /service[_-]?role[^;]*grant|grant[^;]*service_role/i);
});
