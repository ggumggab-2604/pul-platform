import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ClubContentVisibility,
  ClubDetailNotice,
  ClubDetailPost,
  ClubNoticeImportance,
  ClubNoticeType,
  ClubOfficialEvent,
  ClubOfficialEventReservationMethod,
  ClubOfficialEventStatus,
  ClubOfficialEventType,
} from "@/types";

export type ClubCoreContentCapabilities = {
  canCreateNotice: boolean;
  canManageNotice: boolean;
  canCreatePost: boolean;
  canModeratePost: boolean;
  canCreateEvent: boolean;
  canManageEvent: boolean;
};

export type ClubCoreContentSnapshot = {
  availability: "available" | "loadFailed" | "clubNotFound";
  notices: ClubDetailNotice[];
  posts: ClubDetailPost[];
  officialEvents: ClubOfficialEvent[];
  capabilities: ClubCoreContentCapabilities;
};

export type ClubCoreContentType = "notice" | "post" | "event";
export type ClubCoreContentOperation = "create" | "update" | "delete" | "cancel";

export type ClubNoticeInput = {
  title: string;
  contentSummary: string;
  noticeType: ClubNoticeType;
  importance: ClubNoticeImportance;
  visibility: ClubContentVisibility;
};

export type ClubPostInput = {
  title: string;
  contentSummary: string;
  postType: ClubDetailPost["postType"];
  startsAt?: string;
  endsAt?: string;
  linkedCourseLegacyKey?: string;
  location?: string;
  capacity?: number;
  participantTarget?: string;
  recruitmentStatus?: ClubDetailPost["recruitmentStatus"];
  visibility: ClubContentVisibility;
};

export type ClubOfficialEventInput = {
  title: string;
  eventType: ClubOfficialEventType;
  eventStatus: Exclude<ClubOfficialEventStatus, "draft" | "cancelled">;
  startsAt: string;
  endsAt?: string;
  linkedCourseLegacyKey?: string;
  location: string;
  participantTarget: string;
  capacity?: number;
  reservationMethod: ClubOfficialEventReservationMethod;
  memberReservationGuidance?: string;
  organizerGuidance?: string;
  visibility: ClubContentVisibility;
};

export type ClubCoreContentMutationResult = {
  requestId: string;
  contentType: ClubCoreContentType;
  operation: ClubCoreContentOperation;
  id: string;
  version: number;
  replayed: boolean;
};

type ErrorKind = "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown";

export class ClubCoreContentError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly userMessage: string,
    readonly shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "ClubCoreContentError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noticeTypes = new Set(["general", "schedule", "rule", "urgent", "event", "closure"]);
const importanceValues = new Set(["normal", "important", "urgent"]);
const visibilityValues = new Set(["public", "club_members"]);
const postTypes = new Set(["general", "flash_meeting", "companion", "question", "round_review", "event_review", "information"]);
const recruitmentStatuses = new Set(["recruiting", "full", "closed", "completed", "cancelled"]);
const eventTypes = new Set(["monthly_meeting", "club_tournament", "screen_tournament", "friendly_match", "outing", "year_end_party", "new_year_event", "general_meeting", "training", "other"]);
const eventStatuses = new Set(["scheduled", "registration_open", "registration_closed", "completed", "cancelled"]);
const reservationMethods = new Set(["individual_synchronized", "club_group_booking", "walk_in", "no_reservation", "checking"]);

const emptyCapabilities: ClubCoreContentCapabilities = {
  canCreateNotice: false,
  canManageNotice: false,
  canCreatePost: false,
  canModeratePost: false,
  canCreateEvent: false,
  canManageEvent: false,
};

export function emptyClubCoreContent(
  availability: ClubCoreContentSnapshot["availability"] = "loadFailed",
): ClubCoreContentSnapshot {
  return {
    availability,
    notices: [],
    posts: [],
    officialEvents: [],
    capabilities: { ...emptyCapabilities },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function optionalString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function optionalNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value));
}

function visibility(value: string): ClubContentVisibility {
  return value === "club_members" ? "clubMembers" : "public";
}

