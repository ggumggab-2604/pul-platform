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
import { youtubeVideoId } from "@/lib/lessons/lessonInstructorChannels";
import { setLessonInstructorBookmark } from "@/lib/lessons/lessonInstructorBookmarks";
import { videoLessonCategories } from "@/data/videoLessonData";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const shareableCategories = new Set<string>(
  videoLessonCategories.map(({ value }) => value).filter((value) => value !== "all" && value !== "cert_referee"),
);

export type ShareLessonVideoState = { ok: boolean; message: string; category?: string };

export async function shareLessonVideoAction(
  _previous: ShareLessonVideoState,
  form: FormData,
): Promise<ShareLessonVideoState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다." };
  const url = form.get("youtubeUrl");
  const category = form.get("category");
  const scope = form.get("scope");
  if (scope !== null && scope !== "both" && scope !== "exclusive") {
    return { ok: false, message: "공개 범위를 선택해 주세요." };
  }
  const id = typeof url === "string" ? youtubeVideoId(url.trim()) : null;
  if (!id || typeof category !== "string" || !shareableCategories.has(category)) {
    return { ok: false, message: "YouTube 영상 주소와 카테고리를 확인해 주세요." };
  }

  // Request only the fixed YouTube endpoint and send only the public video URL.
  const metadataUrl = new URL("https://www.youtube.com/oembed");
  metadataUrl.searchParams.set("url", `https://www.youtube.com/watch?v=${id}`);
  metadataUrl.searchParams.set("format", "json");
  let title = "YouTube 파크골프 레슨";
  let channel = "YouTube";
  try {
    const response = await fetch(metadataUrl, { redirect: "error", signal: AbortSignal.timeout(6000) });
    const data: unknown = response.ok ? await response.json() : null;
    if (data && typeof data === "object") {
      if ("title" in data && typeof data.title === "string" && data.title.trim()) {
        title = [...data.title.trim()].slice(0, 160).join("").trim();
      }
      if ("author_name" in data && typeof data.author_name === "string" && data.author_name.trim()) {
        channel = [...data.author_name.trim()].slice(0, 100).join("").trim();
      }
    }
  } catch {
    // A video that cannot be embedded can still be shared as a link.
  }
  try {
    const rpcName = scope === null ? "publish_shared_lesson_video" : "publish_lesson_instructor_channel_video";
    const { error } = await context.supabase.rpc(rpcName, {
      p_youtube_id: id,
      p_category: category,
      p_title: [...title].length === 1 ? `${title} (YouTube)` : title,
      p_channel_name: channel,
      ...(scope === null ? {} : { p_exclusive: scope === "exclusive" }),
    });
    if (error) {
      if (error.code === "23505") return { ok: false, message: "이미 등록된 YouTube 영상입니다." };
      return { ok: false, message: "영상을 등록할 수 없습니다. 계정 상태와 영상 정보를 확인해 주세요." };
    }
    revalidatePath("/lessons");
    revalidatePath("/lessons/instructors/[id]", "page");
    const message = scope === "exclusive" ? "교습가 페이지에만 등록했습니다."
      : scope === "both" ? "무료 레슨과 교습가 페이지에 등록했습니다." : "무료 영상 목록에 등록했습니다.";
    return { ok: true, message, category };
  } catch {
    return { ok: false, message: "영상을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function reportLessonVideoAction(videoKey: string) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false as const, message: "로그인하면 신고할 수 있습니다." };
  if (typeof videoKey !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(videoKey)) {
    return { ok: false as const, message: "신고할 영상을 확인해 주세요." };
  }
  const { data, error } = await context.supabase.rpc("report_lesson_video", { p_video_key: videoKey });
  if (error || (data !== "hidden" && data !== "reported" && data !== "already_reported")) {
    return {
      ok: false as const,
      message: error?.code === "P0002"
        ? "현재 공개된 영상을 찾을 수 없습니다."
        : "신고를 접수하지 못했습니다. 계정 상태를 확인해 주세요.",
    };
  }
  if (data === "hidden") {
    revalidatePath("/lessons");
    revalidatePath("/lessons/instructors/[id]", "page");
  }
  return { ok: true as const, message: data === "already_reported" ? "이미 신고한 영상입니다." : "신고를 접수했습니다." };
}

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

export async function setLessonInstructorBookmarkAction(
  instructorId: string,
  saved: boolean,
) {
  try {
    await setLessonInstructorBookmark(await createClient(), instructorId, saved);
    revalidatePath("/lessons");
    revalidatePath(`/lessons/instructors/${instructorId}`);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "관심 교습가를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." };
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
