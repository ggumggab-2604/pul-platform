import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { ClubActivityPhoto, ClubActivityType, ClubRecentActivity } from "@/types";

export type ClubMediaCapabilities = {
  canManageMedia: boolean;
};

export type ClubMediaSnapshot = {
  availability: "available" | "loadFailed" | "clubNotFound";
  representativePhoto?: ClubActivityPhoto;
  activityPhotos: ClubActivityPhoto[];
  recentActivities: ClubRecentActivity[];
  capabilities: ClubMediaCapabilities;
};

type JsonRow = Record<string, unknown>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activityTypes = new Set([
  "monthly_meeting",
  "tournament",
  "friendly_match",
  "screen_event",
  "outing",
  "training",
  "community_event",
  "other",
]);
const sourceTypes = new Set(["notice", "event", "post", "photo"]);
const visibilityValues = new Set(["public", "club_members"]);

export class ClubMediaError extends Error {
  constructor(readonly userMessage: string, readonly shouldRefresh = false) {
    super(userMessage);
    this.name = "ClubMediaError";
  }
}

export function emptyClubMedia(
  availability: ClubMediaSnapshot["availability"] = "loadFailed",
): ClubMediaSnapshot {
  return {
    availability,
    activityPhotos: [],
    recentActivities: [],
    capabilities: { canManageMedia: false },
  };
}

function isRecord(value: unknown): value is JsonRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: JsonRow, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return (
    Object.getPrototypeOf(value) === Object.prototype &&
    actual.length === keys.length &&
    actual.every((key) => typeof key === "string" && keys.includes(key))
  );
}

function invalidResponse(): never {
  throw new ClubMediaError("동호회 사진 응답 형식을 확인할 수 없습니다.", true);
}

function activityType(value: string): ClubActivityType {
  const mapped: Record<string, ClubActivityType> = {
    monthly_meeting: "monthlyMeeting",
    tournament: "tournament",
    friendly_match: "friendlyMatch",
    screen_event: "screenEvent",
    outing: "outing",
    training: "training",
    community_event: "communityEvent",
    other: "other",
  };
  return mapped[value];
}

function publicStorageUrl(bucket: string, path: string): string {
  const { url } = getSupabasePublicEnv();
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

const mediaKeys = [
  "id",
  "media_kind",
  "storage_bucket",
  "storage_path",
  "caption",
  "activity_type",
  "taken_on",
  "created_at",
  "version",
  "can_manage",
] as const;

function parseMedia(
  value: unknown,
  clubLegacyId: string,
): ClubActivityPhoto {
  if (!isRecord(value) || !hasExactKeys(value, mediaKeys)) invalidResponse();
  if (
    typeof value.id !== "string" || !uuidPattern.test(value.id) ||
    (value.media_kind !== "representative" && value.media_kind !== "activity") ||
    value.storage_bucket !== "club-media" ||
    typeof value.storage_path !== "string" || value.storage_path.length < 1 ||
    (value.caption !== null && typeof value.caption !== "string") ||
    (value.taken_on !== null && (typeof value.taken_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.taken_on))) ||
    typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at)) ||
    typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1 ||
    typeof value.can_manage !== "boolean"
  ) {
    invalidResponse();
  }
  if (
    (value.media_kind === "representative" && value.activity_type !== null) ||
    (value.media_kind === "activity" && (typeof value.activity_type !== "string" || !activityTypes.has(value.activity_type)))
  ) {
    invalidResponse();
  }
  const caption = value.caption ?? undefined;
  return {
    id: value.id,
    clubId: clubLegacyId,
    mediaKind: value.media_kind,
    src: publicStorageUrl(value.storage_bucket, value.storage_path),
    alt: caption ?? (value.media_kind === "representative" ? "동호회 대표사진" : "동호회 활동사진"),
    caption,
    activityType: value.media_kind === "activity" ? activityType(value.activity_type as string) : "other",
    activityDate: value.taken_on ?? undefined,
    uploaderRole: "clubManager",
    visibility: "public",
    moderationStatus: "visible",
    verificationStatus: "operatorVerified",
    createdAt: value.created_at,
    version: value.version,
    canDelete: value.can_manage,
  };
}

export function parseClubMediaResponse(
  raw: unknown,
  clubLegacyId: string,
): ClubMediaSnapshot {
  if (!isRecord(raw) || !hasExactKeys(raw, ["representative_photo", "activity_photos", "recent_activities", "capabilities"])) {
    invalidResponse();
  }
  if (!Array.isArray(raw.activity_photos) || !Array.isArray(raw.recent_activities) || !isRecord(raw.capabilities)) {
    invalidResponse();
  }
  if (!hasExactKeys(raw.capabilities, ["can_manage_media"]) || typeof raw.capabilities.can_manage_media !== "boolean") {
    invalidResponse();
  }

  const representativePhoto = raw.representative_photo === null
    ? undefined
    : parseMedia(raw.representative_photo, clubLegacyId);
  if (representativePhoto && representativePhoto.mediaKind !== "representative") invalidResponse();

  const activityPhotos = raw.activity_photos.map((item) => parseMedia(item, clubLegacyId));
  if (activityPhotos.some((item) => item.mediaKind !== "activity")) invalidResponse();

  const recentKeys = ["id", "source_type", "title", "summary", "occurred_at", "activity_type", "visibility"] as const;
  const recentActivities = raw.recent_activities.map((item): ClubRecentActivity => {
    if (!isRecord(item) || !hasExactKeys(item, recentKeys)) invalidResponse();
    if (
      typeof item.id !== "string" || !/^(notice|event|post|photo):[0-9a-f-]{36}$/i.test(item.id) ||
      typeof item.source_type !== "string" || !sourceTypes.has(item.source_type) ||
      typeof item.title !== "string" || item.title.length < 1 ||
      typeof item.summary !== "string" || item.summary.length < 1 ||
      typeof item.occurred_at !== "string" || !Number.isFinite(Date.parse(item.occurred_at)) ||
      typeof item.activity_type !== "string" || !activityTypes.has(item.activity_type) ||
      typeof item.visibility !== "string" || !visibilityValues.has(item.visibility)
    ) {
      invalidResponse();
    }
    return {
      id: item.id,
      clubId: clubLegacyId,
      activityType: activityType(item.activity_type),
      title: item.title,
      summary: item.summary,
      occurredAt: item.occurred_at,
      visibility: item.visibility === "club_members" ? "clubMembers" : "public",
      verificationStatus: "operatorVerified",
      moderationStatus: "visible",
    };
  });

  return {
    availability: "available",
    representativePhoto,
    activityPhotos,
    recentActivities,
    capabilities: { canManageMedia: raw.capabilities.can_manage_media },
  };
}

function mapError(error: { message?: string } | null): ClubMediaError {
  const message = error?.message ?? "";
  if (/로그인|JWT/.test(message)) return new ClubMediaError("로그인 상태를 다시 확인해 주세요.", true);
  if (/권한|정상 활동 계정|활동 중인 동호회/.test(message)) return new ClubMediaError(message || "동호회 사진 관리 권한이 없습니다.");
  if (/찾을 수 없습니다/.test(message)) return new ClubMediaError(message, true);
  return new ClubMediaError("동호회 사진을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export async function fetchClubMedia(
  supabase: SupabaseClient,
  clubUuid: string,
  clubLegacyId: string,
): Promise<ClubMediaSnapshot> {
  const { data, error } = await supabase.rpc("get_club_media_content", { p_club_id: clubUuid });
  if (error) throw mapError(error);
  return parseClubMediaResponse(data, clubLegacyId);
}
