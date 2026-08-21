"use server";

import { revalidatePath } from "next/cache";

import {
  CertificationSubmissionRequestError,
  resolveCertificationSubmissionRequest,
  type CertificationSubmissionResolution,
} from "@/lib/certification/certificationSubmissionRequests";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type CertificationSubmissionManagementActionResult =
  | { ok: true; message: string; requestKey: string }
  | { ok: false; message: string; shouldRefresh: boolean };

const requestKeyPattern = /^[0-9a-f]{32}$/;

export async function resolveCertificationSubmissionRequestAction(
  input: unknown,
): Promise<CertificationSubmissionManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  }

  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new CertificationSubmissionRequestError("validation", "처리할 등록 문의를 확인해 주세요.");
    }
    const row = input as Record<string, unknown>;
    const keys = Object.keys(row).sort();
    if (keys.length !== 2 || keys[0] !== "requestKey" || keys[1] !== "resolution") {
      throw new CertificationSubmissionRequestError("validation", "처리할 등록 문의를 확인해 주세요.");
    }
    const requestKey = typeof row.requestKey === "string" ? row.requestKey.trim() : "";
    if (!requestKeyPattern.test(requestKey)) {
      throw new CertificationSubmissionRequestError("validation", "처리할 등록 문의를 확인해 주세요.");
    }
    if (row.resolution !== "resolved" && row.resolution !== "dismissed") {
      throw new CertificationSubmissionRequestError("validation", "처리 결과를 확인해 주세요.");
    }

    const resolution = row.resolution as CertificationSubmissionResolution;
    const result = await resolveCertificationSubmissionRequest(
      context.supabase,
      requestKey,
      resolution,
    );
    revalidatePath("/certification/manage/requests");
    return {
      ok: true,
      requestKey: result.requestKey,
      message: resolution === "resolved" ? "등록 문의를 처리 완료했습니다." : "등록 문의를 종료했습니다.",
    };
  } catch (error) {
    const safe = error instanceof CertificationSubmissionRequestError
      ? error
      : new CertificationSubmissionRequestError(
        "unknown",
        "자격증·심판 등록 문의를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    return {
      ok: false,
      message: safe.userMessage,
      shouldRefresh: safe.code === "conflict" || safe.code === "notFound",
    };
  }
}
