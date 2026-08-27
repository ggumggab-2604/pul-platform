import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20260918000100_pul_promotion_second_directory_slots.sql", import.meta.url),
  "utf8",
);

const slots = [
  "courses.after_map.01",
  "clubs.after_list.01",
  "market.after_list.01",
  "community.after_posts.01",
  "events.after_schedule.01",
  "lessons.after_content.01",
  "certification.after_content.01",
  "news.after_list.01",
];

test("migration adds exactly the eight approved secondary directory slots", () => {
  for (const slot of slots) {
    assert.equal(migration.match(new RegExp(`'${slot.replaceAll(".", "\\.")}'`, "g"))?.length, 2);
  }
  assert.match(migration, /v_inserted_count <> pg_catalog\.cardinality\(v_target_slot_codes\)/);
  assert.match(migration, /pg_catalog\.count\(\*\) from public\.promotion_slots\) <> 21/);
  assert.match(migration, /pg_catalog\.count\(\*\) from public\.promotion_slots where is_enabled\) <> 20/);
});

test("all secondary slots use the corrected horizontal media contract", () => {
  assert.equal((migration.match(/1600, 200, 1080, 300/g) ?? []).length, 8);
  assert.equal((migration.match(/'horizontal'/g) ?? []).length, 9);
  assert.match(migration, /slot\.desktop_width <> 1600/);
  assert.match(migration, /slot\.desktop_height <> 200/);
  assert.match(migration, /slot\.mobile_width <> 1080/);
  assert.match(migration, /slot\.mobile_height <> 300/);
});

test("catalog remains bounded to two enabled slots on each approved page", () => {
  assert.match(migration, /having pg_catalog\.count\(\*\) <> 2/);
  for (const page of ["/courses", "/clubs", "/market", "/community", "/events", "/lessons", "/certification", "/news"]) {
    assert.match(migration, new RegExp(`'${page}'`));
  }
  assert.doesNotMatch(migration, /'\/my'|'\/hall-of-fame'|'\/[a-z-]+\/\[id\]'/);
});

test("migration only extends the slot catalog and leaves existing rows and runtime data untouched", () => {
  assert.match(migration, /insert into public\.promotion_slots/);
  assert.doesNotMatch(migration, /update public\.promotion_slots|delete from|insert into public\.promotions|promotion_placements|promotion_media/);
  assert.doesNotMatch(migration, /create table|alter table|create function|grant |revoke /i);
});
