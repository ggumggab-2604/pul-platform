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
const courseContent = load("../courses/courseContent.ts");
const materials = load("./practicalMaterials.ts", { "@/lib/courses/courseContent": courseContent });
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
    legacy.replace("course=A", "course=X"), legacy + "&materialPage=01", legacy + "&materialPage=1&materialPage=2", "/certification?tab=guide", "https://pul.invalid" + legacy, "//example.invalid" + legacy]) {
    assert.equal(navigation.safeCourseReturn(raw), "/courses", raw);
  }
  const list = safeMaterialReturn("/courses/test/resources?returnTo=https%3A%2F%2Fexample.invalid", "test");
  assert.equal(new URL(list, "https://pul.invalid").searchParams.get("returnTo"), "/courses");
});

test("legacy written URL and topic labels preserve prior data", () => {
  const state = selection.readExamPrep(new URLSearchParams({ subject: "education", question: "3" }));
  assert.equal(state.subject, "education");
  assert.equal(state.question, "3");
  assert.equal(selection.readExamPrep(new URLSearchParams({ qualification: "disability", subject: state.subject })).subject, state.subject);
  assert.equal(phaseOne.certificationStudyTopicTitle("written-2026-education-3"), "2026년 스포츠교육학 3번 질문·답변");
  assert.equal(phaseOne.certificationStudyTopicTitle("written-2026-health-20"), "2026년 건강교육론 20번 질문·답변");
  assert.equal(phaseOne.certificationStudyTopicTitle("written-2026-health-21"), null);
  assert.equal(phaseOne.certificationStudyTopicTitle("practical-boryeong"), "보령장애인파크골프장 질문·후기");
});

test("course directory search keeps region, resource filters, page and map view", () => {
  const href = navigation.courseSearchHref({ keyword: "구장", courseType: "field", region: "경상",
    holes: "27_plus", hasVideo: true, hasYardage: true }, 3, "map");
  assert.equal(navigation.safeCourseReturn(href), href);
});

test("material filter and page are independent of the practical assignment and survive returns", () => {
  const state = selection.readExamPrep(new URLSearchParams("stage=practical&examDate=2026-06-11"));
  assert.equal(state.course, "all");
  const chosen = selection.examPrepHref(state, { course: "CD" });
  const paged = selection.examPrepHref(selection.readExamPrep(new URL(chosen, "https://pul.invalid").searchParams), { materialPage: "2" });
  const params = new URL(paged, "https://pul.invalid").searchParams;
  assert.equal(params.get("examDate"), "2026-06-11");
  assert.equal(params.get("course"), "CD");
  assert.equal(params.get("materialPage"), "2");
  assert.deepEqual(state.practical.courses, ["A", "B"]);
  assert.equal(navigation.safeCourseReturn(paged), paged);
  const yardage = "/courses/test/resources?kind=yardage&" + new URLSearchParams({ returnTo: paged });
  assert.equal(new URL(safeMaterialReturn(yardage, "test"), "https://pul.invalid").searchParams.get("returnTo"), paged);
  const reset = selection.examPrepHref(selection.readExamPrep(params), { course: "C", materialPage: "8" });
  assert.equal(new URL(reset, "https://pul.invalid").searchParams.get("materialPage"), null);
});

test("explicit scope takes priority and only clearly labelled shared titles match a filter", () => {
  const items = [
    { scope: "구장 전체", title: "한천 A코스 공략" },
    { scope: "구장 전체", title: "한천 B코스 공략" },
    { scope: "구장 전체", title: "한천 C코스 공략" },
    { scope: "구장 전체", title: "한천 D코스 공략" },
    { scope: "구장 전체", title: "한천 A·B코스 공략" },
    { scope: "구장 전체", title: "한천 C·D코스 공략" },
    { scope: "구장 전체", title: "공용 자료 A급" },
    { scope: "C코스", title: "B코스 검색어" },
    { scope: "기타", title: "A코스일지도 모릅니다" },
  ];
  const expected = { all: [0, 1, 2, 3, 4, 5, 6, 7, 8], AB: [0, 1, 4], CD: [2, 3, 5, 7], A: [0, 4], B: [1, 4], C: [2, 5, 7], D: [3, 5] };
  for (const [filter, indexes] of Object.entries(expected)) {
    assert.deepEqual(items.flatMap((item, index) => materials.matchesPracticalMaterial(item, filter) ? [index] : []), indexes, filter);
  }
  assert.equal(materials.matchesPracticalMaterial({ scope: "구장 전체", title: "A~B코스 공략" }, "B"), true);
});

const regressionYardage = { id: "yardage-a", kind: "yardage", scope: "A코스", title: "한천 A코스 야디지북" };

function publicMaterialClient(rows, calls = []) {
  return { rpc: async (name, args) => {
    assert.equal(name, "course_material_search");
    assert.equal(args.p_saved, false);
    calls.push(args.p_offset);
    const matching = rows.filter(item => !args.p_kind || item.kind === args.p_kind);
    return { data: { items: matching.slice(args.p_offset, args.p_offset + args.p_limit), total: matching.length } };
  } };
}

test("the A-course yardage book stays out of video counts and video pagination", async () => {
  for (const size of [6, 9, 10]) {
    const videos = Array.from({ length: size }, (_, i) => ({
      id: "video-" + i, kind: "video", scope: size === 6 && i > 1 ? "C코스" : "A코스", title: "한천 공략 영상",
    }));
    const client = publicMaterialClient([regressionYardage, ...videos]);
    for (const course of ["all", "A"]) {
      const expected = size === 6 && course === "A" ? videos.slice(0, 2) : videos;
      const first = await materials.listPracticalMaterials(client, "hancheon", course, 1);
      assert.deepEqual(first.items.map(item => item.id), expected.slice(0, 9).map(item => item.id));
      assert.equal(first.hasNext, expected.length > 9);
      if (expected.length > 9) {
        const second = await materials.listPracticalMaterials(client, "hancheon", course, 2);
        assert.deepEqual(second.items.map(item => item.id), [expected[9].id]);
        assert.equal(second.hasNext, false);
      }
    }
    const yardage = await courseContent.listCourseResources(client, "hancheon", "yardage");
    assert.equal(yardage.total, 1);
    assert.deepEqual(yardage.items, [regressionYardage]);
  }
});

test("a matching old video survives RPC pagination and 10 videos split 9+1", async () => {
  const old = Array.from({ length: 10 }, (_, i) => ({ id: "old-" + i, kind: "video", scope: "A코스", title: "공략 영상" }));
  const rows = [regressionYardage, ...Array.from({ length: 25 }, (_, i) => ({ id: "recent-" + i, kind: "video", scope: "구장 전체", title: "일반 자료" })), ...old];
  const calls = [];
  const client = publicMaterialClient(rows, calls);
  const first = await materials.listPracticalMaterials(client, "hancheon", "A", 1);
  const second = await materials.listPracticalMaterials(client, "hancheon", "A", 2);
  assert.deepEqual(calls, [0, 24, 0, 24]);
  assert.deepEqual(first.items.map(item => item.id), old.slice(0, 9).map(item => item.id));
  assert.equal(first.hasNext, true);
  assert.deepEqual(second.items.map(item => item.id), ["old-9"]);
  assert.equal(second.hasNext, false);
});
