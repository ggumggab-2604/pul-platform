import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CourseCategory,
  CourseMethod,
  CourseStatus,
  ExamSchedule,
  ExamScheduleStatus,
  ExamType,
  ProviderType,
  QualificationCourse,
  RefereeJobPost,
  RefereeJobRoleType,
} from "@/data/certificationData";

export type CertificationPublicationStatus = "published" | "hidden" | "removed";
export type CertificationMutationOperation =
  | "create"
  | "update"
  | "publish"
  | "hide"
  | "remove";

export type PublicQualificationCourse = QualificationCourse & {
  courseKey: string;
  officialUrl: string;
  applicationUrl: string | null;
  featured: boolean;
};

export type PublicExamSchedule = ExamSchedule & {
  scheduleKey: string;
};

export type PublicCertificationJob = RefereeJobPost & {
  jobKey: string;
  organizerName: string;
  officialUrl: string | null;
  applicationUrl: string | null;
};

export type CertificationCourseFilters = {
  keyword?: string;
  category?: CourseCategory;
  providerType?: ProviderType;
  region?: string;
  method?: CourseMethod;
  status?: CourseStatus;
};

export type CertificationExamFilters = {
  examType?: ExamType;
  status?: ExamScheduleStatus;
};

export type CertificationJobFilters = {
  roleType?: RefereeJobRoleType;
  region?: string;
  status?: CourseStatus | "planned";
};

export type CertificationPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type CertificationCourseMutationPayload = {
  title: string;
  category: CourseCategory;
  providerType: ProviderType;
  providerName: string;
  region: string;
  method: CourseMethod;
  target: string;
  schedule: string;
  price: string;
  status: CourseStatus;
  description: string;
  officialUrl: string;
  applicationUrl: string | null;
  featured: boolean;
};

export type CertificationExamMutationPayload = {
  examName: string;
  examType: ExamType;
  organizationName: string;
  applicationPeriod: string;
  examDate: string;
  venueAnnouncement: string;
  resultDate: string;
  requiredItems: string;
  officialUrl: string;
  status: ExamScheduleStatus;
};

export type CertificationJobMutationPayload = {
  title: string;
  roleType: RefereeJobRoleType;
  region: string;
  schedule: string;
  roleDescription: string;
  condition: string;
  payInfo: string;
  organizerName: string;
  organizerType: string;
  status: CourseStatus | "planned";
  officialUrl: string | null;
  applicationUrl: string | null;
};

type JsonObject = Record<string, unknown>;

const publicKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const courseCategories = new Set<CourseCategory>([
  "instructor",
  "referee",
  "life_sports",
  "disabled_sports",
  "private_instructor",
  "private_referee",
  "completion",
]);
const providerTypes = new Set<ProviderType>([
  "national_exam",
  "association",
  "lifelong",
  "foundation",
  "private_academy",
  "online",
]);
const courseMethods = new Set<CourseMethod>([
  "offline",
  "online",
  "hybrid",
  "theory_practice",
]);
const courseStatuses = new Set<CourseStatus>([
  "recruiting",
  "accepting",
  "waiting",
  "closed",
]);
const jobStatuses = new Set<CourseStatus | "planned">([
  ...courseStatuses,
  "planned",
]);
const examTypes = new Set<ExamType>([
  "life_sports",
  "disabled_sports",
  "park_instructor",
  "park_referee",
  "private_instructor",
  "private_referee",
]);
const examStatuses = new Set<ExamScheduleStatus>([
  "application_planned",
  "application_open",
  "application_closed",
  "exam_planned",
  "venue_planned",
  "result_planned",
]);
const jobRoles = new Set<RefereeJobRoleType>([
  "referee",
  "instructor",
  "staff",
  "scorer",
  "assistant",
]);

const courseKeys = [
  "course_key",
  "title",
  "category",
  "provider_type",
  "provider_name",
  "region",
  "course_method",
  "target_text",
  "schedule_text",
  "price_text",
  "recruit_status",
  "description",
  "official_url",
  "application_url",
  "is_featured",
] as const;

