"use server";

import { revalidatePath } from "next/cache";

import {
  CertificationDirectoryError,
  mutateCertificationCourse,
  mutateCertificationExamSchedule,
  mutateCertificationJob,
} from "@/lib/certification/certificationDirectory";
import {
  CertificationManagementInputError,
  parseCertificationManagementPublicationInput,
  parseCertificationManagementSaveInput,
} from "@/lib/certification/certificationManagement";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type CertificationManagementActionResult =
  | { ok: true; message: string; key: string }
  | { ok: false; message: string; shouldRefresh: boolean };

function failure(error: unknown): CertificationManagementActionResult {
  if (error instanceof CertificationDirectoryError) {
    return {
      ok: false,
      message: error.userMessage,
      shouldRefresh: error.shouldRefresh || error.code === "notFound",
    };
  }
  if (error instanceof CertificationManagementInputError) {
    return { ok: false, message: error.userMessage, shouldRefresh: false };
  }
  return {
    ok: false,
    message: "자격증·심판 운영 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    shouldRefresh: false,
  };
}

function revalidateCertificationPaths() {
  revalidatePath("/certification");
  revalidatePath("/certification/manage");
  revalidatePath("/manage");
}

export async function saveCertificationDirectoryItemAction(
  input: unknown,
): Promise<CertificationManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  }

  try {
    const parsed = parseCertificationManagementSaveInput(input);
    let result;
    if (parsed.entity === "course") {
      result = await mutateCertificationCourse(
        context.supabase,
        parsed.operation,
        parsed.key,
        parsed.expectedVersion,
        parsed.payload,
      );
    } else if (parsed.entity === "exam") {
      result = await mutateCertificationExamSchedule(
        context.supabase,
        parsed.operation,
        parsed.key,
        parsed.expectedVersion,
        parsed.payload,
      );
    } else {
      result = await mutateCertificationJob(
        context.supabase,
        parsed.operation,
        parsed.key,
        parsed.expectedVersion,
        parsed.payload,
      );
    }
    revalidateCertificationPaths();
    return {
      ok: true,
      key: result.key,
      message: parsed.operation === "create"
        ? "새 정보를 숨김 상태로 등록했습니다. 내용을 확인한 뒤 공개해 주세요."
        : "변경 내용을 저장했습니다.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function changeCertificationDirectoryPublicationAction(
  input: unknown,
): Promise<CertificationManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  }

  try {
    const parsed = parseCertificationManagementPublicationInput(input);
    let result;
    if (parsed.entity === "course") {
      result = await mutateCertificationCourse(
        context.supabase,
        parsed.operation,
        parsed.key,
        parsed.expectedVersion,
      );
    } else if (parsed.entity === "exam") {
      result = await mutateCertificationExamSchedule(
        context.supabase,
        parsed.operation,
        parsed.key,
        parsed.expectedVersion,
      );
    } else {
      result = await mutateCertificationJob(
        context.supabase,
        parsed.operation,
        parsed.key,
        parsed.expectedVersion,
      );
    }
    revalidateCertificationPaths();
    return {
      ok: true,
      key: result.key,
      message: parsed.operation === "publish" ? "정보를 공개했습니다." : "정보를 숨겼습니다.",
    };
  } catch (error) {
    return failure(error);
  }
}
