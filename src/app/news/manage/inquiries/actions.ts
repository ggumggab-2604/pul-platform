"use server";

import { revalidatePath } from "next/cache";

import {
  NewsInquiryError,
  resolveNewsInquiry,
  type NewsInquiryResolution,
} from "@/lib/news/newsInquiries";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type NewsInquiryManagementActionResult =
  | { ok: true; message: string; inquiryKey: string }
  | { ok: false; message: string; shouldRefresh: boolean };

const inquiryKeyPattern = /^[0-9a-f]{32}$/;

export async function resolveNewsInquiryAction(
  input: unknown,
): Promise<NewsInquiryManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  }

  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new NewsInquiryError("validation", "처리할 문의를 확인해 주세요.");
    }
    const row = input as Record<string, unknown>;
    const keys = Object.keys(row).sort();
    if (keys.length !== 2 || keys[0] !== "inquiryKey" || keys[1] !== "resolution") {
      throw new NewsInquiryError("validation", "처리할 문의를 확인해 주세요.");
    }
    const inquiryKey = typeof row.inquiryKey === "string" ? row.inquiryKey.trim() : "";
    if (!inquiryKeyPattern.test(inquiryKey)) {
      throw new NewsInquiryError("validation", "처리할 문의를 확인해 주세요.");
    }
    if (row.resolution !== "resolved" && row.resolution !== "dismissed") {
      throw new NewsInquiryError("validation", "처리 결과를 확인해 주세요.");
    }

    const resolution = row.resolution as NewsInquiryResolution;
    const result = await resolveNewsInquiry(context.supabase, inquiryKey, resolution);
    revalidatePath("/news/manage/inquiries");
    return {
      ok: true,
      inquiryKey: result.inquiryKey,
      message: resolution === "resolved" ? "문의를 처리 완료했습니다." : "문의를 종료했습니다.",
    };
  } catch (error) {
    const safe = error instanceof NewsInquiryError
      ? error
      : new NewsInquiryError(
        "unknown",
        "뉴스 제보·홍보 문의를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    return {
      ok: false,
      message: safe.userMessage,
      shouldRefresh: safe.code === "conflict" || safe.code === "notFound",
    };
  }
}
