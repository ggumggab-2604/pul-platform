import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const migration = read("../../../supabase/migrations/20260923000100_pul_certification_typed_date_foundation.sql");
const foundation = read("../../../supabase/migrations/20260828000100_pul_certification_directory_foundation.sql");
const client = read("./certificationDirectory.ts");

test("typed-date migration adds exactly eight nullable date columns without defaults", () => {
  for (const column of [
    "starts_on",
    "ends_on",
    "application_starts_on",
    "application_ends_on",
    "exam_on",
    "result_on",
  ]) {
    assert.match(migration, new RegExp(`add column ${column} date`));
  }
  assert.equal((migration.match(/add column starts_on date/g) ?? []).length, 1);
  assert.equal((migration.match(/add column ends_on date/g) ?? []).length, 1);
  assert.equal((migration.match(/add column application_starts_on date/g) ?? []).length, 2);
  assert.equal((migration.match(/add column application_ends_on date/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /add column (?:starts_on|ends_on|application_starts_on|application_ends_on|exam_on|result_on) date[^,;\n]*default/i);
});

test("only the three explicit date ranges are constrained", () => {
  assert.match(migration, /starts_on is null or ends_on is null or starts_on <= ends_on/);
  assert.match(migration, /application_starts_on is null[\s\S]*?application_ends_on is null[\s\S]*?application_starts_on <= application_ends_on/);
  assert.doesNotMatch(migration, /application_ends_on\s*<=\s*exam_on|exam_on\s*<=\s*result_on/);
});

test("human-readable schedules remain intact and are never parsed or backfilled", () => {
  for (const column of ["schedule_text", "application_period", "exam_date_text", "result_date_text"]) {
    assert.match(foundation, new RegExp(`${column} text not null`));
    assert.doesNotMatch(migration, new RegExp(`(?:drop|rename) column ${column}`, "i"));
  }
  const beforeFunctions = migration.slice(0, migration.indexOf("create function private.certification_date_from_jsonb"));
  assert.doesNotMatch(beforeFunctions, /update public\.certification_|regexp_replace|substring/i);
});

test("public DTOs keep text and add nullable snake-case date-only fields", () => {
  for (const key of [
    "starts_on",
    "ends_on",
    "application_starts_on",
    "application_ends_on",
    "exam_on",
    "result_on",
  ]) {
    assert.match(migration, new RegExp(`'${key}', p_(?:course|schedule|job)\.${key}`));
    assert.match(client, new RegExp(`"${key}"`));
  }
  assert.match(migration, /'schedule_text', p_course\.schedule_text/);
  assert.match(migration, /'application_period', p_schedule\.application_period/);
  assert.match(migration, /'schedule_text', p_job\.schedule_text/);
});

test("date-only parser validates calendar dates without constructing timezone Date objects", () => {
  const parser = client.slice(
    client.indexOf("export function isCertificationDateOnly"),
    client.indexOf("function isNullableCertificationDateOnly"),
  );
  assert.match(parser, /\^\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)\$/);
  assert.match(parser, /leapYear/);
  assert.match(parser, /daysInMonth/);
  assert.doesNotMatch(parser, /new Date|Date\.parse/);
  assert.match(migration, /v_text !~ '\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$'/);
});

test("existing mutation signatures and row locks are preserved while date keys are allowlisted", () => {
  for (const name of [
    "mutate_certification_course",
    "mutate_certification_exam_schedule",
    "mutate_certification_job",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?p_expected_version integer`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(text, text, integer, jsonb\\)[\\s\\S]*?to authenticated`));
  }
  assert.equal((migration.match(/for update/g) ?? []).length, 3);
  assert.match(migration, /when p_payload \? 'starts_on'/);
  assert.match(migration, /when p_payload \? 'exam_on'/);
  assert.match(migration, /when p_payload \? 'application_ends_on'/);
});

test("management read foundation is authenticated, permission-scoped, privacy-minimized, and lock-free", () => {
  const signatures = [
    "list_certification_courses_for_management(text, text, integer, integer)",
    "get_certification_course_for_management(text)",
    "list_certification_exam_schedules_for_management(text, text, integer, integer)",
    "get_certification_exam_schedule_for_management(text)",
    "list_certification_jobs_for_management(text, text, integer, integer)",
    "get_certification_job_for_management(text)",
  ];
  for (const signature of signatures) {
    const name = signature.slice(0, signature.indexOf("("));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to authenticated`));
  }
  assert.match(migration, /account\.account_status = 'active'/);
  assert.match(migration, /mapping\.permission_code = 'certification\.manage'/);
  const reads = migration.slice(
    migration.indexOf("create function public.list_certification_courses_for_management"),
    migration.indexOf("create or replace function public.mutate_certification_course"),
  );
  assert.doesNotMatch(reads, /for update|for share/i);
  for (const helper of [
    "management_certification_course_json",
    "management_certification_exam_schedule_json",
    "management_certification_job_json",
  ]) {
    const section = migration.slice(
      migration.indexOf(`create function private.${helper}`),
      migration.indexOf(`revoke all on function private.${helper}`),
    );
    assert.doesNotMatch(section, /created_by|updated_by|'id'|actor_id/);
  }
});

test("4A does not implement UI, freshness, cron, automatic status changes, or AI", () => {
  assert.doesNotMatch(migration, /pg_cron|cron\.schedule|freshness_status|automatic|openai|anthropic/i);
  assert.doesNotMatch(client, /Asia\/Seoul|freshnessStatus/);
});
