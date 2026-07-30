import assert from "node:assert/strict";
import test from "node:test";

import {
  ClubMemberRoleMutationError,
  clearClubMemberRoleRequestSlot,
  createClubMemberRolePayloadFingerprint,
  mutateClubMemberRole,
  normalizeClubMemberRoleReason,
  parseClubMemberRoleMutationResponse,
  resolveClubMemberRoleRequestSlot,
  toClubMemberRoleMutationError,
} from "./clubMemberRoleManagement.ts";

const clubId = "11111111-1111-4111-8111-111111111111";
const otherClubId = "11111111-1111-4111-8111-222222222222";
const membershipId = "22222222-2222-4222-8222-222222222222";
const otherMembershipId = "22222222-2222-4222-8222-333333333333";
const requestId = "33333333-3333-4333-8333-333333333333";
const otherRequestId = "33333333-3333-4333-8333-444444444444";
const roleAssignmentId = "44444444-4444-4444-8444-444444444444";

function resultRow(action = "grant", mode = "success", replayed = false) {
  const grant = action === "grant";
  const success = mode === "success";
  return {
    request_id: requestId,
    action_code: grant ? "role.grant_manager" : "role.revoke_manager",
    club_id: clubId,
    membership_id: membershipId,
    role_code: "club_manager",
    role_assignment_id:
      !grant && !success ? null : roleAssignmentId,
    previous_active: grant ? !success : success,
    current_active: grant,
    changed: success,
    replayed,
    outcome: success ? "success" : "noop",
  };
}

function parse(rows, action = "grant") {
  return parseClubMemberRoleMutationResponse(rows, {
    action,
    clubId,
    membershipId,
    requestId,
  });
}

function assertRoleError(run, kind, message) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof ClubMemberRoleMutationError);
    assert.equal(error.kind, kind);
    if (message) assert.equal(error.message, message);
    return true;
  });
}

test("normalizes valid reasons and preserves internal content", () => {
  assert.equal(normalizeClubMemberRoleReason("  역할 부여  "), "역할 부여");
  assert.equal(normalizeClubMemberRoleReason("내부  공백"), "내부  공백");
  assert.equal(normalizeClubMemberRoleReason("사유\n확인"), "사유\n확인");
  assert.equal(normalizeClubMemberRoleReason("가나"), "가나");
  assert.equal(
    normalizeClubMemberRoleReason("가".repeat(500)),
    "가".repeat(500),
  );
});

test("validates reason length by Unicode code points", () => {
  assert.equal(normalizeClubMemberRoleReason("😀😀"), "😀😀");
  assert.equal(
    normalizeClubMemberRoleReason("😀".repeat(500)),
    "😀".repeat(500),
  );
  for (const value of ["", "   ", "가", "😀", "가".repeat(501), "😀".repeat(501)]) {
    assertRoleError(
      () => normalizeClubMemberRoleReason(value),
      "validation",
      "역할 변경 사유는 2자 이상 500자 이하로 입력해 주세요.",
    );
  }
});

test("does not include rejected reason content in validation errors", () => {
  const privateReason = "민감한 테스트 사유";
  assert.throws(
    () => normalizeClubMemberRoleReason(privateReason.repeat(100)),
    (error) => {
      assert.ok(error instanceof ClubMemberRoleMutationError);
      assert.doesNotMatch(error.message, /민감한 테스트 사유/);
      return true;
    },
  );
});

