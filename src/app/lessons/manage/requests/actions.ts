"use server";

import { revalidatePath } from "next/cache";

import {
  isLessonYoutubeUrl,
  isSafeLessonExternalUrl,
  type LessonMutationPayload,
  type LessonVideoMutationPayload,
} from "@/lib/lessons/lessonDirectory";
import {
  LessonSubmissionError,
  resolveLessonSubmissionRequest,
} from "@/lib/lessons/lessonSubmission";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import type {
  LessonFormat,
  LessonRecruitStatus,
  LessonRegion,
  LessonScheduleTag,
  LessonTarget,
  LessonType,
  VideoLessonCategory,
  VideoLessonLevel,
  VideoThumbnailType,
} from "@/types";

export type LessonSubmissionManagementActionResult =
  | { ok: true; message: string; requestKey: string }
  | { ok: false; message: string; shouldRefresh: boolean };

const requestKeyPattern = /^[0-9a-f]{32}$/;
const publicKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const lessonTypes = new Set<LessonType>(["beginner", "improvement", "group", "certification", "referee", "instructor", "online"]);
const regions = new Set<LessonRegion>(["서울", "경기", "인천", "충청", "강원", "전라", "경상", "제주"]);
const formats = new Set<LessonFormat>(["offline", "online", "field", "group"]);
const targets = new Set<LessonTarget>(["absolute_beginner", "golf_experienced", "senior", "club_member", "cert_prep"]);
const scheduleTags = new Set<LessonScheduleTag>(["this_week", "this_month", "always", "closing_soon"]);
const recruitStatuses = new Set<LessonRecruitStatus>(["recruiting", "waiting", "closed"]);
const videoCategories = new Set<VideoLessonCategory>([
  "beginner_intro", "basic_stance", "swing", "tee_shot", "putting", "approach",
  "distance_control", "direction", "rules_manner", "practical_strategy", "equipment",
  "club_reservation", "tournament_prep", "cert_referee", "other",
]);
const levels = new Set<VideoLessonLevel>(["intro", "beginner", "intermediate", "advanced"]);
const thumbnails = new Set<VideoThumbnailType>(["green", "teal", "emerald", "forest"]);

function invalid(message = "운영 처리 입력값을 확인해 주세요.") {
  return new LessonSubmissionError("validation", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) throw invalid();
  const actual = Object.keys(value).sort();
  const wanted = [...keys].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw invalid();
  return value;
}

function text(value: unknown, min: number, max: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const length = [...normalized].length;
  if (length < min || length > max) throw invalid();
  return normalized;
}

function nullableText(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, min, max);
}

function stringArray(value: unknown, allowed: Set<string> | null, min: number, max: number, itemMax: number) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw invalid();
  const normalized = value.map((item) => text(item, 1, itemMax));
  if (new Set(normalized).size !== normalized.length || (allowed && normalized.some((item) => !allowed.has(item)))) throw invalid();
  return normalized;
}

function parseLessonPayload(value: unknown): LessonMutationPayload {
  const row = exact(value, [
    "title", "type", "province", "district", "location", "instructor", "organizer",
    "targets", "schedule", "scheduleTags", "time", "price", "format", "recruitStatus",
    "description", "curriculum", "supplies", "notices", "inquiryNote", "inquiryUrl",
    "officialUrl", "featured",
  ]);
  if (
    typeof row.type !== "string" || !lessonTypes.has(row.type as LessonType) ||
    typeof row.province !== "string" || !regions.has(row.province as LessonRegion) ||
    typeof row.format !== "string" || !formats.has(row.format as LessonFormat) ||
    typeof row.recruitStatus !== "string" || !recruitStatuses.has(row.recruitStatus as LessonRecruitStatus) ||
    typeof row.featured !== "boolean"
  ) throw invalid();
  const inquiryUrl = nullableText(row.inquiryUrl, 12, 500);
  const officialUrl = nullableText(row.officialUrl, 12, 500);
  if (!isSafeLessonExternalUrl(inquiryUrl) || !isSafeLessonExternalUrl(officialUrl)) throw invalid("https 주소를 확인해 주세요.");
  return {
    title: text(row.title, 2, 160),
    type: row.type as LessonType,
    province: row.province as LessonRegion,
    district: text(row.district, 1, 100),
    location: text(row.location, 2, 200),
    instructor: text(row.instructor, 1, 100),
    organizer: text(row.organizer, 2, 160),
    targets: stringArray(row.targets, targets as Set<string>, 1, 5, 40) as LessonTarget[],
    schedule: text(row.schedule, 2, 300),
    scheduleTags: stringArray(row.scheduleTags, scheduleTags as Set<string>, 0, 4, 40) as LessonScheduleTag[],
    time: text(row.time, 1, 100),
    price: text(row.price, 1, 100),
    format: row.format as LessonFormat,
    recruitStatus: row.recruitStatus as LessonRecruitStatus,
    description: text(row.description, 10, 3000),
    curriculum: text(row.curriculum, 2, 3000),
    supplies: text(row.supplies, 1, 1000),
    notices: stringArray(row.notices, null, 0, 12, 300),
    inquiryNote: nullableText(row.inquiryNote, 2, 1000),
    inquiryUrl,
    officialUrl,
    featured: row.featured,
  };
}

