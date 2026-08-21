import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  LessonSubmissionError,
  listLessonSubmissionRequestsForManagement,
  listMyLessonSubmissionRequests,
  resolveLessonSubmissionRequest,
  submitLessonSubmissionRequest,
} from "./lessonSubmission.ts";

const requestKey = "a".repeat(32);
const now = "2026-09-01T00:00:00.000Z";

function client(handler) {
  return { rpc: handler };
}

function requestRow(overrides = {}) {
  return {
    request_key: requestKey,
    request_type: "lesson",
    title: "입문 레슨",
    provider_name: "PUL 교육기관",
    region: "서울",
    category: null,
    summary: "파크골프 입문자를 위한 등록 요청입니다.",
    source_url: "https://example.invalid/lesson",
    secondary_url: null,
    request_status: "pending",
    result_public_key: null,
    resolution_note: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

test("submit sends normalized exact RPC input and accepts strict result", async () => {
  const requestId = randomUUID();
  let call;
  const result = await submitLessonSubmissionRequest(client(async (name, args) => {
    call = { name, args };
    return { data: { request_key: requestKey, request_status: "pending", version: 1, replayed: false }, error: null };
  }), requestId, "lesson", {
    title: "  입문 레슨  ", providerName: " PUL 교육기관 ", region: " 서울 ", category: null,
    summary: "  파크골프 입문자를 위한 등록 요청입니다.  ", sourceUrl: " https://example.invalid/lesson ", secondaryUrl: null,
  });
  assert.equal(call.name, "submit_lesson_submission_request");
  assert.deepEqual(call.args, {
    p_request_id: requestId,
    p_request_type: "lesson",
    p_payload: {
      title: "입문 레슨", provider_name: "PUL 교육기관", region: "서울", category: null,
      summary: "파크골프 입문자를 위한 등록 요청입니다.", source_url: "https://example.invalid/lesson", secondary_url: null,
    },
  });
  assert.deepEqual(result, { requestKey, requestStatus: "pending", version: 1, replayed: false });
});

test("own list parses privacy-minimized exact DTO", async () => {
  const page = await listMyLessonSubmissionRequests(client(async () => ({
    data: { items: [requestRow()], total: 1, limit: 20, offset: 0, has_more: false }, error: null,
  })));
  assert.equal(page.items[0].requestKey, requestKey);
  assert.equal("requesterUserId" in page.items[0], false);
});

test("unexpected internal fields fail closed", async () => {
  await assert.rejects(
    listMyLessonSubmissionRequests(client(async () => ({
      data: { items: [requestRow({ requester_user_id: randomUUID() })], total: 1, limit: 20, offset: 0, has_more: false }, error: null,
    }))),
    (error) => error instanceof LessonSubmissionError && error.code === "unknown",
  );
});

test("management list requires strict version and display-name additions", async () => {
  const page = await listLessonSubmissionRequestsForManagement(client(async (name, args) => {
    assert.equal(name, "list_lesson_submission_requests_for_management");
    assert.deepEqual(args, { p_status: "pending", p_limit: 30, p_offset: 0 });
    return {
      data: { items: [{ ...requestRow(), requester_display_name: "PUL 회원", version: 1, processed_at: null }], total: 1, limit: 30, offset: 0, has_more: false },
      error: null,
    };
  }), "pending", 30, 0);
  assert.equal(page.items[0].requesterDisplayName, "PUL 회원");
  assert.equal(page.items[0].version, 1);
});

test("resolution binds the response to the requested public request key", async () => {
  const input = {
    requestKey,
    expectedVersion: 1,
    resolution: "rejected",
    directoryKey: null,
    directoryPayload: null,
    resolutionNote: "공식 내용을 확인할 수 없습니다.",
  };
  const result = await resolveLessonSubmissionRequest(client(async (name, args) => {
    assert.equal(name, "resolve_lesson_submission_request");
    assert.equal(args.p_request_key, requestKey);
    return { data: { request_key: requestKey, request_status: "rejected", version: 2, result_public_key: null }, error: null };
  }), input);
  assert.equal(result.requestStatus, "rejected");

  await assert.rejects(
    resolveLessonSubmissionRequest(client(async () => ({
      data: { request_key: "b".repeat(32), request_status: "rejected", version: 2, result_public_key: null }, error: null,
    })), input),
    (error) => error instanceof LessonSubmissionError && error.code === "unknown",
  );
});