test("reuses request IDs only for the same normalized payload", () => {
  let generated = 0;
  const createRequestId = () =>
    `00000000-0000-4000-8000-${String(++generated).padStart(12, "0")}`;
  const payload = {
    action: "grant",
    clubId,
    membershipId,
    reason: "  역할 부여  ",
  };
  const first = resolveClubMemberRoleRequestSlot(
    undefined,
    payload,
    createRequestId,
  );
  const retry = resolveClubMemberRoleRequestSlot(
    first,
    { ...payload, reason: "역할 부여" },
    createRequestId,
  );
  const changedAction = resolveClubMemberRoleRequestSlot(
    retry,
    { ...payload, action: "revoke" },
    createRequestId,
  );
  const changedClub = resolveClubMemberRoleRequestSlot(
    changedAction,
    { ...payload, clubId: otherClubId },
    createRequestId,
  );
  const changedMembership = resolveClubMemberRoleRequestSlot(
    changedClub,
    { ...payload, membershipId: otherMembershipId },
    createRequestId,
  );
  const changedReason = resolveClubMemberRoleRequestSlot(
    changedMembership,
    { ...payload, reason: "다른 사유" },
    createRequestId,
  );
  const cleared = clearClubMemberRoleRequestSlot();
  const afterClear = resolveClubMemberRoleRequestSlot(
    cleared,
    payload,
    createRequestId,
  );

  assert.equal(first.requestId, retry.requestId);
  assert.notEqual(changedAction.requestId, retry.requestId);
  assert.notEqual(changedClub.requestId, changedAction.requestId);
  assert.notEqual(changedMembership.requestId, changedClub.requestId);
  assert.notEqual(changedReason.requestId, changedMembership.requestId);
  assert.notEqual(afterClear.requestId, first.requestId);
  assert.equal(generated, 6);
});

test("fingerprints all identity fields using the normalized reason", () => {
  const base = { action: "grant", clubId, membershipId, reason: " 사유 확인 " };
  assert.equal(
    createClubMemberRolePayloadFingerprint(base),
    createClubMemberRolePayloadFingerprint({ ...base, reason: "사유 확인" }),
  );
  for (const changed of [
    { ...base, action: "revoke" },
    { ...base, clubId: otherClubId },
    { ...base, membershipId: otherMembershipId },
    { ...base, reason: "다른 사유" },
  ]) {
    assert.notEqual(
      createClubMemberRolePayloadFingerprint(base),
      createClubMemberRolePayloadFingerprint(changed),
    );
  }
});

test("request slot helpers do not write identifiers or fingerprints to console", () => {
  const calls = [];
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  console.log = (...args) => calls.push(args);
  console.warn = (...args) => calls.push(args);
  console.error = (...args) => calls.push(args);
  try {
    resolveClubMemberRoleRequestSlot(
      undefined,
      { action: "grant", clubId, membershipId, reason: "역할 부여" },
      () => requestId,
    );
  } finally {
    console.log = originals.log;
    console.warn = originals.warn;
    console.error = originals.error;
  }
  assert.deepEqual(calls, []);
});

test("accepts all approved grant, revoke, noop, and replay results", () => {
  for (const action of ["grant", "revoke"]) {
    for (const mode of ["success", "noop"]) {
      for (const replayed of [false, true]) {
        const row = resultRow(action, mode, replayed);
        const result = parse([row], action);
        assert.deepEqual(result, {
          requestId,
          actionCode:
            action === "grant"
              ? "role.grant_manager"
              : "role.revoke_manager",
          clubId,
          membershipId,
          roleCode: "club_manager",
          roleAssignmentId: row.role_assignment_id,
          previousActive: row.previous_active,
          currentActive: row.current_active,
          changed: row.changed,
          replayed,
          outcome: row.outcome,
        });
      }
    }
  }
});

test("rejects invalid result containers and exact-key violations", () => {
  for (const value of [
    null,
    undefined,
    {},
    [],
    [resultRow(), resultRow()],
    ["not-an-object"],
  ]) {
    assertRoleError(() => parse(value), "malformedResponse");
  }

  const missing = resultRow();
  delete missing.outcome;
  assertRoleError(() => parse([missing]), "malformedResponse");
  assertRoleError(
    () => parse([{ ...resultRow(), unexpected: true }]),
    "malformedResponse",
  );
  assertRoleError(
    () =>
      parse([
        {
          ...resultRow(),
          target_user_id: "55555555-5555-4555-8555-555555555555",
        },
      ]),
    "malformedResponse",
  );
});

test("rejects malformed and mismatched identifiers", () => {
  for (const row of [
    { ...resultRow(), request_id: "bad-request" },
    { ...resultRow(), club_id: "bad-club" },
    { ...resultRow(), membership_id: "bad-membership" },
    { ...resultRow(), role_assignment_id: "bad-assignment" },
    { ...resultRow(), request_id: otherRequestId },
    { ...resultRow(), club_id: otherClubId },
    { ...resultRow(), membership_id: otherMembershipId },
  ]) {
    assertRoleError(() => parse([row]), "malformedResponse");
  }
  assertRoleError(
    () =>
      parseClubMemberRoleMutationResponse([resultRow()], {
        action: "grant",
        clubId,
        membershipId,
        requestId: "bad-request",
      }),
    "malformedResponse",
  );
});

