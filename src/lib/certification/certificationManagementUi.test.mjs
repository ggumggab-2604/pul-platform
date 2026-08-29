import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

function read(relative) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const helperSource = read("./certificationManagement.ts");
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helper = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const route = read("../../app/certification/manage/page.tsx");
const actions = read("../../app/certification/manage/actions.ts");
const component = read("../../components/certification/manage/CertificationDirectoryManagementPage.tsx");
const manageHome = read("../../app/manage/page.tsx");
const requestsRoute = read("../../app/certification/manage/requests/page.tsx");
const typedContract = read("./certificationTypedDateContract.test.mjs");
const typedRpc = read("./certificationTypedDateRpc.test.mjs");
const typedMigration = read("../../../supabase/migrations/20260923000100_pul_certification_typed_date_foundation.sql");

function courseInput(overrides = {}) {
  return {
    entity: "course",
    operation: "create",
    key: "operator-course",
    expectedVersion: null,
    payload: {
      title: "운영 과정",
      category: "instructor",
      providerType: "association",
      providerName: "운영 협회",
      region: "서울",
      method: "offline",
      target: "파크골프 입문자",
      schedule: "기관 일정에 따라 변경",
      price: "10만원",
      status: "recruiting",
      description: "운영자가 확인한 교육과정 설명입니다.",
      officialUrl: "https://example.com/course",
      applicationUrl: null,
      featured: false,
      startsOn: "2026-09-01",
      endsOn: "2026-09-30",
      ...overrides,
    },
  };
}

