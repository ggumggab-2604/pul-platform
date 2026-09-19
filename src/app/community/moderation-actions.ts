"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { ContentModerationError, moderateContent, type ModerationInput } from "@/lib/community/contentModeration";

export async function moderateContentAction(input: ModerationInput) {
  try {
    const context = await getAuthenticatedSupabaseContext();
    if (!context) throw new ContentModerationError("login");
    // The RPC independently enforces active account + community.reports.manage.
    await moderateContent(context.supabase, input);
    revalidatePath("/");
    for (const path of ["/community", "/courses", "/certification", "/events", "/my"]) revalidatePath(path, "layout");
    return { ok: true as const };
  } catch (error) {
    const safe = error instanceof ContentModerationError ? error : new ContentModerationError("unknown");
    return { ok: false as const, error: safe.message, needsLogin: safe.code === "login" };
  }
}
