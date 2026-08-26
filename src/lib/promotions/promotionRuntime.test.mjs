import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const banner = readFileSync(
  new URL("../../components/promotions/PromotionBanner.tsx", import.meta.url),
  "utf8",
);
const runtime = readFileSync(new URL("./promotionRuntime.ts", import.meta.url), "utf8");
const runtimeServer = readFileSync(
  new URL("./promotionRuntime.server.ts", import.meta.url),
  "utf8",
);
const directory = readFileSync(new URL("./promotionDirectory.ts", import.meta.url), "utf8");
const detail = readFileSync(
  new URL("../../app/promotions/[slug]/page.tsx", import.meta.url),
  "utf8",
);

test("common banner supports the four approved responsive variants", () => {
  for (const variant of ["hero", "rail", "horizontal", "mobileFeed"]) {
    assert.match(banner, new RegExp(`${variant}:`));
  }
  assert.match(banner, /promotion\.mobileMedia \?\? promotion\.desktopMedia/);
  assert.match(banner, /object-cover object-center/);
  assert.match(banner, /horizontal: "aspect-\[18\/5\] w-full sm:aspect-\[8\/1\]"/);
  assert.match(banner, /mobileFeed: "aspect-\[9\/4\] w-full"/);
});

test("public media URL construction is centralized and limited to the public bucket route", () => {
  assert.match(runtime, /getPromotionMediaPublicUrl/);
  assert.match(runtime, /storage\/v1\/object\/public/);
  assert.match(runtime, /shouldBypassPromotionImageOptimization/);
  assert.match(runtime, /localhost/);
  assert.match(runtime, /127\.0\.0\.1/);
  assert.match(banner, /getPromotionMediaPublicUrl/);
  assert.match(banner, /shouldBypassPromotionImageOptimization/);
  assert.match(banner, /mobileSrcSet \?\? mobileUrl/);
  assert.match(detail, /shouldBypassPromotionImageOptimization/);
  assert.doesNotMatch(banner, /storage\/v1\/object\/public/);
});

test("external promotions open safely and commercial content is sponsored", () => {
  assert.match(banner, /target="_blank"/);
  assert.match(banner, /noopener noreferrer sponsored/);
  assert.match(banner, /새 창에서 열림/);
  assert.match(banner, /isSponsoredPromotion\(promotion\.contentKind\)/);
});

test("internal details use the public slug route while none banners are static", () => {
  assert.match(banner, /href=\{`\/promotions\/\$\{promotion\.detailSlug\}`\}/);
  assert.match(banner, /promotion\.linkType === "internal_detail"/);
  assert.match(banner, /promotion\.linkType === "external"/);
  assert.match(banner, /return \(\s*<div[^>]*aria-label=\{promotion\.title\}/);
  assert.doesNotMatch(banner, /promotionKey/);
});

test("strict parsers reject mismatched link fields and unsafe detail CTA destinations", () => {
  assert.match(directory, /value\.link_type === "external"[\s\S]*value\.external_url === null/);
  assert.match(directory, /value\.link_type === "internal_detail"[\s\S]*value\.detail_slug === null/);
  assert.match(directory, /value\.startsWith\("\/"\)[\s\S]*!value\.startsWith\("\/\/"\)/);
  assert.match(directory, /parsed\.protocol === "https:"/);
});

test("promotion failures are optional and never fail a core directory page", () => {
  assert.match(runtimeServer, /loadActivePromotionsForSlots/);
  assert.match(runtimeServer, /catch \{\s*return \[\];\s*\}/);
  assert.doesNotMatch(runtimeServer, /console\.(error|warn|log)/);
});

test("public detail uses the existing DTO, metadata, live-only resolver, and notFound", () => {
  assert.match(runtimeServer, /getPublicPromotionDetail/);
  assert.match(runtimeServer, /cache\(/);
  assert.match(detail, /generateMetadata/);
  assert.match(detail, /loadPublicPromotionDetail/);
  assert.match(detail, /if \(!promotion\) notFound\(\)/);
  assert.match(detail, /promotion\.body/);
  assert.match(detail, /promotion\.detailMedia\.map/);
  assert.match(detail, /index === 0 \? "eager" : "lazy"/);
  assert.match(detail, /promotion\.detailCtaLabel/);
});

test("public UI never renders actor identifiers or internal promotion UUIDs", () => {
  const publicSources = banner + runtime + detail;
  assert.doesNotMatch(publicSources, /created_by|updated_by|actor_id|promotion_id|placement_id/);
  assert.doesNotMatch(banner + detail, /promotion\.promotionKey/);
});
