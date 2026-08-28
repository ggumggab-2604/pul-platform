import type { SupabaseClient } from "@supabase/supabase-js";

type CourseType = "field" | "screen";
type CourseOperation = "reservation" | "phone" | "walkIn";
type CourseRegion = "서울" | "경기" | "인천" | "충청" | "강원" | "전라" | "경상" | "제주";
const managementCourseRegions: readonly CourseRegion[] = [
  "서울", "경기", "인천", "충청", "강원", "전라", "경상", "제주",
];

export type CoursePublicationStatus = "active" | "inactive" | "removed";
export type CourseInformationReportStatus = "received" | "handled" | "dismissed";
export type CourseInformationReportType = "new_course" | "correction";
export type CourseManagementOperation = "create" | "update" | "activate" | "deactivate";
export type CourseReportResolution = "handled" | "dismissed";
export type ManagedCourseFeature =
  | "club_available"
  | "event_history"
  | "lesson_available"
  | "equipment_rental";

export type ManagedCourse = {
  courseKey: string;
  name: string;
  courseType: CourseType;
  region: CourseRegion;
  city: string;
  address: string;
  holes: number;
  operatingHours: string | null;
  operation: CourseOperation;
  phone: string | null;
  parkingAvailable: boolean | null;
  featureCodes: ManagedCourseFeature[];
  description: string;
  reservationUrl: string | null;
  reservationGuide: string | null;
  feeGuide: string | null;
  latitude: number | null;
  longitude: number | null;
  courseStatus: CoursePublicationStatus;
  updatedAt: string;
};

