import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CourseManagementError,
  findCourseDuplicateCandidates,
  listCourseInformationReportsForManagement,
  listCoursesForManagement,
  mutateManagedCourse,
  parseCourseInformationReportDetail,
  parseManagedCourse,
  resolveCourseInformationReport,
  validateManagedCourseInput,
} from "./courseManagement.ts";

const requestId = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-09-21T00:00:00.000Z";

function course(overrides = {}) {
  return {
    course_key: "course-test",
    name: "TEST 한강 파크골프장",
    course_type: "field",
    region: "서울",
    city: "마포구",
    address: "서울 TEST 주소 10",
    holes: 18,
    operating_hours: null,
    operation_code: "walkIn",
    phone: null,
    parking_available: null,
    feature_codes: [],
    description: "TEST 골프장 운영 설명입니다.",
    reservation_url: null,
    reservation_guide: null,
    fee_guide: null,
    latitude: null,
    longitude: null,
    course_status: "inactive",
    updated_at: timestamp,
    ...overrides,
  };
}

function report(overrides = {}) {
  return {
    report_id: reportId,
    report_type: "new_course",
    correction_target: null,
    course_name: "TEST 신규 골프장",
    region: "서울",
    report_status: "received",
    created_at: timestamp,
    updated_at: timestamp,
    target_course_key: null,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    name: "TEST 한강 파크골프장",
    courseType: "field",
    region: "서울",
    city: "마포구",
    address: "서울 TEST 주소 10",
    holes: 18,
    operatingHours: null,
    operation: "walkIn",
    phone: null,
    parkingAvailable: null,
    featureCodes: [],
    description: "TEST 골프장 운영 설명입니다.",
    reservationUrl: null,
    reservationGuide: null,
    feeGuide: null,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

function client(data, error = null) {
  return { rpc: async (name, args) => ({ data: typeof data === "function" ? data(name, args) : data, error }) };
}

test("management course parser accepts exact nullable data and rejects extras, invalid coordinates and prototype values", () => {
  assert.equal(parseManagedCourse(course()).courseStatus, "inactive");
  assert.throws(() => parseManagedCourse({ ...course(), id: requestId }), CourseManagementError);
  assert.throws(() => parseManagedCourse(course({ latitude: 37.5, longitude: null })), CourseManagementError);
  const inherited = Object.create({ course_key: "inherited" });
  Object.assign(inherited, course());
  assert.throws(() => parseManagedCourse(inherited), CourseManagementError);
});

test("validator trims realistic fields and blocks unsafe URL, coordinate pair and duplicate features", () => {
  const valid = validateManagedCourseInput(input({ name: "  TEST 한강 파크골프장  ", reservationUrl: "https://example.invalid/course" }));
  assert.equal(valid.name, "TEST 한강 파크골프장");
  assert.throws(() => validateManagedCourseInput(input({ reservationUrl: "javascript:alert(1)" })), /https/);
  assert.throws(() => validateManagedCourseInput(input({ latitude: 37.5, longitude: null })), /함께/);
  assert.throws(() => validateManagedCourseInput(input({ featureCodes: ["club_available", "club_available"] })), /제공 기능/);
});

test("management list and report list parse exact paged contracts", async () => {
  const page = await listCoursesForManagement(client({ items: [course()], total: 1, limit: 30, offset: 0, has_more: false }));
  assert.equal(page.items[0].courseKey, "course-test");
  const reports = await listCourseInformationReportsForManagement(client({ items: [report()], total: 1, limit: 30, offset: 0, has_more: false }));
  assert.equal(reports.items[0].reportId, reportId);
});

test("detail parser excludes reporter identity and accepts target course without internal UUID", () => {
  const parsed = parseCourseInformationReportDetail({
    ...report({ report_type: "correction", correction_target: "operating_hours", target_course_key: "course-test" }),
    location_description: "서울 TEST 주소 10",
    operation_details: "운영시간 변경",
    report_body: "TEST 운영시간 정정 제보 본문입니다.",
    resolved_at: null,
    resolution_note: null,
    target_course: { course_key: "course-test", name: "TEST 한강 파크골프장", address: "서울 TEST 주소 10", course_status: "active", updated_at: timestamp },
  });
  assert.equal(parsed.targetCourse?.courseKey, "course-test");
  assert.equal(parsed.correctionTarget, "operating_hours");
  assert.equal("reporter_user_id" in parsed, false);
  assert.throws(() => parseCourseInformationReportDetail({ ...report(), reporter_user_id: requestId }), CourseManagementError);
});

test("course mutation sends exact payload and requires the response request ID to match", async () => {
  let called;
  const result = await mutateManagedCourse(client((name, args) => {
    called = { name, args };
    return { course_key: "course-test", course_status: "inactive", updated_at: timestamp, request_id: requestId };
  }), "create", null, null, requestId, input());
  assert.equal(called.name, "mutate_managed_course");
  assert.equal(called.args.p_payload.course_type, "field");
  assert.equal(result.requestId, requestId);
  await assert.rejects(() => mutateManagedCourse(client({ course_key: "course-test", course_status: "inactive", updated_at: timestamp, request_id: reportId }), "create", null, null, requestId, input()), CourseManagementError);
});

test("duplicate candidates are privacy-minimized and report mutation verifies identity and request ID", async () => {
  const candidates = await findCourseDuplicateCandidates(client([{ course_key: "course-test", name: "TEST 한강 파크골프장", region: "서울", city: "마포구", address: "서울 TEST 주소 10", course_status: "active" }]), { name: "TEST 한강 파크골프장", region: "서울", city: "마포구" });
  assert.deepEqual(Object.keys(candidates[0]).sort(), ["address", "city", "courseKey", "courseStatus", "name", "region"]);
  const resolved = await resolveCourseInformationReport(client({ report_id: reportId, report_status: "handled", updated_at: timestamp, request_id: requestId }), reportId, "handled", timestamp, "운영시간 반영", requestId);
  assert.equal(resolved.reportStatus, "handled");
});

test("permission, conflict and network failures map to safe Korean errors", async () => {
  await assert.rejects(() => listCoursesForManagement(client(null, { code: "42501", message: "권한이 없습니다." })), (error) => error instanceof CourseManagementError && error.code === "permission" && error.shouldRefresh);
  await assert.rejects(() => listCoursesForManagement(client(null, { code: "40001", message: "변경되었습니다." })), (error) => error instanceof CourseManagementError && error.code === "conflict" && error.shouldRefresh);
  await assert.rejects(() => listCoursesForManagement(client(null, { message: "fetch failed" })), (error) => error instanceof CourseManagementError && error.code === "network");
});
