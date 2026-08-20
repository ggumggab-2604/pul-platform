import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ClubDetailData,
  ClubProvince,
  ClubRecruitStatus,
  ParkGolfClub,
} from "@/types";

export const clubRegions = [
  "서울",
  "경기",
  "인천",
  "충북",
  "충남",
  "강원",
  "전북",
  "전남",
  "경북",
  "경남",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "제주",
] as const satisfies readonly ClubProvince[];

export type PublicClub = {
  publicKey: string;
  name: string;
  region: ClubProvince | null;
  district: string | null;
  regionLabel: string;
  summary: string | null;
  recruitmentStatus: ClubRecruitStatus;
  createdAt: string;
};

export type PublicClubFilters = {
  keyword?: string;
  region?: ClubProvince;
  district?: string;
  recruitmentStatus?: ClubRecruitStatus;
};

export type PublicClubPage = {
  items: PublicClub[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type ClubRegistrationInput = {
  name: string;
  region: ClubProvince;
  district: string;
  summary: string;
  recruitmentStatus: ClubRecruitStatus;
};

export type ClubRegistrationResult = PublicClub & {
  requestId: string;
  replayed: boolean;
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
const registrationKeys = [
  "request_id",
  "public_key",
  "name",
  "region",
  "district",
  "region_label",
  "summary",
  "recruitment_status",
  "created_at",
  "replayed",
] as const;
const publicKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const regionSet = new Set<ClubProvince>(clubRegions);
const recruitmentStatusSet = new Set<ClubRecruitStatus>([
  "recruiting",
  "waiting",
  "closed",
]);

export class ClubDirectoryError extends Error {
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
  ) {
    super(userMessage);
    this.name = "ClubDirectoryError";
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
  throw new ClubDirectoryError(
    "unknown",
    "동호회 공개 응답 형식이 올바르지 않습니다.",
  );
}

function parsePublicClubObject(value: JsonObject): PublicClub {
  if (!exactKeys(value, publicClubKeys)) invalidResponse();
  if (
    typeof value.public_key !== "string" ||
    !publicKeyPattern.test(value.public_key) ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    !(value.region === null || (typeof value.region === "string" && regionSet.has(value.region as ClubProvince))) ||
    !(value.district === null || typeof value.district === "string") ||
    typeof value.region_label !== "string" ||
    value.region_label.length < 1 ||
    !(value.summary === null || typeof value.summary === "string") ||
    typeof value.recruitment_status !== "string" ||
    !recruitmentStatusSet.has(value.recruitment_status as ClubRecruitStatus) ||
    typeof value.created_at !== "string" ||
    !Number.isFinite(Date.parse(value.created_at))
  ) invalidResponse();

  return {
    publicKey: value.public_key,
    name: value.name,
    region: value.region as ClubProvince | null,
    district: value.district,
    regionLabel: value.region_label,
    summary: value.summary,
    recruitmentStatus: value.recruitment_status as ClubRecruitStatus,
    createdAt: value.created_at,
  };
}

export function parsePublicClub(value: unknown): PublicClub {
  if (!isObject(value)) invalidResponse();
  return parsePublicClubObject(value);
}

export function parsePublicClubPage(value: unknown): PublicClubPage {
  if (
    !isObject(value) ||
    !exactKeys(value, ["items", "total", "limit", "offset", "has_more"]) ||
    !Array.isArray(value.items) ||
    typeof value.total !== "number" ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0 ||
    typeof value.limit !== "number" ||
    !Number.isSafeInteger(value.limit) ||
    value.limit < 1 ||
    value.limit > 30 ||
    typeof value.offset !== "number" ||
    !Number.isSafeInteger(value.offset) ||
    value.offset < 0 ||
    typeof value.has_more !== "boolean"
  ) invalidResponse();

  return {
    items: value.items.map(parsePublicClub),
    total: value.total,
    limit: value.limit,
    offset: value.offset,
    hasMore: value.has_more,
  };
}

function mapError(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  if (/로그인/.test(message)) {
    throw new ClubDirectoryError("authentication", "로그인이 필요합니다.");
  }
  if (/활성 계정|권한/.test(message)) {
    throw new ClubDirectoryError("permission", "활성 계정인 회원만 동호회를 등록할 수 있습니다.");
  }
  if (/동일한 request ID|처리 중/.test(message)) {
    throw new ClubDirectoryError("conflict", message);
  }
  if (/찾을 수 없습니다/.test(message)) {
    throw new ClubDirectoryError("notFound", "동호회를 찾을 수 없습니다.");
  }
  if (/확인해 주세요|이하여야|이상|지원하지 않는/.test(message)) {
    throw new ClubDirectoryError("validation", message);
  }
  if (/fetch|network/i.test(message)) {
    throw new ClubDirectoryError(
      "network",
      "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  }
  throw new ClubDirectoryError(
    "unknown",
    "동호회 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

function normalizeFilters(filters: PublicClubFilters): PublicClubFilters {
  const keyword = filters.keyword?.trim() || undefined;
  const district = filters.district?.trim() || undefined;
  if (keyword && keyword.length > 100) {
    throw new ClubDirectoryError("validation", "검색어는 100자 이하로 입력해 주세요.");
  }
  if (filters.region && !regionSet.has(filters.region)) {
    throw new ClubDirectoryError("validation", "지역을 확인해 주세요.");
  }
  if (district && district.length > 80) {
    throw new ClubDirectoryError("validation", "활동 지역은 80자 이하로 입력해 주세요.");
  }
  if (filters.recruitmentStatus && !recruitmentStatusSet.has(filters.recruitmentStatus)) {
    throw new ClubDirectoryError("validation", "회원 모집 상태를 확인해 주세요.");
  }
  return { keyword, region: filters.region, district, recruitmentStatus: filters.recruitmentStatus };
}

function validPage(limit: number, offset: number) {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 30 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new ClubDirectoryError("validation", "페이지 범위를 확인해 주세요.");
  }
}

export async function listPublicClubs(
  client: SupabaseClient,
  filters: PublicClubFilters = {},
  limit = 24,
  offset = 0,
) {
  validPage(limit, offset);
  const normalized = normalizeFilters(filters);
  const { data, error } = await client.rpc("list_public_clubs", {
    p_keyword: normalized.keyword ?? null,
    p_region: normalized.region ?? null,
    p_district: normalized.district ?? null,
    p_recruitment_status: normalized.recruitmentStatus ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) mapError(error);
  return parsePublicClubPage(data);
}

export async function getPublicClub(client: SupabaseClient, publicKey: string) {
  const normalized = publicKey.trim();
  if (!publicKeyPattern.test(normalized)) {
    throw new ClubDirectoryError("notFound", "동호회를 찾을 수 없습니다.");
  }
  const { data, error } = await client.rpc("get_public_club", {
    p_public_key: normalized,
  });
  if (error) mapError(error);
  if (data === null) {
    throw new ClubDirectoryError("notFound", "동호회를 찾을 수 없습니다.");
  }
  return parsePublicClub(data);
}

function normalizeRegistrationInput(input: ClubRegistrationInput) {
  const normalized = {
    name: input.name.trim(),
    region: input.region,
    district: input.district.trim(),
    summary: input.summary.trim(),
    recruitmentStatus: input.recruitmentStatus,
  };
  if (normalized.name.length < 2 || normalized.name.length > 80) {
    throw new ClubDirectoryError("validation", "동호회명은 2자 이상 80자 이하로 입력해 주세요.");
  }
  if (!regionSet.has(normalized.region)) {
    throw new ClubDirectoryError("validation", "활동 지역을 확인해 주세요.");
  }
  if (normalized.district.length < 1 || normalized.district.length > 80) {
    throw new ClubDirectoryError("validation", "시·군·구 또는 활동 지역을 80자 이하로 입력해 주세요.");
  }
  if (normalized.summary.length < 10 || normalized.summary.length > 500) {
    throw new ClubDirectoryError("validation", "동호회 소개는 10자 이상 500자 이하로 입력해 주세요.");
  }
  if (!recruitmentStatusSet.has(normalized.recruitmentStatus)) {
    throw new ClubDirectoryError("validation", "회원 모집 상태를 확인해 주세요.");
  }
  return normalized;
}

export async function registerClub(
  client: SupabaseClient,
  requestId: string,
  input: ClubRegistrationInput,
): Promise<ClubRegistrationResult> {
  if (!uuidPattern.test(requestId)) {
    throw new ClubDirectoryError("validation", "동호회 등록 request ID를 확인해 주세요.");
  }
  const normalized = normalizeRegistrationInput(input);
  const { data, error } = await client.rpc("register_club", {
    p_request_id: requestId,
    p_payload: {
      name: normalized.name,
      region: normalized.region,
      district: normalized.district,
      summary: normalized.summary,
      recruitment_status: normalized.recruitmentStatus,
    },
  });
  if (error) mapError(error);
  if (!isObject(data) || !exactKeys(data, registrationKeys)) invalidResponse();
  const publicClub = parsePublicClubObject({
    public_key: data.public_key,
    name: data.name,
    region: data.region,
    district: data.district,
    region_label: data.region_label,
    summary: data.summary,
    recruitment_status: data.recruitment_status,
    created_at: data.created_at,
  });
  if (
    data.request_id !== requestId ||
    typeof data.replayed !== "boolean"
  ) invalidResponse();
  return { ...publicClub, requestId, replayed: data.replayed };
}

export function createPublicClubDetailData(club: PublicClub): ClubDetailData {
  const directoryClub: ParkGolfClub = {
    id: club.publicKey,
    name: club.name,
    province: club.region ?? "서울",
    district: club.district ?? "",
    regionLabel: club.regionLabel,
    homeCourse: "주 활동 골프장 정보 미등록",
    homeCourseId: "",
    memberCount: 0,
    schedule: "both",
    scheduleLabel: "정기 활동 정보 미등록",
    time: "시간 미등록",
    recruitStatus: club.recruitmentStatus,
    beginnerFriendly: false,
    memberStyles: [],
    tags: [],
    description: club.summary ?? "동호회 소개가 아직 등록되지 않았습니다.",
    detailSummary: club.summary ?? undefined,
    leaderName: "",
    feeInfo: "",
    joinConditions: "",
    beginnerGuide: "",
    mainActivities: [],
    activityAtmosphere: [],
    meetingInfo: "",
    notices: [],
    contactMethod: "PUL 가입 문의 또는 가입 신청 이용",
    recentEvent: "",
    nextMonthlyMeeting: "",
    eventStatus: "none",
    directoryDataAvailability: {
      homeCourse: false,
      schedule: false,
      memberCount: false,
    },
  };

  return {
    club: directoryClub,
    officialEvents: [],
    participationContext: {
      featureAvailability: "preparing",
      authenticationStatus: "unavailable",
      viewerRole: "unknown",
      canManageParticipants: false,
    },
    joinInquiryContext: {
      featureAvailability: "preparing",
      authenticationStatus: "unavailable",
      viewerRole: "unknown",
      canSubmit: false,
      canWithdraw: false,
      canManage: false,
    },
    joinApplicationContext: {
      featureAvailability: "preparing",
      authenticationStatus: "unavailable",
      viewerRole: "unknown",
      isClubMember: false,
      canSubmit: false,
      canWithdraw: false,
      canManage: false,
    },
    participationRequestContext: {
      featureAvailability: "preparing",
      authenticationStatus: "unavailable",
      viewerRole: "unknown",
      canSubmit: false,
      canWithdraw: false,
      canManage: false,
    },
    notices: [],
    posts: [],
    photos: [],
    recentActivities: [],
    contact: {
      method: "PUL 가입 문의 또는 가입 신청 이용",
      region: club.regionLabel,
    },
  };
}
