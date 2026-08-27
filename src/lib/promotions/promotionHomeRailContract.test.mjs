import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20260919000100_pul_home_rail_long_short_slots.sql", import.meta.url),
  "utf8",
);

const longSlots = ["home.rail_left.01", "home.rail_right.01"];
const shortSlots = [
  "home.rail_left.short.01",
  "home.rail_left.short.02",
  "home.rail_left.short.03",
  "home.rail_right.short.01",
  "home.rail_right.short.02",
  "home.rail_right.short.03",
];

test("migration promotes two stable long slots and adds exactly six desktop-only short slots", () => {
  for (const slot of [...longSlots, ...shortSlots]) assert.match(migration, new RegExp(slot.replaceAll(".", "\\.")));
  assert.match(migration, /desktop_height = 1500/);
  assert.equal((migration.match(/600, 480, null, null/g) ?? []).length, 6);
  assert.match(migration, /pg_catalog\.count\(\*\) from public\.promotion_slots\) <> 27/);
  assert.match(migration, /pg_catalog\.count\(\*\) from public\.promotion_slots where is_enabled\) <> 26/);
  assert.match(migration, /hall_of_fame\.top\.01/);
  assert.match(migration, /slot_code ~ '\^\[a-z\]\[a-z0-9_\]\*\(\\\.\[a-z0-9_\]\+\)\{2,3\}\$'/);
  assert.match(migration, /create or replace function public\.get_active_promotions_for_slots/);
  assert.match(migration, /create or replace function public\.list_promotion_overviews_for_management/);
  assert.doesNotMatch(migration, /insert into public\.promotions|update public\.promotions|delete from public\.(promotions|promotion_placements|promotion_media)/i);
});

test("same-side long versus short publication uses independent side locks and half-open overlap", () => {
  assert.match(migration, /create function private\.enforce_promotion_home_rail_mode_exclusivity/);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(migration, /case v_side when 'left' then 1 else 2 end/);
  assert.match(migration, /tstzrange\(conflict\.starts_at, conflict\.ends_at, '\[\)'\)/);
  assert.match(migration, /v_conflict_slot_codes := array\['home\.rail_left\.01'\]/);
  assert.match(migration, /v_conflict_slot_codes := array\['home\.rail_right\.01'\]/);
  assert.match(migration, /왼쪽 긴 배너 게시 기간/);
  assert.match(migration, /오른쪽 긴 배너 게시 기간/);
  assert.match(migration, /before insert or update of slot_code, publication_status, starts_at, ends_at/);
});

test("guard is trigger-only and widens no table or function privileges", () => {
  assert.match(migration, /security invoker/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function private\.enforce_promotion_home_rail_mode_exclusivity\(\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant execute on function private\.enforce_promotion_home_rail_mode_exclusivity/i);
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete)|grant\s+all\s+on\s+(table|schema)/i);
  assert.doesNotMatch(migration, /alter table[\s\S]*disable row level security/i);
});
