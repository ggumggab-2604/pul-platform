import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260819000100_pul_hall_of_fame_public_ranking_read_contract.sql",
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

test("public record type list is a bounded anonymous-safe read contract", () => {
  const block = functionBlock("public.list_hall_of_fame_public_records_by_type");
  const header = block.split("language plpgsql", 1)[0];
  assert.match(
    header,
    /p_record_type_code text default null,[\s\S]*p_limit integer default 24,[\s\S]*p_offset integer default 0/,
  );
  assert.doesNotMatch(
    header,
    /record_id|target_user_id|application_record_id|request_id|actor_user_id|evidence/,
  );
  assert.match(block, /stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.match(block, /p_limit > 100/);
  assert.match(block, /definition\.code = p_record_type_code[\s\S]*definition\.is_active/);
  assert.match(block, /canonical\.record_type_code = p_record_type_code/);
  assert.match(
    migration,
    /grant execute on function public\.list_hall_of_fame_public_records_by_type\(text, integer, integer\)[\s\S]*to anon, authenticated;/,
  );
});

test("filtered public records preserve the existing consent and validity boundary", () => {
  const block = functionBlock("public.list_hall_of_fame_public_records_by_type");
  assert.match(block, /canonical\.validity_status = 'active'/);
  assert.match(block, /canonical\.publication_status = 'published'/);
  assert.match(block, /consent\.status = 'granted'/);
  assert.match(block, /consent\.policy_version is not null/);
  assert.match(block, /consent\.masked_display_name_consent/);
  assert.match(block, /consent\.record_date_consent/);
  assert.match(block, /consent\.course_detail_consent/);
  assert.match(block, /consent\.withdrawn_at is null/);
  assert.match(block, /when consent\.club_name_consent then club\.name/);
  assert.match(block, /when consent\.badge_consent then/);
  assert.match(block, /order by canonical\.played_on desc, canonical\.approved_at desc/);
});

test("ranking RPC has strict kinds, KST period boundaries, and bounded output", () => {
  const block = functionBlock("public.list_hall_of_fame_public_rankings");
  const header = block.split("language plpgsql", 1)[0];
  assert.match(
    header,
    /p_ranking_kind text,[\s\S]*p_reference_date date default null,[\s\S]*p_limit integer default 20/,
  );
  assert.match(
    header,
    /rank_position bigint,[\s\S]*ranking_label text,[\s\S]*ranking_sublabel text,[\s\S]*record_count bigint,[\s\S]*record_type_counts jsonb/,
  );
  assert.doesNotMatch(
    header,
    /record_id|target_user_id|club_id|application_record_id|request_id|actor_user_id|email/,
  );
  assert.match(block, /'monthly', 'yearly', 'region', 'club', 'course'/);
  assert.match(block, /at time zone 'Asia\/Seoul'/);
  assert.match(block, /date_trunc\('month', v_reference_date::timestamp\)/);
  assert.match(block, /date_trunc\('year', v_reference_date::timestamp\)/);
  assert.match(block, /canonical\.played_on >= v_period_start/);
  assert.match(block, /canonical\.played_on < v_period_end/);
  assert.doesNotMatch(block, /published_at\s*[<>]=?\s*v_period|approved_at\s*[<>]=?\s*v_period/);
  assert.match(block, /p_limit > 50/);
});

test("member rankings aggregate by private identity without merging masked labels", () => {
  const block = functionBlock("public.list_hall_of_fame_public_rankings");
  assert.match(block, /group by eligible\.target_user_id/);
  assert.match(block, /type_counts\.target_user_id = member_counts\.target_user_id/);
  assert.match(block, /bool_and\(eligible\.full_display_name_consent\)/);
  assert.match(block, /count\(distinct eligible\.full_display_name\) = 1/);
  assert.match(block, /else 'PUL member'::text/);
  assert.match(block, /dense_rank\(\) over \(order by ranked\.total_count desc\)/);
});

test("region, club, and course rankings use only consented public dimensions", () => {
  const block = functionBlock("public.list_hall_of_fame_public_rankings");
  assert.match(block, /canonical\.course_region_snapshot as group_label/);
  assert.match(block, /consent\.club_name_consent[\s\S]*join public\.clubs as club/);
  assert.match(block, /canonical\.nominating_club_id as group_id/);
  assert.match(block, /canonical\.course_name_snapshot as group_label/);
  assert.match(block, /canonical\.course_region_snapshot as group_sublabel/);
  assert.match(block, /jsonb_build_object\([\s\S]*'code'[\s\S]*'name'[\s\S]*'count'/);
});

test("ranking projection excludes private and operator-only domains", () => {
  const block = functionBlock("public.list_hall_of_fame_public_rankings");
  for (const forbidden of [
    "auth.users",
    "user_private_contacts",
    "hall_of_fame_evidence_files",
    "hall_of_fame_disputes",
    "hall_of_fame_dispute_reviews",
    "hall_of_fame_application_reviews",
    "audit_logs",
    "hall_of_fame_mutation_requests",
  ]) {
    assert.doesNotMatch(block, new RegExp(forbidden.replace(".", "\\.")));
  }
  assert.match(block, /canonical\.validity_status = 'active'/g);
  assert.match(block, /canonical\.publication_status = 'published'/g);
  assert.match(block, /consent\.withdrawn_at is null/g);
  assert.doesNotMatch(block, /execute\s+format|format\s*\(|\bdelete\b|\binsert\b|\bupdate\b/);
});

test("ranking ACL grants only anon and authenticated execution", () => {
  assert.match(
    migration,
    /revoke all on function public\.list_hall_of_fame_public_rankings\(text, date, integer\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.list_hall_of_fame_public_rankings\(text, date, integer\)[\s\S]*to anon, authenticated;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.list_hall_of_fame_public_rankings[\s\S]{0,160}service_role/,
  );
});
