import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  listPublicUniversityDepartments,
  parseManagedUniversityDepartment,
  parsePublicUniversityDepartment,
  submitUniversityDepartmentRequest,
  UniversityDirectoryError,
} from "./universityDirectory.ts";

const now = "2026-09-24T00:00:00.000Z";
const publicRow = {
  department_key: "test-department",
  university_name: "TEST 대학교",
  department_name: "파크골프 과정",
  summary: "공식 출처로 확인한 TEST 대학 과정 설명입니다.",
  region: "서울",
  official_url: "https://example.invalid/department",
  admissions_url: null,
};

const page = (items) => ({ items, total: items.length, limit: 24, offset: 0, has_more: false });
const client = (handler) => ({ rpc: handler });

test("strict public and management DTO parsers accept exact safe rows", () => {
  assert.equal(parsePublicUniversityDepartment(publicRow).departmentKey, "test-department");
  const managed = parseManagedUniversityDepartment({ ...publicRow, publication_status: "hidden", version: 1, created_at: now, updated_at: now });
  assert.equal(managed.publicationStatus, "hidden");
  assert.throws(() => parsePublicUniversityDepartment({ ...publicRow, internal_id: "leak" }), UniversityDirectoryError);
  assert.throws(() => parsePublicUniversityDepartment({ ...publicRow, official_url: "javascript:alert(1)" }), UniversityDirectoryError);
});

test("public list sends normalized server filters and parses honest empty result", async () => {
  let call;
  const result = await listPublicUniversityDepartments(client(async (name, args) => {
    call = { name, args };
    return { data: page([]), error: null };
  }), "  파크골프  ", "서울", 24, 0);
  assert.equal(call.name, "list_public_lesson_university_departments");
  assert.equal(call.args.p_keyword, "파크골프");
  assert.equal(call.args.p_region, "서울");
  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);
});

test("submission uses exact request id and normalized five-field payload", async () => {
  const requestId = randomUUID();
  let call;
  const result = await submitUniversityDepartmentRequest(client(async (name, args) => {
    call = { name, args };
    return { data: { request_key: randomUUID(), request_status: "pending", version: 1, replayed: false }, error: null };
  }), requestId, {
    universityName: " TEST 대학교 ", departmentName: " 파크골프 과정 ", region: "서울",
    referenceUrl: " https://example.invalid/source ", requestMessage: " 공식 과정 정보를 확인해 주세요. ",
  });
  assert.equal(call.name, "submit_lesson_university_department_request");
  assert.equal(call.args.p_request_id, requestId);
  assert.deepEqual(Object.keys(call.args.p_payload).sort(), ["department_name", "reference_url", "region", "request_message", "university_name"]);
  assert.equal(call.args.p_payload.university_name, "TEST 대학교");
  assert.equal(result.replayed, false);
});
