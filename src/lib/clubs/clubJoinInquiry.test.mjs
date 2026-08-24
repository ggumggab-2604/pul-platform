import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const source = readFileSync(
  fileURLToPath(new URL("./clubJoinInquiry.ts", import.meta.url)),
  "utf8",
).replace('import "client-only";', "");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  ClubJoinInquiryClientError,
  loadMyClubJoinInquirySnapshot,
  parseClubJoinInquiryDetail,
  parseClubJoinInquiryHistory,
  submitClubJoinInquiry,
  toClubJoinInquiryError,
  validateClubJoinInquiryForm,
  withdrawClubJoinInquiry,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const clubId = "11111111-1111-4111-8111-111111111111";
const inquiryId = "22222222-2222-4222-8222-222222222222";
const applicantId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const now = "2026-08-24T00:00:00.000Z";

function listRow() {
  return {
    inquiry_id: inquiryId,
    club_id: clubId,
    experience_code: "beginner",
    available_day_code: "weekend",
    interest_codes: ["regularRound"],
    inquiry_status: "received",
    is_assigned: false,
    has_public_reply: false,
    submitted_at: now,
    updated_at: now,
  };
}

function detailRow() {
  return {
    inquiry_id: inquiryId,
    club_id: clubId,
    applicant_id: applicantId,
    experience_code: "beginner",
    available_day_code: "weekend",
    interest_codes: ["regularRound"],
    message: "주말 활동 문의",
    inquiry_status: "received",
    is_assigned: false,
    public_reply: null,
    submitted_at: now,
    review_started_at: null,
    replied_at: null,
    closed_at: null,
    withdrawn_at: null,
    updated_at: now,
  };
}

function historyRow() {
  return {
    history_id: "55555555-5555-4555-8555-555555555555",
    inquiry_id: inquiryId,
    event_code: "inquiry.submitted",
    previous_status: null,
    new_status: "received",
    is_applicant_action: true,
    created_at: now,
  };
}

function submitRow(overrides = {}) {
  return {
    request_id: requestId,
    action_code: "inquiry.submit",
    inquiry_id: inquiryId,
    club_id: clubId,
    applicant_id: applicantId,
    inquiry_status: "received",
    changed: true,
    replayed: false,
    outcome: "success",
    ...overrides,
  };
}

function withdrawRow(overrides = {}) {
  return {
    request_id: requestId,
    action_code: "inquiry.withdraw",
    inquiry_id: inquiryId,
    club_id: clubId,
    applicant_id: applicantId,
    previous_status: "received",
    current_status: "withdrawn",
    changed: true,
    replayed: false,
    outcome: "success",
    ...overrides,
  };
}

test("validates and normalizes the approved inquiry form", () => {
  const valid = validateClubJoinInquiryForm({
    experience: "underOneYear",
    availableDay: "both",
    interests: ["regularRound", "clubEvent"],
    message: "  가입 절차가 궁금합니다.  ",
  });
  assert.deepEqual(valid, {
    ok: true,
    value: {
      experience: "underOneYear",
      availableDay: "both",
      interests: ["regularRound", "clubEvent"],
      message: "가입 절차가 궁금합니다.",
    },
  });
  assert.equal(
    validateClubJoinInquiryForm({
      availableDay: "both",
      interests: ["clubEvent"],
      message: "",
    }).ok,
    false,
  );
  assert.equal(
    validateClubJoinInquiryForm({
      experience: "beginner",
      availableDay: "weekday",
      interests: [],
      message: "",
    }).ok,
    false,
  );
  assert.equal(
    validateClubJoinInquiryForm({
      experience: "beginner",
      availableDay: "weekday",
      interests: ["regularRound", "regularRound"],
      message: "",
    }).ok,
    false,
  );
});

test("strict detail parser exposes only the applicant UI contract", () => {
  const parsed = parseClubJoinInquiryDetail([detailRow()], clubId, inquiryId);
  assert.equal(parsed.inquiryId, inquiryId);
  assert.equal(parsed.message, "주말 활동 문의");
  assert.equal("applicantId" in parsed, false);
  assert.equal("clubId" in parsed, false);
  assert.equal("internalNote" in parsed, false);
  assert.throws(
    () =>
      parseClubJoinInquiryDetail(
        [{ ...detailRow(), internal_note: "노출 금지" }],
        clubId,
        inquiryId,
      ),
    /안전하게 확인/,
  );
  const inherited = Object.assign(Object.create({ hidden: true }), detailRow());
  assert.throws(
    () => parseClubJoinInquiryDetail([inherited], clubId, inquiryId),
    /안전하게 확인/,
  );
});

test("strict history parser removes row identifiers and rejects mixed inquiries", () => {
  const parsed = parseClubJoinInquiryHistory([historyRow()], inquiryId);
  assert.deepEqual(parsed, [
    {
      eventCode: "inquiry.submitted",
      previousStatus: undefined,
      newStatus: "received",
      isApplicantAction: true,
      createdAt: now,
    },
  ]);
  assert.equal("historyId" in parsed[0], false);
  assert.equal("inquiryId" in parsed[0], false);
  assert.throws(
    () =>
      parseClubJoinInquiryHistory(
        [{ ...historyRow(), inquiry_id: applicantId }],
        inquiryId,
      ),
    /안전하게 확인/,
  );
});

