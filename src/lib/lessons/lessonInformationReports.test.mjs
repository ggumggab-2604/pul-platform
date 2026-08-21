import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  LessonInformationReportError,
  listLessonInformationReportsForManagement,
  resolveLessonInformationReport,
  submitLessonInformationReport,
} from "./lessonInformationReports.ts";

const reportKey = "a".repeat(32);
const now = "2026-09-03T00:00:00.000Z";

function client(handler) {
  return { rpc: handler };
}

function managedRow(overrides = {}) {
  return {
    report_key: reportKey,
    report_type: "incorrect_information",
    report_body: "공개된 운영 시간이 실제 안내와 다릅니다.",
    report_status: "pending",
    lesson_key: "lesson-public-1",
    lesson_title: "파크골프 입문 레슨",
    province: "서울",
    district: "송파구",
    location: "잠실 교육장",
    organizer_name: "PUL 교육기관",
    created_at: now,
    resolved_at: null,
    ...overrides,
  };
}

test("submit trims public input and sends exact RPC arguments", async () => {
  let call;
  const result = await submitLessonInformationReport(client(async (name, args) => {
    call = { name, args };
    return { data: { report_key: reportKey, report_status: "pending" }, error: null };
  }), {
    lessonKey: " lesson-public-1 ",
    reportType: "incorrect_information",
    reportBody: "  공개된 운영 시간이 실제 안내와 다릅니다.  ",
  });
  assert.deepEqual(call, {
    name: "submit_lesson_information_report",
    args: {
      p_lesson_key: "lesson-public-1",
      p_report_type: "incorrect_information",
      p_report_body: "공개된 운영 시간이 실제 안내와 다릅니다.",
    },
  });
  assert.deepEqual(result, { reportKey, reportStatus: "pending" });
});

test("client validation rejects invalid keys, enum values, and body lengths", async () => {
  for (const input of [
    { lessonKey: "bad key", reportType: "other", reportBody: "충분히 자세한 제보 내용입니다." },
    { lessonKey: "lesson-public-1", reportType: "bad", reportBody: "충분히 자세한 제보 내용입니다." },
    { lessonKey: "lesson-public-1", reportType: "other", reportBody: "짧음" },
    { lessonKey: "lesson-public-1", reportType: "other", reportBody: "가".repeat(3001) },
  ]) {
    await assert.rejects(
      submitLessonInformationReport(client(async () => ({ data: null, error: null })), input),
      (error) => error instanceof LessonInformationReportError && error.code === "validation",
    );
  }
});

test("management list parses an exact privacy-minimized DTO", async () => {
  let call;
  const page = await listLessonInformationReportsForManagement(
    client(async (name, args) => {
      call = { name, args };
      return {
        data: { items: [managedRow()], total: 1, limit: 30, offset: 0, has_more: false },
        error: null,
      };
    }),
    "pending",
    30,
    0,
  );
  assert.deepEqual(call, {
    name: "list_lesson_information_reports_for_management",
    args: { p_status: "pending", p_limit: 30, p_offset: 0 },
  });
  assert.equal(page.items[0].reportKey, reportKey);
  assert.equal(page.items[0].lessonKey, "lesson-public-1");
  assert.equal("reporterUserId" in page.items[0], false);
});

test("strict parsers reject additional internal UUID fields", async () => {
  for (const extra of ["id", "lesson_id", "reporter_user_id", "resolved_by"]) {
    await assert.rejects(
      listLessonInformationReportsForManagement(client(async () => ({
        data: {
          items: [managedRow({ [extra]: randomUUID() })],
          total: 1,
          limit: 30,
          offset: 0,
          has_more: false,
        },
        error: null,
      }))),
      (error) => error instanceof LessonInformationReportError && error.code === "unknown",
    );
  }
});

test("resolution binds a strict result to the requested public report key", async () => {
  const result = await resolveLessonInformationReport(client(async (name, args) => {
    assert.equal(name, "resolve_lesson_information_report");
    assert.deepEqual(args, { p_report_key: reportKey, p_resolution: "resolved" });
    return {
      data: { report_key: reportKey, report_status: "resolved", resolved_at: now },
      error: null,
    };
  }), reportKey, "resolved");
  assert.equal(result.reportStatus, "resolved");

  await assert.rejects(
    resolveLessonInformationReport(client(async () => ({
      data: { report_key: "b".repeat(32), report_status: "resolved", resolved_at: now },
      error: null,
    })), reportKey, "resolved"),
    (error) => error instanceof LessonInformationReportError && error.code === "unknown",
  );
});

test("database errors map to stable authentication, permission, conflict, and network errors", async () => {
  for (const [message, code] of [
    ["로그인이 필요합니다.", "authentication"],
    ["레슨·교육 운영 권한이 없습니다.", "permission"],
    ["이미 처리된 레슨 정보 제보입니다.", "conflict"],
    ["Failed to fetch", "network"],
  ]) {
    await assert.rejects(
      listLessonInformationReportsForManagement(client(async () => ({
        data: null,
        error: { message },
      }))),
      (error) => error instanceof LessonInformationReportError && error.code === code,
    );
  }
});
