import type {
  PublicLessonVideo,
  PublicLessonVideoPage,
} from "@/lib/lessons/lessonDirectory";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  VideoLessonCategory,
  VideoLessonLevel,
  VideoThumbnailType,
} from "@/types";

export type LessonVideoBookmarkErrorCode =
  | "authentication"
  | "account"
  | "notFound"
  | "validation"
  | "network"
  | "unknown";

export class LessonVideoBookmarkError extends Error {
  readonly code: LessonVideoBookmarkErrorCode;
  readonly userMessage: string;

  constructor(
    code: LessonVideoBookmarkErrorCode,
    userMessage: string,
  ) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.name = "LessonVideoBookmarkError";
  }
}

const videoKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const videoCategories = new Set<VideoLessonCategory>([
  "beginner_intro",
  "basic_stance",
  "swing",
  "tee_shot",
  "putting",
  "approach",
  "distance_control",
  "direction",
  "rules_manner",
  "practical_strategy",
  "equipment",
  "club_reservation",
  "tournament_prep",
  "cert_referee",
  "other",
]);
const videoLevels = new Set<VideoLessonLevel>(["intro", "beginner", "intermediate", "advanced"]);
const thumbnailTypes = new Set<VideoThumbnailType>(["green", "teal", "emerald", "forest"]);
const videoKeys = [
  "video_key",
  "title",
  "category",
  "channel_name",
  "instructor_name",
  "level",
  "duration_text",
  "description",
  "youtube_url",
  "youtube_channel_url",
  "thumbnail_type",
  "tags",
  "is_featured",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function invalidResponse(): never {
  throw new LessonVideoBookmarkError(
    "unknown",
    "관심 영상 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLessonYoutubeUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && ["youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname);
  } catch {
    return false;
  }
}

function parseBookmarkVideo(value: unknown): PublicLessonVideo {
  if (!isObject(value) || !exactKeys(value, videoKeys)) invalidResponse();
  if (
    typeof value.video_key !== "string" || !videoKeyPattern.test(value.video_key) ||
    typeof value.title !== "string" ||
    typeof value.category !== "string" || !videoCategories.has(value.category as VideoLessonCategory) ||
    typeof value.channel_name !== "string" || typeof value.instructor_name !== "string" ||
    typeof value.level !== "string" || !videoLevels.has(value.level as VideoLessonLevel) ||
    typeof value.duration_text !== "string" || typeof value.description !== "string" ||
    !isLessonYoutubeUrl(value.youtube_url) || value.youtube_url === null ||
    !isLessonYoutubeUrl(value.youtube_channel_url) ||
    typeof value.thumbnail_type !== "string" || !thumbnailTypes.has(value.thumbnail_type as VideoThumbnailType) ||
    !isStringArray(value.tags) || typeof value.is_featured !== "boolean"
  ) {
    invalidResponse();
  }
  return {
    id: value.video_key,
    videoKey: value.video_key,
    title: value.title,
    category: value.category as VideoLessonCategory,
    channelName: value.channel_name,
    instructorName: value.instructor_name,
    level: value.level as VideoLessonLevel,
    duration: value.duration_text,
    description: value.description,
    youtubeUrl: value.youtube_url,
    youtubeChannelUrl: value.youtube_channel_url,
    thumbnailType: value.thumbnail_type as VideoThumbnailType,
    tags: [...value.tags],
    featured: value.is_featured,
  };
}

function normalizeVideoKey(videoKey: string) {
  const key = videoKey.trim();
  if (!videoKeyPattern.test(key)) {
    throw new LessonVideoBookmarkError("validation", "무료 강의 영상 정보를 확인해 주세요.");
  }
  return key;
}

export function normalizeLessonVideoBookmarkKeys(videoKeys: readonly string[]) {
  if (videoKeys.length > 50) {
    throw new LessonVideoBookmarkError("validation", "한 번에 확인할 영상 수를 줄여 주세요.");
  }
  return [...new Set(videoKeys.map(normalizeVideoKey))];
}

function validPage(limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
    throw new LessonVideoBookmarkError("validation", "페이지 범위를 확인해 주세요.");
  }
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new LessonVideoBookmarkError("authentication", "로그인이 필요합니다.");
  }
  if (/정상 계정/.test(message)) {
    throw new LessonVideoBookmarkError("account", "현재 계정에서는 관심 영상을 이용할 수 없습니다.");
  }
  if (/찾을 수 없|공개 중/.test(message)) {
    throw new LessonVideoBookmarkError("notFound", "현재 저장할 수 없는 무료 강의 영상입니다.");
  }
  if (/확인해 주세요|줄여 주세요/.test(message)) {
    throw new LessonVideoBookmarkError("validation", message);
  }
  if (/fetch|network/i.test(message)) {
    throw new LessonVideoBookmarkError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new LessonVideoBookmarkError(
    "unknown",
    "관심 영상을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function parseBookmarkMutation(value: unknown, expectedVideoKey: string, expectedSaved: boolean) {
  if (!isObject(value) || !exactKeys(value, ["video_key", "saved"])) invalidResponse();
  if (value.video_key !== expectedVideoKey || value.saved !== expectedSaved) invalidResponse();
  return { videoKey: expectedVideoKey, saved: expectedSaved };
}

function parseBookmarkPage(value: unknown): PublicLessonVideoPage {
  if (!isObject(value) || !exactKeys(value, ["items", "total", "limit", "offset", "has_more"])) {
    invalidResponse();
  }
  if (
    !Array.isArray(value.items) ||
    typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 50 ||
    typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) {
    invalidResponse();
  }
  return {
    items: value.items.map(parseBookmarkVideo),
    total: value.total,
    limit: value.limit,
    offset: value.offset,
    hasMore: value.has_more,
  };
}

export async function setLessonVideoBookmark(
  client: SupabaseClient,
  videoKey: string,
  saved: boolean,
) {
  const key = normalizeVideoKey(videoKey);
  if (typeof saved !== "boolean") {
    throw new LessonVideoBookmarkError("validation", "관심 영상 저장 상태를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("set_lesson_video_bookmark", {
    p_video_key: key,
    p_saved: saved,
  });
  if (error) mapError(error);
  return parseBookmarkMutation(data, key, saved);
}

export async function listMyLessonVideoBookmarks(
  client: SupabaseClient,
  videoKeys: readonly string[] | null = null,
  category?: VideoLessonCategory,
  limit = 24,
  offset = 0,
) {
  if (category && !videoCategories.has(category)) {
    throw new LessonVideoBookmarkError("validation", "영상 카테고리를 확인해 주세요.");
  }
  validPage(limit, offset);
  const keys = videoKeys === null ? null : normalizeLessonVideoBookmarkKeys(videoKeys);
  const { data, error } = await client.rpc("list_my_lesson_video_bookmarks", {
    p_video_keys: keys,
    p_category: category ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parseBookmarkPage(data);
}
