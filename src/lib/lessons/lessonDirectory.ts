import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LessonFormat,
  LessonRecruitStatus,
  LessonRegion,
  LessonScheduleTag,
  LessonTarget,
  LessonType,
  ParkGolfLesson,
  VideoLesson,
  VideoLessonCategory,
  VideoLessonLevel,
  VideoThumbnailType,
} from "@/types";

export type LessonPublicationStatus = "published" | "hidden" | "removed";
export type LessonMutationOperation = "create" | "update" | "publish" | "hide" | "remove";
export type PublicLesson = ParkGolfLesson & {
  lessonKey: string;
  inquiryUrl: string | null;
  officialUrl: string | null;
  featured: boolean;
};
export type PublicLessonVideo = VideoLesson & {
  videoKey: string;
  youtubeChannelUrl: string | null;
  featured: boolean;
};
export type LessonDirectoryFilters = {
  keyword?: string;
  type?: LessonType;
  region?: LessonRegion;
  format?: LessonFormat;
  target?: LessonTarget;
  schedule?: LessonScheduleTag;
};
export type PublicLessonPage = {
  items: PublicLesson[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};
export type PublicLessonVideoPage = {
  items: PublicLessonVideo[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type LessonMutationPayload = {
  title: string;
  type: LessonType;
  province: LessonRegion;
  district: string;
  location: string;
  instructor: string;
  organizer: string;
  targets: LessonTarget[];
  schedule: string;
  scheduleTags: LessonScheduleTag[];
  time: string;
  price: string;
  format: LessonFormat;
  recruitStatus: LessonRecruitStatus;
  description: string;
  curriculum: string;
  supplies: string;
  notices: string[];
  inquiryNote: string | null;
  inquiryUrl: string | null;
  officialUrl: string | null;
  featured: boolean;
};

export type LessonVideoMutationPayload = {
  title: string;
  category: VideoLessonCategory;
  channelName: string;
  instructorName: string;
  level: VideoLessonLevel;
  duration: string;
  description: string;
  youtubeUrl: string;
  youtubeChannelUrl: string | null;
  thumbnailType: VideoThumbnailType;
  tags: string[];
  featured: boolean;
};

type JsonObject = Record<string, unknown>;

const lessonKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const lessonTypes = new Set<LessonType>([
  "beginner",
  "improvement",
  "group",
  "certification",
  "referee",
  "instructor",
  "online",
]);
const lessonRegions = new Set<LessonRegion>([
  "서울",
  "경기",
  "인천",
  "충청",
  "강원",
  "전라",
  "경상",
  "제주",
]);
const lessonFormats = new Set<LessonFormat>(["offline", "online", "field", "group"]);
const lessonTargets = new Set<LessonTarget>([
  "absolute_beginner",
  "golf_experienced",
  "senior",
  "club_member",
  "cert_prep",
]);
const lessonScheduleTags = new Set<LessonScheduleTag>([
  "this_week",
  "this_month",
  "always",
  "closing_soon",
]);
const lessonRecruitStatuses = new Set<LessonRecruitStatus>(["recruiting", "waiting", "closed"]);
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

const lessonKeys = [
  "lesson_key",
  "title",
  "lesson_type",
  "province",
  "district",
  "location",
  "instructor_name",
  "organizer_name",
  "targets",
  "schedule_text",
  "schedule_tags",
  "time_text",
  "price_text",
  "lesson_format",
  "recruit_status",
  "description",
  "curriculum",
  "supplies",
  "notices",
  "inquiry_note",
  "inquiry_url",
  "official_url",
  "is_featured",
] as const;

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
] as const;

export class LessonDirectoryError extends Error {
  constructor(
    readonly code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown",
    readonly userMessage: string,
    readonly shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "LessonDirectoryError";
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonObject, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function invalidResponse(): never {
  throw new LessonDirectoryError("unknown", "레슨·교육 응답 형식이 올바르지 않습니다.");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSafeExternalUrl(value: string | null) {
  return value === null || (value.startsWith("https://") && value.length <= 500);
}

function isYoutubeUrl(value: string | null) {
  if (value === null || !isSafeExternalUrl(value)) return value === null;
  try {
    const url = new URL(value);
    return url.hostname === "youtube.com" || url.hostname === "www.youtube.com" || url.hostname === "youtu.be";
  } catch {
    return false;
  }
}

export function parsePublicLesson(value: unknown): PublicLesson {
  if (!isObject(value) || !exactKeys(value, lessonKeys)) invalidResponse();
  if (
    typeof value.lesson_key !== "string" || !lessonKeyPattern.test(value.lesson_key) ||
    typeof value.title !== "string" ||
    typeof value.lesson_type !== "string" || !lessonTypes.has(value.lesson_type as LessonType) ||
    typeof value.province !== "string" || !lessonRegions.has(value.province as LessonRegion) ||
    typeof value.district !== "string" || typeof value.location !== "string" ||
    typeof value.instructor_name !== "string" || typeof value.organizer_name !== "string" ||
    !isStringArray(value.targets) || !value.targets.every((item) => lessonTargets.has(item as LessonTarget)) ||
    typeof value.schedule_text !== "string" ||
    !isStringArray(value.schedule_tags) || !value.schedule_tags.every((item) => lessonScheduleTags.has(item as LessonScheduleTag)) ||
    typeof value.time_text !== "string" || typeof value.price_text !== "string" ||
    typeof value.lesson_format !== "string" || !lessonFormats.has(value.lesson_format as LessonFormat) ||
    typeof value.recruit_status !== "string" || !lessonRecruitStatuses.has(value.recruit_status as LessonRecruitStatus) ||
    typeof value.description !== "string" || typeof value.curriculum !== "string" || typeof value.supplies !== "string" ||
    !isStringArray(value.notices) || !isNullableString(value.inquiry_note) ||
    !isNullableString(value.inquiry_url) || !isSafeExternalUrl(value.inquiry_url) ||
    !isNullableString(value.official_url) || !isSafeExternalUrl(value.official_url) ||
    typeof value.is_featured !== "boolean"
  ) invalidResponse();

  return {
    id: value.lesson_key,
    lessonKey: value.lesson_key,
    title: value.title,
    type: value.lesson_type as LessonType,
    province: value.province as LessonRegion,
    district: value.district,
    regionLabel: value.district ? `${value.province} > ${value.district}` : value.province,
    location: value.location,
    instructor: value.instructor_name,
    organizer: value.organizer_name,
    target: [...value.targets] as LessonTarget[],
    schedule: value.schedule_text,
    scheduleTags: [...value.schedule_tags] as LessonScheduleTag[],
    time: value.time_text,
    price: value.price_text,
    format: value.lesson_format as LessonFormat,
    recruitStatus: value.recruit_status as LessonRecruitStatus,
    description: value.description,
    curriculum: value.curriculum,
    supplies: value.supplies,
    notices: [...value.notices],
    contactMethod: value.inquiry_note ?? "주관기관 문의 정보가 아직 등록되지 않았습니다.",
    inquiryUrl: value.inquiry_url,
    officialUrl: value.official_url,
    featured: value.is_featured,
  };
}

export function parsePublicLessonVideo(value: unknown): PublicLessonVideo {
  if (!isObject(value) || !exactKeys(value, videoKeys)) invalidResponse();
  if (
    typeof value.video_key !== "string" || !lessonKeyPattern.test(value.video_key) ||
    typeof value.title !== "string" ||
    typeof value.category !== "string" || !videoCategories.has(value.category as VideoLessonCategory) ||
    typeof value.channel_name !== "string" || typeof value.instructor_name !== "string" ||
    typeof value.level !== "string" || !videoLevels.has(value.level as VideoLessonLevel) ||
    typeof value.duration_text !== "string" || typeof value.description !== "string" ||
    typeof value.youtube_url !== "string" || !isYoutubeUrl(value.youtube_url) ||
    !isNullableString(value.youtube_channel_url) || !isYoutubeUrl(value.youtube_channel_url) ||
    typeof value.thumbnail_type !== "string" || !thumbnailTypes.has(value.thumbnail_type as VideoThumbnailType) ||
    !isStringArray(value.tags) || typeof value.is_featured !== "boolean"
  ) invalidResponse();
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

function parsePage<T>(value: unknown, parseItem: (item: unknown) => T) {
  if (!isObject(value) || !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) || !Array.isArray(value.items)) invalidResponse();
  if (
    typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 50 ||
    typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) invalidResponse();
  return {
    items: value.items.map(parseItem),
    total: value.total,
    limit: value.limit,
    offset: value.offset,
    hasMore: value.has_more,
  };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) throw new LessonDirectoryError("authentication", "로그인이 필요합니다.");
  if (/권한/.test(message)) throw new LessonDirectoryError("permission", "레슨·교육 운영 권한이 없습니다.");
  if (/변경되었습니다/.test(message)) throw new LessonDirectoryError("conflict", message, true);
  if (/찾을 수 없습니다/.test(message)) throw new LessonDirectoryError("notFound", "레슨·교육 정보를 찾을 수 없습니다.");
  if (/확인해 주세요|사용 중|지원하지 않는/.test(message)) throw new LessonDirectoryError("validation", message);
  if (/fetch|network/i.test(message)) throw new LessonDirectoryError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  throw new LessonDirectoryError("unknown", "레슨·교육 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export function normalizeLessonFilters(filters: LessonDirectoryFilters) {
  const keyword = filters.keyword?.trim() || undefined;
  if (keyword && keyword.length > 100) throw new LessonDirectoryError("validation", "검색어는 100자 이하로 입력해 주세요.");
  if (filters.type && !lessonTypes.has(filters.type)) throw new LessonDirectoryError("validation", "교육 유형을 확인해 주세요.");
  if (filters.region && !lessonRegions.has(filters.region)) throw new LessonDirectoryError("validation", "지역을 확인해 주세요.");
  if (filters.format && !lessonFormats.has(filters.format)) throw new LessonDirectoryError("validation", "교육 방식을 확인해 주세요.");
  if (filters.target && !lessonTargets.has(filters.target)) throw new LessonDirectoryError("validation", "교육 대상을 확인해 주세요.");
  if (filters.schedule && !lessonScheduleTags.has(filters.schedule)) throw new LessonDirectoryError("validation", "일정 조건을 확인해 주세요.");
  return { ...filters, keyword };
}

function validPage(limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
    throw new LessonDirectoryError("validation", "페이지 범위를 확인해 주세요.");
  }
}

export async function listPublicLessons(
  client: SupabaseClient,
  filters: LessonDirectoryFilters = {},
  limit = 24,
  offset = 0,
): Promise<PublicLessonPage> {
  const valid = normalizeLessonFilters(filters);
  validPage(limit, offset);
  const { data, error } = await client.rpc("list_public_lessons", {
    p_keyword: valid.keyword ?? null,
    p_province: valid.region ?? null,
    p_lesson_type: valid.type ?? null,
    p_lesson_format: valid.format ?? null,
    p_target: valid.target ?? null,
    p_schedule_tag: valid.schedule ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parsePublicLesson);
}

export async function listFeaturedPublicLessons(client: SupabaseClient, limit = 4) {
  validPage(limit, 0);
  const { data, error } = await client.rpc("list_featured_public_lessons", { p_limit: limit });
  if (error) mapError(error);
  if (!Array.isArray(data)) invalidResponse();
  return data.map(parsePublicLesson);
}

export async function getPublicLesson(client: SupabaseClient, lessonKey: string) {
  const key = lessonKey.trim();
  if (!lessonKeyPattern.test(key)) throw new LessonDirectoryError("notFound", "레슨·교육 정보를 찾을 수 없습니다.");
  const { data, error } = await client.rpc("get_public_lesson", { p_lesson_key: key });
  if (error) mapError(error);
  return parsePublicLesson(data);
}

export async function listPublicLessonVideos(
  client: SupabaseClient,
  category?: VideoLessonCategory,
  limit = 24,
  offset = 0,
): Promise<PublicLessonVideoPage> {
  if (category && !videoCategories.has(category)) throw new LessonDirectoryError("validation", "영상 카테고리를 확인해 주세요.");
  validPage(limit, offset);
  const { data, error } = await client.rpc("list_public_lesson_videos", {
    p_category: category ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parsePublicLessonVideo);
}

function lessonPayload(payload: LessonMutationPayload) {
  return {
    title: payload.title.trim(),
    lesson_type: payload.type,
    province: payload.province,
    district: payload.district.trim(),
    location: payload.location.trim(),
    instructor_name: payload.instructor.trim(),
    organizer_name: payload.organizer.trim(),
    targets: payload.targets,
    schedule_text: payload.schedule.trim(),
    schedule_tags: payload.scheduleTags,
    time_text: payload.time.trim(),
    price_text: payload.price.trim(),
    lesson_format: payload.format,
    recruit_status: payload.recruitStatus,
    description: payload.description.trim(),
    curriculum: payload.curriculum.trim(),
    supplies: payload.supplies.trim(),
    notices: payload.notices.map((item) => item.trim()).filter(Boolean),
    inquiry_note: payload.inquiryNote?.trim() || null,
    inquiry_url: payload.inquiryUrl?.trim() || null,
    official_url: payload.officialUrl?.trim() || null,
    is_featured: payload.featured,
  };
}

function videoPayload(payload: LessonVideoMutationPayload) {
  return {
    title: payload.title.trim(),
    category: payload.category,
    channel_name: payload.channelName.trim(),
    instructor_name: payload.instructorName.trim(),
    level: payload.level,
    duration_text: payload.duration.trim(),
    description: payload.description.trim(),
    youtube_url: payload.youtubeUrl.trim(),
    youtube_channel_url: payload.youtubeChannelUrl?.trim() || null,
    thumbnail_type: payload.thumbnailType,
    tags: payload.tags.map((item) => item.trim()).filter(Boolean),
    is_featured: payload.featured,
  };
}

function parseMutationResult(value: unknown, keyName: "lesson_key" | "video_key", expectedKey: string) {
  if (!isObject(value) || !exactKeys(value, [keyName, "publication_status", "version"])) invalidResponse();
  if (
    value[keyName] !== expectedKey ||
    typeof value.publication_status !== "string" || !new Set<LessonPublicationStatus>(["published", "hidden", "removed"]).has(value.publication_status as LessonPublicationStatus) ||
    typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1
  ) invalidResponse();
  return { key: expectedKey, publicationStatus: value.publication_status as LessonPublicationStatus, version: value.version };
}

export async function mutateLesson(
  client: SupabaseClient,
  operation: LessonMutationOperation,
  lessonKey: string,
  expectedVersion: number | null,
  payload?: LessonMutationPayload,
) {
  const key = lessonKey.trim();
  if (!lessonKeyPattern.test(key)) throw new LessonDirectoryError("validation", "공개 lesson key를 확인해 주세요.");
  const { data, error } = await client.rpc("mutate_lesson", {
    p_operation: operation,
    p_lesson_key: key,
    p_expected_version: expectedVersion,
    p_payload: payload ? lessonPayload(payload) : {},
  });
  if (error) mapError(error);
  return parseMutationResult(data, "lesson_key", key);
}

export async function mutateLessonVideo(
  client: SupabaseClient,
  operation: LessonMutationOperation,
  videoKey: string,
  expectedVersion: number | null,
  payload?: LessonVideoMutationPayload,
) {
  const key = videoKey.trim();
  if (!lessonKeyPattern.test(key)) throw new LessonDirectoryError("validation", "공개 video key를 확인해 주세요.");
  const { data, error } = await client.rpc("mutate_lesson_video", {
    p_operation: operation,
    p_video_key: key,
    p_expected_version: expectedVersion,
    p_payload: payload ? videoPayload(payload) : {},
  });
  if (error) mapError(error);
  return parseMutationResult(data, "video_key", key);
}
