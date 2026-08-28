"use server";

import { revalidatePath } from "next/cache";

import {
  EventDirectoryError,
  mutateEvent,
  type EventMutationOperation,
  type EventMutationPayload,
  type EventRegion,
  type EventScale,
  type MatchType,
  type RecruitmentStatus,
  type RegistrationStatus,
  type VenueType,
} from "@/lib/events/eventDirectory";
import {
  EventManagementError,
  validateManagedEventInput,
} from "@/lib/events/eventManagement";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type EventManagementActionResult =
  | { ok: true; message: string; eventKey: string }
  | { ok: false; message: string; shouldRefresh: boolean };

const eventKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) throw invalid();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw invalid();
  return value;
}

function invalid(): EventManagementError {
  return new EventManagementError("validation", "입력한 대회·이벤트 운영 정보를 확인해 주세요.");
}

function nullableString(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw invalid();
  return value;
}

function parsePayload(value: unknown): EventMutationPayload {
  const row = exact(value, [
    "title", "matchType", "eventScale", "region", "venueName", "venueType", "startDate", "endDate",
    "scheduleNote", "registrationStatus", "targetAudience", "organizer", "summary", "benefits",
    "recruitmentStatus", "relatedCourseKey", "officialUrl", "registrationUrl", "registrationNote", "isFeatured",
  ]);
  if (
    typeof row.title !== "string" || typeof row.matchType !== "string" || typeof row.eventScale !== "string" ||
    typeof row.region !== "string" || typeof row.venueName !== "string" || typeof row.venueType !== "string" ||
    typeof row.registrationStatus !== "string" || !Array.isArray(row.targetAudience) ||
    !row.targetAudience.every((item) => typeof item === "string") || typeof row.organizer !== "string" ||
    typeof row.summary !== "string" || !Array.isArray(row.benefits) || !row.benefits.every((item) => typeof item === "string") ||
    typeof row.recruitmentStatus !== "string" || typeof row.isFeatured !== "boolean"
  ) throw invalid();
  return validateManagedEventInput({
    title: row.title,
    matchType: row.matchType as MatchType,
    eventScale: row.eventScale as EventScale,
    region: row.region as EventRegion,
    venueName: row.venueName,
    venueType: row.venueType as VenueType,
    startDate: nullableString(row.startDate),
    endDate: nullableString(row.endDate),
    scheduleNote: nullableString(row.scheduleNote),
    registrationStatus: row.registrationStatus as RegistrationStatus,
    targetAudience: row.targetAudience,
    organizer: row.organizer,
    summary: row.summary,
    benefits: row.benefits,
    recruitmentStatus: row.recruitmentStatus as RecruitmentStatus,
    relatedCourseKey: nullableString(row.relatedCourseKey),
    officialUrl: nullableString(row.officialUrl),
    registrationUrl: nullableString(row.registrationUrl),
    registrationNote: nullableString(row.registrationNote),
    isFeatured: row.isFeatured,
  });
}

function failure(error: unknown): EventManagementActionResult {
  if (error instanceof EventManagementError || error instanceof EventDirectoryError) {
    return { ok: false, message: error.userMessage, shouldRefresh: error.shouldRefresh };
  }
  return { ok: false, message: "대회·이벤트 운영 요청을 처리하지 못했습니다.", shouldRefresh: false };
}

function revalidateEventPaths(eventKey: string) {
  revalidatePath("/events");
  revalidatePath("/events/manage");
  revalidatePath("/manage");
  revalidatePath(`/events/${encodeURIComponent(eventKey)}`);
  revalidatePath(`/events/manage/${encodeURIComponent(eventKey)}`);
}

export async function saveManagedEventAction(input: unknown): Promise<EventManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exact(input, ["operation", "eventKey", "expectedVersion", "payload"]);
    if (row.operation !== "create" && row.operation !== "update") throw invalid();
    if (typeof row.eventKey !== "string" || !eventKeyPattern.test(row.eventKey)) throw invalid();
    if (row.operation === "create" && row.expectedVersion !== null) throw invalid();
    if (row.operation === "update" && (typeof row.expectedVersion !== "number" || !Number.isInteger(row.expectedVersion) || row.expectedVersion < 1)) throw invalid();
    const operation = row.operation as EventMutationOperation;
    const result = await mutateEvent(context.supabase, operation, row.eventKey, row.expectedVersion as number | null, parsePayload(row.payload));
    revalidateEventPaths(result.eventKey);
    return {
      ok: true,
      message: operation === "create" ? "새 대회·이벤트를 숨김 상태로 등록했습니다." : "대회·이벤트 정보를 수정했습니다.",
      eventKey: result.eventKey,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function changeManagedEventStatusAction(input: unknown): Promise<EventManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exact(input, ["operation", "eventKey", "expectedVersion"]);
    if (row.operation !== "publish" && row.operation !== "hide" && row.operation !== "end") throw invalid();
    if (
      typeof row.eventKey !== "string" || !eventKeyPattern.test(row.eventKey) ||
      typeof row.expectedVersion !== "number" || !Number.isInteger(row.expectedVersion) || row.expectedVersion < 1
    ) throw invalid();
    const operation = row.operation as EventMutationOperation;
    const result = await mutateEvent(context.supabase, operation, row.eventKey, row.expectedVersion);
    revalidateEventPaths(result.eventKey);
    const message = operation === "publish" ? "대회·이벤트를 공개했습니다." : operation === "hide" ? "대회·이벤트를 숨겼습니다." : "대회·이벤트 접수를 종료했습니다.";
    return { ok: true, message, eventKey: result.eventKey };
  } catch (error) {
    return failure(error);
  }
}
