"use server";

import { revalidatePath } from "next/cache";

import {
  LessonVideoBookmarkError,
  setLessonVideoBookmark,
} from "@/lib/lessons/lessonVideoBookmarks";
import { createClient } from "@/lib/supabase/server";

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
