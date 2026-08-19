import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  HallOfFameMemberUiError,
  getHallOfFamePrivateIdentityState,
  getMyHallOfFameDispute,
  listHallOfFamePublicRankings,
  listHallOfFamePublicRecords,
  listHallOfFamePublicRecordsByType,
  listMyHallOfFameApplications,
  normalizeHallOfFameDisputeSubmitInput,
  normalizeHallOfFameDisputeWithdrawInput,
  parseHallOfFameDisputeMutationResult,
  parseHallOfFamePublicRankings,
  parseHallOfFamePublicRecords,
  parseMyHallOfFameApplications,
  parseMyHallOfFameDisputes,
  parseMyHallOfFameRecords,
  submitHallOfFameDispute,
  toHallOfFameMemberUiError,
  withdrawHallOfFameDispute,
} from "./hallOfFameMemberUi.ts";

const id = randomUUID();
const requestId = randomUUID();
const timestamp = "2026-08-18T10:00:00.000Z";

function publicRow(overrides = {}) {
  return {
    record_type_code: "hole_in_one",
    record_type_name: "홀인원",
    played_on: "2026-08-01",
    course_name: "테스트 파크골프장",
    course_region: "서울",
    course_environment: "outdoor",
    course_layout: "A코스",
    course_segment: "A",
    hole_number: 1,
    hole_par: 3,
    strokes: 1,
    display_name: "테스트 회원",
    avatar_url: null,
    club_name: "테스트 동호회",
    badges: [{ code: "hole_in_one", name: "홀인원", source_count: 1 }],
    approved_at: timestamp,
    published_at: timestamp,
    ...overrides,
  };
}

function rankingRow(overrides = {}) {
  return {
    rank_position: 1,
    ranking_label: "테스트 회원",
    ranking_sublabel: null,
    record_count: 3,
    record_type_counts: [
      { code: "hole_in_one", name: "홀인원", count: 2 },
      { code: "albatross", name: "알바트로스", count: 1 },
    ],
    ...overrides,
  };
}

function applicationRow(overrides = {}) {
  return {
    application_record_id: id,
    application_type: "direct_application",
    batch_status: "rejected",
    record_status: "rejected",
    record_type_code: "hole_in_one",
    record_type_name: "홀인원",
    played_on: "2026-08-01",
    course_name: "테스트 파크골프장",
    course_region: "서울",
    course_environment: "outdoor",
    course_layout: "A코스",
    course_segment: "A",
    hole_number: 1,
    hole_par: 3,
    strokes: 1,
    club_name: null,
    created_at: timestamp,
    submitted_at: timestamp,
    finalized_at: timestamp,
    is_submitter: true,
    is_subject: true,
    allowed_dispute_types: ["decision_appeal"],
    can_submit_dispute: true,
    ...overrides,
  };
}

function memberRecordRow(overrides = {}) {
  return {
    canonical_record_id: id,
    record_type_code: "hole_in_one",
    record_type_name: "홀인원",
    validity_status: "corrected",
    publication_status: "suppressed",
    played_on: "2026-08-01",
    course_name: "테스트 파크골프장",
    course_region: "서울",
    course_environment: "outdoor",
    course_layout: "A코스",
    course_segment: "A",
    hole_number: 1,
    hole_par: 3,
    strokes: 1,
    club_name: null,
    approved_at: timestamp,
    published_at: null,
    is_submitter: true,
    is_subject: true,
    badges: [{ code: "hole_in_one", name: "홀인원", status: "inactive" }],
    allowed_dispute_types: ["correction_request", "subject_objection"],
    can_submit_dispute: true,
    ...overrides,
  };
}

function mutationRow(overrides = {}) {
  return {
    request_id: requestId,
    operation: "hall_of_fame.dispute.submit",
    dispute_id: id,
    dispute_type: "decision_appeal",
    status: "open",
    version: 1,
    changed: true,
    replayed: false,
    ...overrides,
  };
}

