import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  HallOfFameOperatorError,
  getHallOfFameDisputeResolutionContext,
  parseHallOfFameDisputeInternalNotes,
  parseHallOfFameDisputeResolutionContext,
  parseHallOfFameDisputeReviewDetail,
  parseHallOfFameDisputeReviewQueue,
  resolveHallOfFameDispute,
  startHallOfFameDisputeReview,
} from "./hallOfFameOperatorUi.ts";

const disputeId = randomUUID();
const requestId = randomUUID();
const canonicalRecordId = randomUUID();
const timestamp = "2026-08-19T09:00:00.000Z";

function queueRow(overrides = {}) {
  return {
    dispute_id: disputeId,
    dispute_type: "subject_objection",
    category: "wrong_subject",
    status: "under_review",
    version: 2,
    statement: "대상 기록을 다시 확인해 주세요.",
    target_kind: "canonical_record",
    application_record_id: null,
    canonical_record_id: canonicalRecordId,
    submitted_by_user_id: randomUUID(),
    subject_user_id: randomUUID(),
    created_at: timestamp,
    updated_at: timestamp,
    review_started_at: timestamp,
    resolution_outcome: null,
    resolved_at: null,
    ...overrides,
  };
}

function detailRow(overrides = {}) {
  const { resolved_at, ...queue } = queueRow();
  return {
    ...queue,
    review_started_by_user_id: randomUUID(),
    resolution_message: null,
    resolution_canonical_record_id: null,
    resolved_at,
    ...overrides,
  };
}

function contextRow(overrides = {}) {
  return {
    dispute_id: disputeId,
    dispute_type: "subject_objection",
    dispute_version: 2,
    canonical_record_id: canonicalRecordId,
    canonical_record_version: 3,
    record_type_code: "hole_in_one",
    played_on: "2026-08-01",
    course_name_snapshot: "테스트 파크골프장",
    course_region_snapshot: "서울",
    course_environment: "outdoor",
    course_layout_snapshot: null,
    course_segment_snapshot: "A",
    hole_number: 1,
    hole_par: 3,
    strokes: 1,
    nominating_club_id: null,
    ...overrides,
  };
}

function rpcClient(handler) {
  return { rpc: handler };
}

test("queue and detail parsers retain only minimum operator fields", () => {
  const queue = parseHallOfFameDisputeReviewQueue([queueRow()]);
  assert.equal(queue[0].disputeId, disputeId);
  assert.equal(queue[0].version, 2);
  assert.equal("submittedByUserId" in queue[0], false);
  assert.equal("canonicalRecordId" in queue[0], false);

  const detail = parseHallOfFameDisputeReviewDetail([detailRow()]);
  assert.equal(detail.status, "under_review");
  assert.equal(detail.resolutionMessage, undefined);
  assert.equal("reviewStartedByUserId" in detail, false);
});

test("strict parsers reject extra keys, malformed UUIDs, and prototype objects", () => {
  assert.throws(
    () => parseHallOfFameDisputeReviewQueue([queueRow({ email: "hidden@example.test" })]),
    HallOfFameOperatorError,
  );
  assert.throws(
    () => parseHallOfFameDisputeReviewQueue([queueRow({ dispute_id: "bad" })]),
    HallOfFameOperatorError,
  );
  const inherited = Object.create({ secret: true });
  Object.assign(inherited, queueRow());
  assert.throws(
    () => parseHallOfFameDisputeReviewQueue([inherited]),
    HallOfFameOperatorError,
  );
});

test("internal notes discard actor identity and require an exact response", () => {
  const notes = parseHallOfFameDisputeInternalNotes([
    {
      review_id: randomUUID(),
      review_kind: "internal_note",
      note: "운영자 전용 확인 메모",
      actor_user_id: randomUUID(),
      created_at: timestamp,
    },
  ]);
  assert.equal(notes[0].note, "운영자 전용 확인 메모");
  assert.equal("actorUserId" in notes[0], false);
});

test("resolution context parser enforces canonical correction boundary", () => {
  const context = parseHallOfFameDisputeResolutionContext([contextRow()]);
  assert.equal(context.canonicalRecordId, canonicalRecordId);
  assert.equal(context.canonicalRecordVersion, 3);
  assert.throws(
    () => parseHallOfFameDisputeResolutionContext([contextRow({ dispute_type: "decision_appeal" })]),
    HallOfFameOperatorError,
  );
});

test("context read calls only the approved minimum RPC", async () => {
  const calls = [];
  const client = rpcClient(async (name, parameters) => {
    calls.push([name, parameters]);
    return { data: [contextRow()], error: null };
  });
  const result = await getHallOfFameDisputeResolutionContext(client, disputeId);
  assert.equal(result.disputeId, disputeId);
  assert.deepEqual(calls, [["get_hall_of_fame_dispute_resolution_context", { p_dispute_id: disputeId }]]);
});

test("review start validates request identity and result operation", async () => {
  const client = rpcClient(async () => ({
    data: [{
      request_id: requestId,
      operation: "hall_of_fame.dispute.review.start",
      dispute_id: disputeId,
      status: "under_review",
      version: 2,
      review_started_at: timestamp,
      changed: true,
      replayed: false,
    }],
    error: null,
  }));
  const result = await startHallOfFameDisputeReview(client, disputeId, 1, requestId);
  assert.equal(result.version, 2);
  assert.equal(result.changed, true);
});

test("final resolution rejects mismatched request IDs and extra response fields", async () => {
  const input = {
    disputeId,
    expectedVersion: 2,
    resolutionOutcome: "objection_not_upheld",
    resolutionMessage: "검토 결과 요청을 반영하지 않습니다.",
    internalNote: "증빙과 기존 결정을 재확인했습니다.",
  };
  const mismatched = rpcClient(async () => ({
    data: [{
      request_id: randomUUID(),
      operation: "hall_of_fame.dispute.resolve",
      dispute_id: disputeId,
      status: "resolved",
      version: 3,
      resolution_outcome: "objection_not_upheld",
      resolved_at: timestamp,
      changed: true,
      replayed: false,
    }],
    error: null,
  }));
  await assert.rejects(
    resolveHallOfFameDispute(mismatched, input, requestId),
    HallOfFameOperatorError,
  );
});
