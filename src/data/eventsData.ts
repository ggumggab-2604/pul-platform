/**
 * TODO:
 * - DB 연동 · 대회 접수/결제
 * - 운영자 수동 등록 CMS
 * - /events/[id] 상세 페이지
 */

export type EventCategoryFilter = "all" | "fieldMatch" | "screenMatch" | "eventReview";

export type MatchType = "field" | "screen";

export type EventScale =
  | "national"
  | "province"
  | "city"
  | "citizen"
  | "senior"
  | "store"
  | "league"
  | "friendly";

export type RegistrationStatus = "open" | "scheduled" | "closed" | "needCheck" | "ended";

export type RecruitmentStatus = "refereeOpen" | "staffOpen" | "volunteerScheduled" | "none";

export type VenueType = "field" | "screen" | "indoor" | "publicCourse" | "privateVenue" | "undecided";

export type EventRelatedMenu = "courses" | "clubs" | "licenseReferee" | "community" | "news";

export type EventItem = {
  id: string;
  title: string;
  matchType: MatchType;
  eventScale: EventScale;
  eventScaleLabel: string;
  region: string;
  venueName: string;
  venueType: VenueType;
  startDate: string;
  endDate?: string;
  registrationStatus: RegistrationStatus;
  targetAudience: string[];
  organizer: string;
  benefits: string[];
  recruitmentStatus: RecruitmentStatus;
  summary: string;
  isFeatured?: boolean;
  relatedCourseId?: string;
  relatedMenu?: EventRelatedMenu;
  tags?: string[];
};

export type QuickFilterState = {
  matchType: string;
  region: string;
  registrationStatus: string;
};

export const matchTypeFilterOptions = ["전체", "필드 시합", "스크린 시합"] as const;

const matchTypeFilterMap: Record<string, MatchType | ""> = {
  "필드 시합": "field",
  "스크린 시합": "screen",
};

export type RegionEventSummary = {
  id: string;
  regionLabel: string;
  upcomingCount: number;
  representativeTitle: string;
  openCount: number;
  needCheckCount: number;
};

export type ScreenTournamentCard = {
  id: string;
  storeName: string;
  region: string;
  tournamentName: string;
  screenEventType: string;
  schedule: string;
  registrationStatus: RegistrationStatus;
  targetAudience: string;
  benefits: string[];
  promoBadge: string;
  summary: string;
};

export type EventReviewCard = {
  id: string;
  title: string;
  tournamentName: string;
  region: string;
  reviewType: string;
  rating: number;
  summary: string;
  authorNickname: string;
  createdAt: string;
};

export type EventInquiryType = {
  id: string;
  title: string;
  description: string;
};

export const EVENTS_PAGE_COPY = {
  title: "파크골프 대회·이벤트",
  description: "필드 대회와 스크린 대회, 참가 신청, 부대행사, 경품, 후기까지 한곳에서 확인하세요.",
  subDescription:
    "대회명, 일정, 개최 장소, 주최, 접수 상태와 함께 혜택/부대행사 정보를 확인하고 심판·운영 모집은 자격증·심판 > 구인구직 메뉴에서 이어서 확인할 수 있습니다.",
  inquiryNote:
    "MVP 단계에서는 문의 기능 대신 UI만 제공합니다. 추후 Google Form, 카카오톡, 이메일 등으로 연결할 예정입니다.",
  inquiryDescription:
    "필드 시합, 스크린 시합, 지역 시합, 심판·운영 모집 정보, 대회 후기, 대회 주변 광고를 PUL에 등록하거나 홍보하고 싶다면 문의해주세요. 운영자가 내용을 확인한 뒤 대회·이벤트 또는 관련 메뉴에 반영할 수 있습니다.",
  disclaimer:
    "PUL 대회·이벤트 정보는 파크골프 대회와 행사를 쉽게 확인할 수 있도록 돕기 위한 정보 제공 영역입니다.\n대회 일정, 접수 기간, 참가 자격, 개최 장소, 주최·주관, 부대행사·혜택, 심판·운영 모집 정보는 변경될 수 있으므로 반드시 공식 기관, 주최 측, 지자체, 협회, 동호회, 업체의 최신 공지를 함께 확인해주세요.\nPUL은 대회 참가 가능 여부, 접수 결과, 행사 진행 여부, 수상 결과, 모집 결과, 경품·혜택 제공 여부, 홍보 효과를 보증하지 않습니다.",
} as const;

