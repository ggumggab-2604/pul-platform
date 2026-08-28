"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  CourseManagementError,
  findCourseDuplicateCandidates,
  mutateManagedCourse,
  resolveCourseInformationReport,
  type CourseManagementOperation,
  type CourseReportResolution,
  type ManagedCourseFeature,
  type ManagedCourseInput,
} from "@/lib/courses/courseManagement";
import type { CourseOperation, CourseRegion, CourseType } from "@/lib/courses/courseDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type CourseManagementActionResult =
  | { ok: true; message: string; courseKey?: string }
  | { ok: false; message: string; shouldRefresh: boolean };

export type CourseDuplicateActionResult =
  | { ok: true; candidates: Awaited<ReturnType<typeof findCourseDuplicateCandidates>> }
  | { ok: false; message: string };

const courseKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function invalid() {
  return new CourseManagementError("validation", "입력한 골프장 운영 정보를 확인해 주세요.");
}

function nullableString(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw invalid();
  return value;
}

function nullableNumber(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalid();
  return value;
}

function parsePayload(value: unknown): ManagedCourseInput {
  const row = exact(value, [
    "name", "courseType", "region", "city", "address", "holes", "operatingHours",
    "operation", "phone", "parkingAvailable", "featureCodes", "description",
    "reservationUrl", "reservationGuide", "feeGuide", "latitude", "longitude",
  ]);
  if (
    typeof row.name !== "string" || typeof row.courseType !== "string" ||
    typeof row.region !== "string" || typeof row.city !== "string" ||
    typeof row.address !== "string" || typeof row.holes !== "number" ||
    typeof row.operation !== "string" ||
    !(row.parkingAvailable === null || typeof row.parkingAvailable === "boolean") ||
    !Array.isArray(row.featureCodes) || !row.featureCodes.every((item) => typeof item === "string") ||
    typeof row.description !== "string"
  ) throw invalid();
  return {
    name: row.name,
    courseType: row.courseType as CourseType,
    region: row.region as CourseRegion,
    city: row.city,
    address: row.address,
    holes: row.holes,
    operatingHours: nullableString(row.operatingHours),
    operation: row.operation as CourseOperation,
    phone: nullableString(row.phone),
    parkingAvailable: row.parkingAvailable,
    featureCodes: row.featureCodes as ManagedCourseFeature[],
    description: row.description,
    reservationUrl: nullableString(row.reservationUrl),
    reservationGuide: nullableString(row.reservationGuide),
    feeGuide: nullableString(row.feeGuide),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
  };
}

function failure(error: unknown): CourseManagementActionResult {
  const safe = error instanceof CourseManagementError
    ? error
    : new CourseManagementError("unknown", "골프장 운영 요청을 처리하지 못했습니다.");
  return { ok: false, message: safe.userMessage, shouldRefresh: safe.shouldRefresh };
}

function revalidateCoursePaths(courseKey?: string) {
  revalidatePath("/courses");
  revalidatePath("/courses/manage");
  revalidatePath("/courses/manage/reports");
  revalidatePath("/manage");
  if (courseKey) {
    revalidatePath(`/courses/${encodeURIComponent(courseKey)}`);
    revalidatePath(`/courses/manage/${encodeURIComponent(courseKey)}`);
  }
}

export async function saveManagedCourseAction(input: unknown): Promise<CourseManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exact(input, ["operation", "courseKey", "expectedUpdatedAt", "payload"]);
    if (row.operation !== "create" && row.operation !== "update") throw invalid();
    const operation = row.operation;
    const courseKey = row.courseKey === null ? null : typeof row.courseKey === "string" && courseKeyPattern.test(row.courseKey) ? row.courseKey : (() => { throw invalid(); })();
    const expectedUpdatedAt = row.expectedUpdatedAt === null ? null : typeof row.expectedUpdatedAt === "string" && Number.isFinite(Date.parse(row.expectedUpdatedAt)) ? row.expectedUpdatedAt : (() => { throw invalid(); })();
    if ((operation === "create" && (courseKey !== null || expectedUpdatedAt !== null)) || (operation === "update" && (!courseKey || !expectedUpdatedAt))) throw invalid();
    const result = await mutateManagedCourse(context.supabase, operation, courseKey, expectedUpdatedAt, randomUUID(), parsePayload(row.payload));
    revalidateCoursePaths(result.courseKey);
    return { ok: true, message: operation === "create" ? "새 골프장을 숨김 상태로 등록했습니다." : "골프장 정보를 수정했습니다.", courseKey: result.courseKey };
  } catch (error) {
    return failure(error);
  }
}

export async function changeManagedCourseStatusAction(input: unknown): Promise<CourseManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exact(input, ["operation", "courseKey", "expectedUpdatedAt"]);
    if (row.operation !== "activate" && row.operation !== "deactivate") throw invalid();
    if (typeof row.courseKey !== "string" || !courseKeyPattern.test(row.courseKey) || typeof row.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(row.expectedUpdatedAt))) throw invalid();
    const result = await mutateManagedCourse(context.supabase, row.operation as CourseManagementOperation, row.courseKey, row.expectedUpdatedAt, randomUUID());
    revalidateCoursePaths(result.courseKey);
    return { ok: true, message: row.operation === "activate" ? "골프장을 공개했습니다." : "골프장을 숨겼습니다.", courseKey: result.courseKey };
  } catch (error) {
    return failure(error);
  }
}

export async function findCourseDuplicatesAction(input: unknown): Promise<CourseDuplicateActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다." };
  try {
    const row = exact(input, ["name", "region", "city", "excludeCourseKey"]);
    if (typeof row.name !== "string" || typeof row.region !== "string" || typeof row.city !== "string" || !(row.excludeCourseKey === null || (typeof row.excludeCourseKey === "string" && courseKeyPattern.test(row.excludeCourseKey)))) throw invalid();
    return { ok: true, candidates: await findCourseDuplicateCandidates(context.supabase, { name: row.name, region: row.region as CourseRegion, city: row.city }, row.excludeCourseKey) };
  } catch (error) {
    return { ok: false, message: error instanceof CourseManagementError ? error.userMessage : "중복 후보를 확인하지 못했습니다." };
  }
}

export async function resolveCourseInformationReportAction(input: unknown): Promise<CourseManagementActionResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다.", shouldRefresh: true };
  try {
    const row = exact(input, ["reportId", "resolution", "expectedUpdatedAt", "note"]);
    if (
      typeof row.reportId !== "string" || !uuidPattern.test(row.reportId) ||
      (row.resolution !== "handled" && row.resolution !== "dismissed") ||
      typeof row.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(row.expectedUpdatedAt)) ||
      !(row.note === null || typeof row.note === "string")
    ) throw invalid();
    const resolution = row.resolution as CourseReportResolution;
    await resolveCourseInformationReport(context.supabase, row.reportId, resolution, row.expectedUpdatedAt, row.note, randomUUID());
    revalidateCoursePaths();
    return { ok: true, message: resolution === "handled" ? "제보를 처리 완료했습니다." : "적용할 내용 없음으로 처리했습니다." };
  } catch (error) {
    return failure(error);
  }
}