test("rejects wrong action, role, boolean, and outcome values", () => {
  for (const row of [
    { ...resultRow(), action_code: "role.revoke_manager" },
    { ...resultRow(), role_code: "club_member" },
    { ...resultRow(), previous_active: "false" },
    { ...resultRow(), current_active: 1 },
    { ...resultRow(), changed: null },
    { ...resultRow(), replayed: "true" },
    { ...resultRow(), outcome: "completed" },
  ]) {
    assertRoleError(() => parse([row]), "malformedResponse");
  }
});

test("rejects impossible grant state and outcome combinations", () => {
  for (const row of [
    { ...resultRow(), previous_active: true },
    { ...resultRow(), current_active: false },
    { ...resultRow(), changed: false },
    { ...resultRow(), outcome: "noop" },
    { ...resultRow("grant", "noop"), previous_active: false },
    { ...resultRow("grant", "noop"), current_active: false },
    { ...resultRow("grant", "noop"), changed: true },
    { ...resultRow("grant", "noop"), outcome: "success" },
    { ...resultRow(), replayed: true, current_active: false },
  ]) {
    assertRoleError(() => parse([row]), "malformedResponse");
  }
});

test("rejects impossible revoke state and outcome combinations", () => {
  for (const row of [
    { ...resultRow("revoke"), previous_active: false },
    { ...resultRow("revoke"), current_active: true },
    { ...resultRow("revoke"), changed: false },
    { ...resultRow("revoke"), outcome: "noop" },
    { ...resultRow("revoke", "noop"), previous_active: true },
    { ...resultRow("revoke", "noop"), current_active: true },
    { ...resultRow("revoke", "noop"), changed: true },
    { ...resultRow("revoke", "noop"), outcome: "success" },
    { ...resultRow("revoke"), replayed: true, current_active: true },
  ]) {
    assertRoleError(() => parse([row], "revoke"), "malformedResponse");
  }
});

test("enforces the approved role assignment identifier nullability", () => {
  assertRoleError(
    () => parse([{ ...resultRow("grant"), role_assignment_id: null }]),
    "malformedResponse",
  );
  assertRoleError(
    () =>
      parse(
        [{ ...resultRow("grant", "noop"), role_assignment_id: null }],
        "grant",
      ),
    "malformedResponse",
  );
  assertRoleError(
    () =>
      parse(
        [{ ...resultRow("revoke"), role_assignment_id: null }],
        "revoke",
      ),
    "malformedResponse",
  );
  assertRoleError(
    () =>
      parse(
        [
          {
            ...resultRow("revoke", "noop"),
            role_assignment_id: roleAssignmentId,
          },
        ],
        "revoke",
      ),
    "malformedResponse",
  );
});

test("calls only the approved grant and revoke RPCs with four arguments", async () => {
  const calls = [];
  const supabase = {
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      const action = name.startsWith("grant") ? "grant" : "revoke";
      return { data: [resultRow(action)], error: null };
    },
  };

  const grant = await mutateClubMemberRole(supabase, {
    action: "grant",
    clubId,
    membershipId,
    requestId,
    reason: "  역할 부여  ",
  });
  const revoke = await mutateClubMemberRole(supabase, {
    action: "revoke",
    clubId,
    membershipId,
    requestId,
    reason: "  역할 회수  ",
  });

  assert.equal(grant.actionCode, "role.grant_manager");
  assert.equal(revoke.actionCode, "role.revoke_manager");
  assert.deepEqual(calls, [
    {
      name: "grant_club_manager_role_by_membership",
      payload: {
        p_club_id: clubId,
        p_target_membership_id: membershipId,
        p_request_id: requestId,
        p_reason: "역할 부여",
      },
    },
    {
      name: "revoke_club_manager_role_by_membership",
      payload: {
        p_club_id: clubId,
        p_target_membership_id: membershipId,
        p_request_id: requestId,
        p_reason: "역할 회수",
      },
    },
  ]);
  assert.deepEqual(
    Object.keys(calls[0].payload).sort(),
    ["p_club_id", "p_reason", "p_request_id", "p_target_membership_id"],
  );
  assert.equal("target_user_id" in calls[0].payload, false);
});