export const SCHEDULE_PC_PREVIEW = 6;
export const SCHEDULE_MOBILE_PREVIEW = 4;
export const SCREEN_PC_PREVIEW = 3;
export const SCREEN_MOBILE_PREVIEW = 2;
export const REGION_PC_PREVIEW = 4;
export const REGION_MOBILE_PREVIEW = 3;
export const REVIEW_PC_PREVIEW = 2;
export const REVIEW_MOBILE_PREVIEW = 2;

export const eventCategoryTabs: { id: EventCategoryFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "fieldMatch", label: "필드 시합" },
  { id: "screenMatch", label: "스크린 시합" },
  { id: "eventReview", label: "대회 후기" },
];

export const matchTypeLabels: Record<MatchType, string> = {
  field: "필드 시합",
  screen: "스크린 시합",
};

export const registrationStatusLabels: Record<RegistrationStatus, string> = {
  open: "접수중",
  scheduled: "접수 예정",
  closed: "마감",
  needCheck: "일정 확인 필요",
  ended: "종료",
};

export const recruitmentStatusLabels: Record<RecruitmentStatus, string> = {
  refereeOpen: "심판 모집 있음",
  staffOpen: "운영요원 모집 있음",
  volunteerScheduled: "자원봉사 모집 예정",
  none: "모집 없음",
};

export const regionFilterOptions = [
  "전체",
  "서울",
  "경기",
  "인천",
  "강원",
  "충청",
  "전라",
  "경상",
  "제주",
  "장소 미정",
] as const;

export const registrationFilterOptions = [
  "전체",
  "접수중",
  "접수 예정",
  "마감",
  "종료",
  "일정 확인 필요",
] as const;

const registrationFilterMap: Record<string, RegistrationStatus | ""> = {
  접수중: "open",
  "접수 예정": "scheduled",
  마감: "closed",
  "일정 확인 필요": "needCheck",
  종료: "ended",
};

function matchesCategoryFilter(item: EventItem, category: EventCategoryFilter): boolean {
  if (category === "all") return true;
  if (category === "fieldMatch") return item.matchType === "field";
  if (category === "screenMatch") return item.matchType === "screen";
  return false;
}

function isVenueUndecided(item: EventItem): boolean {
  return item.venueType === "undecided" || item.venueName === "추후 공지";
}

export const targetAudienceLabels: Record<string, string> = {
  beginner: "초보 가능",
  clubMember: "동호인",
  senior: "시니어",
  family: "가족 동반",
  anyone: "누구나",
  athlete: "선수부",
  certifiedOnly: "회원 전용",
  gyeonggiResident: "경기도 거주자",
  goyangCitizen: "고양시민",
  nationalClub: "전국 동호인",
};

