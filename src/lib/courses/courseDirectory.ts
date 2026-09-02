import type { SupabaseClient } from "@supabase/supabase-js";

export type CourseType = "field" | "screen";
export type CourseOperation = "reservation" | "phone" | "walkIn";
export type CourseRegion = "서울" | "경기" | "인천" | "충청" | "강원" | "전라" | "경상" | "제주";
export type CourseFeatureCode =
  | "club_available"
  | "event_history"
  | "lesson_available"
  | "equipment_rental"
  | "parking";
export type CourseHolesFilter = "9" | "18" | "27_plus";
export const courseInformationCorrectionTargets = [
  "name",
  "location",
  "phone",
  "operating_hours",
  "fee",
  "reservation",
  "course_details",
  "facilities",
  "map_location",
  "description",
  "media",
  "other",
] as const;
export type CourseInformationCorrectionTarget =
  (typeof courseInformationCorrectionTargets)[number];

export type PublicCourse = {
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
  featureCodes: Exclude<CourseFeatureCode, "parking">[];
  description: string;
  reservationUrl: string | null;
  reservationGuide: string | null;
  feeGuide: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CourseFilters = {
  keyword?: string;
  courseType?: CourseType;
  region?: CourseRegion;
  operation?: CourseOperation;
  holes?: CourseHolesFilter;
  features?: CourseFeatureCode[];
};

export type PublicCoursePage = {
  items: PublicCourse[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type CourseInformationReportInput = {
  requestId: string;
  reportType: "new_course" | "correction";
  courseKey?: string | null;
  correctionTarget?: CourseInformationCorrectionTarget | null;
  courseName?: string | null;
  region?: CourseRegion | null;
  locationDescription?: string | null;
  operationDetails?: string | null;
  reportBody: string;
};

export type CourseInformationReportResult = {
  reportId: string;
  status: "received";
  requestId: string;
  replayed: boolean;
};

export const courseInformationCorrectionTargetLabels: Readonly<
  Record<CourseInformationCorrectionTarget, string>
> = {
  name: "골프장명",
  location: "주소·위치",
  phone: "전화번호",
  operating_hours: "운영시간",
  fee: "이용요금",
  reservation: "예약정보",
  course_details: "코스정보",
  facilities: "시설정보",
  map_location: "지도위치",
  description: "소개·기타안내",
  media: "사진정보",
  other: "기타",
};

export const courseTypeLabels: Record<CourseType, string> = {
  field: "실제 필드",
  screen: "스크린 파크골프장",
};

export const courseOperationLabels: Record<CourseOperation, string> = {
  reservation: "예약 가능",
  phone: "전화 문의",
  walkIn: "현장 접수",
};

export const courseRegionOptions: readonly CourseRegion[] = [
  "서울",
  "경기",
  "인천",
  "충청",
  "강원",
  "전라",
  "경상",
  "제주",
];

export const courseFeatureLabels: Record<CourseFeatureCode, string> = {
  club_available: "동호회 있음",
  event_history: "대회 개최 이력",
  lesson_available: "레슨 가능",
  equipment_rental: "장비 대여",
  parking: "주차 가능",
};

type JsonObject = Record<string, unknown>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const courseKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const courseTypes = new Set<CourseType>(["field", "screen"]);
const operations = new Set<CourseOperation>(["reservation", "phone", "walkIn"]);
const regions = new Set<CourseRegion>(courseRegionOptions);
const featureCodes = new Set<Exclude<CourseFeatureCode, "parking">>([
  "club_available",
  "event_history",
  "lesson_available",
  "equipment_rental",
]);
const filterFeatureCodes = new Set<CourseFeatureCode>([...featureCodes, "parking"]);
const holesFilters = new Set<CourseHolesFilter>(["9", "18", "27_plus"]);
const correctionTargets = new Set<CourseInformationCorrectionTarget>(
  courseInformationCorrectionTargets,
);
const courseKeys = [
  "course_key",
  "name",
  "course_type",
  "region",
  "city",
  "address",
  "holes",
  "operating_hours",
  "operation_code",
  "phone",
  "parking_available",
  "feature_codes",
  "description",
  "reservation_url",
  "reservation_guide",
  "fee_guide",
  "latitude",
  "longitude",
] as const;

export class CourseDirectoryError extends Error {
  constructor(
    readonly code: "authentication" | "validation" | "conflict" | "notFound" | "network" | "unknown",
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = "CourseDirectoryError";
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
  throw new CourseDirectoryError("unknown", "골프장 응답 형식이 올바르지 않습니다.");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

export function parsePublicCourse(value: unknown): PublicCourse {
  if (!isObject(value) || !exactKeys(value, courseKeys)) invalidResponse();
  if (
    typeof value.course_key !== "string" || !courseKeyPattern.test(value.course_key) ||
    typeof value.name !== "string" ||
    typeof value.course_type !== "string" || !courseTypes.has(value.course_type as CourseType) ||
    typeof value.region !== "string" || !regions.has(value.region as CourseRegion) ||
    typeof value.city !== "string" || typeof value.address !== "string" ||
    typeof value.holes !== "number" || !Number.isInteger(value.holes) || value.holes < 1 || value.holes > 72 ||
    !isNullableString(value.operating_hours) ||
    typeof value.operation_code !== "string" || !operations.has(value.operation_code as CourseOperation) ||
    !isNullableString(value.phone) ||
    !(value.parking_available === null || typeof value.parking_available === "boolean") ||
    !Array.isArray(value.feature_codes) || !value.feature_codes.every((item) => typeof item === "string" && featureCodes.has(item as Exclude<CourseFeatureCode, "parking">)) ||
    typeof value.description !== "string" ||
    !isNullableString(value.reservation_url) || !isNullableString(value.reservation_guide) || !isNullableString(value.fee_guide) ||
    !isNullableNumber(value.latitude) || !isNullableNumber(value.longitude) ||
    (value.latitude === null) !== (value.longitude === null)
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
    featureCodes: value.feature_codes as Exclude<CourseFeatureCode, "parking">[],
    description: value.description,
    reservationUrl: value.reservation_url,
    reservationGuide: value.reservation_guide,
    feeGuide: value.fee_guide,
    latitude: value.latitude,
    longitude: value.longitude,
  };
}

function parseCoursePage(value: unknown): PublicCoursePage {
  if (!isObject(value) || !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) || !Array.isArray(value.items)) invalidResponse();
  if (
    typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 50 ||
    typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) invalidResponse();
  return {
    items: value.items.map(parsePublicCourse),
    total: value.total,
    limit: value.limit,
    offset: value.offset,
    hasMore: value.has_more,
  };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인|정상 활동/.test(message)) {
    throw new CourseDirectoryError("authentication", "로그인한 정상 활동 회원만 골프장 정보를 제보할 수 있습니다.");
  }
  if (/찾을 수 없습니다/.test(message)) {
    throw new CourseDirectoryError("notFound", "골프장 정보를 찾을 수 없습니다.");
  }
  if (/동일한 요청 식별자|확인 대기 중인 제보|이미 다른 완료 작업/.test(message)) {
    throw new CourseDirectoryError("conflict", message);
  }
  if (/확인해 주세요|입력해 주세요|이내로|이상으로/.test(message)) {
    throw new CourseDirectoryError("validation", message || "입력 내용을 확인해 주세요.");
  }
  if (/fetch|network/i.test(message)) {
    throw new CourseDirectoryError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new CourseDirectoryError("unknown", "골프장 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export function normalizeCourseFilters(filters: CourseFilters): CourseFilters {
  const keyword = filters.keyword?.trim() ?? "";
  if (Array.from(keyword).length > 100) throw new CourseDirectoryError("validation", "검색어는 100자 이내로 입력해 주세요.");
  if (filters.courseType && !courseTypes.has(filters.courseType)) throw new CourseDirectoryError("validation", "골프장 유형을 확인해 주세요.");
  if (filters.region && !regions.has(filters.region)) throw new CourseDirectoryError("validation", "지역을 확인해 주세요.");
  if (filters.operation && !operations.has(filters.operation)) throw new CourseDirectoryError("validation", "운영 방식을 확인해 주세요.");
  if (filters.holes && !holesFilters.has(filters.holes)) throw new CourseDirectoryError("validation", "홀 수 조건을 확인해 주세요.");
  const features = [...new Set(filters.features ?? [])];
  if (!features.every((feature) => filterFeatureCodes.has(feature))) throw new CourseDirectoryError("validation", "부가 정보 조건을 확인해 주세요.");
  return {
    keyword: keyword || undefined,
    courseType: filters.courseType,
    region: filters.region,
    operation: filters.operation,
    holes: filters.holes,
    features: features.length > 0 ? features : undefined,
  };
}

export async function listPublicCourses(client: SupabaseClient, filters: CourseFilters = {}, limit = 24, offset = 0) {
  const valid = normalizeCourseFilters(filters);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
    throw new CourseDirectoryError("validation", "페이지 범위를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("list_public_courses", {
    p_keyword: valid.keyword ?? null,
    p_course_type: valid.courseType ?? null,
    p_region: valid.region ?? null,
    p_operation_code: valid.operation ?? null,
    p_holes: valid.holes ?? null,
    p_feature_codes: valid.features ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parseCoursePage(data);
}

export async function getPublicCourse(client: SupabaseClient, courseKey: string) {
  const key = courseKey.trim();
  if (!courseKeyPattern.test(key)) throw new CourseDirectoryError("notFound", "골프장 정보를 찾을 수 없습니다.");
  const { data, error } = await client.rpc("get_public_course", { p_course_key: key });
  if (error) mapError(error);
  return parsePublicCourse(data);
}

export function validateCourseInformationReport(input: CourseInformationReportInput): CourseInformationReportInput {
  const requestId = input.requestId.trim();
  const courseKey = input.courseKey?.trim() || null;
  const courseName = input.courseName?.trim() || null;
  const locationDescription = input.locationDescription?.trim() || null;
  const operationDetails = input.operationDetails?.trim() || null;
  const reportBody = input.reportBody.trim();
  if (!uuidPattern.test(requestId)) throw new CourseDirectoryError("validation", "제보 요청 식별자를 확인해 주세요.");
  if (input.reportType !== "new_course" && input.reportType !== "correction") throw new CourseDirectoryError("validation", "제보 종류를 확인해 주세요.");
  if (input.reportType === "new_course") {
    if (courseKey || input.correctionTarget) throw new CourseDirectoryError("validation", "신규 골프장 제보 내용을 확인해 주세요.");
    if (!courseName || Array.from(courseName).length < 2 || Array.from(courseName).length > 120) throw new CourseDirectoryError("validation", "골프장명은 2~120자로 입력해 주세요.");
    if (!input.region || !regions.has(input.region)) throw new CourseDirectoryError("validation", "지역을 확인해 주세요.");
    if (!locationDescription || Array.from(locationDescription).length < 2 || Array.from(locationDescription).length > 500) throw new CourseDirectoryError("validation", "주소 또는 위치 설명을 2~500자로 입력해 주세요.");
  } else {
    if (!courseKey || !courseKeyPattern.test(courseKey)) throw new CourseDirectoryError("validation", "수정할 골프장을 확인해 주세요.");
    if (!input.correctionTarget || !correctionTargets.has(input.correctionTarget)) throw new CourseDirectoryError("validation", "수정 대상을 확인해 주세요.");
  }
  if (operationDetails && (Array.from(operationDetails).length < 2 || Array.from(operationDetails).length > 1000)) throw new CourseDirectoryError("validation", "알고 있는 운영 정보는 2~1000자로 입력해 주세요.");
  if (Array.from(reportBody).length < 10 || Array.from(reportBody).length > 3000) throw new CourseDirectoryError("validation", "제보 내용은 10~3000자로 입력해 주세요.");
  return {
    ...input,
    requestId,
    courseKey,
    correctionTarget: input.reportType === "correction" ? input.correctionTarget : null,
    courseName,
    locationDescription,
    operationDetails,
    reportBody,
  };
}

export async function submitCourseInformationReport(client: SupabaseClient, input: CourseInformationReportInput): Promise<CourseInformationReportResult> {
  const valid = validateCourseInformationReport(input);
  const { data, error } = await client.rpc("submit_course_information_report", {
    p_request_id: valid.requestId,
    p_report_type: valid.reportType,
    p_course_key: valid.courseKey ?? null,
    p_correction_target: valid.correctionTarget ?? null,
    p_course_name: valid.courseName ?? null,
    p_region: valid.region ?? null,
    p_location_description: valid.locationDescription ?? null,
    p_operation_details: valid.operationDetails ?? null,
    p_report_body: valid.reportBody,
  });
  if (error) mapError(error);
  if (
    !isObject(data) ||
    !exactKeys(data, ["report_id", "status", "request_id", "replayed"]) ||
    typeof data.report_id !== "string" ||
    !uuidPattern.test(data.report_id) ||
    data.status !== "received" ||
    typeof data.request_id !== "string" ||
    data.request_id !== valid.requestId ||
    typeof data.replayed !== "boolean"
  ) invalidResponse();
  return {
    reportId: data.report_id,
    status: "received",
    requestId: data.request_id,
    replayed: data.replayed,
  };
}