test("loads only the latest own inquiry with exact read RPC arguments", async () => {
  const calls = [];
  const client = {
    rpc: async (name, parameters) => {
      calls.push({ name, parameters });
      if (name === "list_my_club_join_inquiries") {
        return { data: [listRow()], error: null };
      }
      if (name === "get_my_club_join_inquiry") {
        return { data: [detailRow()], error: null };
      }
      return { data: [historyRow()], error: null };
    },
  };
  const snapshot = await loadMyClubJoinInquirySnapshot(client, clubId);
  assert.equal(snapshot.inquiry.inquiryId, inquiryId);
  assert.equal(snapshot.history.length, 1);
  assert.deepEqual(calls, [
    {
      name: "list_my_club_join_inquiries",
      parameters: {
        p_club_id: clubId,
        p_limit: 1,
        p_before_submitted_at: null,
        p_before_inquiry_id: null,
      },
    },
    {
      name: "get_my_club_join_inquiry",
      parameters: { p_inquiry_id: inquiryId },
    },
    {
      name: "list_my_club_join_inquiry_history",
      parameters: { p_inquiry_id: inquiryId },
    },
  ]);
});

test("does not request detail or history when the user has no inquiry", async () => {
  const calls = [];
  const snapshot = await loadMyClubJoinInquirySnapshot(
    {
      rpc: async (name, parameters) => {
        calls.push({ name, parameters });
        return { data: [], error: null };
      },
    },
    clubId,
  );
  assert.deepEqual(snapshot, { inquiry: null, history: [] });
  assert.equal(calls.length, 1);
});

test("submit and withdraw call only the approved RPCs with exact payloads", async () => {
  const calls = [];
  const client = {
    rpc: async (name, parameters) => {
      calls.push({ name, parameters });
      return {
        data: [name === "submit_club_join_inquiry" ? submitRow() : withdrawRow()],
        error: null,
      };
    },
  };
  const form = {
    experience: "beginner",
    availableDay: "weekend",
    interests: ["regularRound"],
    message: null,
  };
  assert.equal(
    (await submitClubJoinInquiry(client, clubId, form, requestId)).status,
    "received",
  );
  assert.equal(
    (await withdrawClubJoinInquiry(client, clubId, inquiryId, requestId)).status,
    "withdrawn",
  );
  assert.deepEqual(calls, [
    {
      name: "submit_club_join_inquiry",
      parameters: {
        p_club_id: clubId,
        p_experience_code: "beginner",
        p_available_day_code: "weekend",
        p_interest_codes: ["regularRound"],
        p_message: null,
        p_request_id: requestId,
      },
    },
    {
      name: "withdraw_club_join_inquiry",
      parameters: {
        p_inquiry_id: inquiryId,
        p_request_id: requestId,
      },
    },
  ]);
});

test("accepts a valid replay and rejects mismatched mutation identities", async () => {
  const replay = await submitClubJoinInquiry(
    {
      rpc: async () => ({
        data: [submitRow({ replayed: true })],
        error: null,
      }),
    },
    clubId,
    {
      experience: "beginner",
      availableDay: "weekend",
      interests: ["regularRound"],
      message: null,
    },
    requestId,
  );
  assert.equal(replay.replayed, true);
  await assert.rejects(
    submitClubJoinInquiry(
      {
        rpc: async () => ({
          data: [submitRow({ request_id: applicantId })],
          error: null,
        }),
      },
      clubId,
      {
        experience: "beginner",
        availableDay: "weekend",
        interests: ["regularRound"],
        message: null,
      },
      requestId,
    ),
    (error) =>
      error instanceof ClubJoinInquiryClientError &&
      error.kind === "malformedResponse",
  );
});

test("maps backend and network errors to safe Korean messages", () => {
  const cases = [
    [{ message: "로그인이 필요합니다." }, "authentication"],
    [{ message: "활성 계정만 가입 문의를 조회할 수 있습니다." }, "account"],
    [{ message: "이미 처리 중인 가입 문의가 있습니다." }, "conflict"],
    [{ message: "가입 문의가 없거나 접근 권한이 없습니다." }, "permission"],
    [new TypeError(`Failed to fetch ${requestId}`), "network"],
    [{ message: `unexpected ${requestId} ${applicantId}` }, "unknown"],
  ];
  for (const [error, kind] of cases) {
    const mapped = toClubJoinInquiryError(error);
    assert.equal(mapped.kind, kind);
    assert.equal(mapped.userMessage.includes(requestId), false);
    assert.equal(mapped.userMessage.includes(applicantId), false);
  }
  assert.equal(toClubJoinInquiryError(cases[4][0]).preserveRequestId, true);
});

test("rejects exact-key, prototype, type, and status response violations", async () => {
  for (const row of [
    { ...detailRow(), extra: true },
    { ...detailRow(), inquiry_status: "approved" },
    { ...detailRow(), is_assigned: "false" },
    { ...detailRow(), submitted_at: "not-a-date" },
    { ...detailRow(), interest_codes: ["regularRound", "regularRound"] },
  ]) {
    assert.throws(
      () => parseClubJoinInquiryDetail([row], clubId, inquiryId),
      /안전하게 확인/,
    );
  }
  await assert.rejects(
    withdrawClubJoinInquiry(
      { rpc: async () => ({ data: [withdrawRow({ outcome: "noop" })], error: null }) },
      clubId,
      inquiryId,
      requestId,
    ),
    /안전하게 확인/,
  );
});