test("management input preserves date-only strings, nullable dates, and human schedule text", () => {
  const dated = helper.parseCertificationManagementSaveInput(courseInput());
  assert.equal(dated.payload.startsOn, "2026-09-01");
  assert.equal(dated.payload.endsOn, "2026-09-30");
  assert.equal(dated.payload.schedule, "기관 일정에 따라 변경");

  const undated = helper.parseCertificationManagementSaveInput(courseInput({ startsOn: "", endsOn: null }));
  assert.equal(undated.payload.startsOn, null);
  assert.equal(undated.payload.endsOn, null);
  assert.equal(helper.formatCertificationDateOnly("2026-09-01"), "2026.09.01");
  assert.equal(helper.formatCertificationDateRange(null, null), "확정 날짜 미정");
  assert.doesNotMatch(helperSource, /new Date\(|toISOString\(|getTimezoneOffset/);
});

test("management input rejects malformed and reversed ranges without adding exam/result ordering", () => {
  assert.throws(
    () => helper.parseCertificationManagementSaveInput(courseInput({ startsOn: "2026-10-02", endsOn: "2026-10-01" })),
    /종료일은 시작일보다 빠를 수 없습니다/,
  );
  assert.throws(
    () => helper.parseCertificationManagementSaveInput(courseInput({ startsOn: "2026-02-30" })),
    /YYYY-MM-DD/,
  );
  assert.doesNotMatch(helperSource, /applicationEndsOn\s*>\s*examOn|examOn\s*>\s*resultOn/);
});

test("server route uses all six 4A management read functions and keeps permission failures distinct", () => {
  for (const name of [
    "listCertificationCoursesForManagement",
    "getCertificationCourseForManagement",
    "listCertificationExamSchedulesForManagement",
    "getCertificationExamScheduleForManagement",
    "listCertificationJobsForManagement",
    "getCertificationJobForManagement",
  ]) {
    assert.match(route, new RegExp(name));
  }
  assert.match(route, /getAuthenticatedSupabaseContext\(\)/);
  assert.match(route, /error instanceof CertificationDirectoryError && error\.code === "permission"/);
  assert.match(route, /redirect\("\/login\?next=\/certification\/manage"\)/);
});

test("server actions strictly parse inputs and only call existing optimistic mutation adapters", () => {
  assert.match(actions, /^"use server";/);
  assert.match(actions, /getAuthenticatedSupabaseContext\(\)/g);
  assert.match(actions, /parseCertificationManagementSaveInput/);
  assert.match(actions, /parseCertificationManagementPublicationInput/);
  for (const name of ["mutateCertificationCourse", "mutateCertificationExamSchedule", "mutateCertificationJob"]) {
    assert.match(actions, new RegExp(name));
  }
  assert.match(component, /expectedVersion: item\?\.version \?\? null/g);
  assert.match(component, /expectedVersion: version/);
  assert.doesNotMatch(actions + component, /\.from\([\s\S]{0,100}\.(?:insert|update|delete)\(/);
  assert.doesNotMatch(actions + component, /operation:\s*["']remove["']/);
});

test("single management screen exposes readable tabs, empty states, inline editors, and publication confirmation", () => {
  for (const label of ["교육과정", "시험 일정", "심판·관련 구인"]) assert.match(component, new RegExp(label));
  for (const empty of ["등록된 교육과정이 없습니다", "등록된 시험 일정이 없습니다", "등록된 구인 정보가 없습니다"]) {
    assert.match(component, new RegExp(empty));
  }
  assert.match(component, /mode: "new"/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /requestAnimationFrame/);
  assert.match(component, /min-h-12/);
  assert.doesNotMatch(component, /window\.location\.reload/);
});

test("management polish localizes identifiers, avoids duplicate create actions, and uses operator-friendly empty states", () => {
  for (const label of ["과정 식별 키", "시험 일정 식별 키", "구인 식별 키"]) {
    assert.match(component, new RegExp(label));
  }
  for (const legacyLabel of ["공개 course key", "공개 schedule key", "공개 job key", "편집 닫기"]) {
    assert.doesNotMatch(component, new RegExp(legacyLabel));
  }
  assert.match(component, /props\.editorMode === "none"[\s\S]*meta\.newLabel/);
  for (const description of [
    "새 과정 등록으로 첫 교육과정을 등록해 주세요.",
    "새 시험 일정 등록으로 첫 일정을 등록해 주세요.",
    "새 구인 등록으로 첫 구인 정보를 등록해 주세요.",
  ]) {
    assert.match(component, new RegExp(description));
  }
  assert.doesNotMatch(component, /가짜 예시 대신 운영자가 확인한 실제 정보만 등록합니다/);
});

test("forms retain all typed and human-readable schedule fields for courses, exams, and jobs", () => {
  for (const token of [
    "startsOn", "endsOn", "schedule",
    "applicationStartsOn", "applicationEndsOn", "examOn", "resultOn",
    "applicationPeriod", "examDate", "resultDate",
  ]) {
    assert.match(component, new RegExp(token));
  }
  assert.match(component, /draft\.startsOn \|\| null/);
  assert.match(component, /draft\.applicationStartsOn \|\| null/g);
  assert.doesNotMatch(component, /자동.*(?:날짜|마감|숨김)|setInterval|setTimeout/);
});

test("management integration adds the directory card and preserves the separate requests workflow", () => {
  assert.match(manageHome, /href: "\/certification\/manage"[\s\S]*title: "자격증·심판 운영"/);
  assert.match(manageHome, /href: "\/certification\/manage\/requests"[\s\S]*title: "자격증 정보 요청"/);
  assert.match(component, /href="\/certification\/manage\/requests"/);
  assert.match(requestsRoute, /CertificationSubmissionRequestManagementPage/);
});

test("existing database regression covers the requested authorization matrix", () => {
  assert.match(typedMigration, /account\.account_status = 'active'/);
  assert.match(typedMigration, /mapping\.permission_code = 'certification\.manage'/);
  assert.match(typedContract, /management read foundation is authenticated, permission-scoped/);
  assert.match(typedRpc, /member, inactive admin, HOF moderator, and anon cannot use management reads or mutations/);
  assert.match(typedRpc, /ids\.suspendedAdmin/);
  assert.match(typedRpc, /json\(authenticated\(ids\.admin/);
});
