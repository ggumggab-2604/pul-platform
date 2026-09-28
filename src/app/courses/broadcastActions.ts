"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { MessagingError, previewCourseBroadcast, sendCourseBroadcast } from "@/lib/messaging/messaging";

async function perform<T>(expectedViewerId: string, work: (c: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSupabaseContext>>>) => Promise<T>) {
  try {
    const c = await getAuthenticatedSupabaseContext();
    if (!c) throw new MessagingError("login");
    // Stale browser views cannot send as a newly signed-in account. This is only
    // a comparison; the DB client binds the real actor and independently authorizes.
    if (c.userId !== expectedViewerId) throw new MessagingError("permission");
    return { ok: true as const, data: await work(c) };
  } catch (error) {
    const safe = error instanceof MessagingError ? error : new MessagingError("unknown");
    return { ok: false as const, error: safe.message, code: safe.code };
  }
}
export async function previewCourseBroadcastAction(expectedViewerId: string, courseId: string) {
  return perform(expectedViewerId, c => previewCourseBroadcast(c.supabase, courseId));
}
export async function sendCourseBroadcastAction(expectedViewerId: string, input: { courseId: string; body: string; requestId: string }) {
  return perform(expectedViewerId, async c => {
    const data = await sendCourseBroadcast(c.supabase, input);
    revalidatePath("/messages", "layout");
    return data;
  });
}