function disputeRow(overrides = {}) {
  return {
    dispute_id: id,
    dispute_type: "decision_appeal",
    category: "decision_error",
    target_kind: "application_record",
    statement: "처리 결과를 확인해 주세요.",
    status: "open",
    version: 1,
    created_at: timestamp,
    updated_at: timestamp,
    withdrawn_at: null,
    resolution_outcome: null,
    resolution_message: null,
    resolved_at: null,
    ...overrides,
  };
}

function rpcClient(handler) {
  return { rpc: handler };
}

test("private identity gate allows the same server and browser user", () => {
  assert.deepEqual(getHallOfFamePrivateIdentityState("account-a", "account-a"), {
    showPrivate: true,
    refreshRequired: false,
  });
});

test("private identity gate hides server DTOs after sign-out and requests refresh", () => {
  assert.deepEqual(getHallOfFamePrivateIdentityState("account-a", null), {
    showPrivate: false,
    refreshRequired: true,
  });
});

test("private identity gate hides account A DTOs during an A to B switch", () => {
  assert.deepEqual(getHallOfFamePrivateIdentityState("account-a", "account-b"), {
    showPrivate: false,
    refreshRequired: true,
  });
});

test("private identity gate allows account B DTOs after the server refresh", () => {
  assert.deepEqual(getHallOfFamePrivateIdentityState("account-b", "account-b"), {
    showPrivate: true,
    refreshRequired: false,
  });
});

test("private identity gate prevents a private-data flash while auth is loading", () => {
  assert.deepEqual(getHallOfFamePrivateIdentityState("account-a", undefined), {
    showPrivate: false,
    refreshRequired: false,
  });
});

test("public parser accepts only the approved projection", () => {
  const parsed = parseHallOfFamePublicRecords([publicRow()]);
  assert.equal(parsed[0].displayName, "테스트 회원");
  assert.deepEqual(parsed[0].badges, [
    { code: "hole_in_one", name: "홀인원", sourceCount: 1 },
  ]);
  assert.equal("recordId" in parsed[0], false);
});

test("public ranking parser accepts tied ranks and preserves safe aggregate labels", () => {
  const parsed = parseHallOfFamePublicRankings([
    rankingRow(),
    rankingRow({ ranking_label: "PUL member" }),
    rankingRow({
      rank_position: 2,
      ranking_label: "서울",
      ranking_sublabel: "한강 파크골프장",
      record_count: 1,
      record_type_counts: [{ code: "condor", name: "콘도르", count: 1 }],
    }),
  ]);
  assert.deepEqual(parsed[0].recordTypeCounts, [
    { code: "hole_in_one", name: "홀인원", count: 2 },
    { code: "albatross", name: "알바트로스", count: 1 },
  ]);
  assert.equal(parsed[1].rank, 1);
  assert.equal(parsed[2].sublabel, "한강 파크골프장");
  assert.equal("targetUserId" in parsed[0], false);
});

test("public ranking parser rejects malformed totals, duplicate type codes, and ordering", () => {
  assert.throws(
    () => parseHallOfFamePublicRankings([rankingRow({ record_count: 4 })]),
    HallOfFameMemberUiError,
  );
  assert.throws(
    () =>
      parseHallOfFamePublicRankings([
        rankingRow({
          record_type_counts: [
            { code: "hole_in_one", name: "홀인원", count: 2 },
            { code: "hole_in_one", name: "홀인원", count: 1 },
          ],
        }),
      ]),
    HallOfFameMemberUiError,
  );
  assert.throws(
    () =>
      parseHallOfFamePublicRankings([
        rankingRow(),
        rankingRow({ rank_position: 2, record_count: 3 }),
      ]),
    HallOfFameMemberUiError,
  );
});

test("strict parsers reject unknown keys and inherited DTO objects", () => {
  assert.throws(
    () => parseHallOfFamePublicRecords([publicRow({ internal_id: id })]),
    HallOfFameMemberUiError,
  );
  const inherited = Object.create(applicationRow());
  assert.throws(() => parseMyHallOfFameApplications([inherited]), HallOfFameMemberUiError);
});

