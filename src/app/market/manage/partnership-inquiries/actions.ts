"use server";

import { revalidatePath } from "next/cache";

import {
  MarketPartnershipInquiryError,
  resolveMarketPartnershipInquiry,
  type MarketPartnershipInquiryResolution,
} from "@/lib/market/marketPartnershipInquiries";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type MarketPartnershipInquiryManagementActionResult =
  | { ok: true; message: string; inquiryKey: string }
  | { ok: false; message: string; shouldRefresh: boolean };

const inquiryKeyPattern = /^[0-9a-f]{32}$/;

function isExactActionInput(value: unknown): value is {
  inquiryKey: string;
  resolution: MarketPartnershipInquiryResolution;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  return keys.length === 2
    && keys[0] === "inquiryKey"
    && keys[1] === "resolution"
    && typeof row.inquiryKey === "string"
    && inquiryKeyPattern.test(row.inquiryKey.trim())
    && (row.resolution === "resolved" || row.resolution === "dismissed");
}

export async function resolveMarketPartnershipInquiryAction(
  input: unknown,
): Promise<MarketPartnershipInquiryManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  }

  try {
    if (!isExactActionInput(input)) {
      throw new MarketPartnershipInquiryError("validation", "처리할 문의를 확인해 주세요.");
    }
    const inquiryKey = input.inquiryKey.trim();
    const result = await resolveMarketPartnershipInquiry(
      context.supabase,
      inquiryKey,
      input.resolution,
    );
    revalidatePath("/market/manage/partnership-inquiries");
    return {
      ok: true,
      inquiryKey: result.inquiryKey,
      message: input.resolution === "resolved"
        ? "문의를 처리 완료했습니다."
        : "문의를 종료했습니다.",
    };
  } catch (error) {
    const safe = error instanceof MarketPartnershipInquiryError
      ? error
      : new MarketPartnershipInquiryError(
        "unknown",
        "광고·입점·제휴 문의를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    return {
      ok: false,
      message: safe.userMessage,
      shouldRefresh: safe.code === "conflict" || safe.code === "notFound",
    };
  }
}
