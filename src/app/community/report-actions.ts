"use server";

import { revalidatePath } from "next/cache";
import { CommunityReportError, resolveCommunityReport, submitCommunityReport, type CommunityReportInput } from "@/lib/community/communityReports";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

function failure(error: unknown) {
  const safe = error instanceof CommunityReportError ? error : new CommunityReportError("unknown");
  return { ok: false as const, error: safe.message, needsLogin: safe.code === "login" };
}

export async function submitCommunityReportAction(input: CommunityReportInput) {
  try {
    const context = await getAuthenticatedSupabaseContext();
    if (!context) throw new CommunityReportError("login");
    const data = await submitCommunityReport(context.supabase, input);
    return { ok: true as const, data };
  } catch (error) { return failure(error); }
}

export async function resolveCommunityReportAction(reportId: string) {
  try {
    const context = await getAuthenticatedSupabaseContext();
    if (!context) throw new CommunityReportError("login");
    await resolveCommunityReport(context.supabase, reportId);
    revalidatePath("/community/manage/reports");
    return { ok: true as const };
  } catch (error) { return failure(error); }
}