export const eventItems: EventItem[] = [
  {
    id: "ev-1",
    title: "2026 전국 생활체육 파크골프대회",
    matchType: "field",
    eventScale: "national",
    eventScaleLabel: "전국대회",
    region: "전국",
    venueName: "추후 공지",
    venueType: "undecided",
    startDate: "2026년 4월 예정",
    registrationStatus: "scheduled",
    targetAudience: ["nationalClub"],
    organizer: "관련 기관 확인 필요",
    benefits: ["참가자 경품 추첨", "장비 시타 부스"],
    recruitmentStatus: "refereeOpen",
    summary: "전국 동호인을 대상으로 하는 필드 파크골프 대회 예시입니다.",
    isFeatured: true,
    relatedMenu: "licenseReferee",
    tags: ["전국", "생활체육"],
  },
  {
    id: "ev-2",
    title: "서울 △△스크린 파크골프 오픈전",
    matchType: "screen",
    eventScale: "store",
    eventScaleLabel: "매장대회",
    region: "서울",
    venueName: "△△스크린 파크골프",
    venueType: "screen",
    startDate: "2026년 3월 예정",
    registrationStatus: "open",
    targetAudience: ["anyone"],
    organizer: "매장 운영사",
    benefits: ["신규 회원 무료 체험", "경품 추첨"],
    recruitmentStatus: "none",
    summary: "신규 스크린 매장에서 진행하는 오픈 기념 스크린 시합입니다.",
    isFeatured: true,
    relatedMenu: "news",
    tags: ["스크린", "오픈"],
  },
  {
    id: "ev-3",
    title: "경기도지사배 파크골프대회",
    matchType: "field",
    eventScale: "province",
    eventScaleLabel: "경기도대회",
    region: "경기",
    venueName: "○○파크골프장",
    venueType: "publicCourse",
    startDate: "2026년 3월 예정",
    registrationStatus: "open",
    targetAudience: ["gyeonggiResident"],
    organizer: "경기도체육회",
    benefits: ["지역상품권 추첨"],
    recruitmentStatus: "staffOpen",
    summary: "경기도 거주자를 대상으로 하는 필드 시합입니다.",
    relatedCourseId: "1",
    relatedMenu: "licenseReferee",
  },
  {
    id: "ev-4",
    title: "고양시민 파크골프 한마당",
    matchType: "field",
    eventScale: "citizen",
    eventScaleLabel: "고양시민대회",
    region: "경기",
    venueName: "고양 ○○파크골프장",
    venueType: "publicCourse",
    startDate: "2026년 3월 22일",
    registrationStatus: "open",
    targetAudience: ["goyangCitizen"],
    organizer: "고양시 체육회",
    benefits: ["가족 체험 가능", "동반자 이벤트"],
    recruitmentStatus: "staffOpen",
    summary: "고양시민을 위한 필드 파크골프 시합입니다.",
    relatedMenu: "courses",
  },
  {
    id: "ev-5",
    title: "충청권 시니어 파크골프대회",
    matchType: "field",
    eventScale: "senior",
    eventScaleLabel: "시니어대회",
    region: "충청",
    venueName: "대전 ○○구장",
    venueType: "field",
    startDate: "2026년 4월 예정",
    registrationStatus: "scheduled",
    targetAudience: ["senior"],
    organizer: "충청권 연합회",
    benefits: ["참가자 경품 추첨", "여행권 추첨"],
    recruitmentStatus: "refereeOpen",
    summary: "시니어 회원을 위한 지역 필드 시합 일정 예시입니다.",
    relatedMenu: "licenseReferee",
  },
  {
    id: "ev-6",
    title: "2026 봄맞이 전국 동호인 대회",
    matchType: "field",
    eventScale: "national",
    eventScaleLabel: "전국대회",
    region: "전국",
    venueName: "지역별 예선 → 본선",
    venueType: "undecided",
    startDate: "2026년 5월 예정",
    registrationStatus: "needCheck",
    targetAudience: ["clubMember", "athlete"],
    organizer: "전국 연합 확인 필요",
    benefits: ["파크골프채 경품", "장비 시타 부스"],
    recruitmentStatus: "refereeOpen",
    summary: "전국 규모 동호인 필드 시합 일정 안내 예시입니다.",
    relatedMenu: "licenseReferee",
  },
  {
    id: "ev-7",
    title: "부산 스크린 파크골프 매장 대회",
    matchType: "screen",
    eventScale: "store",
    eventScaleLabel: "매장대회",
    region: "경상",
    venueName: "부산 △△스크린",
    venueType: "screen",
    startDate: "2026년 3월 예정",
    registrationStatus: "scheduled",
    targetAudience: ["certifiedOnly"],
    organizer: "매장 운영사",
    benefits: ["스크린 체험존 운영", "경품 추첨"],
    recruitmentStatus: "none",
    summary: "스크린 매장 회원 대상 소규모 시합 일정입니다.",
  },
  {
    id: "ev-8",
    title: "인천 가족 파크골프 페스티벌",
    matchType: "field",
    eventScale: "friendly",
    eventScaleLabel: "동호인 친선전",
    region: "인천",
    venueName: "□□파크골프장",
    venueType: "field",
    startDate: "2026년 3월 15일",
    registrationStatus: "open",
    targetAudience: ["family", "beginner"],
    organizer: "인천시 생활체육회",
    benefits: ["가족 체험 가능", "지역상품권 증정", "장비 시타 부스"],
    recruitmentStatus: "none",
    summary: "가족 단위 참여가 가능한 지역 필드 시합입니다.",
    relatedCourseId: "2",
    relatedMenu: "courses",
  },
  {
    id: "ev-9",
    title: "제주 파크골프 시즌 오픈 대회",
    matchType: "field",
    eventScale: "province",
    eventScaleLabel: "제주도대회",
    region: "제주",
    venueName: "제주 ○○파크골프장",
    venueType: "field",
    startDate: "2026년 4월 예정",
    registrationStatus: "scheduled",
    targetAudience: ["clubMember", "senior"],
    organizer: "제주 파크골프협회",
    benefits: ["여행권 추첨", "참가자 경품 추첨"],
    recruitmentStatus: "staffOpen",
    summary: "제주 지역 동호인을 위한 시즌 오픈 필드 시합입니다.",
  },
  {
    id: "ev-10",
    title: "충청 스크린 파크골프 리그",
    matchType: "screen",
    eventScale: "league",
    eventScaleLabel: "스크린 리그전",
    region: "충청",
    venueName: "대전 □□스크린",
    venueType: "screen",
    startDate: "2026년 4월 예정",
    registrationStatus: "open",
    targetAudience: ["clubMember"],
    organizer: "충청 스크린 연합",
    benefits: ["참가자 경품 추첨"],
    recruitmentStatus: "none",
    summary: "지역 스크린 매장 연합 리그 시합 일정 예시입니다.",
  },
];

