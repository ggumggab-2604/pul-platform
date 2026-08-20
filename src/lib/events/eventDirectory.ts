import type { SupabaseClient } from "@supabase/supabase-js";

export type MatchType = "field" | "screen";
export type EventScale = "national" | "province" | "city" | "citizen" | "senior" | "store" | "league" | "friendly";
export type RegistrationStatus = "open" | "scheduled" | "closed" | "needCheck" | "ended";
export type RecruitmentStatus = "refereeOpen" | "staffOpen" | "volunteerScheduled" | "none";
export type VenueType = "field" | "screen" | "indoor" | "publicCourse" | "privateVenue" | "undecided";
export type EventRegion = "서울" | "경기" | "인천" | "강원" | "충청" | "전라" | "경상" | "제주" | "장소 미정";

export type PublicEvent = {
  eventKey: string;
  title: string;
  matchType: MatchType;
  eventScale: EventScale;
  region: EventRegion;
  venueName: string;
  venueType: VenueType;
  startDate: string | null;
  endDate: string | null;
  scheduleNote: string | null;
  registrationStatus: RegistrationStatus;
  targetAudience: string[];
  organizer: string;
  summary: string;
  benefits: string[];
  recruitmentStatus: RecruitmentStatus;
  relatedCourse: { courseKey: string; name: string } | null;
  officialUrl: string | null;
  registrationUrl: string | null;
  registrationNote: string | null;
  isFeatured: boolean;
};

export type EventFilters = {
  matchType?: MatchType;
  region?: EventRegion;
  registrationStatus?: RegistrationStatus;
};

