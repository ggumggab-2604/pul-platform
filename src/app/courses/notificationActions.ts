"use server";

import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { CourseNotificationError, getCourseNotificationSubscription, setCourseNotificationSubscription, listMyCourseNotificationSubscriptions } from "@/lib/courses/courseNotifications";

async function perform<T>(viewerId: string, work: (context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSupabaseContext>>>) => Promise<T>) {
  try {
    const context = await getAuthenticatedSupabaseContext();
    // A stale tab must not submit the previous viewer's intent under a new session.
    // This equality is a session guard; the RPC independently derives auth.uid().
    if (!context || context.userId !== viewerId) throw new CourseNotificationError("로그인 계정이 변경되었습니다. 다시 확인해 주세요.");
    return { ok: true as const, data: await work(context) };
  } catch (error) {
    return { ok: false as const, error: (error instanceof CourseNotificationError ? error : new CourseNotificationError()).message };
  }
}
export async function getCourseNotificationAction(viewerId: string, courseKey: string) {
  return perform(viewerId, c => getCourseNotificationSubscription(c.supabase, courseKey));
}
export async function setCourseNotificationAction(viewerId: string, courseKey: string, enabled: boolean) {
  return perform(viewerId, c => setCourseNotificationSubscription(c.supabase, courseKey, enabled));
}
export async function listCourseNotificationsAction(viewerId: string, after: string | null = null) {
  return perform(viewerId, c => listMyCourseNotificationSubscriptions(c.supabase, after));
}
