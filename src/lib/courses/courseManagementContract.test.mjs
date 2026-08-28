import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260921000100_pul_course_operations_management.sql", import.meta.url)), "utf8");

test("migration adds only the explicit platform-admin course management permission", () => {
  assert.match(migration, /'courses\.manage'/);
  assert.match(migration, /'platform_admin',[\s\S]*?'courses\.manage'/);
  assert.doesNotMatch(migration, /'platform_moderator',[\s\S]{0,80}'courses\.manage'/);
});

test("all public management RPCs are security definer with empty search path and authenticated-only execute", () => {
  for (const name of [
    "list_courses_for_management", "get_course_for_management", "find_course_duplicate_candidates",
    "mutate_managed_course", "list_course_information_reports_for_management",
    "get_course_information_report_for_management", "resolve_course_information_report_for_management",
  ]) {
    assert.match(migration, new RegExp(`create function public\\.${name}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role;[\\s\\S]*?grant execute on function public\\.${name}\\([\\s\\S]*?to authenticated;`, "i"));
  }
});

test("course writes use stable keys, inactive creation, stale locks, audit and actor-scoped replay", () => {
  assert.match(migration, /where course\.course_key = v_key\s+for update;/);
  assert.match(migration, /v_course\.updated_at <> p_expected_updated_at/);
  assert.match(migration, /'inactive'\s*\)\s*returning \* into v_course;/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.courses/i);
  assert.match(migration, /primary key \(actor_id, request_id\)/);
  assert.match(migration, /private\.course_write_audit/);
  assert.match(migration, /'request_id', p_request_id/);
});

test("report queue remains privacy-minimized and resolution is a single guarded transition", () => {
  const detailBody = migration.match(/create function public\.get_course_information_report_for_management[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.doesNotMatch(detailBody, /reporter_user_id|resolved_by/);
  assert.match(migration, /report\.report_status <> 'received'/);
  assert.match(migration, /set report_status = p_resolution,[\s\S]*?resolved_by = v_actor_id/);
  assert.match(migration, /p_resolution not in \('handled', 'dismissed'\)/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.course_information_reports/i);
});

test("direct table grants stay closed and no media, AI, scraper or map integration is added", () => {
  assert.match(migration, /revoke all on table private\.course_operation_requests\s+from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete)\s+on\s+(public\.)?(courses|course_information_reports)/i);
  assert.doesNotMatch(migration, /storage\.|course_media|embedding|vector|scrap|maps? api/i);
});