function parseVideoPayload(value: unknown): LessonVideoMutationPayload {
  const row = exact(value, [
    "title", "category", "channelName", "instructorName", "level", "duration",
    "description", "youtubeUrl", "youtubeChannelUrl", "thumbnailType", "tags", "featured",
  ]);
  if (
    typeof row.category !== "string" || !videoCategories.has(row.category as VideoLessonCategory) ||
    typeof row.level !== "string" || !levels.has(row.level as VideoLessonLevel) ||
    typeof row.thumbnailType !== "string" || !thumbnails.has(row.thumbnailType as VideoThumbnailType) ||
    typeof row.featured !== "boolean"
  ) throw invalid();
  const youtubeUrl = text(row.youtubeUrl, 12, 500);
  const youtubeChannelUrl = nullableText(row.youtubeChannelUrl, 12, 500);
  if (!isLessonYoutubeUrl(youtubeUrl) || !isLessonYoutubeUrl(youtubeChannelUrl)) throw invalid("올바른 YouTube 주소를 입력해 주세요.");
  return {
    title: text(row.title, 2, 160),
    category: row.category as VideoLessonCategory,
    channelName: text(row.channelName, 1, 120),
    instructorName: text(row.instructorName, 1, 100),
    level: row.level as VideoLessonLevel,
    duration: text(row.duration, 1, 20),
    description: text(row.description, 10, 2000),
    youtubeUrl,
    youtubeChannelUrl,
    thumbnailType: row.thumbnailType as VideoThumbnailType,
    tags: stringArray(row.tags, null, 0, 12, 60),
    featured: row.featured,
  };
}

export async function resolveLessonSubmissionAction(input: unknown): Promise<LessonSubmissionManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exact(input, ["requestKey", "expectedVersion", "requestType", "resolution", "directoryKey", "directoryPayload", "resolutionNote"]);
    if (typeof row.requestKey !== "string" || !requestKeyPattern.test(row.requestKey)) throw invalid();
    if (!Number.isSafeInteger(row.expectedVersion) || (row.expectedVersion as number) < 1) throw invalid();
    if (row.requestType !== "lesson" && row.requestType !== "video") throw invalid();
    if (row.resolution !== "completed" && row.resolution !== "rejected") throw invalid();

    const completed = row.resolution === "completed";
    const directoryKey = completed && typeof row.directoryKey === "string" ? row.directoryKey.trim() : null;
    if (completed && (!directoryKey || !publicKeyPattern.test(directoryKey))) throw invalid("공개 key를 확인해 주세요.");
    const resolutionNote = completed ? null : text(row.resolutionNote, 2, 500);
    const directoryPayload = completed
      ? row.requestType === "lesson"
        ? parseLessonPayload(row.directoryPayload)
        : parseVideoPayload(row.directoryPayload)
      : null;

    const result = await resolveLessonSubmissionRequest(context.supabase, {
      requestKey: row.requestKey,
      expectedVersion: row.expectedVersion as number,
      resolution: row.resolution,
      directoryKey,
      directoryPayload,
      resolutionNote,
    });
    revalidatePath("/lessons");
    revalidatePath("/lessons/submit");
    revalidatePath("/lessons/manage/requests");
    return {
      ok: true,
      message: result.requestStatus === "completed"
        ? "hidden 디렉터리 초안을 만들고 요청을 완료했습니다. 내용을 확인한 뒤 별도로 공개하세요."
        : "등록 요청을 반려했습니다.",
      requestKey: result.requestKey,
    };
  } catch (error) {
    const safe = error instanceof LessonSubmissionError
      ? error
      : new LessonSubmissionError("unknown", "등록 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return { ok: false, message: safe.userMessage, shouldRefresh: safe.shouldRefresh };
  }
}
