import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  EventMutationPayload,
  EventPublicationStatus,
  EventRegion,
  EventScale,
  MatchType,
  RecruitmentStatus,
  RegistrationStatus,
  VenueType,
} from "./eventDirectory";

export type EventFreshnessStatus = "starting-soon" | "status-mismatch" | null;

export type ManagedEvent = EventMutationPayload & {
  eventKey: string;
  publicationStatus: EventPublicationStatus;
  version: number;
  updatedAt: string;
  freshnessStatus: EventFreshnessStatus;
};

export type ManagedEventPage = {
  items: ManagedEvent[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type EventManagementFilters = {
  keyword?: string;
  publicationStatus?: EventPublicationStatus;
  registrationStatus?: RegistrationStatus;
  freshness?: Exclude<EventFreshnessStatus, null>;
  referenceAt?: string;
};

type JsonObject = Record<string, unknown>;

const eventKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const courseKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const eventManagementRegions: readonly EventRegion[] = ["서울", "경기", "인천", "강원", "충청", "전라", "경상", "제주", "장소 미정"];
const matchTypes = new Set<MatchType>(["field", "screen"]);
const eventScales = new Set<EventScale>(["national", "province", "city", "citizen", "senior", "store", "league", "friendly"]);
const regions = new Set<EventRegion>(eventManagementRegions);
const venueTypes = new Set<VenueType>(["field", "screen", "indoor", "publicCourse", "privateVenue", "undecided"]);
const registrationStatuses = new Set<RegistrationStatus>(["open", "scheduled", "closed", "needCheck", "ended"]);
const recruitmentStatuses = new Set<RecruitmentStatus>(["refereeOpen", "staffOpen", "volunteerScheduled", "none"]);
const publicationStatuses = new Set<EventPublicationStatus>(["published", "hidden", "removed"]);
const freshnessStatuses = new Set<Exclude<EventFreshnessStatus, null>>(["starting-soon", "status-mismatch"]);
const managedEventKeys = [
  "event_key", "title", "match_type", "event_scale", "region", "venue_name", "venue_type",
  "start_date", "end_date", "schedule_note", "registration_status", "target_audience", "organizer",
  "summary", "benefits", "recruitment_status", "related_course_key", "official_url", "registration_url",
  "registration_note", "is_featured", "publication_status", "version", "updated_at", "freshness_status",
] as const;

export class EventManagementError extends Error {
  readonly code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown";
  readonly userMessage: string;
  readonly shouldRefresh: boolean;

  constructor(
    code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown",
    userMessage: string,
    shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "EventManagementError";
    this.code = code;
    this.userMessage = userMessage;
    this.shouldRefresh = shouldRefresh;
  }
}

function isObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: JsonObject, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function invalidResponse(): never {
  throw new EventManagementError("unknown", "대회·이벤트 운영 응답 형식이 올바르지 않습니다.");
}

function invalidInput(message = "입력한 대회·이벤트 정보를 확인해 주세요."): never {
  throw new EventManagementError("validation", message);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function formatEventManagementTimestamp(value: string, includeTime = true) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) invalidResponse();
  const kst = new Date(timestamp + 9 * 60 * 60 * 1000);
  const date = `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}.`;
  if (!includeTime) return date;
  const time = [kst.getUTCHours(), kst.getUTCMinutes(), kst.getUTCSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return `${date} ${time}`;
}

function validHttpsUrl(value: string | null) {
  return value === null || (value.startsWith("https://") && value.length >= 12 && value.length <= 500);
}

export function parseManagedEvent(value: unknown): ManagedEvent {
  if (!isObject(value) || !exactKeys(value, managedEventKeys)) invalidResponse();
  if (
    typeof value.event_key !== "string" || !eventKeyPattern.test(value.event_key) ||
    typeof value.title !== "string" ||
    typeof value.match_type !== "string" || !matchTypes.has(value.match_type as MatchType) ||
    typeof value.event_scale !== "string" || !eventScales.has(value.event_scale as EventScale) ||
    typeof value.region !== "string" || !regions.has(value.region as EventRegion) ||
    typeof value.venue_name !== "string" ||
    typeof value.venue_type !== "string" || !venueTypes.has(value.venue_type as VenueType) ||
    !nullableString(value.start_date) || (value.start_date !== null && !datePattern.test(value.start_date)) ||
    !nullableString(value.end_date) || (value.end_date !== null && !datePattern.test(value.end_date)) ||
    !nullableString(value.schedule_note) ||
    typeof value.registration_status !== "string" || !registrationStatuses.has(value.registration_status as RegistrationStatus) ||
    !Array.isArray(value.target_audience) || !value.target_audience.every((item) => typeof item === "string") ||
    typeof value.organizer !== "string" || typeof value.summary !== "string" ||
    !Array.isArray(value.benefits) || !value.benefits.every((item) => typeof item === "string") ||
    typeof value.recruitment_status !== "string" || !recruitmentStatuses.has(value.recruitment_status as RecruitmentStatus) ||
    !nullableString(value.related_course_key) || (value.related_course_key !== null && !courseKeyPattern.test(value.related_course_key)) ||
    !nullableString(value.official_url) || !validHttpsUrl(value.official_url) ||
    !nullableString(value.registration_url) || !validHttpsUrl(value.registration_url) ||
    !nullableString(value.registration_note) || typeof value.is_featured !== "boolean" ||
    typeof value.publication_status !== "string" || !publicationStatuses.has(value.publication_status as EventPublicationStatus) ||
    typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1 ||
    !validTimestamp(value.updated_at) ||
    !(value.freshness_status === null || (typeof value.freshness_status === "string" && freshnessStatuses.has(value.freshness_status as Exclude<EventFreshnessStatus, null>)))
  ) invalidResponse();

  return {
    eventKey: value.event_key,
    title: value.title,
    matchType: value.match_type as MatchType,
    eventScale: value.event_scale as EventScale,
    region: value.region as EventRegion,
    venueName: value.venue_name,
    venueType: value.venue_type as VenueType,
    startDate: value.start_date,
    endDate: value.end_date,
    scheduleNote: value.schedule_note,
    registrationStatus: value.registration_status as RegistrationStatus,
    targetAudience: [...value.target_audience] as string[],
    organizer: value.organizer,
    summary: value.summary,
    benefits: [...value.benefits] as string[],
    recruitmentStatus: value.recruitment_status as RecruitmentStatus,
    relatedCourseKey: value.related_course_key,
    officialUrl: value.official_url,
    registrationUrl: value.registration_url,
    registrationNote: value.registration_note,
    isFeatured: value.is_featured,
    publicationStatus: value.publication_status as EventPublicationStatus,
    version: value.version,
    updatedAt: value.updated_at,
    freshnessStatus: value.freshness_status as EventFreshnessStatus,
  };
}

export function parseManagedEventPage(value: unknown): ManagedEventPage {
  if (!isObject(value) || !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) || !Array.isArray(value.items)) invalidResponse();
  if (
    typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 50 ||
    typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) invalidResponse();
  const items = value.items.map(parseManagedEvent);
  if (value.has_more !== (value.offset + items.length < value.total)) invalidResponse();
  return { items, total: value.total, limit: value.limit, offset: value.offset, hasMore: value.has_more };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) throw new EventManagementError("authentication", "로그인이 필요합니다.");
  if (/권한/.test(message)) throw new EventManagementError("permission", "대회·이벤트 운영 권한이 없습니다.");
  if (/변경되었습니다/.test(message)) throw new EventManagementError("conflict", message, true);
  if (/찾을 수 없습니다/.test(message)) throw new EventManagementError("notFound", "대회·이벤트를 찾을 수 없습니다.");
  if (/확인해 주세요|사용 중/.test(message)) throw new EventManagementError("validation", message);
  if (/fetch|network/i.test(message)) throw new EventManagementError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  throw new EventManagementError("unknown", "대회·이벤트 운영 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

function trimNullable(value: string | null) {
  return value?.trim() || null;
}

function validateTextArray(value: string[], minimum: number, maximum: number, itemMaximum: number, message: string) {
  const normalized = value.map((item) => item.trim()).filter(Boolean);
  if (normalized.length < minimum || normalized.length > maximum || normalized.some((item) => item.length > itemMaximum)) invalidInput(message);
  return normalized;
}

export function validateManagedEventInput(value: EventMutationPayload): EventMutationPayload {
  const title = value.title.trim();
  const venueName = value.venueName.trim();
  const organizer = value.organizer.trim();
  const summary = value.summary.trim();
  const scheduleNote = trimNullable(value.scheduleNote);
  const relatedCourseKey = trimNullable(value.relatedCourseKey);
  const officialUrl = trimNullable(value.officialUrl);
  const registrationUrl = trimNullable(value.registrationUrl);
  const registrationNote = trimNullable(value.registrationNote);
  if (title.length < 2 || title.length > 160) invalidInput("제목은 2~160자로 입력해 주세요.");
  if (!matchTypes.has(value.matchType) || !eventScales.has(value.eventScale) || !regions.has(value.region) || !venueTypes.has(value.venueType)) invalidInput();
  if (venueName.length < 2 || venueName.length > 200) invalidInput("장소명은 2~200자로 입력해 주세요.");
  if (value.startDate !== null && !datePattern.test(value.startDate)) invalidInput("시작일을 확인해 주세요.");
  if (value.endDate !== null && !datePattern.test(value.endDate)) invalidInput("종료일을 확인해 주세요.");
  if (value.endDate !== null && value.startDate === null) invalidInput("종료일을 입력하려면 시작일이 필요합니다.");
  if (value.startDate !== null && value.endDate !== null && value.endDate < value.startDate) invalidInput("종료일은 시작일보다 빠를 수 없습니다.");
  if (value.startDate === null && scheduleNote === null) invalidInput("시작일 또는 일정 안내를 입력해 주세요.");
  if (scheduleNote !== null && (scheduleNote.length < 2 || scheduleNote.length > 300)) invalidInput("일정 안내는 2~300자로 입력해 주세요.");
  if (!registrationStatuses.has(value.registrationStatus) || !recruitmentStatuses.has(value.recruitmentStatus)) invalidInput();
  if (organizer.length < 2 || organizer.length > 200) invalidInput("주최·주관은 2~200자로 입력해 주세요.");
  if (summary.length < 10 || summary.length > 3000) invalidInput("소개는 10~3000자로 입력해 주세요.");
  if (relatedCourseKey !== null && !courseKeyPattern.test(relatedCourseKey)) invalidInput("연결 골프장 key를 확인해 주세요.");
  if (!validHttpsUrl(officialUrl) || !validHttpsUrl(registrationUrl)) invalidInput("외부 링크는 https:// 주소로 입력해 주세요.");
  if (registrationNote !== null && (registrationNote.length < 2 || registrationNote.length > 1000)) invalidInput("접수 안내는 2~1000자로 입력해 주세요.");
  return {
    title,
    matchType: value.matchType,
    eventScale: value.eventScale,
    region: value.region,
    venueName,
    venueType: value.venueType,
    startDate: value.startDate,
    endDate: value.endDate,
    scheduleNote,
    registrationStatus: value.registrationStatus,
    targetAudience: validateTextArray(value.targetAudience, 1, 12, 100, "참가 대상은 1~12개, 각 100자 이내로 입력해 주세요."),
    organizer,
    summary,
    benefits: validateTextArray(value.benefits, 0, 12, 120, "혜택은 최대 12개, 각 120자 이내로 입력해 주세요."),
    recruitmentStatus: value.recruitmentStatus,
    relatedCourseKey,
    officialUrl,
    registrationUrl,
    registrationNote,
    isFeatured: value.isFeatured,
  };
}

export function normalizeEventManagementFilters(filters: EventManagementFilters): EventManagementFilters {
  const keyword = filters.keyword?.trim() || undefined;
  if (keyword && keyword.length > 100) invalidInput("검색어는 100자 이내로 입력해 주세요.");
  if (filters.publicationStatus && !publicationStatuses.has(filters.publicationStatus)) invalidInput("공개 상태를 확인해 주세요.");
  if (filters.registrationStatus && !registrationStatuses.has(filters.registrationStatus)) invalidInput("접수 상태를 확인해 주세요.");
  if (filters.freshness && !freshnessStatuses.has(filters.freshness)) invalidInput("최신성 조건을 확인해 주세요.");
  if (filters.referenceAt && !validTimestamp(filters.referenceAt)) invalidInput("기준 시각을 확인해 주세요.");
  return { ...filters, keyword };
}

export async function listEventsForManagement(
  client: SupabaseClient,
  filters: EventManagementFilters = {},
  limit = 30,
  offset = 0,
) {
  const valid = normalizeEventManagementFilters(filters);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) invalidInput("페이지 범위를 확인해 주세요.");
  const { data, error } = await client.rpc("list_events_for_management", {
    p_keyword: valid.keyword ?? null,
    p_publication_status: valid.publicationStatus ?? null,
    p_registration_status: valid.registrationStatus ?? null,
    p_freshness: valid.freshness ?? null,
    p_reference_at: valid.referenceAt ?? new Date().toISOString(),
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parseManagedEventPage(data);
}

export async function getEventForManagement(client: SupabaseClient, eventKey: string, referenceAt = new Date().toISOString()) {
  const key = eventKey.trim();
  if (!eventKeyPattern.test(key)) throw new EventManagementError("notFound", "대회·이벤트를 찾을 수 없습니다.");
  if (!validTimestamp(referenceAt)) invalidInput("기준 시각을 확인해 주세요.");
  const { data, error } = await client.rpc("get_event_for_management", { p_event_key: key, p_reference_at: referenceAt });
  if (error) mapError(error);
  return parseManagedEvent(data);
}
