import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(path, imports = {}) {
  const content = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (key) => {
    assert.ok(Object.hasOwn(imports, key), key);
    return imports[key];
  });
  return exports;
}

const sources = load("../../data/certificationSources.ts");
const selection = load("./examPrepSelection.ts", { "@/data/certificationSources": sources });
const phaseOne = load("./certificationPhaseOne.ts", { "@/data/certificationSources": sources, "./examPrepSelection": selection });
const navigation = load("../courses/courseNavigation.ts", { "@/lib/certification/examPrepSelection": selection });
const { safeMaterialReturn } = load("../courses/courseMaterialNavigation.ts", { "./courseNavigation": navigation });
const { getSafeRedirectPath } = load("../auth/safeRedirect.ts");

test("legacy and shuffled exam return URLs canonicalize without changing practical selection", () => {
  const legacy = "/certification?examDate=2026-06-11&course=B&venue=hancheon&stage=practical&tab=exam-prep";
  const canonical = navigation.safeCourseReturn(legacy);
  const q = new URL(canonical, "https://pul.invalid").searchParams;
  for (const [name, value] of Object.entries({ qualification: "life", grade: "2", year: "2026", examDate: "2026-06-11", course: "B", venue: "hancheon" })) {
    assert.equal(q.get(name), value);
  }
  const boryeong = "/certification?grade=1&examDate=2026-06-02&tab=exam-prep&venue=boryeong&stage=practical&qualification=disability";
  assert.match(navigation.safeCourseReturn(boryeong), /venue=boryeong&examDate=2026-06-02/);
  const loginNext = "/courses/example/resources/new?" + new URLSearchParams({ returnTo: canonical });
  assert.equal(getSafeRedirectPath(loginNext), loginNext);
});

test("references from another qualification, year, or site have no course return", () => {
  const legacy = "/certification?tab=exam-prep&stage=practical&venue=hancheon&examDate=2026-06-11&course=A";
  for (const raw of [legacy + "&grade=2&grade=1", legacy + "&qualification=disability", legacy + "&year=2027", legacy + "#map",
    legacy.replace("course=A", "course=C"), "/certification?tab=guide", "https://pul.invalid" + legacy, "//example.invalid" + legacy]) {
    assert.equal(navigation.safeCourseReturn(raw), "/courses", raw);
  }
  const list = safeMaterialReturn("/courses/test/resources?returnTo=https%3A%2F%2Fexample.invalid", "test");
  assert.equal(new URL(list, "https://pul.invalid").searchParams.get("returnTo"), "/courses");
});

test("legacy written URL, topic labels and material scope preserve prior data", () => {
  const state = selection.readExamPrep(new URLSearchParams({ subject: "education", question: "3" }));
  assert.equal(state.subject, "education");
  assert.equal(state.question, "3");
  assert.equal(selection.readExamPrep(new URLSearchParams({ qualification: "disability", subject: state.subject })).subject, state.subject);
  assert.equal(phaseOne.certificationStudyTopicTitle("written-2026-education-3"), "2026년 스포츠교육학 3번 질문·답변");
  assert.equal(phaseOne.certificationStudyTopicTitle("written-2026-health-20"), "2026년 건강교육론 20번 질문·답변");
  assert.equal(phaseOne.certificationStudyTopicTitle("written-2026-health-21"), null);
  assert.equal(phaseOne.certificationStudyTopicTitle("practical-boryeong"), "보령장애인파크골프장 질문·후기");
  assert.equal(phaseOne.practicalCourseMaterialScope("구장 전체", "공용 자료", "B"), "구장 전체");
  assert.equal(phaseOne.practicalCourseMaterialScope("구장 전체", "A~B코스 공략", "B"), "A·B코스");
  assert.equal(phaseOne.practicalCourseMaterialScope("C코스", "B코스 검색어", "B"), null);
});

test("course directory search keeps region, resource filters, page and map view", () => {
  const href = navigation.courseSearchHref({ keyword: "구장", courseType: "field", region: "경상",
    holes: "27_plus", hasVideo: true, hasYardage: true }, 3, "map");
  assert.equal(navigation.safeCourseReturn(href), href);
});
