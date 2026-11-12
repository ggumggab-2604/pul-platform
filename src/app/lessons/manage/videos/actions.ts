"use server";

import { revalidatePath } from "next/cache";
import {
  getLessonVideoForManagement,
  LessonDirectoryError,
  mutateLessonVideo,
  renameLessonInstructor,
} from "@/lib/lessons/lessonDirectory";
import { isLessonInstructorId } from "@/lib/lessons/lessonInstructorBookmarks";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type InstructorEditState = { message?: string; error?: string };

function readNames(form: FormData) {
  const channelInput = form.get("channelName");
  const instructorInput = form.get("instructorName");
  const channelName = typeof channelInput === "string" ? channelInput.trim() : "";
  const instructorName = typeof instructorInput === "string" ? instructorInput.trim() : "";
  if (!channelName || channelName.length > 120 || !instructorName || instructorName.length > 100) {
    throw new LessonDirectoryError("validation", "채널명과 교습가 활동명을 확인해 주세요.");
  }
  return { channelName, instructorName };
}

function refreshLessons() {
  revalidatePath("/lessons/manage/videos");
  revalidatePath("/lessons");
}

function messageFor(error: unknown) {
  return error instanceof LessonDirectoryError ? error.userMessage : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function correctLessonVideoInstructorAction(
  videoKey: string,
  version: number,
  _previous: InstructorEditState,
  form: FormData,
): Promise<InstructorEditState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { error: "로그인이 필요합니다." };
  try {
    const names = readNames(form);
    const video = await getLessonVideoForManagement(context.supabase, videoKey);
    if (!video) return { error: "영상을 찾을 수 없습니다." };
    if (video.version !== version) return { error: "영상 정보가 변경되었습니다. 최신 정보를 다시 확인해 주세요." };
    await mutateLessonVideo(context.supabase, "update", videoKey, version, { ...video, ...names });
    refreshLessons();
    return { message: "이 영상의 교습가를 저장했습니다." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function renameLessonInstructorAction(
  instructorId: string,
  expectedChannelName: string,
  expectedInstructorName: string,
  _previous: InstructorEditState,
  form: FormData,
): Promise<InstructorEditState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { error: "로그인이 필요합니다." };
  try {
    if (!isLessonInstructorId(instructorId)) return { error: "교습가 정보를 확인해 주세요." };
    const { channelName, instructorName } = readNames(form);
    await renameLessonInstructor(context.supabase, instructorId, expectedChannelName, expectedInstructorName, channelName, instructorName);
    refreshLessons();
    return { message: "교습가 프로필과 연결 영상의 표시명을 저장했습니다." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}
