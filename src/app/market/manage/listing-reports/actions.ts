"use server";

import { revalidatePath } from "next/cache";

import {
  getMarketListingReportForManagement,
  MarketListingReportError,
  removeMarketListingForModeration,
  resolveMarketListingReport,
  type MarketListingReportResolution,
} from "@/lib/market/marketListingReports";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

function failure(error: unknown) {
  const safe = error instanceof MarketListingReportError
    ? error
    : new MarketListingReportError("unknown", "장터 판매글 신고 작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return {
    ok: false as const,
    message: safe.userMessage,
    shouldRefresh: safe.shouldRefresh,
  };
}

function exactRecord(value: unknown, keys: readonly string[]) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const row = value as Record<string, unknown>;
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]) ? row : null;
}

export async function getMarketListingReportDetailAction(reportKey: string) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false as const, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const detail = await getMarketListingReportForManagement(context.supabase, reportKey);
    return { ok: true as const, detail };
  } catch (error) {
    return failure(error);
  }
}

export async function resolveMarketListingReportAction(input: unknown) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false as const, message: "로그인이 필요합니다.", shouldRefresh: true };
  const row = exactRecord(input, ["reportKey", "expectedVersion", "resolution", "note", "requestId"]);
  if (
    !row
    || typeof row.reportKey !== "string"
    || typeof row.expectedVersion !== "number"
    || (row.resolution !== "handled" && row.resolution !== "dismissed")
    || typeof row.note !== "string"
    || typeof row.requestId !== "string"
  ) return failure(new MarketListingReportError("validation", "신고 처리 입력을 확인해 주세요."));
  try {
    const result = await resolveMarketListingReport(context.supabase, {
      reportKey: row.reportKey,
      expectedVersion: row.expectedVersion,
      resolution: row.resolution as MarketListingReportResolution,
      note: row.note,
      requestId: row.requestId,
    });
    revalidatePath("/market/manage/listing-reports");
    return { ok: true as const, result, message: "신고 처리 상태를 저장했습니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function removeMarketListingForModerationAction(input: unknown) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false as const, message: "로그인이 필요합니다.", shouldRefresh: true };
  const row = exactRecord(input, ["listingId", "expectedVersion", "reason", "requestId"]);
  if (
    !row
    || typeof row.listingId !== "string"
    || typeof row.expectedVersion !== "number"
    || typeof row.reason !== "string"
    || typeof row.requestId !== "string"
  ) return failure(new MarketListingReportError("validation", "판매글 비공개 처리 입력을 확인해 주세요."));
  try {
    const result = await removeMarketListingForModeration(context.supabase, {
      listingId: row.listingId,
      expectedVersion: row.expectedVersion,
      reason: row.reason,
      requestId: row.requestId,
    });
    // The RPC's removed listing/media state is authoritative. Physical object
    // cleanup is not a new dependency of this moderation operation.
    revalidatePath("/market");
    revalidatePath("/market/manage/listing-reports");
    return { ok: true as const, result, message: "판매글을 비공개 처리했습니다." };
  } catch (error) {
    return failure(error);
  }
}
