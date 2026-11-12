import type { SupabaseClient } from "@supabase/supabase-js";

export function isLessonInstructorId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function lessonInstructorHref(instructorId: string) {
  return `/lessons?tab=instructor-promotion&instructorId=${encodeURIComponent(instructorId)}`;
}

export async function listMyLessonInstructorBookmarkKeys(
  client: SupabaseClient,
  instructorIds: string[],
): Promise<string[]> {
  if (instructorIds.length === 0) return [];
  const { data, error } = await client.rpc("list_my_lesson_instructor_bookmarks", {
    p_instructor_ids: instructorIds,
  });
  if (error || !Array.isArray(data) || !data.every(isLessonInstructorId)) {
    throw new Error("관심 교습가를 불러오지 못했습니다.");
  }
  return data;
}

export async function setLessonInstructorBookmark(
  client: SupabaseClient,
  instructorId: string,
  saved: boolean,
) {
  if (!isLessonInstructorId(instructorId) || typeof saved !== "boolean") {
    throw new Error("관심 교습가 정보를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("set_lesson_instructor_bookmark", {
    p_instructor_id: instructorId,
    p_saved: saved,
  });
  if (error || data !== saved) {
    throw new Error("관심 교습가를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
