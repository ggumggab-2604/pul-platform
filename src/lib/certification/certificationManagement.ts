import type {
  CourseCategory,
  CourseMethod,
  CourseStatus,
  ExamScheduleStatus,
  ExamType,
  ProviderType,
  RefereeJobRoleType,
} from "@/data/certificationData";
import type {
  CertificationCourseMutationPayload,
  CertificationExamMutationPayload,
  CertificationJobMutationPayload,
} from "@/lib/certification/certificationDirectory";

export type CertificationManagementEntity = "course" | "exam" | "job";
export type CertificationManagementWriteOperation = "create" | "update";
export type CertificationManagementPublicationOperation = "publish" | "hide";

export type CertificationManagementSaveInput =
  | {
      entity: "course";
      operation: CertificationManagementWriteOperation;
      key: string;
      expectedVersion: number | null;
      payload: CertificationCourseMutationPayload;
    }
  | {
      entity: "exam";
      operation: CertificationManagementWriteOperation;
      key: string;
      expectedVersion: number | null;
      payload: CertificationExamMutationPayload;
    }
  | {
      entity: "job";
      operation: CertificationManagementWriteOperation;
      key: string;
      expectedVersion: number | null;
      payload: CertificationJobMutationPayload;
    };

export type CertificationManagementPublicationInput = {
  entity: CertificationManagementEntity;
  operation: CertificationManagementPublicationOperation;
  key: string;
  expectedVersion: number;
};

export class CertificationManagementInputError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = "CertificationManagementInputError";
  }
}

const publicKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const courseCategories = new Set<CourseCategory>([
  "instructor", "referee", "life_sports", "disabled_sports",
  "private_instructor", "private_referee", "completion",
]);
const providerTypes = new Set<ProviderType>([
  "national_exam", "association", "lifelong", "foundation", "private_academy", "online",
]);
const courseMethods = new Set<CourseMethod>(["offline", "online", "hybrid", "theory_practice"]);
const courseStatuses = new Set<CourseStatus>(["recruiting", "accepting", "waiting", "closed"]);
const jobStatuses = new Set<CourseStatus | "planned">([
  "planned", "recruiting", "accepting", "waiting", "closed",
]);
const examTypes = new Set<ExamType>([
  "life_sports", "disabled_sports", "park_instructor", "park_referee",
  "private_instructor", "private_referee",
]);
const examStatuses = new Set<ExamScheduleStatus>([
  "application_planned", "application_open", "application_closed",
  "exam_planned", "venue_planned", "result_planned",
]);
const jobRoles = new Set<RefereeJobRoleType>([
  "referee", "instructor", "staff", "scorer", "assistant",
]);

function invalid(message = "입력한 자격증·심판 운영 정보를 확인해 주세요."): never {
  throw new CertificationManagementInputError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) invalid();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid();
  }
  return value;
}

function text(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "string") invalid(`${label}을 확인해 주세요.`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    invalid(`${label}은 ${minimum}~${maximum}자로 입력해 주세요.`);
  }
  return normalized;
}

function key(value: unknown) {
  if (typeof value !== "string" || !publicKeyPattern.test(value.trim())) {
    invalid("공개 key는 영문·숫자·밑줄·하이픈으로 입력해 주세요.");
  }
  return value.trim();
}

function expectedVersion(operation: CertificationManagementWriteOperation, value: unknown) {
  if (operation === "create") {
    if (value !== null) invalid("신규 등록에는 기존 version을 사용할 수 없습니다.");
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    invalid("현재 version을 확인해 주세요.");
  }
  return value;
}

function dateOnly(value: unknown, label: string) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") invalid(`${label}을 확인해 주세요.`);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) invalid(`${label}을 YYYY-MM-DD로 입력해 주세요.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    invalid(`${label}을 YYYY-MM-DD로 입력해 주세요.`);
  }
  return value;
}

function validateRange(start: string | null, end: string | null, label: string) {
  if (start !== null && end !== null && start > end) {
    invalid(`${label} 종료일은 시작일보다 빠를 수 없습니다.`);
  }
}

