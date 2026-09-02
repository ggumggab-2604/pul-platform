import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CourseDirectoryError,
  submitCourseInformationReport,
  validateCourseInformationReport,
} from "./courseDirectory.ts";

const requestId = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";

function correction(overrides = {}) {
  return {
    requestId,
    reportType: "correction",
    courseKey: "course-test",
    correctionTarget: "phone",
    courseName: null,
    region: null,
    locationDescription: null,
    operationDetails: null,
    reportBody: "TEST 전화번호 수정 제보 본문입니다.",
    ...overrides,
  };
}

function client(data, error = null) {
  return { rpc: async (name, args) => ({ data: typeof data === "function" ? data(name, args) : data, error }) };
}

test("new-course and correction validation enforce distinct target contracts", () => {
  const valid = validateCourseInformationReport(correction({ courseKey: "  course-test  " }));
  assert.equal(valid.courseKey, "course-test");
  assert.equal(valid.correctionTarget, "phone");
  assert.throws(() => validateCourseInformationReport(correction({ correctionTarget: null })), /수정 대상을/);
  assert.throws(() => validateCourseInformationReport(correction({ requestId: "not-a-uuid" })), /요청 식별자/);
  assert.throws(() => validateCourseInformationReport({
    ...correction(),
    reportType: "new_course",
    courseKey: null,
    correctionTarget: "phone",
    courseName: "TEST 신규 골프장",
    region: "서울",
    locationDescription: "서울 TEST 위치",
  }), /신규 골프장 제보 내용을/);
});

test("submit sends the exact hardening payload and verifies response request identity", async () => {
  let called;
  const result = await submitCourseInformationReport(client((name, args) => {
    called = { name, args };
    return { report_id: reportId, status: "received", request_id: requestId, replayed: false };
  }), correction());
  assert.equal(called.name, "submit_course_information_report");
  assert.equal(called.args.p_request_id, requestId);
  assert.equal(called.args.p_correction_target, "phone");
  assert.equal(result.requestId, requestId);
  assert.equal(result.replayed, false);

  await assert.rejects(
    () => submitCourseInformationReport(client({ report_id: reportId, status: "received", request_id: reportId, replayed: false }), correction()),
    CourseDirectoryError,
  );
  await assert.rejects(
    () => submitCourseInformationReport(client({ report_id: reportId, status: "received", request_id: requestId, replayed: false, extra: true }), correction()),
    CourseDirectoryError,
  );
});

test("duplicate and request-ID conflict errors remain user-actionable", async () => {
  for (const message of [
    "같은 수정 대상에 확인 대기 중인 제보가 있습니다.",
    "동일한 요청 식별자를 다른 작업에 재사용할 수 없습니다.",
  ]) {
    await assert.rejects(
      () => submitCourseInformationReport(client(null, { code: "40901", message }), correction()),
      (error) => error instanceof CourseDirectoryError && error.code === "conflict" && error.userMessage === message,
    );
  }
});
