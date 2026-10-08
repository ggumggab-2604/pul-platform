import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentRpc } from "./courseContent";

/** Removed is terminal: a delayed cancellation can never clean a saved image. */
export async function cleanupCourseOperatorImages(service: SupabaseClient, actor: string, courseKey: string, ids: string[]) {
  if (!ids.length) return;
  const args = { p_actor: actor, p_course_key: courseKey, p_ids: ids };
  const eligible = await contentRpc<{ removed: string[] }>(service, "course_operator_image_cleanup_server", { ...args, p_complete: false });
  if (!Array.isArray(eligible.removed) || eligible.removed.length !== ids.length || new Set(eligible.removed).size !== ids.length || eligible.removed.some(id => !ids.includes(id))) throw Error("사진 정리 대상을 확인하지 못했습니다.");
  const removal = await service.storage.from("course-operator-images").remove(eligible.removed);
  if (removal.error) throw Error("사진 정리가 완료되지 않았습니다. 다시 시도해 주세요.");
  await contentRpc(service, "course_operator_image_cleanup_server", { ...args, p_complete: true });
}