test("maps RPC failures and rejects malformed RPC success responses", async () => {
  await assert.rejects(
    mutateClubMemberRole(
      {
        rpc: async () => ({
          data: null,
          error: { message: "동호회 역할 관리 권한이 없습니다." },
        }),
      },
      { action: "grant", clubId, membershipId, requestId, reason: "역할 부여" },
    ),
    (error) =>
      error instanceof ClubMemberRoleMutationError &&
      error.kind === "permission",
  );
  await assert.rejects(
    mutateClubMemberRole(
      { rpc: async () => ({ data: [], error: null }) },
      { action: "grant", clubId, membershipId, requestId, reason: "역할 부여" },
    ),
    (error) =>
      error instanceof ClubMemberRoleMutationError &&
      error.kind === "malformedResponse",
  );
});

test("maps approved backend error categories to safe user messages", () => {
  const cases = [
    [
      { message: "로그인이 필요합니다." },
      "authentication",
      "로그인 상태를 다시 확인해 주세요.",
    ],
    [
      { message: "같은 요청 식별자를 다른 입력에 재사용할 수 없습니다." },
      "conflict",
      "이전 요청과 다른 내용이 감지됐습니다. 새 요청으로 다시 시도해 주세요.",
    ],
    [
      { message: "동호회 역할 관리 권한이 없습니다." },
      "permission",
      "운영진 역할을 관리할 권한이 없습니다.",
    ],
    [
      { message: "본인의 운영진 역할을 변경할 수 없습니다." },
      "protectedTarget",
      "이 회원의 역할은 이 화면에서 변경할 수 없습니다.",
    ],
    [
      { message: "회장 역할을 가진 회원은 일반 역할 작업으로 변경할 수 없습니다." },
      "protectedTarget",
      "이 회원의 역할은 이 화면에서 변경할 수 없습니다.",
    ],
    [
      { message: "부회장은 일반 운영진 역할 작업으로 변경할 수 없습니다." },
      "protectedTarget",
      "이 회원의 역할은 이 화면에서 변경할 수 없습니다.",
    ],
    [
      {
        message:
          "대상 동호회 회원 관계를 찾을 수 없거나 역할 관리 권한이 없습니다.",
      },
      "unavailable",
      "대상 회원을 확인할 수 없거나 역할을 변경할 수 없습니다.",
    ],
    [
      { message: "활성 계정의 역할만 변경할 수 있습니다." },
      "inactive",
      "현재 상태에서는 운영진 역할을 변경할 수 없습니다.",
    ],
    [
      { message: "정상 활동 중인 동호회 회원의 역할만 변경할 수 있습니다." },
      "inactive",
      "현재 상태에서는 운영진 역할을 변경할 수 없습니다.",
    ],
    [
      new TypeError("Failed to fetch"),
      "network",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    ],
    [
      { message: "운영진 역할 변경 결과를 확인할 수 없습니다." },
      "malformedResponse",
      "역할 변경 결과를 확인하지 못했습니다.",
    ],
    [
      { message: "unexpected database failure" },
      "unknown",
      "운영진 역할 변경을 처리하지 못했습니다.",
    ],
  ];

  for (const [input, kind, message] of cases) {
    const mapped = toClubMemberRoleMutationError(input);
    assert.equal(mapped.kind, kind);
    assert.equal(mapped.message, message);
  }
});

