import assert from "node:assert/strict";
import { test } from "node:test";

import {
  friendlySlotName,
  kstLocalDateTimeToIso,
  normalizePromotionEditorDraft,
  normalizePublicationPeriod,
  promotionImageProductionGuidance,
  promotionMediaPreviewAspectClass,
  promotionDraftToPayload,
  promotionStatusLabels,
  slotDescription,
  validatePromotionImageFile,
  validatePromotionImageDimensions,
} from "./promotionManagementUi.ts";

const horizontalSlot = {
  slotCode: "market.list_top.01",
  displayName: "중고장터 목록 상단",
  pagePath: "/market",
  placementCode: "list_top",
  formatCode: "horizontal",
  desktopWidth: 1600,
  desktopHeight: 200,
  mobileWidth: 1080,
  mobileHeight: 300,
  allowedContentKinds: ["advertisement"],
  enabled: true,
  sortOrder: 120,
};

function draft(overrides = {}) {
  return {
    contentKind: "pul_notice",
    title: "PUL 운영 안내",
    summary: "회원에게 전달할 PUL 운영 안내 요약입니다.",
    linkType: "none",
    externalUrl: "",
    slug: "",
    body: "",
    detailCtaLabel: "",
    detailCtaUrl: "",
    contentStatus: "draft",
    ...overrides,
  };
}

test("management status labels expose Korean runtime states", () => {
  assert.deepEqual(promotionStatusLabels, {
    draft: "초안",
    hidden: "숨김",
    scheduled: "예약",
    live: "게시중",
    ended: "종료",
    archived: "보관됨",
  });
});

test("none link mode strips every unrelated link field", () => {
  const parsed = normalizePromotionEditorDraft(draft({
    externalUrl: "https://example.com",
    slug: "unused-slug",
    body: "사용하지 않는 상세 본문이 충분히 길게 입력되어 있습니다.",
    detailCtaLabel: "열기",
    detailCtaUrl: "/news",
  }));
  assert.equal(parsed.linkType, "none");
  assert.equal(parsed.externalUrl, "");
  assert.equal(parsed.slug, "");
  assert.equal(parsed.body, "");
  assert.equal(parsed.detailCtaLabel, "");
  assert.equal(parsed.detailCtaUrl, "");
});

test("external mode accepts HTTPS only and removes internal detail data", () => {
  assert.throws(
    () => normalizePromotionEditorDraft(draft({ linkType: "external", externalUrl: "http://example.com" })),
    /HTTPS/,
  );
  const parsed = normalizePromotionEditorDraft(draft({
    linkType: "external",
    externalUrl: "https://example.com/promotion",
    slug: "unused-slug",
    body: "사용하지 않는 상세 본문이 충분히 길게 입력되어 있습니다.",
  }));
  assert.equal(parsed.externalUrl, "https://example.com/promotion");
  assert.equal(parsed.slug, "");
  assert.equal(parsed.body, "");
});

test("internal detail requires slug and body and keeps paired CTA values", () => {
  assert.throws(
    () => normalizePromotionEditorDraft(draft({ linkType: "internal_detail", slug: "bad slug", body: "짧음" })),
    /상세 주소/,
  );
  assert.throws(
    () => normalizePromotionEditorDraft(draft({
      linkType: "internal_detail",
      slug: "pul-event-2026",
      body: "PUL 상세페이지 검증을 위한 충분히 긴 본문 내용입니다.",
      detailCtaLabel: "자세히 보기",
    })),
    /함께 입력/,
  );
  const parsed = promotionDraftToPayload(normalizePromotionEditorDraft(draft({
    linkType: "internal_detail",
    slug: "pul-event-2026",
    body: "PUL 상세페이지 검증을 위한 충분히 긴 본문 내용입니다.",
    detailCtaLabel: "자세히 보기",
    detailCtaUrl: "/events",
    contentStatus: "ready",
  })), true);
  assert.equal(parsed.slug, "pul-event-2026");
  assert.equal(parsed.detail_cta_url, "/events");
  assert.equal(parsed.content_status, "ready");
});

