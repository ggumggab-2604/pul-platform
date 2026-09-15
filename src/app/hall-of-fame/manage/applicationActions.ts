"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { APPLICATION_PERMISSIONS, parseReviewCommand, parseReviewResult, reviewFailure, parseProjectionCommand, parseProjectionContext, parseProjectionResult, projectionFailure } from "@/lib/hall-of-fame/hallOfFameApplicationReview";

export async function performApplicationReviewAction(input: unknown) {
  try {
    const command = parseReviewCommand(input);
    const context = await getAuthenticatedSupabaseContext();
    if (!context) return reviewFailure({ code: "42501" });
    // The active account's DB permission is authoritative; no role/permission comes from the client.
    const codes = [APPLICATION_PERMISSIONS.read, command.operation === "start" ? APPLICATION_PERMISSIONS.review : APPLICATION_PERMISSIONS.decide];
    const permissions = await Promise.all(codes.map(code => context.supabase.rpc("current_user_has_platform_permission", { p_permission_code: code })));
    if (permissions.some(({ data, error }) => error || data !== true)) return reviewFailure({ code: "42501" });
    const args = { p_application_batch_id: command.batchId, p_expected_batch_version: command.expectedVersion, p_request_id: command.requestId };
    // The existing RPC atomically rechecks authorization, state, versions and complete record coverage.
    // Do not put a pre-read of the pending queue before it: that would prevent legitimate idempotent replays.
    const { data, error } = command.operation === "start"
      ? await context.supabase.rpc("start_hall_of_fame_application_review", args)
      : await context.supabase.rpc("decide_hall_of_fame_application", { ...args, p_decisions: command.decisions });
    if (error) return reviewFailure(error);
    const result = parseReviewResult(data, command);
    revalidatePath("/hall-of-fame/manage");
    revalidatePath("/hall-of-fame/apply");
    revalidatePath("/hall-of-fame");
    return { ok: true as const, result };
  } catch (error) { return reviewFailure(error); }
}

export async function performApplicationProjectionAction(input: unknown) {
  try {
    const context = await getAuthenticatedSupabaseContext();
    if (!context) return projectionFailure({ code: "42501" });
    const command = parseProjectionCommand(input);
    const permissions = await Promise.all([APPLICATION_PERMISSIONS.read, APPLICATION_PERMISSIONS.decide]
      .map(code => context.supabase.rpc("current_user_has_platform_permission", { p_permission_code: code })));
    if (permissions.some(({ data, error }) => error || data !== true)) return projectionFailure({ code: "42501" });
    // Both DB RPCs enforce the exact active platform_admin boundary themselves.
    const read = await context.supabase.rpc("get_hall_of_fame_record_projection_context", { p_record_id: command.recordId });
    if (read.error) return projectionFailure(read.error);
    const projection = parseProjectionContext(read.data, command);
    const requestId = crypto.randomUUID();
    const sync = await context.supabase.rpc("sync_hall_of_fame_record_projection", {
      p_record_id: projection.recordId, p_expected_record_version: projection.recordVersion, p_request_id: requestId,
    });
    if (sync.error) return projectionFailure(sync.error);
    const result = parseProjectionResult(sync.data, projection, requestId);
    revalidatePath("/hall-of-fame/manage");
    revalidatePath("/hall-of-fame/apply");
    revalidatePath("/hall-of-fame");
    return { ok: true as const, result };
  } catch (error) { return projectionFailure(error); }
}
