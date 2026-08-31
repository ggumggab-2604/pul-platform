"use server";

import { revalidatePath } from "next/cache";

import {
  isSafeUniversityUrl,
  mutateUniversityDepartment,
  resolveUniversityDepartmentRequest,
  UNIVERSITY_REGIONS,
  UniversityDirectoryError,
  type UniversityDepartmentMutationOperation,
  type UniversityDepartmentPayload,
  type UniversityRegion,
} from "@/lib/lessons/universityDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type UniversityManagementActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; shouldRefresh: boolean };

function invalid(message = "운영 입력값을 확인해 주세요."): never {
  throw new UniversityDirectoryError("validation", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) invalid();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid();
  return value;
}

function text(value: unknown, label: string, min: number, max: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const length = [...normalized].length;
  if (length < min || length > max) invalid(`${label}은 ${min}~${max}자로 입력해 주세요.`);
  return normalized;
}

function nullableUrl(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() || null : null;
  if (!isSafeUniversityUrl(normalized)) invalid("외부 주소는 https URL로 입력해 주세요.");
  return normalized;
}

function parsePayload(value: unknown): UniversityDepartmentPayload {
  const row = exact(value, ["universityName", "departmentName", "summary", "region", "officialUrl", "admissionsUrl"]);
  if (typeof row.region !== "string" || !(UNIVERSITY_REGIONS as readonly string[]).includes(row.region)) invalid("지역을 확인해 주세요.");
  return {
    universityName: text(row.universityName, "대학명", 2, 160),
    departmentName: text(row.departmentName, "학과·과정명", 2, 160),
    summary: text(row.summary, "설명", 10, 1000),
    region: row.region as UniversityRegion,
    officialUrl: nullableUrl(row.officialUrl),
    admissionsUrl: nullableUrl(row.admissionsUrl),
  };
}

function safeResult(reason: unknown): UniversityManagementActionResult {
  const error = reason instanceof UniversityDirectoryError
    ? reason
    : new UniversityDirectoryError("unknown", "대학·학과 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return { ok: false, message: error.userMessage, shouldRefresh: error.shouldRefresh };
}

export async function mutateUniversityDepartmentAction(input: unknown): Promise<UniversityManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exact(input, ["operation", "departmentKey", "expectedVersion", "payload"]);
    if (!new Set(["create", "update", "publish", "hide"]).has(String(row.operation))) invalid("작업을 확인해 주세요.");
    const operation = row.operation as UniversityDepartmentMutationOperation;
    const departmentKey = text(row.departmentKey, "공개 key", 1, 64);
    const expectedVersion = row.expectedVersion === null ? null : Number(row.expectedVersion);
    if (operation === "create" && expectedVersion !== null) invalid();
    if (operation !== "create" && (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 1)) invalid("현재 version을 확인해 주세요.");
    const value = operation === "create" || operation === "update" ? parsePayload(row.payload) : undefined;
    if (!value && row.payload !== null) invalid("이 작업에는 추가 입력값을 사용할 수 없습니다.");
    await mutateUniversityDepartment(context.supabase, operation, departmentKey, expectedVersion, value);
    revalidatePath("/lessons");
    revalidatePath("/lessons/manage/university-departments");
    return { ok: true, message: operation === "create" ? "hidden 상태로 등록했습니다." : operation === "update" ? "대학·학과 정보를 수정했습니다." : operation === "publish" ? "대학·학과 정보를 공개했습니다." : "대학·학과 정보를 숨겼습니다." };
  } catch (reason) {
    return safeResult(reason);
  }
}

export async function resolveUniversityDepartmentRequestAction(input: unknown): Promise<UniversityManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exact(input, ["requestKey", "expectedVersion", "resolution", "resolutionNote"]);
    if (typeof row.requestKey !== "string" || !/^[0-9a-f-]{36}$/i.test(row.requestKey)) invalid("요청 식별값을 확인해 주세요.");
    if (!Number.isSafeInteger(row.expectedVersion) || (row.expectedVersion as number) < 1) invalid("현재 version을 확인해 주세요.");
    if (row.resolution !== "completed" && row.resolution !== "closed") invalid("처리 상태를 확인해 주세요.");
    const resolutionNote = typeof row.resolutionNote === "string" ? row.resolutionNote.trim() || null : null;
    if (resolutionNote && ([...resolutionNote].length < 2 || [...resolutionNote].length > 1000)) invalid("처리 메모는 2~1000자로 입력해 주세요.");
    await resolveUniversityDepartmentRequest(context.supabase, row.requestKey, row.expectedVersion as number, row.resolution, resolutionNote);
    revalidatePath("/lessons/manage/university-departments/requests");
    return { ok: true, message: row.resolution === "completed" ? "요청을 완료 처리했습니다. 디렉터리 정보는 별도로 등록해야 합니다." : "요청을 닫았습니다." };
  } catch (reason) {
    return safeResult(reason);
  }
}
