import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260806000100_pul_platform_permission_foundation.sql",
  import.meta.url,
);

const migration = readFileSync(fileURLToPath(migrationUrl), "utf8");
const normalized = migration.replace(/\s+/g, " ").trim();

test("creates the explicit platform permission catalog and role mapping", () => {
  assert.match(
    normalized,
    /create table public\.platform_permission_definitions \( code text primary key,/,
  );
  assert.match(
    normalized,
    /create table public\.platform_role_permissions \( platform_role text not null, permission_code text not null references public\.platform_permission_definitions \(code\) on delete cascade,/,
  );
  assert.match(
    normalized,
    /primary key \(platform_role, permission_code\)/,
  );
  assert.match(
    normalized,
    /check \(platform_role in \('platform_moderator', 'platform_admin'\)\)/,
  );
});

test("enforces lowercase dot-notation permission codes", () => {
  assert.match(
    normalized,
    /code = pg_catalog\.btrim\(code\) and code ~ '\^\[a-z\]\[a-z0-9_\]\*\(\\\.\[a-z\]\[a-z0-9_\]\*\)\+\$'/,
  );
});

test("seeds exactly the seven approved Hall of Fame permissions", () => {
  for (const permission of [
    "hall_of_fame.applications.read",
    "hall_of_fame.applications.review",
    "hall_of_fame.applications.request_additional_info",
    "hall_of_fame.applications.decide",
    "hall_of_fame.evidence.read",
    "hall_of_fame.records.correct",
    "hall_of_fame.records.revoke",
  ]) {
    assert.match(migration, new RegExp(`'${permission.replaceAll(".", "\\.")}'`));
  }

  assert.match(
    normalized,
    /where permission\.code like 'hall_of_fame\.%' and permission\.is_active \) <> 7/,
  );
});

test("stores explicit moderator and administrator mappings without member inheritance", () => {
  const moderatorMappings = migration.match(
    /'platform_moderator',\s*'hall_of_fame\.[^']+'/g,
  );
  const adminMappings = migration.match(
    /'platform_admin',\s*'hall_of_fame\.[^']+'/g,
  );

  assert.equal(moderatorMappings?.length, 4);
  assert.equal(adminMappings?.length, 7);
  assert.doesNotMatch(normalized, /'member', 'hall_of_fame\./);
  assert.doesNotMatch(normalized, /\b(role_rank|inherit|recursive)\b/i);
});

test("does not give moderators final decision, correction, or revocation", () => {
  assert.match(
    normalized,
    /mapping\.platform_role = 'platform_moderator' and mapping\.permission_code in \( 'hall_of_fame\.applications\.decide', 'hall_of_fame\.records\.correct', 'hall_of_fame\.records\.revoke' \)/,
  );
});

test("defines an auth-bound active-account permission helper", () => {
  assert.match(
    normalized,
    /create function public\.current_user_has_platform_permission\( p_permission_code text \) returns boolean language sql stable security definer set search_path = ''/,
  );
  assert.match(normalized, /where account\.id = auth\.uid\(\)/);
  assert.match(normalized, /account\.account_status = 'active'/);
  assert.match(
    normalized,
    /mapping\.platform_role = account\.platform_role/,
  );
  assert.match(normalized, /permission\.is_active/);
  assert.match(normalized, /mapping\.permission_code = p_permission_code/);
});

test("keeps both platform permission tables behind forced RLS and no table grants", () => {
  for (const table of [
    "platform_permission_definitions",
    "platform_role_permissions",
  ]) {
    assert.match(
      normalized,
      new RegExp(
        `alter table public\\.${table} enable row level security; alter table public\\.${table} force row level security;`,
      ),
    );
    assert.match(
      normalized,
      new RegExp(
        `revoke all on table public\\.${table} from public, anon, authenticated, service_role;`,
      ),
    );
  }

  assert.doesNotMatch(
    normalized,
    /grant\s+(select|insert|update|delete|all)\s+on table public\.platform_/i,
  );
});

test("exposes only the boolean helper to authenticated users", () => {
  assert.match(
    normalized,
    /revoke all on function public\.current_user_has_platform_permission\(text\) from public, anon, authenticated, service_role; grant execute on function public\.current_user_has_platform_permission\(text\) to authenticated;/,
  );
  assert.doesNotMatch(
    normalized,
    /grant execute on function public\.current_user_has_platform_permission\(text\) to (anon|public|service_role)/,
  );
});
