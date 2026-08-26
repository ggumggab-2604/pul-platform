import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const correction = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260917000100_pul_promotion_horizontal_banner_ratio_correction.sql", import.meta.url)),
  "utf8",
);
const banner = readFileSync(
  new URL("../../components/promotions/PromotionBanner.tsx", import.meta.url),
  "utf8",
);
const editor = readFileSync(
  new URL("../../components/promotions/manage/PromotionEditor.tsx", import.meta.url),
  "utf8",
);
const managementUi = readFileSync(new URL("./promotionManagementUi.ts", import.meta.url), "utf8");

const correctedSlots = [
  "courses.top.01",
  "clubs.top.01",
  "market.list_top.01",
  "community.top.01",
  "events.top.01",
  "lessons.top.01",
  "certification.top.01",
  "news.top.01",
];

test("correction targets exactly the eight approved subpage horizontal slots", () => {
  for (const slotCode of correctedSlots) {
    assert.match(correction, new RegExp(`'${slotCode.replaceAll(".", "\\.")}'`));
  }
  for (const excluded of [
    "home.hero.01",
    "home.rail_left.01",
    "home.rail_right.01",
    "home.feed.01",
    "hall_of_fame.top.01",
  ]) {
    assert.doesNotMatch(correction, new RegExp(`'${excluded.replaceAll(".", "\\.")}'`));
  }
  assert.match(correction, /v_updated_count <> pg_catalog\.cardinality\(v_target_slot_codes\)/);
});

test("effective slot metadata changes only height to 1600x200 and 1080x300", () => {
  assert.match(correction, /slot\.desktop_width <> 1600/);
  assert.match(correction, /slot\.desktop_height <> 320/);
  assert.match(correction, /slot\.mobile_width <> 1080/);
  assert.match(correction, /slot\.mobile_height <> 480/);
  assert.match(correction, /set desktop_height = 200,[\s\S]*mobile_height = 300/);
  assert.doesNotMatch(correction, /create table|create function|grant execute|alter table/i);
});

test("management validation, preview, and public runtime share the new ratios", () => {
  assert.match(managementUi, /dimensions\.width !== expectedWidth/);
  assert.match(managementUi, /dimensions\.height !== expectedHeight/);
  assert.match(managementUi, /aspect-\[8\/1\]/);
  assert.match(managementUi, /aspect-\[18\/5\]/);
  assert.match(editor, /readPromotionImageDimensions/);
  assert.match(editor, /validatePromotionImageDimensions/);
  assert.match(banner, /horizontal: "aspect-\[18\/5\] w-full sm:aspect-\[8\/1\]"/);
});

test("public DTO and advertisement labels remain unchanged", () => {
  assert.doesNotMatch(correction, /get_active_promotions_for_slots|content_kind|promotion_media/i);
  assert.match(banner, /isSponsoredPromotion\(promotion\.contentKind\)/);
  assert.match(banner, /getPromotionContentKindLabel\(promotion\.contentKind\)/);
});