test("application parser enforces allowed action/capability consistency", () => {
  assert.equal(parseMyHallOfFameApplications([applicationRow()])[0].canSubmitDispute, true);
  assert.throws(
    () =>
      parseMyHallOfFameApplications([
        applicationRow({ allowed_dispute_types: [], can_submit_dispute: true }),
      ]),
    HallOfFameMemberUiError,
  );
});

test("application parser preserves nullable layout and strokes without rejecting the collection", () => {
  const parsed = parseMyHallOfFameApplications([
    applicationRow({ course_layout: null, strokes: null }),
    applicationRow({ application_record_id: randomUUID() }),
  ]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].courseLayout, undefined);
  assert.equal(parsed[0].strokes, undefined);
  assert.equal(parsed[1].courseLayout, "A코스");
  assert.equal(parsed[1].strokes, 1);
});

test("member record parser preserves nullable and non-null layout and strokes", () => {
  const parsed = parseMyHallOfFameRecords([
    memberRecordRow({ course_layout: null, strokes: null }),
    memberRecordRow({ canonical_record_id: randomUUID(), course_layout: "B코스", strokes: 3 }),
  ]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].courseLayout, undefined);
  assert.equal(parsed[0].strokes, undefined);
  assert.equal(parsed[1].courseLayout, "B코스");
  assert.equal(parsed[1].strokes, 3);
});

test("member DTO parsers still reject invalid layout and strokes types", () => {
  for (const courseLayout of [123, {}, []]) {
    assert.throws(
      () => parseMyHallOfFameApplications([applicationRow({ course_layout: courseLayout })]),
      HallOfFameMemberUiError,
    );
    assert.throws(
      () => parseMyHallOfFameRecords([memberRecordRow({ course_layout: courseLayout })]),
      HallOfFameMemberUiError,
    );
  }
  for (const strokes of ["3", 3.5, {}, []]) {
    assert.throws(
      () => parseMyHallOfFameApplications([applicationRow({ strokes })]),
      HallOfFameMemberUiError,
    );
    assert.throws(
      () => parseMyHallOfFameRecords([memberRecordRow({ strokes })]),
      HallOfFameMemberUiError,
    );
  }
});

test("dispute parser enforces type/category and terminal resolution contracts", () => {
  assert.equal(parseMyHallOfFameDisputes([disputeRow()])[0].status, "open");
  assert.throws(
    () => parseMyHallOfFameDisputes([disputeRow({ category: "false_record" })]),
    HallOfFameMemberUiError,
  );
  assert.throws(
    () =>
      parseMyHallOfFameDisputes([
        disputeRow({ status: "resolved", resolution_outcome: "appeal_denied" }),
      ]),
    HallOfFameMemberUiError,
  );
});

test("submit input trims text and rejects action/category or target mismatches", () => {
  assert.deepEqual(
    normalizeHallOfFameDisputeSubmitInput({
      disputeType: "decision_appeal",
      category: "decision_error",
      targetKind: "application_record",
      targetId: id,
      statement: "  처리 결과를 다시 확인해 주세요.  ",
    }),
    {
      disputeType: "decision_appeal",
      category: "decision_error",
      targetKind: "application_record",
      targetId: id,
      statement: "처리 결과를 다시 확인해 주세요.",
    },
  );
  assert.throws(
    () =>
      normalizeHallOfFameDisputeSubmitInput({
        disputeType: "fraud_report",
        category: "false_record",
        targetKind: "application_record",
        targetId: id,
        statement: "허용되지 않은 대상입니다.",
      }),
    HallOfFameMemberUiError,
  );
});

test("withdraw input requires an exact plain payload and positive version", () => {
  assert.deepEqual(normalizeHallOfFameDisputeWithdrawInput({ disputeId: id, expectedVersion: 2 }), {
    disputeId: id,
    expectedVersion: 2,
  });
  assert.throws(
    () => normalizeHallOfFameDisputeWithdrawInput({ disputeId: id, expectedVersion: 0 }),
    HallOfFameMemberUiError,
  );
});