function postType(value: string): ClubDetailPost["postType"] {
  const mapped: Record<string, ClubDetailPost["postType"]> = {
    general: "general",
    flash_meeting: "flashMeeting",
    companion: "companion",
    question: "question",
    round_review: "roundReview",
    event_review: "eventReview",
    information: "information",
  };
  return mapped[value];
}

function eventType(value: string): ClubOfficialEventType {
  const mapped: Record<string, ClubOfficialEventType> = {
    monthly_meeting: "monthlyMeeting",
    club_tournament: "clubTournament",
    screen_tournament: "screenTournament",
    friendly_match: "friendlyMatch",
    outing: "outing",
    year_end_party: "yearEndParty",
    new_year_event: "newYearEvent",
    general_meeting: "generalMeeting",
    training: "training",
    other: "other",
  };
  return mapped[value];
}

function eventStatus(value: string): ClubOfficialEventStatus {
  const mapped: Record<string, ClubOfficialEventStatus> = {
    scheduled: "scheduled",
    registration_open: "registrationOpen",
    registration_closed: "registrationClosed",
    completed: "completed",
    cancelled: "cancelled",
  };
  return mapped[value];
}

function reservationMethod(value: string): ClubOfficialEventReservationMethod {
  const mapped: Record<string, ClubOfficialEventReservationMethod> = {
    individual_synchronized: "individualSynchronized",
    club_group_booking: "clubGroupBooking",
    walk_in: "walkIn",
    no_reservation: "noReservation",
    checking: "checking",
  };
  return mapped[value];
}

function scheduleLabels(startsAt: string, endsAt: string | null): { scheduledForLabel: string; scheduleDetail: string } {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : undefined;
  const dateFormatter = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  const timeFormatter = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return {
    scheduledForLabel: dateFormatter.format(start),
    scheduleDetail: end ? `${timeFormatter.format(start)} ~ ${timeFormatter.format(end)}` : timeFormatter.format(start),
  };
}

function invalidResponse(): never {
  throw new ClubCoreContentError("unknown", "동호회 콘텐츠 응답 형식을 확인할 수 없습니다.", true);
}