export type ManagedCoursePage = {
  items: ManagedCourse[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type ManagedCourseInput = Omit<
  ManagedCourse,
  "courseKey" | "courseStatus" | "updatedAt"
>;

export type CourseDuplicateCandidate = Pick<
  ManagedCourse,
  "courseKey" | "name" | "region" | "city" | "address" | "courseStatus"
>;

export type CourseInformationReportSummary = {
  reportId: string;
  reportType: CourseInformationReportType;
  courseName: string;
  region: CourseRegion;
  reportStatus: CourseInformationReportStatus;
  createdAt: string;
  updatedAt: string;
  targetCourseKey: string | null;
};

export type CourseInformationReportPage = {
  items: CourseInformationReportSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type CourseInformationReportDetail = CourseInformationReportSummary & {
  locationDescription: string;
  operationDetails: string | null;
  reportBody: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  targetCourse: Pick<
    ManagedCourse,
    "courseKey" | "name" | "address" | "courseStatus" | "updatedAt"
  > | null;
};

export type CourseMutationResult = {
  courseKey: string;
  courseStatus: CoursePublicationStatus;
  updatedAt: string;
  requestId: string;
};

export type CourseReportMutationResult = {
  reportId: string;
  reportStatus: CourseReportResolution;
  updatedAt: string;
  requestId: string;
};

type JsonObject = Record<string, unknown>;

const courseKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const courseTypes = new Set<CourseType>(["field", "screen"]);
const courseOperations = new Set<CourseOperation>(["reservation", "phone", "walkIn"]);
const regions = new Set<CourseRegion>(managementCourseRegions);
const statuses = new Set<CoursePublicationStatus>(["active", "inactive", "removed"]);
const reportStatuses = new Set<CourseInformationReportStatus>(["received", "handled", "dismissed"]);
const reportTypes = new Set<CourseInformationReportType>(["new_course", "correction"]);
const featureCodes = new Set<ManagedCourseFeature>([
  "club_available", "event_history", "lesson_available", "equipment_rental",
]);
const courseKeys = [
  "course_key", "name", "course_type", "region", "city", "address", "holes",
  "operating_hours", "operation_code", "phone", "parking_available", "feature_codes",
  "description", "reservation_url", "reservation_guide", "fee_guide", "latitude",
  "longitude", "course_status", "updated_at",
] as const;
const reportSummaryKeys = [
  "report_id", "report_type", "course_name", "region", "report_status", "created_at",
  "updated_at", "target_course_key",
] as const;

export class CourseManagementError extends Error {
  constructor(
    readonly code: "authentication" | "permission" | "validation" | "conflict" | "notFound" | "network" | "unknown",
    readonly userMessage: string,
    readonly shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "CourseManagementError";
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
  throw new CourseManagementError("unknown", "골프장 운영 응답 형식이 올바르지 않습니다.");
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function text(value: unknown, min: number, max: number, message: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const length = Array.from(normalized).length;
  if (length < min || length > max) throw new CourseManagementError("validation", message);
  return normalized;
}

function nullableText(value: unknown, min: number, max: number, message: string) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, min, max, message);
}

function mapError(error: { message?: string; code?: string } | null): never {
  const message = error?.message ?? "";
  if (error?.code === "40001" || /변경되었습니다|최신 내용을/.test(message)) {
    throw new CourseManagementError("conflict", "다른 화면에서 내용이 변경되었습니다. 최신 내용을 다시 확인해 주세요.", true);
  }
  if (/로그인이 필요/.test(message)) {
    throw new CourseManagementError("authentication", "로그인이 필요합니다.", true);
  }
  if (error?.code === "42501" || /권한이 없습니다/.test(message)) {
    throw new CourseManagementError("permission", "골프장 운영 권한이 없습니다.", true);
  }
  if (error?.code === "P0002" || /찾을 수 없습니다/.test(message)) {
    throw new CourseManagementError("notFound", "대상 정보를 찾을 수 없습니다.", true);
  }
  if (/확인해 주세요|입력해 주세요|사용할 수 없습니다|이미 처리/.test(message)) {
    throw new CourseManagementError("validation", message || "입력 내용을 확인해 주세요.", /이미 처리/.test(message));
  }
  if (/fetch|network/i.test(message)) {
    throw new CourseManagementError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new CourseManagementError("unknown", "골프장 운영 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export function parseManagedCourse(value: unknown): ManagedCourse {
  if (!isObject(value) || !exactKeys(value, courseKeys)) invalidResponse();
  if (
    typeof value.course_key !== "string" || !courseKeyPattern.test(value.course_key) ||
    typeof value.name !== "string" ||
    typeof value.course_type !== "string" || !courseTypes.has(value.course_type as CourseType) ||
    typeof value.region !== "string" || !regions.has(value.region as CourseRegion) ||
    typeof value.city !== "string" || typeof value.address !== "string" ||
    typeof value.holes !== "number" || !Number.isInteger(value.holes) || value.holes < 1 || value.holes > 72 ||
    !isNullableString(value.operating_hours) ||
    typeof value.operation_code !== "string" || !courseOperations.has(value.operation_code as CourseOperation) ||
    !isNullableString(value.phone) ||
    !(value.parking_available === null || typeof value.parking_available === "boolean") ||
    !Array.isArray(value.feature_codes) || !value.feature_codes.every((item) => typeof item === "string" && featureCodes.has(item as ManagedCourseFeature)) ||
    typeof value.description !== "string" ||
    !isNullableString(value.reservation_url) || !isNullableString(value.reservation_guide) || !isNullableString(value.fee_guide) ||
    !isNullableNumber(value.latitude) || !isNullableNumber(value.longitude) ||
    (value.latitude === null) !== (value.longitude === null) ||
    typeof value.course_status !== "string" || !statuses.has(value.course_status as CoursePublicationStatus) ||
    !isDate(value.updated_at)
  ) invalidResponse();
  return {
    courseKey: value.course_key,
    name: value.name,
    courseType: value.course_type as CourseType,
    region: value.region as CourseRegion,
    city: value.city,
    address: value.address,
    holes: value.holes,
    operatingHours: value.operating_hours,
    operation: value.operation_code as CourseOperation,
    phone: value.phone,
    parkingAvailable: value.parking_available,
    featureCodes: value.feature_codes as ManagedCourseFeature[],
    description: value.description,
    reservationUrl: value.reservation_url,
    reservationGuide: value.reservation_guide,
    feeGuide: value.fee_guide,
    latitude: value.latitude,
    longitude: value.longitude,
    courseStatus: value.course_status as CoursePublicationStatus,
    updatedAt: value.updated_at,
  };
}

function parsePage<T>(value: unknown, parseItem: (item: unknown) => T): { items: T[]; total: number; limit: number; offset: number; hasMore: boolean } {
  if (!isObject(value) || !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) || !Array.isArray(value.items)) invalidResponse();
  if (
    typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 50 ||
    typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) invalidResponse();
  return { items: value.items.map(parseItem), total: value.total, limit: value.limit, offset: value.offset, hasMore: value.has_more };
}

function parseReportSummary(value: unknown): CourseInformationReportSummary {
  if (!isObject(value) || !exactKeys(value, reportSummaryKeys)) invalidResponse();
  if (
    typeof value.report_id !== "string" || !uuidPattern.test(value.report_id) ||
    typeof value.report_type !== "string" || !reportTypes.has(value.report_type as CourseInformationReportType) ||
    typeof value.course_name !== "string" ||
    typeof value.region !== "string" || !regions.has(value.region as CourseRegion) ||
    typeof value.report_status !== "string" || !reportStatuses.has(value.report_status as CourseInformationReportStatus) ||
    !isDate(value.created_at) || !isDate(value.updated_at) ||
    !(value.target_course_key === null || (typeof value.target_course_key === "string" && courseKeyPattern.test(value.target_course_key)))
  ) invalidResponse();
  return {
    reportId: value.report_id,
    reportType: value.report_type as CourseInformationReportType,
    courseName: value.course_name,
    region: value.region as CourseRegion,
    reportStatus: value.report_status as CourseInformationReportStatus,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    targetCourseKey: value.target_course_key,
  };
}

export function parseCourseInformationReportDetail(value: unknown): CourseInformationReportDetail {
  if (!isObject(value) || !exactKeys(value, [
    ...reportSummaryKeys, "location_description", "operation_details", "report_body",
    "resolved_at", "resolution_note", "target_course",
  ])) invalidResponse();
  const summary = parseReportSummary(Object.fromEntries(reportSummaryKeys.map((key) => [key, value[key]])));
  if (
    typeof value.location_description !== "string" || !isNullableString(value.operation_details) ||
    typeof value.report_body !== "string" || !(value.resolved_at === null || isDate(value.resolved_at)) ||
    !isNullableString(value.resolution_note)
  ) invalidResponse();
  let targetCourse: CourseInformationReportDetail["targetCourse"] = null;
  if (value.target_course !== null) {
    if (!isObject(value.target_course) || !exactKeys(value.target_course, ["course_key", "name", "address", "course_status", "updated_at"])) invalidResponse();
    if (
      typeof value.target_course.course_key !== "string" || !courseKeyPattern.test(value.target_course.course_key) ||
      typeof value.target_course.name !== "string" || typeof value.target_course.address !== "string" ||
      typeof value.target_course.course_status !== "string" || !statuses.has(value.target_course.course_status as CoursePublicationStatus) ||
      !isDate(value.target_course.updated_at)
    ) invalidResponse();
    targetCourse = {
      courseKey: value.target_course.course_key,
      name: value.target_course.name,
      address: value.target_course.address,
      courseStatus: value.target_course.course_status as CoursePublicationStatus,
      updatedAt: value.target_course.updated_at,
    };
  }
  return {
    ...summary,
    locationDescription: value.location_description,
    operationDetails: value.operation_details,
    reportBody: value.report_body,
    resolvedAt: value.resolved_at,
    resolutionNote: value.resolution_note,
    targetCourse,
  };
}

export function validateManagedCourseInput(input: ManagedCourseInput): ManagedCourseInput {
  if (!courseTypes.has(input.courseType)) throw new CourseManagementError("validation", "골프장 유형을 확인해 주세요.");
  if (!regions.has(input.region)) throw new CourseManagementError("validation", "지역을 확인해 주세요.");
  if (!courseOperations.has(input.operation)) throw new CourseManagementError("validation", "운영 방식을 확인해 주세요.");
  if (!Number.isInteger(input.holes) || input.holes < 1 || input.holes > 72) throw new CourseManagementError("validation", "홀 수는 1~72로 입력해 주세요.");
  if (!input.featureCodes.every((item) => featureCodes.has(item)) || new Set(input.featureCodes).size !== input.featureCodes.length) throw new CourseManagementError("validation", "제공 기능을 확인해 주세요.");
  if (!(input.parkingAvailable === null || typeof input.parkingAvailable === "boolean")) throw new CourseManagementError("validation", "주차 정보를 확인해 주세요.");
  if (!(input.latitude === null || (Number.isFinite(input.latitude) && input.latitude >= -90 && input.latitude <= 90))) throw new CourseManagementError("validation", "위도는 -90~90으로 입력해 주세요.");
  if (!(input.longitude === null || (Number.isFinite(input.longitude) && input.longitude >= -180 && input.longitude <= 180))) throw new CourseManagementError("validation", "경도는 -180~180으로 입력해 주세요.");
  if ((input.latitude === null) !== (input.longitude === null)) throw new CourseManagementError("validation", "위도와 경도는 함께 입력해 주세요.");
  const reservationUrl = nullableText(input.reservationUrl, 12, 500, "예약 URL은 12~500자로 입력해 주세요.");
  if (reservationUrl && !/^https:\/\/[^\s]+$/i.test(reservationUrl)) throw new CourseManagementError("validation", "예약 URL은 https:// 주소로 입력해 주세요.");
  return {
    name: text(input.name, 2, 120, "골프장명은 2~120자로 입력해 주세요."),
    courseType: input.courseType,
    region: input.region,
    city: text(input.city, 1, 100, "시·군·구는 1~100자로 입력해 주세요."),
    address: text(input.address, 5, 300, "주소는 5~300자로 입력해 주세요."),
    holes: input.holes,
    operatingHours: nullableText(input.operatingHours, 1, 200, "운영시간은 200자 이내로 입력해 주세요."),
    operation: input.operation,
    phone: nullableText(input.phone, 7, 30, "전화번호는 7~30자로 입력해 주세요."),
    parkingAvailable: input.parkingAvailable,
    featureCodes: [...input.featureCodes].sort(),
    description: text(input.description, 10, 2000, "소개는 10~2000자로 입력해 주세요."),
    reservationUrl,
    reservationGuide: nullableText(input.reservationGuide, 2, 1000, "예약 안내는 2~1000자로 입력해 주세요."),
    feeGuide: nullableText(input.feeGuide, 1, 500, "이용 요금 안내는 500자 이내로 입력해 주세요."),
    latitude: input.latitude,
    longitude: input.longitude,
  };
}

function mutationPayload(input: ManagedCourseInput) {
  const valid = validateManagedCourseInput(input);
  return {
    name: valid.name,
    course_type: valid.courseType,
    region: valid.region,
    city: valid.city,
    address: valid.address,
    holes: valid.holes,
    operating_hours: valid.operatingHours,
    operation_code: valid.operation,
    phone: valid.phone,
    parking_available: valid.parkingAvailable,
    feature_codes: valid.featureCodes,
    description: valid.description,
    reservation_url: valid.reservationUrl,
    reservation_guide: valid.reservationGuide,
    fee_guide: valid.feeGuide,
    latitude: valid.latitude,
    longitude: valid.longitude,
  };
}

function parseCourseMutationResult(value: unknown, requestId: string): CourseMutationResult {
  if (!isObject(value) || !exactKeys(value, ["course_key", "course_status", "updated_at", "request_id"])) invalidResponse();
  if (
    typeof value.course_key !== "string" || !courseKeyPattern.test(value.course_key) ||
    typeof value.course_status !== "string" || !statuses.has(value.course_status as CoursePublicationStatus) ||
    !isDate(value.updated_at) || value.request_id !== requestId
  ) invalidResponse();
  return { courseKey: value.course_key, courseStatus: value.course_status as CoursePublicationStatus, updatedAt: value.updated_at, requestId };
}

export async function listCoursesForManagement(client: SupabaseClient, keyword?: string, region?: CourseRegion, status?: CoursePublicationStatus, limit = 30, offset = 0): Promise<ManagedCoursePage> {
  const normalized = keyword?.trim() || null;
  if (normalized && Array.from(normalized).length > 100) throw new CourseManagementError("validation", "검색어는 100자 이내로 입력해 주세요.");
  if (region && !regions.has(region)) throw new CourseManagementError("validation", "지역을 확인해 주세요.");
  if (status && !statuses.has(status)) throw new CourseManagementError("validation", "공개 상태를 확인해 주세요.");
  const { data, error } = await client.rpc("list_courses_for_management", { p_keyword: normalized, p_region: region ?? null, p_course_status: status ?? null, p_limit: limit, p_offset: offset });
  if (error) mapError(error);
  return parsePage(data, parseManagedCourse);
}

export async function getCourseForManagement(client: SupabaseClient, courseKey: string) {
  const key = courseKey.trim();
  if (!courseKeyPattern.test(key)) throw new CourseManagementError("notFound", "골프장 정보를 찾을 수 없습니다.");
  const { data, error } = await client.rpc("get_course_for_management", { p_course_key: key });
  if (error) mapError(error);
  return parseManagedCourse(data);
}

export async function findCourseDuplicateCandidates(client: SupabaseClient, input: Pick<ManagedCourseInput, "name" | "region" | "city">, excludeCourseKey?: string | null) {
  const name = text(input.name, 2, 120, "골프장명을 확인해 주세요.");
  const city = text(input.city, 1, 100, "시·군·구를 확인해 주세요.");
  if (!regions.has(input.region)) throw new CourseManagementError("validation", "지역을 확인해 주세요.");
  const { data, error } = await client.rpc("find_course_duplicate_candidates", { p_name: name, p_region: input.region, p_city: city, p_exclude_course_key: excludeCourseKey ?? null });
  if (error) mapError(error);
  if (!Array.isArray(data)) invalidResponse();
  return data.map((value): CourseDuplicateCandidate => {
    if (!isObject(value) || !exactKeys(value, ["course_key", "name", "region", "city", "address", "course_status"])) invalidResponse();
    if (
      typeof value.course_key !== "string" || !courseKeyPattern.test(value.course_key) ||
      typeof value.name !== "string" || typeof value.region !== "string" || !regions.has(value.region as CourseRegion) ||
      typeof value.city !== "string" || typeof value.address !== "string" ||
      typeof value.course_status !== "string" || !statuses.has(value.course_status as CoursePublicationStatus)
    ) invalidResponse();
    return { courseKey: value.course_key, name: value.name, region: value.region as CourseRegion, city: value.city, address: value.address, courseStatus: value.course_status as CoursePublicationStatus };
  });
}

export async function mutateManagedCourse(client: SupabaseClient, operation: CourseManagementOperation, courseKey: string | null, expectedUpdatedAt: string | null, requestId: string, input?: ManagedCourseInput) {
  if (!uuidPattern.test(requestId)) throw new CourseManagementError("validation", "요청 식별자를 확인해 주세요.");
  if ((operation === "create" || operation === "update") !== Boolean(input)) throw new CourseManagementError("validation", "골프장 입력값을 확인해 주세요.");
  const { data, error } = await client.rpc("mutate_managed_course", {
    p_operation: operation,
    p_course_key: courseKey,
    p_expected_updated_at: expectedUpdatedAt,
    p_request_id: requestId,
    p_payload: input ? mutationPayload(input) : {},
  });
  if (error) mapError(error);
  return parseCourseMutationResult(data, requestId);
}

export async function listCourseInformationReportsForManagement(client: SupabaseClient, status?: CourseInformationReportStatus, limit = 30, offset = 0): Promise<CourseInformationReportPage> {
  if (status && !reportStatuses.has(status)) throw new CourseManagementError("validation", "제보 처리 상태를 확인해 주세요.");
  const { data, error } = await client.rpc("list_course_information_reports_for_management", { p_report_status: status ?? null, p_limit: limit, p_offset: offset });
  if (error) mapError(error);
  return parsePage(data, parseReportSummary);
}

export async function getCourseInformationReportForManagement(client: SupabaseClient, reportId: string) {
  if (!uuidPattern.test(reportId)) throw new CourseManagementError("notFound", "제보를 찾을 수 없습니다.");
  const { data, error } = await client.rpc("get_course_information_report_for_management", { p_report_id: reportId });
  if (error) mapError(error);
  return parseCourseInformationReportDetail(data);
}

export async function resolveCourseInformationReport(client: SupabaseClient, reportId: string, resolution: CourseReportResolution, expectedUpdatedAt: string, note: string | null, requestId: string) {
  if (!uuidPattern.test(reportId) || !uuidPattern.test(requestId) || !isDate(expectedUpdatedAt) || !(["handled", "dismissed"] as const).includes(resolution)) {
    throw new CourseManagementError("validation", "제보 처리 요청을 확인해 주세요.");
  }
  const normalizedNote = note?.trim() || null;
  if (normalizedNote && (Array.from(normalizedNote).length < 2 || Array.from(normalizedNote).length > 500)) throw new CourseManagementError("validation", "운영 메모는 2~500자로 입력해 주세요.");
  const { data, error } = await client.rpc("resolve_course_information_report_for_management", {
    p_report_id: reportId,
    p_resolution: resolution,
    p_expected_updated_at: expectedUpdatedAt,
    p_resolution_note: normalizedNote,
    p_request_id: requestId,
  });
  if (error) mapError(error);
  if (!isObject(data) || !exactKeys(data, ["report_id", "report_status", "updated_at", "request_id"])) invalidResponse();
  if (data.report_id !== reportId || data.request_id !== requestId || data.report_status !== resolution || !isDate(data.updated_at)) invalidResponse();
  return { reportId, reportStatus: resolution, updatedAt: data.updated_at, requestId } satisfies CourseReportMutationResult;
}