test("never exposes backend identifiers, reason text, SQLSTATE, or stack text", () => {
  const sensitiveValues = [
    requestId,
    membershipId,
    "민감한 역할 변경 사유",
    "SQLSTATE 42501",
    "private.execute_club_manager_role_mutation",
  ];
  const mapped = toClubMemberRoleMutationError({
    code: "XX000",
    message: sensitiveValues.join(" "),
    details: "postgres stack trace",
  });
  for (const sensitive of sensitiveValues) {
    assert.equal(mapped.message.includes(sensitive), false);
  }
  assert.equal(mapped.message, "운영진 역할 변경을 처리하지 못했습니다.");
});
test("rejects custom prototypes and inherited response properties", () => {
  const customPrototype = Object.assign(
    Object.create({ unexpected: true }),
    resultRow(),
  );
  assertRoleError(() => parse([customPrototype]), "malformedResponse");

  const inheritedTarget = Object.assign(
    Object.create({
      target_user_id: "55555555-5555-4555-8555-555555555555",
    }),
    resultRow(),
  );
  assertRoleError(() => parse([inheritedTarget]), "malformedResponse");

  const withoutMembership = resultRow();
  delete withoutMembership.membership_id;
  const inheritedRequired = Object.assign(
    Object.create({ membership_id: membershipId }),
    withoutMembership,
  );
  assertRoleError(() => parse([inheritedRequired]), "malformedResponse");
});

test("accepts null-prototype rows and rejects abnormal row objects", () => {
  const nullPrototypeRow = Object.assign(Object.create(null), resultRow());
  assert.equal(parse([nullPrototypeRow]).membershipId, membershipId);

  class ResultRow {
    constructor() {
      Object.assign(this, resultRow());
    }
  }
  for (const row of [
    [...Object.values(resultRow())],
    new Date(),
    new Map(),
    new Set(),
    new ResultRow(),
  ]) {
    assertRoleError(() => parse([row]), "malformedResponse");
  }
});

test("rejects symbol and non-enumerable extra own keys", () => {
  const withSymbol = resultRow();
  withSymbol[Symbol("unexpected")] = true;
  assertRoleError(() => parse([withSymbol]), "malformedResponse");

  const withNonEnumerable = resultRow();
  Object.defineProperty(withNonEnumerable, "hidden_extra", {
    enumerable: false,
    value: true,
  });
  assertRoleError(() => parse([withNonEnumerable]), "malformedResponse");
});

test("rejects every invalid injected request ID without exposing it", () => {
  const payload = {
    action: "grant",
    clubId,
    membershipId,
    reason: "역할 부여",
  };
  for (const generated of [
    "",
    "not-a-uuid",
    " " + requestId + " ",
    null,
    undefined,
  ]) {
    let calls = 0;
    assert.throws(
      () =>
        resolveClubMemberRoleRequestSlot(undefined, payload, () => {
          calls += 1;
          return generated;
        }),
      (error) => {
        assert.ok(error instanceof ClubMemberRoleMutationError);
        assert.equal(error.kind, "validation");
        if (typeof generated === "string" && generated.length > 0) {
          assert.equal(error.message.includes(generated), false);
        }
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});

test("maps RPC Promise rejection to a safe network failure", async () => {
  const rawMessage = "Failed to fetch " + requestId + " " + membershipId;
  await assert.rejects(
    mutateClubMemberRole(
      {
        rpc: async () => {
          throw new TypeError(rawMessage);
        },
      },
      { action: "grant", clubId, membershipId, requestId, reason: "역할 부여" },
    ),
    (error) => {
      assert.ok(error instanceof ClubMemberRoleMutationError);
      assert.equal(error.kind, "network");
      assert.equal(error.message, "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
      assert.equal(error.message.includes(rawMessage), false);
      return true;
    },
  );
});

test("prioritizes Supabase error over simultaneously returned valid data", async () => {
  await assert.rejects(
    mutateClubMemberRole(
      {
        rpc: async () => ({
          data: [resultRow()],
          error: { message: "동호회 역할 관리 권한이 없습니다." },
        }),
      },
      { action: "grant", clubId, membershipId, requestId, reason: "역할 부여" },
    ),
    (error) => {
      assert.ok(error instanceof ClubMemberRoleMutationError);
      assert.equal(error.kind, "permission");
      return true;
    },
  );
});

test("rejects non-boolean values across every boolean response field", () => {
  const fields = [
    "previous_active",
    "current_active",
    "changed",
    "replayed",
  ];
  const invalidValues = [0, 1, "true", "false", null, undefined];
  for (const field of fields) {
    for (const invalidValue of invalidValues) {
      assertRoleError(
        () => parse([{ ...resultRow(), [field]: invalidValue }]),
        "malformedResponse",
      );
    }
  }
});
