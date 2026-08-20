"use server";

import { revalidatePath } from "next/cache";

import {
  NewsDirectoryError,
  mutateNewsArticle,
  type NewsCategory,
  type NewsMutationOperation,
  type NewsMutationPayload,
  type NewsSourceType,
} from "@/lib/news/newsDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type NewsManagementActionResult =
  | { ok: true; message: string; newsKey: string }
  | { ok: false; message: string; shouldRefresh: boolean };

const keyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const categories = new Set<NewsCategory>([
  "parkGolfNews", "screenParkGolf", "equipmentBrand", "noticeOperation",
]);
const sourceTypes = new Set<NewsSourceType>([
  "adminVerified", "officialNotice", "memberReport", "organizationNotice", "brandPromotion",
]);
const operations = new Set<NewsMutationOperation>(["create", "update", "publish", "hide", "remove"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) throw invalid();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw invalid();
  }
  return value;
}

function invalid() {
  return new NewsDirectoryError("validation", "입력한 뉴스·정보를 확인해 주세요.");
}

function text(value: unknown, min: number, max: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const length = [...normalized].length;
  if (length < min || length > max) throw invalid();
  return normalized;
}

function nullableText(value: unknown, max: number) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, 2, max);
}

function payload(value: unknown): NewsMutationPayload {
  const row = exact(value, [
    "category", "title", "summary", "body", "region", "sourceType",
    "sourceName", "sourceUrl", "publishedAt", "featured",
  ]);
  if (
    typeof row.category !== "string" || !categories.has(row.category as NewsCategory) ||
    typeof row.sourceType !== "string" || !sourceTypes.has(row.sourceType as NewsSourceType) ||
    typeof row.featured !== "boolean" || typeof row.publishedAt !== "string" ||
    !Number.isFinite(Date.parse(row.publishedAt))
  ) throw invalid();
  const sourceUrl = row.sourceUrl === null || row.sourceUrl === ""
    ? null
    : text(row.sourceUrl, 12, 500);
  return {
    category: row.category as NewsCategory,
    title: text(row.title, 2, 180),
    summary: text(row.summary, 10, 500),
    body: text(row.body, 20, 20000),
    region: text(row.region, 1, 80),
    sourceType: row.sourceType as NewsSourceType,
    sourceName: nullableText(row.sourceName, 160),
    sourceUrl,
    publishedAt: row.publishedAt,
    featured: row.featured,
  };
}

export async function mutateNewsArticleAction(input: unknown): Promise<NewsManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  }
  try {
    const row = exact(input, ["operation", "newsKey", "expectedVersion", "payload"]);
    if (typeof row.operation !== "string" || !operations.has(row.operation as NewsMutationOperation)) {
      throw invalid();
    }
    const operation = row.operation as NewsMutationOperation;
    const newsKey = typeof row.newsKey === "string" ? row.newsKey.trim() : "";
    if (!keyPattern.test(newsKey)) throw invalid();
    const expectedVersion = row.expectedVersion === null
      ? null
      : Number.isSafeInteger(row.expectedVersion) && (row.expectedVersion as number) >= 1
        ? row.expectedVersion as number
        : (() => { throw invalid(); })();
    const body = operation === "create" || operation === "update"
      ? payload(row.payload)
      : row.payload === null
        ? undefined
        : (() => { throw invalid(); })();
    const result = await mutateNewsArticle(
      context.supabase,
      operation,
      newsKey,
      expectedVersion,
      body,
    );
    revalidatePath("/news");
    revalidatePath(`/news/${encodeURIComponent(result.newsKey)}`);
    revalidatePath("/news/manage");
    const messages: Record<NewsMutationOperation, string> = {
      create: "뉴스 초안을 등록했습니다.",
      update: "뉴스 내용을 수정했습니다.",
      publish: "뉴스를 공개했습니다.",
      hide: "뉴스를 숨겼습니다.",
      remove: "뉴스를 제거했습니다.",
    };
    return { ok: true, message: messages[operation], newsKey: result.newsKey };
  } catch (error) {
    const safe = error instanceof NewsDirectoryError
      ? error
      : new NewsDirectoryError("unknown", "뉴스·정보를 처리하지 못했습니다.");
    return { ok: false, message: safe.userMessage, shouldRefresh: safe.shouldRefresh };
  }
}
