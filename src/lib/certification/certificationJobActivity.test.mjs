import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

const source = readFileSync(new URL("./certificationJobActivity.ts", import.meta.url), "utf8")
  .replace("@/data/certificationData", new URL("../../data/certificationData.ts", import.meta.url).href)
  .replace("./certificationDateDisplay", new URL("./certificationDateDisplay.ts", import.meta.url).href);
const { safeCertificationActivityReturn, certificationInquiryHref, certificationJobFacts } =
  await import("data:text/javascript," + encodeURIComponent(stripTypeScriptTypes(source)));

test("activity return keeps only the activity filters and page numbers across login and compose", () => {
  const fallback = "/certification?tab=activity";
  for (const value of [
    "https://example.invalid/certification?tab=activity", "//example.invalid/certification?tab=activity",
    "/certification/jobs/sample?tab=activity", "/certification?tab=courses",
    fallback + "&tab=activity", fallback + "#jobs", [fallback],
  ]) assert.equal(safeCertificationActivityReturn(value), fallback);
  const list = fallback + "&" + new URLSearchParams({
    jobKeyword: "격리 파크골프", jobRoleType: "referee", jobRegion: "경기", jobStatus: "accepting", jobPage: "2", talentPage: "3",
  });
  assert.equal(safeCertificationActivityReturn(list + "&next=https%3A%2F%2Fexample.invalid"), list);
  assert.equal(safeCertificationActivityReturn(fallback + "&jobRole=referee"), fallback + "&jobRoleType=referee");
  assert.equal(safeCertificationActivityReturn(fallback + "&jobKeyword=%0Dtest&jobStatus=invalid&jobPage=1e4"), fallback);
  for (const [kind, path] of [["job", "jobs"], ["talent", "talent"]]) {
    const login = new URL(certificationInquiryHref(kind, "sample", list, false), "http://localhost");
    const next = new URL(login.searchParams.get("next"), login.origin);
    assert.equal(next.pathname, "/certification/" + path + "/sample");
    assert.equal(next.searchParams.get("inquiry"), "1");
    assert.equal(next.searchParams.get("returnTo"), list);
    const compose = new URL(certificationInquiryHref(kind, "sample", list, true), login.origin);
    assert.equal(compose.pathname, "/messages/new");
    assert.equal(compose.searchParams.get("certificationKey"), "sample");
    assert.equal(compose.searchParams.get("certificationReturn"), list);
  }
});

test("activity facts keep job values and label missing information without inheriting event fields", () => {
  assert.deepEqual(certificationJobFacts({ activityDate: null, venue: null, qualification: null }),
    [["활동일", "미정"], ["구장", "미정"], ["필요 자격", "공고 확인"]]);
  assert.deepEqual(certificationJobFacts({ activityDate: "2026-12-11", venue: "한빛시민 구장", qualification: "심판 2급" }),
    [["활동일", "2026.12.11"], ["구장", "한빛시민 구장"], ["필요 자격", "심판 2급"]]);
});
