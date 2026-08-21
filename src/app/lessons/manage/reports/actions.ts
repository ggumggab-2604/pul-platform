"use server";

import { revalidatePath } from "next/cache";

import {
  LessonInformationReportError,
  resolveLessonInformationReport,
  type LessonInformationReportResolution,
} from "@/lib/lessons/lessonInformationReports";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type LessonInformationReportManagementActionResult =
  | { ok: true; message: string; reportKey: string }
  | { ok: false; message: string; shouldRefresh: boolean };

const reportKeyPattern = /^[0-9a-f]{32}$/;

export async function resolveLessonInformationReportAction(
  input: unknown,
): Promise<LessonInformationReportManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  }

  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new LessonInformationReportError("validation", "처리할 제보를 확인해 주세요.");
    }
    const row = input as Record<string, unknown>;
    const keys = Object.keys(row).sort();
    if (keys.length !== 2 || keys[0] !== "reportKey" || keys[1] !== "resolution") {
      throw new LessonInformationReportError("validation", "처리할 제보를 확인해 주세요.");
    }
    const reportKey = typeof row.reportKey === "string" ? row.reportKey.trim() : "";
    if (!reportKeyPattern.test(reportKey)) {
      throw new LessonInformationReportError("validation", "처리할 제보를 확인해 주세요.");
    }
    if (row.resolution !== "resolved" && row.resolution !== "dismissed") {
      throw new LessonInformationReportError("validation", "처리 결과를 확인해 주세요.");
    }

    const resolution = row.resolution as LessonInformationReportResolution;
    const result = await resolveLessonInformationReport(
      context.supabase,
      reportKey,
      resolution,
    );
    revalidatePath("/lessons/manage/reports");
    return {
      ok: true,
      reportKey: result.reportKey,
      message: resolution === "resolved" ? "제보를 처리 완료했습니다." : "제보를 무시 처리했습니다.",
    };
  } catch (error) {
    const safe = error instanceof LessonInformationReportError
      ? error
      : new LessonInformationReportError(
        "unknown",
        "레슨 정보 제보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    return {
      ok: false,
      message: safe.userMessage,
      shouldRefresh: safe.code === "conflict" || safe.code === "notFound",
    };
  }
}