function url(value: unknown, label: string, nullable: boolean) {
  if ((value === null || value === "") && nullable) return null;
  if (typeof value !== "string") invalid(`${label}을 확인해 주세요.`);
  const normalized = value.trim();
  if (normalized.length === 0 && nullable) return null;
  if (normalized.length > 500 || /\s/.test(normalized)) invalid(`${label}을 확인해 주세요.`);
  try {
    if (new URL(normalized).protocol !== "https:") invalid(`${label}은 https 주소로 입력해 주세요.`);
  } catch {
    invalid(`${label}을 확인해 주세요.`);
  }
  return normalized;
}

function enumValue<T extends string>(value: unknown, values: Set<T>, label: string): T {
  if (typeof value !== "string" || !values.has(value as T)) invalid(`${label}을 확인해 주세요.`);
  return value as T;
}

function boolean(value: unknown, label: string) {
  if (typeof value !== "boolean") invalid(`${label}을 확인해 주세요.`);
  return value;
}

function parseCoursePayload(value: unknown): CertificationCourseMutationPayload {
  const row = exact(value, [
    "title", "category", "providerType", "providerName", "region", "method", "target",
    "schedule", "price", "status", "description", "officialUrl", "applicationUrl",
    "featured", "startsOn", "endsOn",
  ]);
  const startsOn = dateOnly(row.startsOn, "과정 시작일");
  const endsOn = dateOnly(row.endsOn, "과정 종료일");
  validateRange(startsOn, endsOn, "과정");
  return {
    title: text(row.title, "과정명", 2, 160),
    category: enumValue(row.category, courseCategories, "과정 구분"),
    providerType: enumValue(row.providerType, providerTypes, "교육기관 유형"),
    providerName: text(row.providerName, "교육기관명", 2, 160),
    region: text(row.region, "지역", 1, 80),
    method: enumValue(row.method, courseMethods, "교육 방식"),
    target: text(row.target, "교육 대상", 2, 300),
    schedule: text(row.schedule, "일정 안내", 2, 500),
    price: text(row.price, "비용 안내", 1, 100),
    status: enumValue(row.status, courseStatuses, "모집 상태"),
    description: text(row.description, "과정 설명", 10, 3000),
    officialUrl: url(row.officialUrl, "공식 URL", false) as string,
    applicationUrl: url(row.applicationUrl, "신청 URL", true),
    featured: boolean(row.featured, "추천 여부"),
    startsOn,
    endsOn,
  };
}

function parseExamPayload(value: unknown): CertificationExamMutationPayload {
  const row = exact(value, [
    "examName", "examType", "organizationName", "applicationPeriod", "examDate",
    "venueAnnouncement", "resultDate", "requiredItems", "officialUrl", "status",
    "applicationStartsOn", "applicationEndsOn", "examOn", "resultOn",
  ]);
  const applicationStartsOn = dateOnly(row.applicationStartsOn, "접수 시작일");
  const applicationEndsOn = dateOnly(row.applicationEndsOn, "접수 종료일");
  validateRange(applicationStartsOn, applicationEndsOn, "시험 접수");
  return {
    examName: text(row.examName, "시험명", 2, 180),
    examType: enumValue(row.examType, examTypes, "시험 유형"),
    organizationName: text(row.organizationName, "주관기관", 2, 160),
    applicationPeriod: text(row.applicationPeriod, "접수 기간 안내", 2, 300),
    examDate: text(row.examDate, "시험일 안내", 2, 300),
    venueAnnouncement: text(row.venueAnnouncement, "시험 장소 안내", 2, 500),
    resultDate: text(row.resultDate, "결과 발표 안내", 2, 300),
    requiredItems: text(row.requiredItems, "준비물", 1, 1000),
    officialUrl: url(row.officialUrl, "공식 URL", false) as string,
    status: enumValue(row.status, examStatuses, "시험 일정 상태"),
    applicationStartsOn,
    applicationEndsOn,
    examOn: dateOnly(row.examOn, "시험일"),
    resultOn: dateOnly(row.resultOn, "결과 발표일"),
  };
}