export function parseClubCoreContentResponse(raw: unknown, clubLegacyId: string): ClubCoreContentSnapshot {
  if (!isRecord(raw) || !hasExactKeys(raw, ["notices", "posts", "official_events", "capabilities"])) invalidResponse();
  if (!Array.isArray(raw.notices) || !Array.isArray(raw.posts) || !Array.isArray(raw.official_events) || !isRecord(raw.capabilities)) invalidResponse();
  const capabilities = raw.capabilities;

  const capabilityKeys = ["can_create_notice", "can_manage_notice", "can_create_post", "can_moderate_post", "can_create_event", "can_manage_event"] as const;
  if (!hasExactKeys(capabilities, capabilityKeys) || capabilityKeys.some((key) => typeof capabilities[key] !== "boolean")) invalidResponse();

  const noticeKeys = ["id", "title", "content_summary", "notice_type", "importance", "visibility", "notice_status", "published_at", "created_at", "updated_at", "version", "author_role", "can_manage"] as const;
  const notices = raw.notices.map((item): ClubDetailNotice => {
    if (!isRecord(item) || !hasExactKeys(item, noticeKeys)) invalidResponse();
    if (typeof item.id !== "string" || !uuidPattern.test(item.id) || typeof item.title !== "string" || typeof item.content_summary !== "string" || typeof item.notice_type !== "string" || !noticeTypes.has(item.notice_type) || typeof item.importance !== "string" || !importanceValues.has(item.importance) || typeof item.visibility !== "string" || !visibilityValues.has(item.visibility) || item.notice_status !== "published" || !isIsoDate(item.published_at) || !isIsoDate(item.created_at) || !isIsoDate(item.updated_at) || typeof item.version !== "number" || !Number.isInteger(item.version) || item.version < 1 || (item.author_role !== "clubAdmin" && item.author_role !== "clubManager") || typeof item.can_manage !== "boolean") invalidResponse();
    return {
      id: item.id,
      clubId: clubLegacyId,
      title: item.title,
      contentSummary: item.content_summary,
      noticeType: item.notice_type as ClubNoticeType,
      importance: item.importance as ClubNoticeImportance,
      visibility: visibility(item.visibility),
      status: "published",
      publishedAt: item.published_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      authorRole: item.author_role,
      version: item.version,
      canManage: item.can_manage,
    };
  });

  const postKeys = ["id", "title", "content_summary", "post_type", "starts_at", "ends_at", "linked_course_legacy_key", "location", "capacity", "participant_target", "recruitment_status", "visibility", "moderation_status", "post_status", "published_at", "created_at", "updated_at", "version", "author_role", "author_display_name", "can_edit", "can_delete"] as const;
  const posts = raw.posts.map((item): ClubDetailPost => {
    if (!isRecord(item) || !hasExactKeys(item, postKeys)) invalidResponse();
    if (typeof item.id !== "string" || !uuidPattern.test(item.id) || typeof item.title !== "string" || typeof item.content_summary !== "string" || typeof item.post_type !== "string" || !postTypes.has(item.post_type) || !optionalString(item.starts_at) || (item.starts_at !== null && !isIsoDate(item.starts_at)) || !optionalString(item.ends_at) || (item.ends_at !== null && !isIsoDate(item.ends_at)) || !optionalString(item.linked_course_legacy_key) || !optionalString(item.location) || !optionalNumber(item.capacity) || !optionalString(item.participant_target) || !optionalString(item.recruitment_status) || (item.recruitment_status !== null && !recruitmentStatuses.has(item.recruitment_status)) || typeof item.visibility !== "string" || !visibilityValues.has(item.visibility) || item.moderation_status !== "visible" || (item.post_status !== "published" && item.post_status !== "edited") || !isIsoDate(item.published_at) || !isIsoDate(item.created_at) || !isIsoDate(item.updated_at) || typeof item.version !== "number" || !Number.isInteger(item.version) || !["clubAdmin", "clubManager", "member"].includes(String(item.author_role)) || !optionalString(item.author_display_name) || typeof item.can_edit !== "boolean" || typeof item.can_delete !== "boolean") invalidResponse();
    return {
      id: item.id,
      relatedClubId: clubLegacyId,
      title: item.title,
      contentSummary: item.content_summary,
      postType: postType(item.post_type),
      authorDisplayName: item.author_display_name ?? "동호회 회원",
      authorRole: item.author_role as ClubDetailPost["authorRole"],
      startsAt: item.starts_at ?? undefined,
      endsAt: item.ends_at ?? undefined,
      linkedCourseId: item.linked_course_legacy_key ?? undefined,
      location: item.location ?? undefined,
      capacity: item.capacity ?? undefined,
      participantTarget: item.participant_target ?? undefined,
      recruitmentStatus: (item.recruitment_status ?? undefined) as ClubDetailPost["recruitmentStatus"],
      visibility: visibility(item.visibility),
      moderationStatus: "visible",
      postStatus: item.post_status,
      publishedAt: item.published_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      version: item.version,
      canEdit: item.can_edit,
      canDelete: item.can_delete,
    };
  });

  const eventKeys = ["id", "event_type", "event_status", "title", "starts_at", "ends_at", "linked_course_legacy_key", "location", "participant_target", "capacity", "reservation_method", "member_reservation_guidance", "organizer_guidance", "visibility", "moderation_status", "version", "created_at", "updated_at", "creator_role", "can_manage"] as const;
  const officialEvents = raw.official_events.map((item): ClubOfficialEvent => {
    if (!isRecord(item) || !hasExactKeys(item, eventKeys)) invalidResponse();
    if (typeof item.id !== "string" || !uuidPattern.test(item.id) || typeof item.event_type !== "string" || !eventTypes.has(item.event_type) || typeof item.event_status !== "string" || !eventStatuses.has(item.event_status) || typeof item.title !== "string" || !isIsoDate(item.starts_at) || !optionalString(item.ends_at) || (item.ends_at !== null && !isIsoDate(item.ends_at)) || !optionalString(item.linked_course_legacy_key) || typeof item.location !== "string" || typeof item.participant_target !== "string" || !optionalNumber(item.capacity) || typeof item.reservation_method !== "string" || !reservationMethods.has(item.reservation_method) || !optionalString(item.member_reservation_guidance) || !optionalString(item.organizer_guidance) || typeof item.visibility !== "string" || !visibilityValues.has(item.visibility) || item.moderation_status !== "visible" || typeof item.version !== "number" || !Number.isInteger(item.version) || !isIsoDate(item.created_at) || !isIsoDate(item.updated_at) || (item.creator_role !== "clubAdmin" && item.creator_role !== "clubManager") || typeof item.can_manage !== "boolean") invalidResponse();
    const status = eventStatus(item.event_status);
    const labels = scheduleLabels(item.starts_at, item.ends_at);
    return {
      id: item.id,
      relatedClubId: clubLegacyId,
      officialEventType: eventType(item.event_type),
      officialEventStatus: status,
      title: item.title,
      ...labels,
      startsAt: item.starts_at,
      endsAt: item.ends_at ?? undefined,
      participationStatus: status === "registrationOpen" ? "open" : status === "registrationClosed" ? "closed" : status === "scheduled" || status === "draft" ? "upcoming" : status,
      participantVisibility: "membersMasked",
      capacity: item.capacity ?? undefined,
      linkedCourseId: item.linked_course_legacy_key ?? undefined,
      location: item.location,
      participantTarget: item.participant_target,
      reservationMethod: reservationMethod(item.reservation_method),
      memberReservationGuidance: item.member_reservation_guidance ?? undefined,
      organizerGuidance: item.organizer_guidance ?? undefined,
      createdByRole: item.creator_role,
      visibility: visibility(item.visibility),
      moderationStatus: "visible",
      lastVerifiedAt: item.updated_at,
      version: item.version,
      canManage: item.can_manage,
    };
  });

  return {
    availability: "available",
    notices,
    posts,
    officialEvents,
    capabilities: {
      canCreateNotice: capabilities.can_create_notice as boolean,
      canManageNotice: capabilities.can_manage_notice as boolean,
      canCreatePost: capabilities.can_create_post as boolean,
      canModeratePost: capabilities.can_moderate_post as boolean,
      canCreateEvent: capabilities.can_create_event as boolean,
      canManageEvent: capabilities.can_manage_event as boolean,
    },
  };
}

