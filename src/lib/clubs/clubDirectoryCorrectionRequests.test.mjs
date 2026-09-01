import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const source = readFileSync(
  fileURLToPath(new URL("./clubDirectoryCorrectionRequests.ts", import.meta.url)),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const contract = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const requestId = "11111111-1111-4111-8111-111111111111";
const requestKey = "a".repeat(32);
const now = "2026-09-01T00:00:00.000Z";

function submitRow(overrides = {}) {
  return {
    request_id: requestId,
    request_key: requestKey,
    club_public_key: "club-one",
    request_status: "pending",
    version: 1,
    created_at: now,
    replayed: false,
    ...overrides,
  };
}

function listRow(overrides = {}) {
  return {
    request_key: requestKey,
    club_public_key: "club-one",
    club_name: "TEST 동호회",
    requester_label: "로그인 회원",
    correction_target: "region",
    proposed_value_preview: "서울 송파구",
    request_status: "pending",
    version: 1,
    created_at: now,
    updated_at: now,
    resolved_at: null,
    ...overrides,
  };
}

test("submit normalizes values and calls only the approved RPC", async () => {
  const calls = [];
  const client = {
    rpc: async (name, parameters) => {
      calls.push({ name, parameters });
      return { data: submitRow(), error: null };
    },
  };
  const result = await contract.submitClubDirectoryCorrectionRequest(client, {
    clubPublicKey: "club-one",
    requestId,
    payload: {
      target: "region",
      displayedValue: "  서울  ",
      proposedValue: "  서울 송파구  ",
      reason: "  공개 정보 확인  ",
      note: "  참고  ",
    },
  });
  assert.equal(result.requestKey, requestKey);
  assert.deepEqual(calls, [
    {
      name: "submit_club_directory_correction_request",
      parameters: {
        p_request_id: requestId,
        p_club_public_key: "club-one",
        p_payload: {
          target: "region",
          displayed_value: "서울",
          proposed_value: "서울 송파구",
          reason: "공개 정보 확인",
          note: "참고",
        },
      },
    },
  ]);
});

test("strict parser rejects response drift and request identity mismatch", async () => {
  for (const data of [
    submitRow({ request_id: "22222222-2222-4222-8222-222222222222" }),
    { ...submitRow(), actor_id: "hidden" },
    Object.assign(Object.create({ hidden: true }), submitRow()),
  ]) {
    await assert.rejects(
      () =>
        contract.submitClubDirectoryCorrectionRequest(
          { rpc: async () => ({ data, error: null }) },
          {
            clubPublicKey: "club-one",
            requestId,
            payload: {
              target: "region",
              proposedValue: "서울 송파구",
              reason: "공개 정보 확인",
            },
          },
        ),
      /응답 형식/,
    );
  }
});

test("list and detail expose privacy-minimized exact DTOs", async () => {
  const detail = {
    ...listRow(),
    displayed_value: "서울",
    proposed_value: "서울 송파구",
    reason: "공개 정보 확인",
    note: null,
    resolver_label: null,
    resolution_note: null,
  };
  delete detail.proposed_value_preview;
  const client = {
    rpc: async (name) =>
      name.startsWith("list_")
        ? {
            data: {
              items: [listRow()],
              total: 1,
              limit: 30,
              offset: 0,
              has_more: false,
            },
            error: null,
          }
        : { data: detail, error: null },
  };
  const page = await contract.listClubDirectoryCorrectionRequestsForManagement(
    client,
    { clubPublicKey: "club-one", status: "pending" },
  );
  const selected = await contract.getClubDirectoryCorrectionRequestForManagement(
    client,
    requestKey,
  );
  assert.equal(page.total, 1);
  assert.equal(selected.proposedValue, "서울 송파구");
  for (const key of ["requesterUserId", "resolvedBy", "clubId", "email"]) {
    assert.equal(key in selected, false);
  }
});

test("resolve preserves request ID, optimistic version, and exact result", async () => {
  const calls = [];
  const result = await contract.resolveClubDirectoryCorrectionRequest(
    {
      rpc: async (name, parameters) => {
        calls.push({ name, parameters });
        return {
          data: {
            request_id: requestId,
            request_key: requestKey,
            club_public_key: "club-one",
            request_status: "completed",
            version: 2,
            resolved_at: now,
            replayed: false,
          },
          error: null,
        };
      },
    },
    {
      requestKey,
      expectedVersion: 1,
      resolution: "completed",
      resolutionNote: "확인 완료",
      requestId,
    },
  );
  assert.equal(result.version, 2);
  assert.deepEqual(calls[0], {
    name: "resolve_club_directory_correction_request",
    parameters: {
      p_request_key: requestKey,
      p_expected_version: 1,
      p_resolution: "completed",
      p_resolution_note: "확인 완료",
      p_request_id: requestId,
    },
  });
});

test("validation blocks malformed IDs, empty other display, and short text before RPC", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls += 1; return { data: null, error: null }; } };
  await assert.rejects(
    () => contract.submitClubDirectoryCorrectionRequest(client, {
      clubPublicKey: "club-one",
      requestId: "bad",
      payload: { target: "region", proposedValue: "정상", reason: "근거" },
    }),
    /request ID/,
  );
  await assert.rejects(
    () => contract.submitClubDirectoryCorrectionRequest(client, {
      clubPublicKey: "club-one",
      requestId,
      payload: { target: "other", proposedValue: "정상", reason: "근거" },
    }),
    /현재 표시 내용/,
  );
  assert.equal(calls, 0);
});

test("detail action state isolates notes, feedback, request IDs, and stale results by request identity", () => {
  const requestA = "a".repeat(32);
  const requestB = "b".repeat(32);
  const retryId = "22222222-2222-4222-8222-222222222222";
  let stateA = contract.createClubDirectoryCorrectionActionState(requestA);
  stateA = contract.reduceClubDirectoryCorrectionActionState(stateA, {
    type: "edit",
    requestKey: requestA,
    resolutionNote: "A 처리 메모",
  });
  stateA = contract.reduceClubDirectoryCorrectionActionState(stateA, {
    type: "start",
    requestKey: requestA,
    requestId: retryId,
  });
  stateA = contract.reduceClubDirectoryCorrectionActionState(stateA, {
    type: "failure",
    requestKey: requestA,
    error: "A 오류",
  });
  assert.equal(stateA.resolutionNote, "A 처리 메모");
  assert.equal(stateA.error, "A 오류");
  assert.equal(stateA.requestId, retryId);

  const stateB = contract.createClubDirectoryCorrectionActionState(requestB);
  assert.deepEqual(stateB, {
    requestKey: requestB,
    resolutionNote: "",
    message: "",
    error: "",
    requestId: null,
  });

  const afterLateSuccess = contract.reduceClubDirectoryCorrectionActionState(stateB, {
    type: "success",
    requestKey: requestA,
    message: "A 처리 완료",
  });
  const afterLateFailure = contract.reduceClubDirectoryCorrectionActionState(afterLateSuccess, {
    type: "failure",
    requestKey: requestA,
    error: "A 늦은 오류",
  });
  assert.strictEqual(afterLateSuccess, stateB);
  assert.strictEqual(afterLateFailure, stateB);
});
