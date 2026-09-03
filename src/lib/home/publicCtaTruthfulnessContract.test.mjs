import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

function file(path) {
  return new URL(path, root);
}

function source(path) {
  return readFile(file(path), "utf8");
}

test("global public navigation contains no known dead support or footer hrefs", async () => {
  const [homeData, footer, header, mobileMenu] = await Promise.all([
    source("data/homeData.ts"),
    source("components/layout/Footer.tsx"),
    source("components/auth/HeaderAuthActions.tsx"),
    source("components/layout/MobileFullMenu.tsx"),
  ]);
  const navigation = homeData + footer + header + mobileMenu;
  const deadPaths = [
    "/about",
    "/pul",
    "/terms",
    "/privacy",
    "/support",
    "/faq",
    "/inquiry",
    "/notice",
    "/partnership",
    "/ads",
    "/vendor",
  ];

  for (const path of deadPaths) {
    assert.doesNotMatch(navigation, new RegExp(`(?:href:\\s*|href=)["']${path}["']`));
  }

  assert.match(footer, /footerPendingItems\.map/);
  assert.match(footer, /장터의 실제 제휴·광고 문의 창구/);
  assert.doesNotMatch(footer, /1234-5678|help@pul\.co\.kr|cursor-pointer/);
});

test("every surviving footer link targets an existing public page", async () => {
  const destinations = ["courses", "clubs", "events", "lessons", "news", "community", "market"];
  await Promise.all(destinations.map((path) => access(file(`app/${path}/page.tsx`))));
});

test("lesson guide cards do not expose a no-op detail control", async () => {
  const lessons = await source("components/lessons/LessonsIntroGuideTab.tsx");

  assert.doesNotMatch(lessons, /handleGuideDetail|console\.log|자세히 보기/);
  assert.match(lessons, /\{card\.summary\}/);
  assert.match(lessons, /introGuideCtaButtons\.map/);
});

test("community legacy shortcut does not promise an unavailable report workflow", async () => {
  const communityData = await source("data/communityData.ts");

  assert.doesNotMatch(communityData, /건의·신고/);
  assert.match(communityData, /label: "커뮤니티 안내", scrollTarget: "section-notices"/);
});

test("the public course layout test route is removed and resolves through the not-found guard", async () => {
  await assert.rejects(access(file("app/courses/1-layout-test/page.tsx")), {
    code: "ENOENT",
  });

  const courseDetail = await source("app/courses/[id]/page.tsx");
  assert.match(courseDetail, /error instanceof CourseClubError/);
  assert.match(courseDetail, /error\.code === "notFound"/);
  assert.match(courseDetail, /notFound\(\)/);
});