function mapRpcError(error: { message?: string; code?: string } | null): ClubCoreContentError {
  const message = error?.message ?? "";
  if (/로그인|JWT/i.test(message)) return new ClubCoreContentError("authentication", "로그인 상태를 다시 확인해 주세요.", true);
  if (/권한|활동 중인 동호회 회원|정상 활동 계정/.test(message)) return new ClubCoreContentError("permission", message || "이 작업을 수행할 권한이 없습니다.");
  if (/변경되었습니다|요청 식별자를 다른 입력/.test(message)) return new ClubCoreContentError("conflict", message, true);
  if (/찾을 수 없습니다/.test(message)) return new ClubCoreContentError("notFound", message, true);
  if (/입력|필수|글자|자 이하여야|정수|숫자/.test(message)) return new ClubCoreContentError("validation", message);
  if (error?.code === "PGRST301" || error?.code === "PGRST302") return new ClubCoreContentError("authentication", "로그인 상태를 다시 확인해 주세요.", true);
  return new ClubCoreContentError("network", "동호회 콘텐츠를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export async function fetchClubCoreContent(
  supabase: SupabaseClient,
  clubUuid: string,
  clubLegacyId: string,
): Promise<ClubCoreContentSnapshot> {
  const { data, error } = await supabase.rpc("get_club_core_content", { p_club_id: clubUuid });
  if (error) throw mapRpcError(error);
  return parseClubCoreContentResponse(data, clubLegacyId);
}

function snakePostType(value: ClubDetailPost["postType"]): string {
  return ({ flashMeeting: "flash_meeting", roundReview: "round_review", eventReview: "event_review" } as Record<string, string>)[value] ?? value;
}

function snakeEventType(value: ClubOfficialEventType): string {
  return ({ monthlyMeeting: "monthly_meeting", clubTournament: "club_tournament", screenTournament: "screen_tournament", friendlyMatch: "friendly_match", yearEndParty: "year_end_party", newYearEvent: "new_year_event", generalMeeting: "general_meeting" } as Record<string, string>)[value] ?? value;
}

function snakeEventStatus(value: ClubOfficialEventInput["eventStatus"]): string {
  return ({ registrationOpen: "registration_open", registrationClosed: "registration_closed" } as Record<string, string>)[value] ?? value;
}

function snakeReservationMethod(value: ClubOfficialEventReservationMethod): string {
  return ({ individualSynchronized: "individual_synchronized", clubGroupBooking: "club_group_booking", walkIn: "walk_in", noReservation: "no_reservation" } as Record<string, string>)[value] ?? value;
}

export async function mutateClubCoreContent(
  supabase: SupabaseClient,
  input: {
    clubUuid: string;
    requestId: string;
    contentType: ClubCoreContentType;
    operation: ClubCoreContentOperation;
    contentId?: string;
    expectedVersion?: number;
    payload?: ClubNoticeInput | ClubPostInput | ClubOfficialEventInput;
  },
): Promise<ClubCoreContentMutationResult> {
  let payload: Record<string, unknown> = {};
  if (input.payload && input.contentType === "notice") {
    const value = input.payload as ClubNoticeInput;
    payload = { title: value.title, content_summary: value.contentSummary, notice_type: value.noticeType, importance: value.importance, visibility: value.visibility === "clubMembers" ? "club_members" : "public" };
  } else if (input.payload && input.contentType === "post") {
    const value = input.payload as ClubPostInput;
    payload = { title: value.title, content_summary: value.contentSummary, post_type: snakePostType(value.postType), starts_at: value.startsAt ?? null, ends_at: value.endsAt ?? null, linked_course_legacy_key: value.linkedCourseLegacyKey ?? null, location: value.location ?? null, capacity: value.capacity ?? null, participant_target: value.participantTarget ?? null, recruitment_status: value.recruitmentStatus ?? null, visibility: value.visibility === "clubMembers" ? "club_members" : "public" };
  } else if (input.payload && input.contentType === "event") {
    const value = input.payload as ClubOfficialEventInput;
    payload = { title: value.title, event_type: snakeEventType(value.eventType), event_status: snakeEventStatus(value.eventStatus), starts_at: value.startsAt, ends_at: value.endsAt ?? null, linked_course_legacy_key: value.linkedCourseLegacyKey ?? null, location: value.location, participant_target: value.participantTarget, capacity: value.capacity ?? null, reservation_method: snakeReservationMethod(value.reservationMethod), member_reservation_guidance: value.memberReservationGuidance ?? null, organizer_guidance: value.organizerGuidance ?? null, visibility: value.visibility === "clubMembers" ? "club_members" : "public" };
  }

  const { data, error } = await supabase.rpc("mutate_club_core_content", {
    p_content_type: input.contentType,
    p_operation: input.operation,
    p_request_id: input.requestId,
    p_club_id: input.clubUuid,
    p_content_id: input.contentId ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_payload: payload,
  });
  if (error) throw mapRpcError(error);
  if (!isRecord(data) || !hasExactKeys(data, ["request_id", "content_type", "operation", "id", "version", "replayed"]) || data.request_id !== input.requestId || data.content_type !== input.contentType || data.operation !== input.operation || typeof data.id !== "string" || !uuidPattern.test(data.id) || typeof data.version !== "number" || !Number.isInteger(data.version) || typeof data.replayed !== "boolean") invalidResponse();
  return { requestId: data.request_id, contentType: data.content_type, operation: data.operation, id: data.id, version: data.version, replayed: data.replayed } as ClubCoreContentMutationResult;
}