test("title and summary length bounds are enforced", () => {
  assert.throws(() => normalizePromotionEditorDraft(draft({ title: "한" })), /제목/);
  assert.throws(() => normalizePromotionEditorDraft(draft({ summary: "짧은 요약" })), /요약/);
});

test("KST local input converts without browser locale dependence", () => {
  assert.equal(kstLocalDateTimeToIso("2026-09-16T09:30"), "2026-09-16T00:30:00.000Z");
  assert.deepEqual(normalizePublicationPeriod("2026-09-16T09:30", "2026-09-16T10:30"), {
    startsAt: "2026-09-16T00:30:00.000Z",
    endsAt: "2026-09-16T01:30:00.000Z",
  });
  assert.throws(() => kstLocalDateTimeToIso("2026-02-30T10:00"), /존재하는 날짜/);
  assert.throws(() => normalizePublicationPeriod("2026-09-16T10:30", "2026-09-16T10:30"), /늦어야/);
});

test("media declaration accepts only JPG PNG WebP up to 5MB", () => {
  assert.doesNotThrow(() => validatePromotionImageFile({ type: "image/png", size: 1024, name: "banner.png" }));
  assert.throws(() => validatePromotionImageFile({ type: "image/gif", size: 1024, name: "banner.gif" }), /JPG/);
  assert.throws(() => validatePromotionImageFile({ type: "image/png", size: 5 * 1024 * 1024 + 1, name: "banner.png" }), /5MB/);
  assert.throws(() => validatePromotionImageFile({ type: "image/png", size: 1024, name: "banner.txt" }), /확장자/);
});

test("horizontal media enforces the corrected exact dimensions", () => {
  assert.doesNotThrow(() => validatePromotionImageDimensions(
    { width: 1600, height: 200 }, horizontalSlot, "desktop_banner",
  ));
  assert.doesNotThrow(() => validatePromotionImageDimensions(
    { width: 1080, height: 300 }, horizontalSlot, "mobile_banner",
  ));
  assert.throws(() => validatePromotionImageDimensions(
    { width: 1600, height: 320 }, horizontalSlot, "desktop_banner",
  ), /1600×200/);
  assert.throws(() => validatePromotionImageDimensions(
    { width: 1080, height: 480 }, horizontalSlot, "mobile_banner",
  ), /1080×300/);
});

test("horizontal preview and operator guidance match the corrected contract", () => {
  assert.equal(promotionMediaPreviewAspectClass(horizontalSlot, "desktop_banner"), "aspect-[8/1]");
  assert.equal(promotionMediaPreviewAspectClass(horizontalSlot, "mobile_banner"), "aspect-[18/5]");
  assert.match(promotionImageProductionGuidance(horizontalSlot), /좌우 5~8%/);
  assert.match(promotionImageProductionGuidance(horizontalSlot), /WebP/);
});

test("secondary directory slots have clear management labels and placement guidance", () => {
  const cases = [
    ["courses.after_map.01", "골프장 · 지도·검색 아래 가로배너"],
    ["clubs.after_list.01", "동호회 · 목록 아래 가로배너"],
    ["market.after_list.01", "장터 · 상품목록 아래 가로배너"],
    ["community.after_posts.01", "커뮤니티 · 게시글 목록 아래 가로배너"],
    ["events.after_schedule.01", "대회·이벤트 · 주요 일정 아래 가로배너"],
    ["lessons.after_content.01", "레슨·교육 · 주요 콘텐츠 아래 가로배너"],
    ["certification.after_content.01", "자격증·심판 · 탭 콘텐츠 아래 가로배너"],
    ["news.after_list.01", "뉴스·정보 · 기사목록 아래 가로배너"],
  ];
  for (const [slotCode, label] of cases) {
    assert.equal(friendlySlotName({ slotCode, displayName: slotCode }), label);
    assert.match(slotDescription(slotCode), /표시됩니다/);
  }
  assert.equal(slotDescription("home.hero.01"), null);
});
