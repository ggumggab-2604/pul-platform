"use server";

import { revalidatePath } from "next/cache";

import {
  cleanupHallOfFameEvidenceForOperator,
  HallOfFameEvidenceError,
} from "@/lib/hall-of-fame/hallOfFameEvidenceStorage";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HallOfFameEvidenceCleanupActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; shouldRefresh: boolean };

function invalidInput(): never {
  throw new HallOfFameEvidenceError("HOF_EVIDENCE_CLEANUP_INPUT_INVALID");
}

function normalizeInput(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    invalidInput();
  }
  const row = value as Record<string, unknown>;
  const expectedKeys = [
    "evidenceId",
    "expectedBatchVersion",
    "expectedEvidenceVersion",
    "expireRequestId",
    "storageRequestId",
  ];
  const actualKeys = Object.keys(row).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    invalidInput();
  }
  const uuid = (field: string) => {
    const candidate = row[field];
    if (typeof candidate !== "string" || !UUID_PATTERN.test(candidate)) {
      invalidInput();
    }
    return candidate;
  };
  const version = (field: string) => {
    const candidate = row[field];
    if (!Number.isSafeInteger(candidate) || (candidate as number) < 1) {
      invalidInput();
    }
    return candidate as number;
  };
  return {
    evidenceId: uuid("evidenceId"),
    expectedEvidenceVersion: version("expectedEvidenceVersion"),
    expectedBatchVersion: version("expectedBatchVersion"),
    expireRequestId: uuid("expireRequestId"),
    storageRequestId: uuid("storageRequestId"),
  };
}

function failure(
  error: unknown,
): Extract<HallOfFameEvidenceCleanupActionResult, { ok: false }> {
  const code =
    error instanceof HallOfFameEvidenceError ? error.code : "HOF_UNKNOWN";
  if (code === "HOF_AUTHENTICATION_REQUIRED") {
    return {
      ok: false,
      message: "로그인 상태를 다시 확인해 주세요.",
      shouldRefresh: true,
    };
  }
  if (code === "HOF_EVIDENCE_CLEANUP_NOT_AUTHORIZED") {
    return {
      ok: false,
      message: "증빙 정리 권한이 없습니다.",
      shouldRefresh: true,
    };
  }
  if (
    code === "HOF_EVIDENCE_NOT_CLEANABLE" ||
    code === "HOF_EVIDENCE_CLEANUP_STALE" ||
    code.includes("VERSION_CONFLICT") ||
    code.includes("STALE")
  ) {
    return {
      ok: false,
      message: "증빙 상태가 변경되었습니다. 최신 목록을 확인해 주세요.",
      shouldRefresh: true,
    };
  }
  if (code === "HOF_EVIDENCE_CLEANUP_INPUT_INVALID") {
    return {
      ok: false,
      message: "정리 요청 내용을 다시 확인해 주세요.",
      shouldRefresh: false,
    };
  }
  return {
    ok: false,
    message: "증빙 정리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    shouldRefresh: true,
  };
}

export async function cleanupHallOfFameEvidenceAction(
  input: unknown,
): Promise<HallOfFameEvidenceCleanupActionResult> {
  try {
    const result = await cleanupHallOfFameEvidenceForOperator(
      normalizeInput(input),
    );
    revalidatePath("/hall-of-fame/manage/evidence-cleanup");
    revalidatePath("/manage");
    if (!result.deleted) {
      return {
        ok: false,
        message:
          "Storage 정리에 실패했습니다. 실패 결과가 기록되었으며 다시 시도할 수 있습니다.",
        shouldRefresh: true,
      };
    }
    return { ok: true, message: "증빙 Storage 정리를 완료했습니다." };
  } catch (error) {
    const result = failure(error);
    if (result.shouldRefresh) {
      revalidatePath("/hall-of-fame/manage/evidence-cleanup");
      revalidatePath("/manage");
    }
    return result;
  }
}