const examKeys = [
  "schedule_key",
  "exam_name",
  "exam_type",
  "organization_name",
  "application_period",
  "exam_date_text",
  "venue_announcement",
  "result_date_text",
  "required_items",
  "official_url",
  "schedule_status",
] as const;

const jobKeys = [
  "job_key",
  "title",
  "role_type",
  "region",
  "schedule_text",
  "role_description",
  "condition_text",
  "pay_text",
  "organizer_name",
  "organizer_type",
  "recruit_status",
  "official_url",
  "application_url",
] as const;

export class CertificationDirectoryError extends Error {
  constructor(
    readonly code:
      | "authentication"
      | "permission"
      | "validation"
      | "conflict"
      | "notFound"
      | "network"
      | "unknown",
    readonly userMessage: string,
    readonly shouldRefresh = false,
  ) {
    super(userMessage);
    this.name = "CertificationDirectoryError";
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
  throw new CertificationDirectoryError(
    "unknown",
    "자격증·심판 정보 응답 형식이 올바르지 않습니다.",
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSafeExternalUrl(value: string | null) {
  if (value === null) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && value.length <= 500 && !/\s/.test(value);
  } catch {
    return false;
  }
}

export function parsePublicCertificationCourse(value: unknown): PublicQualificationCourse {
  if (!isObject(value) || !exactKeys(value, courseKeys)) invalidResponse();
  if (
    typeof value.course_key !== "string" || !publicKeyPattern.test(value.course_key) ||
    typeof value.title !== "string" ||
    typeof value.category !== "string" || !courseCategories.has(value.category as CourseCategory) ||
    typeof value.provider_type !== "string" || !providerTypes.has(value.provider_type as ProviderType) ||
    typeof value.provider_name !== "string" || typeof value.region !== "string" ||
    typeof value.course_method !== "string" || !courseMethods.has(value.course_method as CourseMethod) ||
    typeof value.target_text !== "string" || typeof value.schedule_text !== "string" ||
    typeof value.price_text !== "string" ||
    typeof value.recruit_status !== "string" || !courseStatuses.has(value.recruit_status as CourseStatus) ||
    typeof value.description !== "string" || typeof value.official_url !== "string" ||
    !isSafeExternalUrl(value.official_url) || !isNullableString(value.application_url) ||
    !isSafeExternalUrl(value.application_url) || typeof value.is_featured !== "boolean"
  ) invalidResponse();

  return {
    id: value.course_key,
    courseKey: value.course_key,
    title: value.title,
    category: value.category as CourseCategory,
    providerType: value.provider_type as ProviderType,
    provider: value.provider_name,
    region: value.region,
    method: value.course_method as CourseMethod,
    target: value.target_text,
    schedule: value.schedule_text,
    price: value.price_text,
    status: value.recruit_status as CourseStatus,
    description: value.description,
    officialUrl: value.official_url,
    applicationUrl: value.application_url,
    featured: value.is_featured,
  };
}

export function parsePublicCertificationExamSchedule(value: unknown): PublicExamSchedule {
  if (!isObject(value) || !exactKeys(value, examKeys)) invalidResponse();
  if (
    typeof value.schedule_key !== "string" || !publicKeyPattern.test(value.schedule_key) ||
    typeof value.exam_name !== "string" ||
    typeof value.exam_type !== "string" || !examTypes.has(value.exam_type as ExamType) ||
    typeof value.organization_name !== "string" || typeof value.application_period !== "string" ||
    typeof value.exam_date_text !== "string" || typeof value.venue_announcement !== "string" ||
    typeof value.result_date_text !== "string" || typeof value.required_items !== "string" ||
    typeof value.official_url !== "string" || !isSafeExternalUrl(value.official_url) ||
    typeof value.schedule_status !== "string" || !examStatuses.has(value.schedule_status as ExamScheduleStatus)
  ) invalidResponse();

  return {
    id: value.schedule_key,
    scheduleKey: value.schedule_key,
    examName: value.exam_name,
    examType: value.exam_type as ExamType,
    organization: value.organization_name,
    applicationPeriod: value.application_period,
    examDate: value.exam_date_text,
    venueAnnouncement: value.venue_announcement,
    resultDate: value.result_date_text,
    requiredItems: value.required_items,
    officialUrl: value.official_url,
    status: value.schedule_status as ExamScheduleStatus,
  };
}

export function parsePublicCertificationJob(value: unknown): PublicCertificationJob {
  if (!isObject(value) || !exactKeys(value, jobKeys)) invalidResponse();
  if (
    typeof value.job_key !== "string" || !publicKeyPattern.test(value.job_key) ||
    typeof value.title !== "string" ||
    typeof value.role_type !== "string" || !jobRoles.has(value.role_type as RefereeJobRoleType) ||
    typeof value.region !== "string" || typeof value.schedule_text !== "string" ||
    typeof value.role_description !== "string" || typeof value.condition_text !== "string" ||
    typeof value.pay_text !== "string" || typeof value.organizer_name !== "string" ||
    typeof value.organizer_type !== "string" ||
    typeof value.recruit_status !== "string" || !jobStatuses.has(value.recruit_status as CourseStatus | "planned") ||
    !isNullableString(value.official_url) || !isSafeExternalUrl(value.official_url) ||
    !isNullableString(value.application_url) || !isSafeExternalUrl(value.application_url) ||
    (value.official_url === null && value.application_url === null)
  ) invalidResponse();

  return {
    id: value.job_key,
    jobKey: value.job_key,
    title: value.title,
    roleType: value.role_type as RefereeJobRoleType,
    region: value.region,
    schedule: value.schedule_text,
    role: value.role_description,
    condition: value.condition_text,
    payInfo: value.pay_text,
    organizerName: value.organizer_name,
    organizerType: value.organizer_type,
    status: value.recruit_status as CourseStatus | "planned",
    officialUrl: value.official_url,
    applicationUrl: value.application_url,
  };
}

function parsePage<T>(value: unknown, parseItem: (item: unknown) => T): CertificationPage<T> {
  if (
    !isObject(value) ||
    !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) ||
    !Array.isArray(value.items)
  ) invalidResponse();
  if (
    typeof value.total !== "number" || !Number.isInteger(value.total) || value.total < 0 ||
    typeof value.limit !== "number" || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 50 ||
    typeof value.offset !== "number" || !Number.isInteger(value.offset) || value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) invalidResponse();
  return {
    items: value.items.map(parseItem),
    total: value.total,
    limit: value.limit,
    offset: value.offset,
    hasMore: value.has_more,
  };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new CertificationDirectoryError("authentication", "로그인이 필요합니다.");
  }
  if (/권한/.test(message)) {
    throw new CertificationDirectoryError("permission", "자격증·심판 정보 운영 권한이 없습니다.");
  }
  if (/변경되었습니다/.test(message)) {
    throw new CertificationDirectoryError("conflict", message, true);
  }
  if (/찾을 수 없습니다/.test(message)) {
    throw new CertificationDirectoryError("notFound", message);
  }
  if (/확인해 주세요|사용 중|지원하지 않는|constraint/i.test(message)) {
    throw new CertificationDirectoryError("validation", "입력한 자격증·심판 정보를 확인해 주세요.");
  }
  if (/fetch|network/i.test(message)) {
    throw new CertificationDirectoryError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  throw new CertificationDirectoryError(
    "unknown",
    "자격증·심판 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function validPage(limit: number, offset: number) {
  if (
    !Number.isInteger(limit) || limit < 1 || limit > 50 ||
    !Number.isInteger(offset) || offset < 0
  ) {
    throw new CertificationDirectoryError("validation", "페이지 범위를 확인해 주세요.");
  }
}

function normalizeText(value: string | undefined, max: number, label: string) {
  const normalized = value?.trim() || undefined;
  if (normalized && normalized.length > max) {
    throw new CertificationDirectoryError("validation", `${label}을 확인해 주세요.`);
  }
  return normalized;
}

export async function listPublicCertificationCourses(
  client: SupabaseClient,
  filters: CertificationCourseFilters = {},
  limit = 24,
  offset = 0,
): Promise<CertificationPage<PublicQualificationCourse>> {
  validPage(limit, offset);
  const keyword = normalizeText(filters.keyword, 100, "검색어");
  const region = normalizeText(filters.region, 80, "지역");
  if (filters.category && !courseCategories.has(filters.category)) {
    throw new CertificationDirectoryError("validation", "과정 구분을 확인해 주세요.");
  }
  if (filters.providerType && !providerTypes.has(filters.providerType)) {
    throw new CertificationDirectoryError("validation", "교육기관 유형을 확인해 주세요.");
  }
  if (filters.method && !courseMethods.has(filters.method)) {
    throw new CertificationDirectoryError("validation", "교육 방식을 확인해 주세요.");
  }
  if (filters.status && !courseStatuses.has(filters.status)) {
    throw new CertificationDirectoryError("validation", "모집 상태를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("list_public_certification_courses", {
    p_keyword: keyword ?? null,
    p_category: filters.category ?? null,
    p_provider_type: filters.providerType ?? null,
    p_region: region ?? null,
    p_course_method: filters.method ?? null,
    p_recruit_status: filters.status ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parsePublicCertificationCourse);
}

export async function getPublicCertificationCourse(client: SupabaseClient, courseKey: string) {
  const key = courseKey.trim();
  if (!publicKeyPattern.test(key)) {
    throw new CertificationDirectoryError("notFound", "교육과정을 찾을 수 없습니다.");
  }
  const { data, error } = await client.rpc("get_public_certification_course", {
    p_course_key: key,
  });
  if (error) mapError(error);
  return parsePublicCertificationCourse(data);
}

export async function listPublicCertificationExamSchedules(
  client: SupabaseClient,
  filters: CertificationExamFilters = {},
  limit = 24,
  offset = 0,
): Promise<CertificationPage<PublicExamSchedule>> {
  validPage(limit, offset);
  if (filters.examType && !examTypes.has(filters.examType)) {
    throw new CertificationDirectoryError("validation", "시험 유형을 확인해 주세요.");
  }
  if (filters.status && !examStatuses.has(filters.status)) {
    throw new CertificationDirectoryError("validation", "시험 일정 상태를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("list_public_certification_exam_schedules", {
    p_exam_type: filters.examType ?? null,
    p_schedule_status: filters.status ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parsePublicCertificationExamSchedule);
}

export async function listPublicCertificationJobs(
  client: SupabaseClient,
  filters: CertificationJobFilters = {},
  limit = 24,
  offset = 0,
): Promise<CertificationPage<PublicCertificationJob>> {
  validPage(limit, offset);
  const region = normalizeText(filters.region, 80, "지역");
  if (filters.roleType && !jobRoles.has(filters.roleType)) {
    throw new CertificationDirectoryError("validation", "모집 역할을 확인해 주세요.");
  }
  if (filters.status && !jobStatuses.has(filters.status)) {
    throw new CertificationDirectoryError("validation", "모집 상태를 확인해 주세요.");
  }
  const { data, error } = await client.rpc("list_public_certification_jobs", {
    p_role_type: filters.roleType ?? null,
    p_region: region ?? null,
    p_recruit_status: filters.status ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePage(data, parsePublicCertificationJob);
}

export async function getPublicCertificationJob(client: SupabaseClient, jobKey: string) {
  const key = jobKey.trim();
  if (!publicKeyPattern.test(key)) {
    throw new CertificationDirectoryError("notFound", "모집 공고를 찾을 수 없습니다.");
  }
  const { data, error } = await client.rpc("get_public_certification_job", {
    p_job_key: key,
  });
  if (error) mapError(error);
  return parsePublicCertificationJob(data);
}

function parseMutationResult(
  value: unknown,
  keyName: "course_key" | "schedule_key" | "job_key",
  expectedKey: string,
) {
  if (!isObject(value) || !exactKeys(value, [keyName, "publication_status", "version"])) {
    invalidResponse();
  }
  if (
    value[keyName] !== expectedKey ||
    typeof value.publication_status !== "string" ||
    !new Set<CertificationPublicationStatus>(["published", "hidden", "removed"]).has(
      value.publication_status as CertificationPublicationStatus,
    ) ||
    typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1
  ) invalidResponse();
  return {
    key: expectedKey,
    publicationStatus: value.publication_status as CertificationPublicationStatus,
    version: value.version,
  };
}

function normalizedKey(value: string, label: string) {
  const key = value.trim();
  if (!publicKeyPattern.test(key)) {
    throw new CertificationDirectoryError("validation", `${label}를 확인해 주세요.`);
  }
  return key;
}

export async function mutateCertificationCourse(
  client: SupabaseClient,
  operation: CertificationMutationOperation,
  courseKey: string,
  expectedVersion: number | null,
  payload?: CertificationCourseMutationPayload,
) {
  const key = normalizedKey(courseKey, "공개 course key");
  const body = payload
    ? {
        title: payload.title.trim(),
        category: payload.category,
        provider_type: payload.providerType,
        provider_name: payload.providerName.trim(),
        region: payload.region.trim(),
        course_method: payload.method,
        target_text: payload.target.trim(),
        schedule_text: payload.schedule.trim(),
        price_text: payload.price.trim(),
        recruit_status: payload.status,
        description: payload.description.trim(),
        official_url: payload.officialUrl.trim(),
        application_url: payload.applicationUrl?.trim() || null,
        is_featured: payload.featured,
      }
    : {};
  const { data, error } = await client.rpc("mutate_certification_course", {
    p_operation: operation,
    p_course_key: key,
    p_expected_version: expectedVersion,
    p_payload: body,
  });
  if (error) mapError(error);
  return parseMutationResult(data, "course_key", key);
}

export async function mutateCertificationExamSchedule(
  client: SupabaseClient,
  operation: CertificationMutationOperation,
  scheduleKey: string,
  expectedVersion: number | null,
  payload?: CertificationExamMutationPayload,
) {
  const key = normalizedKey(scheduleKey, "공개 schedule key");
  const body = payload
    ? {
        exam_name: payload.examName.trim(),
        exam_type: payload.examType,
        organization_name: payload.organizationName.trim(),
        application_period: payload.applicationPeriod.trim(),
        exam_date_text: payload.examDate.trim(),
        venue_announcement: payload.venueAnnouncement.trim(),
        result_date_text: payload.resultDate.trim(),
        required_items: payload.requiredItems.trim(),
        official_url: payload.officialUrl.trim(),
        schedule_status: payload.status,
      }
    : {};
  const { data, error } = await client.rpc("mutate_certification_exam_schedule", {
    p_operation: operation,
    p_schedule_key: key,
    p_expected_version: expectedVersion,
    p_payload: body,
  });
  if (error) mapError(error);
  return parseMutationResult(data, "schedule_key", key);
}

export async function mutateCertificationJob(
  client: SupabaseClient,
  operation: CertificationMutationOperation,
  jobKey: string,
  expectedVersion: number | null,
  payload?: CertificationJobMutationPayload,
) {
  const key = normalizedKey(jobKey, "공개 job key");
  const body = payload
    ? {
        title: payload.title.trim(),
        role_type: payload.roleType,
        region: payload.region.trim(),
        schedule_text: payload.schedule.trim(),
        role_description: payload.roleDescription.trim(),
        condition_text: payload.condition.trim(),
        pay_text: payload.payInfo.trim(),
        organizer_name: payload.organizerName.trim(),
        organizer_type: payload.organizerType.trim(),
        recruit_status: payload.status,
        official_url: payload.officialUrl?.trim() || null,
        application_url: payload.applicationUrl?.trim() || null,
      }
    : {};
  const { data, error } = await client.rpc("mutate_certification_job", {
    p_operation: operation,
    p_job_key: key,
    p_expected_version: expectedVersion,
    p_payload: body,
  });
  if (error) mapError(error);
  return parseMutationResult(data, "job_key", key);
}
