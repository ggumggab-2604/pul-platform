"use server";

import { revalidatePath } from "next/cache";

import {
  NewsInquiryError,
  submitNewsInquiry,
  type NewsInquiryInput,
} from "@/lib/news/newsInquiries";
import { createClient } from "@/lib/supabase/server";

export async function submitNewsInquiryAction(input: NewsInquiryInput) {
  try {
    const data = await submitNewsInquiry(await createClient(), input);
    revalidatePath("/news/manage/inquiries");
    return { ok: true as const, data };
  } catch (error) {
    const inquiryError = error instanceof NewsInquiryError ? error : null;
    return {
      ok: false as const,
      code: inquiryError?.code ?? "unknown",
      error:
        inquiryError?.userMessage
        ?? "뉴스 제보·홍보 문의를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      authenticationRequired: inquiryError?.code === "authentication",
    };
  }
}
