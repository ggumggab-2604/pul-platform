import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

export type PublicCourseMediaItem = {
  mediaKey: string;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
  canDelete: boolean;
};

export type PublicCourseMediaPage = {
  items: PublicCourseMediaItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type CourseMediaSnapshot = {
  availability: "available" | "loadFailed";
  page: PublicCourseMediaPage;
};

type JsonObject = Record<string, unknown>;

const courseKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const mediaKeyPattern = /^[0-9a-f]{32}$/;
const itemKeys = [
  "media_key",
  "storage_bucket",
  "storage_path",
  "caption",
  "created_at",
  "can_delete",
] as const;

export class CourseMediaError extends Error {
  constructor(
    readonly code:
      | "authentication"
      | "permission"
      | "validation"
      | "notFound"
      | "network"
      | "unknown",
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = "CourseMediaError";
  }
}

function isPlainObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value: JsonObject, expected: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return (
    actual.length === expected.length &&
    actual.every((key) => typeof key === "string" && expected.includes(key))
  );
}

function invalidResponse(): never {
  throw new CourseMediaError("unknown", "골프장 활동사진 응답 형식을 확인할 수 없습니다.");
}

function publicStorageUrl(bucket: string, path: string): string {
  const { url } = getSupabasePublicEnv();
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

function parseItem(value: unknown, courseKey: string): PublicCourseMediaItem {
  if (!isPlainObject(value) || !hasExactKeys(value, itemKeys)) invalidResponse();
  if (
    typeof value.media_key !== "string" ||
    !mediaKeyPattern.test(value.media_key) ||
    value.storage_bucket !== "course-media" ||
    typeof value.storage_path !== "string" ||
    value.storage_path !== `${courseKey}/${value.media_key}/original` ||
    (value.caption !== null && typeof value.caption !== "string") ||
    typeof value.created_at !== "string" ||
    !Number.isFinite(Date.parse(value.created_at)) ||
    typeof value.can_delete !== "boolean"
  ) {
    invalidResponse();
  }
  return {
    mediaKey: value.media_key,
    imageUrl: publicStorageUrl(value.storage_bucket, value.storage_path),
    caption: value.caption,
    createdAt: value.created_at,
    canDelete: value.can_delete,
  };
}

export function parsePublicCourseMediaPage(
  value: unknown,
  courseKey: string,
): PublicCourseMediaPage {
  if (
    !courseKeyPattern.test(courseKey) ||
    !isPlainObject(value) ||
    !hasExactKeys(value, ["items", "total", "limit", "offset", "has_more"]) ||
    !Array.isArray(value.items)
  ) {
    invalidResponse();
  }
  if (
    typeof value.total !== "number" ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0 ||
    typeof value.limit !== "number" ||
    !Number.isSafeInteger(value.limit) ||
    value.limit < 1 ||
    value.limit > 24 ||
    typeof value.offset !== "number" ||
    !Number.isSafeInteger(value.offset) ||
    value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) {
    invalidResponse();
  }
  return {
    items: value.items.map((item) => parseItem(item, courseKey)),
    total: value.total,
    limit: value.limit,
    offset: value.offset,
    hasMore: value.has_more,
  };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new CourseMediaError("authentication", "로그인 후 활동사진을 등록해 주세요.");
  }
  if (/정상 활동|본인이 등록한|권한/.test(message)) {
    throw new CourseMediaError("permission", message || "활동사진을 처리할 권한이 없습니다.");
  }
  if (/찾을 수 없습니다/.test(message)) {
    throw new CourseMediaError("notFound", "골프장 또는 활동사진을 찾을 수 없습니다.");
  }
  if (/확인해 주세요|이하여야|8MB|최대 8장|JPG|PNG|WebP/.test(message)) {
    throw new CourseMediaError("validation", message || "사진 입력을 확인해 주세요.");
  }
  if (/fetch|network/i.test(message)) {
    throw new CourseMediaError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new CourseMediaError("unknown", "골프장 활동사진을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export function emptyPublicCourseMediaPage(limit = 12): PublicCourseMediaPage {
  return { items: [], total: 0, limit, offset: 0, hasMore: false };
}

export async function listPublicCourseMedia(
  client: SupabaseClient,
  courseKey: string,
  limit = 12,
  offset = 0,
): Promise<PublicCourseMediaPage> {
  const key = courseKey.trim();
  if (!courseKeyPattern.test(key)) {
    throw new CourseMediaError("notFound", "골프장을 찾을 수 없습니다.");
  }
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 24 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new CourseMediaError("validation", "사진 목록 범위를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("list_public_course_media", {
    p_course_key: key,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePublicCourseMediaPage(data, key);
}
