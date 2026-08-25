import type { SupabaseClient } from "@supabase/supabase-js";

import {
  clubRegions,
  type PublicClub,
} from "@/lib/clubs/clubDirectory";
import type { ClubRecruitStatus } from "@/types";

export type ManageableCourseClub = PublicClub & {
  linked: boolean;
};

export type CourseClubMutationResult = {
  courseKey: string;
  publicKey: string;
  linked: boolean;
  changed: boolean;
};

type JsonObject = Record<string, unknown>;

const publicClubKeys = [
  "public_key",
  "name",
  "region",
  "district",
  "region_label",
  "summary",
  "recruitment_status",
  "created_at",
] as const;
const manageableClubKeys = [...publicClubKeys, "linked"] as const;
const mutationKeys = ["course_key", "public_key", "linked", "changed"] as const;
const publicKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const regionSet = new Set(clubRegions);
const recruitmentStatusSet = new Set<ClubRecruitStatus>([
  "recruiting",
  "waiting",
  "closed",
]);

export class CourseClubError extends Error {
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
    this.name = "CourseClubError";
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
  throw new CourseClubError(
    "unknown",
    "골프장 활동 동호회 응답 형식을 확인할 수 없습니다.",
  );
}

function parsePublicClubFields(value: JsonObject): PublicClub {
  if (
    typeof value.public_key !== "string" ||
    !publicKeyPattern.test(value.public_key) ||
    uuidPattern.test(value.public_key) ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    !(
      value.region === null ||
      (typeof value.region === "string" && regionSet.has(value.region as never))
    ) ||
    !(value.district === null || typeof value.district === "string") ||
    typeof value.region_label !== "string" ||
    value.region_label.length < 1 ||
    !(value.summary === null || typeof value.summary === "string") ||
    typeof value.recruitment_status !== "string" ||
    !recruitmentStatusSet.has(value.recruitment_status as ClubRecruitStatus) ||
    typeof value.created_at !== "string" ||
    !Number.isFinite(Date.parse(value.created_at))
  ) {
    invalidResponse();
  }

  return {
    publicKey: value.public_key,
    name: value.name,
    region: value.region as PublicClub["region"],
    district: value.district,
    regionLabel: value.region_label,
    summary: value.summary,
    recruitmentStatus: value.recruitment_status as ClubRecruitStatus,
    createdAt: value.created_at,
  };
}

export function parsePublicCourseClubs(value: unknown): PublicClub[] {
  if (!Array.isArray(value)) invalidResponse();
  return value.map((item) => {
    if (!isPlainObject(item) || !hasExactKeys(item, publicClubKeys)) {
      invalidResponse();
    }
    return parsePublicClubFields(item);
  });
}

export function parseManageableCourseClubs(value: unknown): ManageableCourseClub[] {
  if (!Array.isArray(value)) invalidResponse();
  return value.map((item) => {
    if (
      !isPlainObject(item) ||
      !hasExactKeys(item, manageableClubKeys) ||
      typeof item.linked !== "boolean"
    ) {
      invalidResponse();
    }
    return { ...parsePublicClubFields(item), linked: item.linked };
  });
}

export function parseCourseClubMutationResult(
  value: unknown,
): CourseClubMutationResult {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, mutationKeys) ||
    typeof value.course_key !== "string" ||
    !publicKeyPattern.test(value.course_key) ||
    uuidPattern.test(value.course_key) ||
    typeof value.public_key !== "string" ||
    !publicKeyPattern.test(value.public_key) ||
    uuidPattern.test(value.public_key) ||
    typeof value.linked !== "boolean" ||
    typeof value.changed !== "boolean"
  ) {
    invalidResponse();
  }
  return {
    courseKey: value.course_key,
    publicKey: value.public_key,
    linked: value.linked,
    changed: value.changed,
  };
}

function normalizePublicKey(value: string, target: "course" | "club"): string {
  const normalized = value.trim();
  if (!publicKeyPattern.test(normalized) || uuidPattern.test(normalized)) {
    throw new CourseClubError(
      target === "course" ? "notFound" : "validation",
      target === "course"
        ? "골프장을 찾을 수 없습니다."
        : "동호회 식별자를 확인해 주세요.",
    );
  }
  return normalized;
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new CourseClubError("authentication", "로그인 후 다시 시도해 주세요.");
  }
  if (/권한|정상 활동|활동 중인 동호회 회원/.test(message)) {
    throw new CourseClubError(
      "permission",
      message || "동호회 활동 골프장을 관리할 권한이 없습니다.",
    );
  }
  if (/찾을 수 없습니다/.test(message)) {
    throw new CourseClubError("notFound", message);
  }
  if (/확인해 주세요/.test(message)) {
    throw new CourseClubError("validation", message);
  }
  if (/fetch|network/i.test(message)) {
    throw new CourseClubError(
      "network",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  }
  throw new CourseClubError(
    "unknown",
    "활동 동호회 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

export async function listPublicCourseClubs(
  client: SupabaseClient,
  courseKey: string,
): Promise<PublicClub[]> {
  const key = normalizePublicKey(courseKey, "course");
  const { data, error } = await client.rpc("list_public_course_clubs", {
    p_course_key: key,
  });
  if (error) mapError(error);
  return parsePublicCourseClubs(data);
}

export async function listManageableCourseLinkClubs(
  client: SupabaseClient,
  courseKey: string,
): Promise<ManageableCourseClub[]> {
  const key = normalizePublicKey(courseKey, "course");
  const { data, error } = await client.rpc("list_manageable_course_link_clubs", {
    p_course_key: key,
  });
  if (error) mapError(error);
  return parseManageableCourseClubs(data);
}

async function mutateCourseClubLink(
  client: SupabaseClient,
  operation: "link" | "unlink",
  courseKey: string,
  publicKey: string,
): Promise<CourseClubMutationResult> {
  const normalizedCourseKey = normalizePublicKey(courseKey, "course");
  const normalizedClubKey = normalizePublicKey(publicKey, "club");
  const { data, error } = await client.rpc(
    operation === "link" ? "link_club_to_course" : "unlink_club_from_course",
    {
      p_club_key: normalizedClubKey,
      p_course_key: normalizedCourseKey,
    },
  );
  if (error) mapError(error);
  const result = parseCourseClubMutationResult(data);
  if (
    result.courseKey !== normalizedCourseKey ||
    result.publicKey !== normalizedClubKey ||
    result.linked !== (operation === "link")
  ) {
    invalidResponse();
  }
  return result;
}

export function linkClubToCourse(
  client: SupabaseClient,
  courseKey: string,
  publicKey: string,
) {
  return mutateCourseClubLink(client, "link", courseKey, publicKey);
}

export function unlinkClubFromCourse(
  client: SupabaseClient,
  courseKey: string,
  publicKey: string,
) {
  return mutateCourseClubLink(client, "unlink", courseKey, publicKey);
}
