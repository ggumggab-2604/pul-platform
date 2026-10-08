import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoPurpose } from "@/lib/images/photoPolicy";
import { contentRpc, uuid } from "./courseContent";

export const COURSE_OPERATOR_IMAGE_LIMIT = 8;
export type CourseOperatorImage = { id: string; caption: string; purpose: PhotoPurpose; createdAt: string; width: number; height: number };
export type CourseOperatorSnapshot = { items: CourseOperatorImage[]; version: number; canManage: boolean };
export const operatorImageUrl = (id: string) => `/courses/operator-images/${id}`;
export function parseCourseOperatorSnapshot(value: unknown): CourseOperatorSnapshot {
  const invalid = () => { throw Error("구장 이미지 응답을 확인하지 못했습니다."); };
  if (!value || typeof value !== "object") return invalid();
  const data = value as CourseOperatorSnapshot;
  if (!Array.isArray(data.items) || data.items.length > COURSE_OPERATOR_IMAGE_LIMIT || !Number.isSafeInteger(data.version) || data.version < 0 || typeof data.canManage !== "boolean") return invalid();
  for (const item of data.items) {
    if (!item || !uuid.test(item.id) || typeof item.caption !== "string" || item.caption.length > 180 || !["photo", "document"].includes(item.purpose) || !Number.isFinite(Date.parse(item.createdAt)) || !Number.isSafeInteger(item.width) || !Number.isSafeInteger(item.height) || Math.min(item.width, item.height) < 1 || Math.max(item.width, item.height) > (item.purpose === "document" ? 2560 : 800)) return invalid();
  }
  if (new Set(data.items.map(item => item.id)).size !== data.items.length) return invalid();
  return data;
}
export async function getCourseOperatorImages(client: SupabaseClient, courseKey: string) {
  return parseCourseOperatorSnapshot(await contentRpc(client, "course_operator_images", { p_course_key: courseKey }));
}

export type CourseOperatorUnfinishedImage = { id: string; status: "pending" | "uploaded" | "removed"; purpose: PhotoPurpose; createdAt: string };
export function parseCourseOperatorUnfinished(value: unknown): { items: CourseOperatorUnfinishedImage[] } {
  const invalid = () => { throw Error("저장하지 않은 사진을 확인하지 못했습니다."); };
  if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown }).items)) return invalid();
  const data = value as { items: CourseOperatorUnfinishedImage[] };
  if (data.items.length > COURSE_OPERATOR_IMAGE_LIMIT || new Set(data.items.map(item => item?.id)).size !== data.items.length) return invalid();
  for (const item of data.items) if (!item || !uuid.test(item.id) || !["pending", "uploaded", "removed"].includes(item.status) || !["photo", "document"].includes(item.purpose) || !Number.isFinite(Date.parse(item.createdAt))) return invalid();
  return data;
}
export async function getCourseOperatorUnfinished(client: SupabaseClient, courseKey: string) {
  return parseCourseOperatorUnfinished(await contentRpc(client, "course_operator_images_unfinished", { p_course_key: courseKey }));
}