function parseJobPayload(value: unknown): CertificationJobMutationPayload {
  const row = exact(value, [
    "title", "roleType", "region", "schedule", "roleDescription", "condition",
    "payInfo", "organizerName", "organizerType", "status", "officialUrl",
    "applicationUrl", "applicationStartsOn", "applicationEndsOn",
  ]);
  const applicationStartsOn = dateOnly(row.applicationStartsOn, "모집 시작일");
  const applicationEndsOn = dateOnly(row.applicationEndsOn, "모집 종료일");
  validateRange(applicationStartsOn, applicationEndsOn, "구인 모집");
  const officialUrl = url(row.officialUrl, "공식 URL", true);
  const applicationUrl = url(row.applicationUrl, "지원 URL", true);
  if (officialUrl === null && applicationUrl === null) {
    invalid("공식 URL 또는 지원 URL을 하나 이상 입력해 주세요.");
  }
  return {
    title: text(row.title, "구인 제목", 2, 180),
    roleType: enumValue(row.roleType, jobRoles, "모집 역할"),
    region: text(row.region, "지역", 1, 80),
    schedule: text(row.schedule, "일정 안내", 2, 500),
    roleDescription: text(row.roleDescription, "업무 내용", 2, 1500),
    condition: text(row.condition, "지원 조건", 2, 1500),
    payInfo: text(row.payInfo, "보수 안내", 1, 300),
    organizerName: text(row.organizerName, "모집기관명", 2, 160),
    organizerType: text(row.organizerType, "모집기관 유형", 2, 100),
    status: enumValue(row.status, jobStatuses, "모집 상태"),
    officialUrl,
    applicationUrl,
    applicationStartsOn,
    applicationEndsOn,
  };
}

export function parseCertificationManagementSaveInput(
  value: unknown,
): CertificationManagementSaveInput {
  const row = exact(value, ["entity", "operation", "key", "expectedVersion", "payload"]);
  if (row.operation !== "create" && row.operation !== "update") invalid("저장 작업을 확인해 주세요.");
  const operation = row.operation;
  const parsedKey = key(row.key);
  const version = expectedVersion(operation, row.expectedVersion);
  if (row.entity === "course") {
    return { entity: "course", operation, key: parsedKey, expectedVersion: version, payload: parseCoursePayload(row.payload) };
  }
  if (row.entity === "exam") {
    return { entity: "exam", operation, key: parsedKey, expectedVersion: version, payload: parseExamPayload(row.payload) };
  }
  if (row.entity === "job") {
    return { entity: "job", operation, key: parsedKey, expectedVersion: version, payload: parseJobPayload(row.payload) };
  }
  return invalid("관리할 정보 유형을 확인해 주세요.");
}

export function parseCertificationManagementPublicationInput(
  value: unknown,
): CertificationManagementPublicationInput {
  const row = exact(value, ["entity", "operation", "key", "expectedVersion"]);
  if (row.entity !== "course" && row.entity !== "exam" && row.entity !== "job") {
    invalid("관리할 정보 유형을 확인해 주세요.");
  }
  if (row.operation !== "publish" && row.operation !== "hide") {
    invalid("공개 상태 작업을 확인해 주세요.");
  }
  if (typeof row.expectedVersion !== "number" || !Number.isInteger(row.expectedVersion) || row.expectedVersion < 1) {
    invalid("현재 version을 확인해 주세요.");
  }
  return {
    entity: row.entity,
    operation: row.operation,
    key: key(row.key),
    expectedVersion: row.expectedVersion,
  };
}

export function formatCertificationDateOnly(value: string | null) {
  if (value === null) return "미정";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : "확인 필요";
}

export function formatCertificationDateRange(start: string | null, end: string | null) {
  if (start === null && end === null) return "확정 날짜 미정";
  return `${formatCertificationDateOnly(start)} ~ ${formatCertificationDateOnly(end)}`;
}
