"use server";

import { revalidatePath } from "next/cache";

import {
  LessonVideoBookmarkError,
  setLessonVideoBookmark,
} from "@/lib/lessons/lessonVideoBookmarks";
import {
  LessonInformationReportError,
  submitLessonInformationReport,
  type LessonInformationReportInput,
} from "@/lib/lessons/lessonInformationReports";
import { createClient } from "@/lib/supabase/server";

export async function submitLessonInformationReportAction(
  input: LessonInformationReportInput,
) {
  try {
    const data = await submitLessonInformationReport(await createClient(), input);
    revalidatePath("/lessons");
    revalidatePath("/lessons/manage/reports");
    return { ok: true as const, data };
  } catch (error) {
    const reportError = error instanceof LessonInformationReportError ? error : null;
    return {
      ok: false as const,
      code: reportError?.code ?? "unknown",
      error:
        reportError?.userMessage
        ?? "레슨 정보 제보를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      authenticationRequired: reportError?.code === "authentication",
    };
  }
}

export async function setLessonVideoBookmarkAction(videoKey: string, saved: boolean) {
  try {
    const data = await setLessonVideoBookmark(await createClient(), videoKey, saved);
    revalidatePath("/lessons");
    return { ok: true as const, data };
  } catch (error) {
    const bookmarkError = error instanceof LessonVideoBookmarkError ? error : null;
    return {
      ok: false as const,
      code: bookmarkError?.code ?? "unknown",
      error: bookmarkError?.userMessage ?? "관심 영상을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}
