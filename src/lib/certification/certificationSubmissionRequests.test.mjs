import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  CertificationSubmissionRequestError,
  listCertificationSubmissionRequestsForManagement,
  resolveCertificationSubmissionRequest,
  submitCertificationSubmissionRequest,
} from "./certificationSubmissionRequests.ts";

const requestKey = "a".repeat(32);
const now = "2026-09-05T00:00:00.000Z";

function client(handler) {
  return { rpc: handler };
}

function managedRow(overrides = {}) {
  return {
    request_key: requestKey,
    request_type: "course_registration",
    title: "파크골프 심판 교육과정",
    organization_name: "한국 파크골프 교육원",
    region: "서울",
    summary: "공식 심판 교육 일정과 교육 대상을 등록 문의합니다.",
    source_url: "https://example.com/course",
    request_status: "pending",
    created_at: now,
    resolved_at: null,
    ...overrides,
  };
}

test("submit trims all fields and sends exact RPC arguments", async () => {
  let call;
  const result = await submitCertificationSubmissionRequest(client(async (name, args) => {
    call = { name, args };
    return { data: { request_key: requestKey, request_status: "pending" }, error: null };
  }), {
    requestType: "course_registration",
    title: "  파크골프 심판 교육과정  ",
    organizationName: "  한국 파크골프 교육원  ",
    region: "  서울  ",
    summary: "  공식 심판 교육 일정과 교육 대상을 등록 문의합니다.  ",
    sourceUrl: "  https://example.com/course  ",
  });
  assert.deepEqual(call, {
    name: "submit_certification_submission_request",
    args: {
      p_request_type: "course_registration",
      p_title: "파크골프 심판 교육과정",
      p_organization_name: "한국 파크골프 교육원",
      p_region: "서울",
      p_summary: "공식 심판 교육 일정과 교육 대상을 등록 문의합니다.",
      p_source_url: "https://example.com/course",
    },
  });
  assert.deepEqual(result, { requestKey, requestStatus: "pending" });
});

test("job requests send null for optional blank region and source URL", async () => {
  let args;
  await submitCertificationSubmissionRequest(client(async (_name, input) => {
    args = input;
    return { data: { request_key: requestKey, request_status: "pending" }, error: null };
  }), {
    requestType: "job_registration",
    title: "심판 모집 공고",
    organizationName: "지역 체육회",
    region: "  ",
    summary: "공식 심판 모집 일정과 활동 조건을 등록 문의합니다.",
    sourceUrl: "",
  });
  assert.equal(args.p_region, null);
  assert.equal(args.p_source_url, null);
});

test("client validation rejects invalid type, field boundaries, and unsafe URLs", async () => {
  const valid = {
    requestType: "course_registration",
    title: "심판 교육과정",
    organizationName: "파크골프 교육원",
    region: "서울",
    summary: "심판 교육과정 등록을 위한 충분한 안내 내용입니다.",
    sourceUrl: "https://example.com/course",
  };
  for (const input of [
    { ...valid, requestType: "exam_registration" },
    { ...valid, title: "한" },
    { ...valid, organizationName: "한" },
    { ...valid, summary: "짧음" },
    { ...valid, summary: "가".repeat(3001) },
    { ...valid, sourceUrl: "http://example.com" },
  ]) {
    await assert.rejects(
      submitCertificationSubmissionRequest(client(async () => ({ data: null, error: null })), input),
      (error) => error instanceof CertificationSubmissionRequestError && error.code === "validation",
    );
  }
});

test("management list parses an exact privacy-minimized DTO", async () => {
  let call;
  const page = await listCertificationSubmissionRequestsForManagement(
    client(async (name, args) => {
      call = { name, args };
      return {
        data: { items: [managedRow()], total: 1, limit: 30, offset: 0, has_more: false },
        error: null,
      };
    }),
  );
  assert.deepEqual(call, {
    name: "list_certification_submission_requests_for_management",
    args: { p_status: "pending", p_limit: 30, p_offset: 0 },
  });
  assert.equal(page.items[0].requestKey, requestKey);
  assert.equal("requesterUserId" in page.items[0], false);
});

test("strict parsers reject additional internal identity fields", async () => {
  for (const extra of ["id", "requester_user_id", "resolved_by"]) {
    await assert.rejects(
      listCertificationSubmissionRequestsForManagement(client(async () => ({
        data: {
          items: [managedRow({ [extra]: randomUUID() })],
          total: 1,
          limit: 30,
          offset: 0,
          has_more: false,
        },
        error: null,
      }))),
      (error) => error instanceof CertificationSubmissionRequestError && error.code === "unknown",
    );
  }
});

test("resolution binds a strict result to the requested public request key", async () => {
  const result = await resolveCertificationSubmissionRequest(client(async (name, args) => {
    assert.equal(name, "resolve_certification_submission_request");
    assert.deepEqual(args, { p_request_key: requestKey, p_resolution: "resolved" });
    return {
      data: { request_key: requestKey, request_status: "resolved", resolved_at: now },
      error: null,
    };
  }), requestKey, "resolved");
  assert.equal(result.requestStatus, "resolved");

  await assert.rejects(
    resolveCertificationSubmissionRequest(client(async () => ({
      data: { request_key: "b".repeat(32), request_status: "resolved", resolved_at: now },
      error: null,
    })), requestKey, "resolved"),
    (error) => error instanceof CertificationSubmissionRequestError && error.code === "unknown",
  );
});

test("database errors map to stable account, permission, conflict, and network errors", async () => {
  for (const [message, code] of [
    ["로그인이 필요합니다.", "authentication"],
    ["정상 활동 계정만 자격증·심판 등록 문의를 접수할 수 있습니다.", "account"],
    ["자격증·심판 정보 운영 권한이 없습니다.", "permission"],
    ["이미 처리된 자격증·심판 등록 문의입니다.", "conflict"],
    ["Failed to fetch", "network"],
  ]) {
    await assert.rejects(
      listCertificationSubmissionRequestsForManagement(
        client(async () => ({ data: null, error: { message } })),
      ),
      (error) => error instanceof CertificationSubmissionRequestError && error.code === code,
    );
  }
});