export const regionEventSummaries: RegionEventSummary[] = [
  {
    id: "rg-1",
    regionLabel: "서울·경기",
    upcomingCount: 4,
    representativeTitle: "고양시민 파크골프 한마당",
    openCount: 3,
    needCheckCount: 0,
  },
  {
    id: "rg-2",
    regionLabel: "충청권",
    upcomingCount: 2,
    representativeTitle: "충청권 시니어 파크골프대회",
    openCount: 0,
    needCheckCount: 1,
  },
  {
    id: "rg-3",
    regionLabel: "전라권",
    upcomingCount: 1,
    representativeTitle: "전라 지역 동호인 친선전",
    openCount: 1,
    needCheckCount: 0,
  },
  {
    id: "rg-4",
    regionLabel: "경상권",
    upcomingCount: 2,
    representativeTitle: "경상 지역 필드 친선대회",
    openCount: 0,
    needCheckCount: 1,
  },
];

export const screenTournamentCards: ScreenTournamentCard[] = [
  {
    id: "scr-1",
    storeName: "△△스크린 파크골프",
    region: "서울",
    tournamentName: "서울 △△스크린 파크골프 오픈전",
    screenEventType: "오픈 기념 시합",
    schedule: "2026년 3월 예정",
    registrationStatus: "open",
    targetAudience: "누구나",
    benefits: ["신규 회원 무료 체험", "경품 추첨"],
    promoBadge: "이벤트",
    summary: "신규 오픈 기념 스크린 시합과 체험 혜택을 함께 제공합니다.",
  },
  {
    id: "scr-2",
    storeName: "부산 △△스크린",
    region: "경상",
    tournamentName: "부산 스크린 파크골프 매장 대회",
    screenEventType: "매장 대회",
    schedule: "2026년 3월 예정",
    registrationStatus: "scheduled",
    targetAudience: "회원 전용",
    benefits: ["스크린 체험존 운영", "경품 추첨"],
    promoBadge: "업체 홍보",
    summary: "매장 회원 대상 스크린 파크골프 시합 일정입니다.",
  },
  {
    id: "scr-3",
    storeName: "대전 □□스크린",
    region: "충청",
    tournamentName: "충청 스크린 파크골프 리그",
    screenEventType: "스크린 리그",
    schedule: "2026년 4월 예정",
    registrationStatus: "open",
    targetAudience: "동호인",
    benefits: ["참가자 경품 추첨"],
    promoBadge: "일반 소식",
    summary: "지역 스크린 매장 연합 리그 시합 일정 예시입니다.",
  },
];

