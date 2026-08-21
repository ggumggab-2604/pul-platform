"use server";

import { revalidatePath } from "next/cache";

import {
  isLessonYoutubeUrl,
  isSafeLessonExternalUrl,
} from "@/lib/lessons/lessonDirectory";
import {
  LessonSubmissionError,
  submitLessonSubmissionRequest,
  type LessonSubmissionPayload,
  type LessonSubmissionRequestType,
} from "@/lib/lessons/lessonSubmission";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type LessonSubmissionActionResult =
  | { ok: true; message: string; requestKey: string }
  | { ok: false; message: string; shouldRefresh: boolean };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const regions = new Set(["서울", "경기", "인천", "충청", "강원", "전라", "경상", "제주"]);
const categories = new Set([
  "beginner_intro", "basic_stance", "swing", "tee_shot", "putting", "approach",
  "distance_control", "direction", "rules_manner", "practical_strategy", "equipment",
  "club_reservation", "tournament_prep", "cert_referee", "other",
]);

function invalid(message = "등록 요청 입력값을 확인해 주세요.") {
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

function text(value: unknown, min: number, max: number, message: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const length = [...normalized].length;
  if (length < min || length > max) throw invalid(message);
  return normalized;
}

function nullableText(value: unknown, max: number) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, 1, max, "선택 입력값을 확인해 주세요.");
}

function parsePayload(requestType: LessonSubmissionRequestType, value: unknown): LessonSubmissionPayload {
  const row = exact(value, ["title", "providerName", "region", "category", "summary", "sourceUrl", "secondaryUrl"]);
  const sourceUrl = text(row.sourceUrl, 12, 500, "공식 안내 URL을 확인해 주세요.");
  const secondaryUrl = nullableText(row.secondaryUrl, 500);
  if (!isSafeLessonExternalUrl(sourceUrl) || !isSafeLessonExternalUrl(secondaryUrl)) {
    throw invalid("https 주소를 입력해 주세요.");
  }
  const region = nullableText(row.region, 20);
  const category = nullableText(row.category, 40);
  if (requestType === "lesson") {
    if (!region || !regions.has(region) || category !== null) throw invalid("레슨·교육 지역을 확인해 주세요.");
  } else {
    if (region !== null || secondaryUrl !== null || !category || !categories.has(category)) {
      throw invalid("무료 영상 카테고리를 확인해 주세요.");
    }
    if (!isLessonYoutubeUrl(sourceUrl)) throw invalid("올바른 YouTube 주소를 입력해 주세요.");
  }
  return {
    title: text(row.title, 2, 160, "제목은 2~160자로 입력해 주세요."),
    providerName: text(row.providerName, 1, 160, "강사·기관·채널명을 입력해 주세요."),
    region,
    category,
    summary: text(row.summary, 10, 2000, "간단한 소개는 10~2000자로 입력해 주세요."),
    sourceUrl,
    secondaryUrl,
  };
}

export async function submitLessonSubmissionAction(input: unknown): Promise<LessonSubmissionActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exact(input, ["requestId", "requestType", "payload"]);
    if (typeof row.requestId !== "string" || !uuidPattern.test(row.requestId)) throw invalid();
    if (row.requestType !== "lesson" && row.requestType !== "video") throw invalid("등록 요청 종류를 확인해 주세요.");
    const result = await submitLessonSubmissionRequest(
      context.supabase,
      row.requestId,
      row.requestType,
      parsePayload(row.requestType, row.payload),
    );
    revalidatePath("/lessons/submit");
    revalidatePath("/lessons/manage/requests");
    return {
      ok: true,
      message: result.replayed ? "이미 접수된 등록 요청을 확인했습니다." : "등록 요청을 접수했습니다.",
      requestKey: result.requestKey,
    };
  } catch (error) {
    const safe = error instanceof LessonSubmissionError
      ? error
      : new LessonSubmissionError("unknown", "등록 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return { ok: false, message: safe.userMessage, shouldRefresh: safe.shouldRefresh };
  }
}