test("mutation parser binds request, operation and target identity", () => {
  assert.equal(
    parseHallOfFameDisputeMutationResult([mutationRow()], {
      requestId,
      operation: "hall_of_fame.dispute.submit",
      disputeType: "decision_appeal",
    }).disputeId,
    id,
  );
  assert.throws(
    () =>
      parseHallOfFameDisputeMutationResult([mutationRow()], {
        requestId: randomUUID(),
        operation: "hall_of_fame.dispute.submit",
      }),
    HallOfFameMemberUiError,
  );
});

test("public and member reads call only their approved RPC names", async () => {
  const calls = [];
  const client = rpcClient(async (name, parameters) => {
    calls.push([name, parameters]);
    return { data: [], error: null };
  });
  await listHallOfFamePublicRecords(client, 25, 5);
  await listHallOfFamePublicRecordsByType(client, "condor", 12, 3);
  await listHallOfFamePublicRankings(client, "monthly", "2026-08-19", 20);
  await listMyHallOfFameApplications(client, 10, 2);
  await getMyHallOfFameDispute(client, id);
  assert.deepEqual(calls, [
    ["list_hall_of_fame_public_records", { p_limit: 25, p_offset: 5 }],
    [
      "list_hall_of_fame_public_records_by_type",
      { p_record_type_code: "condor", p_limit: 12, p_offset: 3 },
    ],
    [
      "list_hall_of_fame_public_rankings",
      { p_ranking_kind: "monthly", p_reference_date: "2026-08-19", p_limit: 20 },
    ],
    ["list_my_hall_of_fame_applications", { p_limit: 10, p_offset: 2 }],
    ["get_my_hall_of_fame_dispute", { p_dispute_id: id }],
  ]);
});

test("public read wrappers reject unsupported filters and malformed reference dates", async () => {
  const client = rpcClient(async () => ({ data: [], error: null }));
  await assert.rejects(
    () => listHallOfFamePublicRecordsByType(client, "eagle"),
    HallOfFameMemberUiError,
  );
  await assert.rejects(
    () => listHallOfFamePublicRankings(client, "monthly", "2026/08/19"),
    HallOfFameMemberUiError,
  );
});

test("submit RPC sends one target kind and binds the generated request ID", async () => {
  const calls = [];
  const client = rpcClient(async (name, parameters) => {
    calls.push([name, parameters]);
    return { data: [mutationRow()], error: null };
  });
  await submitHallOfFameDispute(
    client,
    {
      disputeType: "decision_appeal",
      category: "decision_error",
      targetKind: "application_record",
      targetId: id,
      statement: "처리 결과를 확인해 주세요.",
    },
    requestId,
  );
  assert.deepEqual(calls, [
    [
      "submit_hall_of_fame_dispute",
      {
        p_dispute_type: "decision_appeal",
        p_category: "decision_error",
        p_application_record_id: id,
        p_canonical_record_id: null,
        p_statement: "처리 결과를 확인해 주세요.",
        p_request_id: requestId,
      },
    ],
  ]);
});

test("withdraw RPC binds dispute/version/request and validates the response", async () => {
  const withdrawal = mutationRow({
    operation: "hall_of_fame.dispute.withdraw",
    status: "withdrawn",
  });
  const calls = [];
  const client = rpcClient(async (name, parameters) => {
    calls.push([name, parameters]);
    return { data: [withdrawal], error: null };
  });
  await withdrawHallOfFameDispute(client, { disputeId: id, expectedVersion: 3 }, requestId);
  assert.deepEqual(calls, [
    [
      "withdraw_hall_of_fame_dispute",
      { p_dispute_id: id, p_expected_version: 3, p_request_id: requestId },
    ],
  ]);
});

test("database errors are mapped to safe Korean user messages", () => {
  const mapped = toHallOfFameMemberUiError({ message: "HOF_STALE_DISPUTE_VERSION" });
  assert.equal(mapped.kind, "conflict");
  assert.equal(mapped.shouldRefresh, true);
  assert.doesNotMatch(mapped.userMessage, /HOF_|uuid|request/i);
});