export const eventReviewCards: EventReviewCard[] = [
  {
    id: "rv-1",
    title: "처음 대회 참가 후기",
    tournamentName: "고양시민 파크골프 한마당",
    region: "경기",
    reviewType: "초보 참가 후기",
    rating: 4,
    summary: "처음 대회에 나갔는데 분위기가 편안했고 운영도 친절했습니다.",
    authorNickname: "첫대회참가",
    createdAt: "2026-03-01",
  },
  {
    id: "rv-2",
    title: "전국 대회 현장 분위기",
    tournamentName: "2025 전국 동호인 대회",
    region: "전국",
    reviewType: "참가 후기",
    rating: 5,
    summary: "규모가 크지만 안내가 잘 되어 있어 참가하기 수월했습니다.",
    authorNickname: "동호인B",
    createdAt: "2026-02-28",
  },
  {
    id: "rv-3",
    title: "스크린 시합 첫 참가 소감",
    tournamentName: "서울 △△스크린 파크골프 오픈전",
    region: "서울",
    reviewType: "스크린 시합 후기",
    rating: 4,
    summary: "실외 구장보다 부담 없이 참가할 수 있어 좋았습니다.",
    authorNickname: "스크린러버",
    createdAt: "2026-02-25",
  },
];

export const eventInquiryTypes: EventInquiryType[] = [
  {
    id: "inq-1",
    title: "필드 시합 등록 문의",
    description: "전국·지역 필드 시합 일정과 접수 안내를 등록하고 싶을 때",
  },
  {
    id: "inq-2",
    title: "스크린 시합 홍보 문의",
    description: "스크린 매장 오픈 시합, 매장 대회, 리그 홍보 문의",
  },
  {
    id: "inq-3",
    title: "지역 시합 제보",
    description: "지자체, 협회, 지역 단체 시합 정보를 제보할 때",
  },
  {
    id: "inq-4",
    title: "심판·운영요원 구인 등록",
    description: "대회 운영 인력 구인 공고를 등록하고 자격증·심판 > 구인구직 메뉴와 연동합니다.",
  },
  {
    id: "inq-5",
    title: "대회 후기 제보",
    description: "참가 후기, 운영 후기 등 커뮤니티 연계 제보",
  },
  {
    id: "inq-6",
    title: "대회 주변 광고 문의",
    description: "대회장 주변 맛집, 숙박, 지역 상권 홍보 문의",
  },
];

export function formatBenefits(benefits: string[]): string {
  if (benefits.length === 0 || (benefits.length === 1 && benefits[0] === "없음")) {
    return "없음";
  }
  return benefits.filter((b) => b !== "없음").join(", ");
}

export function formatBenefitsSummary(benefits: string[], max = 2): string {
  const filtered = benefits.filter((b) => b !== "없음");
  if (filtered.length === 0) return "없음";
  if (filtered.length <= max) return filtered.join(", ");
  return `${filtered.slice(0, max).join(", ")} 외 ${filtered.length - max}건`;
}

export function hasRecruitment(status: RecruitmentStatus): boolean {
  return status !== "none";
}

export function filterEventItems(
  items: EventItem[],
  category: EventCategoryFilter,
  filters: QuickFilterState,
): EventItem[] {
  if (category === "eventReview") {
    return [];
  }

  let result = items;

  if (category === "fieldMatch") {
    result = result.filter((item) => item.matchType === "field");
  } else if (category === "screenMatch") {
    result = result.filter((item) => item.matchType === "screen");
  } else if (filters.matchType !== "전체") {
    const type = matchTypeFilterMap[filters.matchType];
    if (type) {
      result = result.filter((item) => item.matchType === type);
    }
  }

  if (filters.region === "장소 미정") {
    result = result.filter((item) => isVenueUndecided(item));
  } else if (filters.region !== "전체") {
    result = result.filter((item) => item.region === filters.region || item.region === "전국");
  }

  if (filters.registrationStatus !== "전체") {
    const status = registrationFilterMap[filters.registrationStatus];
    if (status) {
      result = result.filter((item) => item.registrationStatus === status);
    }
  }

  return result;
}

export function getScheduleItems(items: EventItem[]): EventItem[] {
  return items;
}

export function formatTargetAudience(audiences: string[]) {
  return audiences.map((a) => targetAudienceLabels[a] ?? a).join(", ");
}

export function registrationStatusTone(
  status: RegistrationStatus,
): "point" | "warn" | "muted" | "default" {
  if (status === "open") return "point";
  if (status === "scheduled" || status === "needCheck") return "warn";
  if (status === "closed" || status === "ended") return "muted";
  return "default";
}
