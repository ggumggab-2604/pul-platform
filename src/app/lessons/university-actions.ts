"use server";

import { revalidatePath } from "next/cache";

import {
  isSafeUniversityUrl,
  submitUniversityDepartmentRequest,
  UNIVERSITY_REGIONS,
  UniversityDirectoryError,
  type UniversityDepartmentRequestPayload,
  type UniversityRegion,
} from "@/lib/lessons/universityDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type UniversityDepartmentRequestActionResult =
  | { ok: true; message: string; replayed: boolean }
  | { ok: false; message: string; authenticationRequired: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalid(message: string): never {
  throw new UniversityDirectoryError("validation", message);
}

function text(value: unknown, label: string, min: number, max: number) {
  const normalized = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const length = [...normalized].length;
  if (length < min || length > max) invalid(`${label}은 ${min}~${max}자로 입력해 주세요.`);
  return normalized;
}

function parseUniversityDepartmentRequestActionInput(value: unknown): {
  requestId: string;
  payload: UniversityDepartmentRequestPayload;
} {
  if (!isRecord(value)) invalid("등록 요청 입력값을 확인해 주세요.");
  const actual = Object.keys(value).sort();
  const expected = ["departmentName", "referenceUrl", "region", "requestId", "requestMessage", "universityName"].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid("지원하지 않는 등록 요청 입력값이 포함되어 있습니다.");
  }
  if (typeof value.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)) {
    invalid("요청 식별값을 확인해 주세요.");
  }
  if (typeof value.region !== "string" || !(UNIVERSITY_REGIONS as readonly string[]).includes(value.region)) {
    invalid("지역을 확인해 주세요.");
  }
  const referenceUrl = typeof value.referenceUrl === "string" ? value.referenceUrl.trim() || null : null;
  if (!isSafeUniversityUrl(referenceUrl)) invalid("참고 URL은 https 주소로 입력해 주세요.");
  return {
    requestId: value.requestId,
    payload: {
      universityName: text(value.universityName, "대학명", 2, 160),
      departmentName: text(value.departmentName, "학과·과정명", 2, 160),
      region: value.region as UniversityRegion,
      referenceUrl,
      requestMessage: text(value.requestMessage, "요청 내용", 10, 2000),
    },
  };
}

export async function submitUniversityDepartmentRequestAction(
  input: unknown,
): Promise<UniversityDepartmentRequestActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", authenticationRequired: true };
  try {
    const parsed = parseUniversityDepartmentRequestActionInput(input);
    const result = await submitUniversityDepartmentRequest(context.supabase, parsed.requestId, parsed.payload);
    revalidatePath("/lessons");
    revalidatePath("/lessons/manage/university-departments/requests");
    return {
      ok: true,
      message: result.replayed ? "이미 접수된 같은 요청을 확인했습니다." : "대학·학과 등록·수정 요청을 접수했습니다.",
      replayed: result.replayed,
    };
  } catch (reason) {
    const error = reason instanceof UniversityDirectoryError
      ? reason
      : new UniversityDirectoryError("unknown", "대학·학과 요청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return { ok: false, message: error.userMessage, authenticationRequired: error.code === "authentication" };
  }
}
