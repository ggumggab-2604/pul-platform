import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("./certificationCourseComparison.ts", import.meta.url), "utf8")
  .replace("@/data/certificationData", new URL("../../data/certificationData.ts", import.meta.url).href);
const { certificationCourseTotal, safeCertificationCourseReturn } =
  await import("data:text/javascript," + encodeURIComponent(stripTypeScriptTypes(source)));

const { readCertificationCourseSummary } = await import("./certificationDirectory.ts");

test("course comparison and detail combine all three amounts including intentional zero", () => {
  assert.equal(certificationCourseTotal(readCertificationCourseSummary({ tuition: "100000", exam_fee: "20000", issue_fee: "0" })), "120,000원");
  assert.equal(certificationCourseTotal(readCertificationCourseSummary({ tuition: "0", exam_fee: "0", issue_fee: "0" })), "0원");
  assert.equal(certificationCourseTotal(readCertificationCourseSummary({ tuition: "100000", issue_fee: "0" })), "총비용은 기관 확인");
  assert.equal(certificationCourseTotal(readCertificationCourseSummary({ tuition: "100000", exam_fee: "-1", issue_fee: "0" })), "총비용은 기관 확인");
});

test("course detail retains only safe, unambiguous education list state", () => {
  const fallback = "/certification?tab=courses";
  for (const value of [
    "https://example.invalid/certification?tab=courses",
    "//example.invalid/certification?tab=courses",
    "/certification/courses/demo?tab=courses",
    "/certification?tab=activity",
    "/certification?tab=courses&tab=activity",
    "/certification?tab=courses#other",
    [fallback],
  ]) assert.equal(safeCertificationCourseReturn(value), fallback);

  const query = new URLSearchParams({
    tab: "courses", courseKeyword: "파크골프", courseCategory: "private_instructor",
    courseRegion: "경기", courseStatus: "accepting", courseProviderType: "association",
    courseMethod: "theory_practice", coursePage: "2",
  });
  const expected = "/certification?" + query;
  assert.equal(safeCertificationCourseReturn(expected + "&next=https%3A%2F%2Fexample.invalid"), expected);
  assert.equal(safeCertificationCourseReturn(fallback + "&courseProvider=association"), fallback + "&courseProviderType=association");
  assert.equal(safeCertificationCourseReturn(fallback + "&courseStatus=unknown&coursePage=1e4"), fallback);
  assert.equal(safeCertificationCourseReturn(fallback + "&courseKeyword=%0Dtest"), fallback);
});