export type PublicEventPage = {
  items: PublicEvent[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type EventRegionSummary = {
  region: EventRegion;
  upcomingCount: number;
  openCount: number;
  needCheckCount: number;
  representativeTitle: string;
};

export type EventReview = {
  id: string;
  title: string;
  summary: string;
  authorDisplayName: string;
  createdAt: string;
  rating: number;
};

export type EventMutationOperation = "create" | "update" | "hide" | "publish" | "end";
export type EventPublicationStatus = "published" | "hidden" | "removed";

export type EventMutationPayload = {
  title: string;
  matchType: MatchType;
  eventScale: EventScale;
  region: EventRegion;
  venueName: string;
  venueType: VenueType;
  startDate: string | null;
  endDate: string | null;
  scheduleNote: string | null;
  registrationStatus: RegistrationStatus;
  targetAudience: string[];
  organizer: string;
  summary: string;
  benefits: string[];
  recruitmentStatus: RecruitmentStatus;
  relatedCourseKey: string | null;
  officialUrl: string | null;
  registrationUrl: string | null;
  registrationNote: string | null;
  isFeatured: boolean;
};

export const matchTypeLabels: Record<MatchType, string> = { field: "필드 시합", screen: "스크린 시합" };
export const eventScaleLabels: Record<EventScale, string> = {
  national: "전국 대회", province: "도 단위 대회", city: "시·군 대회", citizen: "시민 대회",
  senior: "시니어 대회", store: "매장 대회", league: "리그", friendly: "친선 행사",
};
export const registrationStatusLabels: Record<RegistrationStatus, string> = {
  open: "접수중", scheduled: "접수 예정", closed: "마감", needCheck: "일정 확인 필요", ended: "종료",
};
export const recruitmentStatusLabels: Record<RecruitmentStatus, string> = {
  refereeOpen: "심판 모집 있음", staffOpen: "운영요원 모집 있음", volunteerScheduled: "자원봉사 모집 예정", none: "모집 없음",
};
export const venueTypeLabels: Record<VenueType, string> = {
  field: "필드", screen: "스크린", indoor: "실내 시설", publicCourse: "공공 골프장",
  privateVenue: "민간 시설", undecided: "장소 미정",
};
export const eventRegionOptions: readonly EventRegion[] = ["서울", "경기", "인천", "강원", "충청", "전라", "경상", "제주", "장소 미정"];

type JsonObject = Record<string, unknown>;
const eventKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const courseKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const matchTypes = new Set<MatchType>(["field", "screen"]);
const eventScales = new Set<EventScale>(["national", "province", "city", "citizen", "senior", "store", "league", "friendly"]);
const registrationStatuses = new Set<RegistrationStatus>(["open", "scheduled", "closed", "needCheck", "ended"]);
const recruitmentStatuses = new Set<RecruitmentStatus>(["refereeOpen", "staffOpen", "volunteerScheduled", "none"]);
const venueTypes = new Set<VenueType>(["field", "screen", "indoor", "publicCourse", "privateVenue", "undecided"]);
const regions = new Set<EventRegion>(eventRegionOptions);
const eventKeys = [
  "event_key", "title", "match_type", "event_scale", "region", "venue_name", "venue_type", "start_date", "end_date",
  "schedule_note", "registration_status", "target_audience", "organizer", "summary", "benefits", "recruitment_status",
  "related_course", "official_url", "registration_url", "registration_note", "is_featured",
] as const;

export class EventDirectoryError extends Error {
  constructor(
    readonly code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown",
    readonly userMessage: string,
    readonly shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "EventDirectoryError";
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
  throw new EventDirectoryError("unknown", "대회·이벤트 응답 형식이 올바르지 않습니다.");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function validPublicUrl(value: string | null) {
  return value === null || (value.startsWith("https://") && value.length <= 500);
}

function parseRelatedCourse(value: unknown): PublicEvent["relatedCourse"] {
  if (value === null) return null;
  if (!isObject(value) || !exactKeys(value, ["course_key", "name"]) || typeof value.course_key !== "string" || !courseKeyPattern.test(value.course_key) || typeof value.name !== "string") invalidResponse();
  return { courseKey: value.course_key, name: value.name };
}

export function parsePublicEvent(value: unknown): PublicEvent {
  if (!isObject(value) || !exactKeys(value, eventKeys)) invalidResponse();
  if (
    typeof value.event_key !== "string" || !eventKeyPattern.test(value.event_key) ||
    typeof value.title !== "string" ||
    typeof value.match_type !== "string" || !matchTypes.has(value.match_type as MatchType) ||
    typeof value.event_scale !== "string" || !eventScales.has(value.event_scale as EventScale) ||
    typeof value.region !== "string" || !regions.has(value.region as EventRegion) ||
    typeof value.venue_name !== "string" ||
    typeof value.venue_type !== "string" || !venueTypes.has(value.venue_type as VenueType) ||
    !isNullableString(value.start_date) || (value.start_date !== null && !datePattern.test(value.start_date)) ||
    !isNullableString(value.end_date) || (value.end_date !== null && !datePattern.test(value.end_date)) ||
    !isNullableString(value.schedule_note) ||
    typeof value.registration_status !== "string" || !registrationStatuses.has(value.registration_status as RegistrationStatus) ||
    !Array.isArray(value.target_audience) || !value.target_audience.every((item) => typeof item === "string") ||
    typeof value.organizer !== "string" || typeof value.summary !== "string" ||
    !Array.isArray(value.benefits) || !value.benefits.every((item) => typeof item === "string") ||
    typeof value.recruitment_status !== "string" || !recruitmentStatuses.has(value.recruitment_status as RecruitmentStatus) ||
    !isNullableString(value.official_url) || !validPublicUrl(value.official_url) ||
    !isNullableString(value.registration_url) || !validPublicUrl(value.registration_url) ||
    !isNullableString(value.registration_note) || typeof value.is_featured !== "boolean"
  ) invalidResponse();
  if (value.start_date === null && value.schedule_note === null) invalidResponse();

  return {
    eventKey: value.event_key, title: value.title, matchType: value.match_type as MatchType,
    eventScale: value.event_scale as EventScale, region: value.region as EventRegion, venueName: value.venue_name,
    venueType: value.venue_type as VenueType, startDate: value.start_date, endDate: value.end_date,
    scheduleNote: value.schedule_note, registrationStatus: value.registration_status as RegistrationStatus,
    targetAudience: [...value.target_audience] as string[], organizer: value.organizer, summary: value.summary,
    benefits: [...value.benefits] as string[], recruitmentStatus: value.recruitment_status as RecruitmentStatus,
    relatedCourse: parseRelatedCourse(value.related_course), officialUrl: value.official_url,
    registrationUrl: value.registration_url, registrationNote: value.registration_note, isFeatured: value.is_featured,
  };
}

function parsePage(value: unknown): PublicEventPage {
  if (!isObject(value) || !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) || !Array.isArray(value.items)) invalidResponse();
  if (typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0 || typeof value.limit !== "number" || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 50 || typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 || typeof value.has_more !== "boolean") invalidResponse();
  return { items: value.items.map(parsePublicEvent), total: value.total, limit: value.limit, offset: value.offset, hasMore: value.has_more };
}

function parseRegionSummaries(value: unknown): EventRegionSummary[] {
  if (!Array.isArray(value)) invalidResponse();
  return value.map((item) => {
    if (!isObject(item) || !exactKeys(item, ["region", "upcoming_count", "open_count", "need_check_count", "representative_title"]) || typeof item.region !== "string" || !regions.has(item.region as EventRegion) || typeof item.upcoming_count !== "number" || !Number.isInteger(item.upcoming_count) || item.upcoming_count < 0 || typeof item.open_count !== "number" || !Number.isInteger(item.open_count) || item.open_count < 0 || typeof item.need_check_count !== "number" || !Number.isInteger(item.need_check_count) || item.need_check_count < 0 || typeof item.representative_title !== "string") invalidResponse();
    return { region: item.region as EventRegion, upcomingCount: item.upcoming_count, openCount: item.open_count, needCheckCount: item.need_check_count, representativeTitle: item.representative_title };
  });
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) throw new EventDirectoryError("authentication", "로그인이 필요합니다.");
  if (/권한/.test(message)) throw new EventDirectoryError("permission", "대회·이벤트 운영 권한이 없습니다.");
  if (/변경되었습니다/.test(message)) throw new EventDirectoryError("conflict", message, true);
  if (/찾을 수 없습니다/.test(message)) throw new EventDirectoryError("notFound", "대회·이벤트를 찾을 수 없습니다.");
  if (/확인해 주세요|사용 중/.test(message)) throw new EventDirectoryError("validation", message);
  if (/fetch|network/i.test(message)) throw new EventDirectoryError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  throw new EventDirectoryError("unknown", "대회·이벤트 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export function normalizeEventFilters(filters: EventFilters): EventFilters {
  if (filters.matchType && !matchTypes.has(filters.matchType)) throw new EventDirectoryError("validation", "시합 유형을 확인해 주세요.");
  if (filters.region && !regions.has(filters.region)) throw new EventDirectoryError("validation", "지역을 확인해 주세요.");
  if (filters.registrationStatus && !registrationStatuses.has(filters.registrationStatus)) throw new EventDirectoryError("validation", "접수 상태를 확인해 주세요.");
  return filters;
}

export async function listPublicEvents(client: SupabaseClient, filters: EventFilters = {}, limit = 24, offset = 0) {
  const valid = normalizeEventFilters(filters);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) throw new EventDirectoryError("validation", "페이지 범위를 확인해 주세요.");
  const { data, error } = await client.rpc("list_public_events", { p_match_type: valid.matchType ?? null, p_region: valid.region ?? null, p_registration_status: valid.registrationStatus ?? null, p_limit: limit, p_offset: offset });
  if (error) mapError(error);
  return parsePage(data);
}

export async function getPublicEvent(client: SupabaseClient, eventKey: string) {
  const key = eventKey.trim();
  if (!eventKeyPattern.test(key)) throw new EventDirectoryError("notFound", "대회·이벤트를 찾을 수 없습니다.");
  const { data, error } = await client.rpc("get_public_event", { p_event_key: key });
  if (error) mapError(error);
  return parsePublicEvent(data);
}

export async function getPublicEventRegionSummaries(client: SupabaseClient, registrationStatus?: RegistrationStatus) {
  if (registrationStatus && !registrationStatuses.has(registrationStatus)) throw new EventDirectoryError("validation", "접수 상태를 확인해 주세요.");
  const { data, error } = await client.rpc("get_public_event_region_summaries", { p_registration_status: registrationStatus ?? null });
  if (error) mapError(error);
  return parseRegionSummaries(data);
}

export async function listPublicEventReviews(client: SupabaseClient): Promise<EventReview[]> {
  const { data, error } = await client.rpc("list_public_event_reviews", { p_limit: 2 });
  if (error) mapError(error);
  if (!Array.isArray(data)) invalidResponse();
  return data.map((item) => {
    if (!isObject(item) || !exactKeys(item, ["id", "title", "summary", "author_display_name", "created_at", "rating"]) || typeof item.id !== "string" || typeof item.title !== "string" || typeof item.summary !== "string" || typeof item.author_display_name !== "string" || typeof item.created_at !== "string" || !Number.isFinite(new Date(item.created_at).getTime()) || typeof item.rating !== "number" || !Number.isInteger(item.rating) || item.rating < 1 || item.rating > 5) invalidResponse();
    return {
      id: item.id,
      title: item.title,
      summary: item.summary,
      authorDisplayName: item.author_display_name,
      createdAt: new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(new Date(item.created_at)),
      rating: item.rating,
    };
  });
}

export function formatEventSchedule(event: Pick<PublicEvent, "startDate" | "endDate" | "scheduleNote">) {
  if (!event.startDate) return event.scheduleNote ?? "일정 확인 필요";
  const formatter = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
  const start = formatter.format(new Date(`${event.startDate}T00:00:00Z`));
  if (!event.endDate || event.endDate === event.startDate) return start;
  return `${start} ~ ${formatter.format(new Date(`${event.endDate}T00:00:00Z`))}`;
}

export async function mutateEvent(client: SupabaseClient, operation: EventMutationOperation, eventKey: string, expectedVersion: number | null, payload?: EventMutationPayload) {
  const key = eventKey.trim();
  if (!eventKeyPattern.test(key)) throw new EventDirectoryError("validation", "공개 event key를 확인해 주세요.");
  const body = payload ? {
    title: payload.title.trim(), match_type: payload.matchType, event_scale: payload.eventScale, region: payload.region,
    venue_name: payload.venueName.trim(), venue_type: payload.venueType, start_date: payload.startDate, end_date: payload.endDate,
    schedule_note: payload.scheduleNote?.trim() || null, registration_status: payload.registrationStatus,
    target_audience: payload.targetAudience.map((item) => item.trim()).filter(Boolean), organizer: payload.organizer.trim(),
    summary: payload.summary.trim(), benefits: payload.benefits.map((item) => item.trim()).filter(Boolean),
    recruitment_status: payload.recruitmentStatus, related_course_key: payload.relatedCourseKey?.trim() || null,
    official_url: payload.officialUrl?.trim() || null, registration_url: payload.registrationUrl?.trim() || null,
    registration_note: payload.registrationNote?.trim() || null, is_featured: payload.isFeatured,
  } : {};
  const { data, error } = await client.rpc("mutate_event", { p_operation: operation, p_event_key: key, p_expected_version: expectedVersion, p_payload: body });
  if (error) mapError(error);
  if (!isObject(data) || !exactKeys(data, ["event_key", "publication_status", "registration_status", "version"]) || data.event_key !== key || typeof data.publication_status !== "string" || !new Set<EventPublicationStatus>(["published", "hidden", "removed"]).has(data.publication_status as EventPublicationStatus) || typeof data.registration_status !== "string" || !registrationStatuses.has(data.registration_status as RegistrationStatus) || typeof data.version !== "number" || !Number.isInteger(data.version) || data.version < 1) invalidResponse();
  return { eventKey: data.event_key, publicationStatus: data.publication_status as EventPublicationStatus, registrationStatus: data.registration_status as RegistrationStatus, version: data.version };
}
