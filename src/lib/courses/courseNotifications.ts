import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CourseNotificationState = { courseKey: string; subscribed: boolean; available: boolean };
export type CourseNotificationItem = CourseNotificationState & { name: string | null; courseType: "field" | "screen" | null };
export type CourseNotificationPage = { items: CourseNotificationItem[]; nextCursor: string | null };
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export class CourseNotificationError extends Error {
  constructor(message = "운영알림 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.") { super(message); }
}
function key(value: unknown): asserts value is string {
  if (typeof value !== "string" || !keyPattern.test(value)) throw new CourseNotificationError("장소 정보를 확인해 주세요.");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CourseNotificationError();
  return value as Record<string, unknown>;
}
function state(value: unknown): CourseNotificationState {
  const row = object(value); key(row.course_key);
  if (typeof row.subscribed !== "boolean" || typeof row.available !== "boolean") throw new CourseNotificationError();
  return { courseKey: row.course_key, subscribed: row.subscribed, available: row.available };
}
async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.message?.includes("account_unavailable")) throw new CourseNotificationError("가입 상태를 확인해 주세요. 현재 계정으로 새 운영알림을 신청할 수 없습니다.");
    if (error.message?.includes("unavailable")) throw new CourseNotificationError("현재 이 장소의 운영알림을 신청할 수 없습니다.");
    throw new CourseNotificationError();
  }
  return data as unknown;
}
export async function getCourseNotificationSubscription(client: SupabaseClient, courseKey: string) {
  key(courseKey);
  const result = state(await rpc(client, "get_course_notification_subscription", { p_course_key: courseKey }));
  if (result.courseKey !== courseKey) throw new CourseNotificationError();
  return result;
}
export async function setCourseNotificationSubscription(client: SupabaseClient, courseKey: string, enabled: boolean) {
  key(courseKey); if (typeof enabled !== "boolean") throw new CourseNotificationError();
  const result = state(await rpc(client, "set_course_notification_subscription", { p_course_key: courseKey, p_enabled: enabled }));
  if (result.courseKey !== courseKey || result.subscribed !== enabled) throw new CourseNotificationError();
  return result;
}
export async function listMyCourseNotificationSubscriptions(client: SupabaseClient, after: string | null = null): Promise<CourseNotificationPage> {
  if (after !== null) key(after);
  const row = object(await rpc(client, "list_my_course_notification_subscriptions", { p_limit: 20, p_after_course_key: after }));
  if (!Array.isArray(row.items) || row.items.length > 20) throw new CourseNotificationError();
  if (row.next_cursor !== null) key(row.next_cursor);
  const items = row.items.map((value): CourseNotificationItem => {
    const item = object(value), parsed = state(item);
    if (!parsed.subscribed || (parsed.available ? typeof item.name !== "string" || !["field", "screen"].includes(String(item.course_type)) : item.name !== null || item.course_type !== null)) throw new CourseNotificationError();
    return { ...parsed, name: item.name as string | null, courseType: item.course_type as CourseNotificationItem["courseType"] };
  });
  return { items, nextCursor: row.next_cursor as string | null };
}
