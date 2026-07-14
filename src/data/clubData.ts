import type {
  ClubEvent,
  ClubEventRecruitmentStatus,
  ClubEventStatus,
  ClubEventType,
  ClubDetailNotice,
  ClubDetailPost,
  ClubActivityType,
  ClubContentVerificationStatus,
  ClubJoinInquiryAvailableDay,
  ClubJoinApplicationStatus,
  ClubJoinInquiryExperience,
  ClubJoinInquiryInterest,
  ClubJoinInquiryStatus,
  ClubInformationCorrectionStatus,
  ClubMemberStyle,
  ClubOfficialEvent,
  ClubOfficialEventReservationMethod,
  ClubOfficialEventStatus,
  ClubOfficialEventType,
  ClubOperatorVerificationStatus,
  ClubPartnerBannerItem,
  ClubParticipationRequestType,
  ClubProvince,
  ClubRecruitStatus,
  ClubRepresentativePhotoRequestStatus,
  ClubScheduleType,
  ClubDetailData,
  ParkGolfClub,
} from "@/types";

export const CLUB_REGISTER_FORM_URL =
  "https://docs.google.com/forms/d/e/placeholder-club/viewform";

export const CLUB_PARTNER_INQUIRY_URL =
  "https://docs.google.com/forms/d/e/placeholder-partner/viewform";

export const CLUB_PARTNER_INQUIRY_MESSAGE =
  "PUL 동호회 제휴·광고 신청 기능은 준비 중입니다. 정식 오픈 전에는 운영자 확인 후 안내드립니다.";

export const clubPartnerBenefitTags = [
  "해외 라운딩",
  "건강검진",
  "장비 할인",
  "지역 제휴",
] as const;

export const clubPartnerCategoryTags = [
  "여행",
  "건강",
  "장비",
  "레슨",
  "식당",
  "보험",
] as const;

/**
 * TODO: 동호회 제휴·광고 배너 노출
 * - 기초지역 광고 우선 노출
 * - 없으면 광역 광고 노출
 * - 없으면 PUL 기본 배너 노출
 * - 광고 신청/승인/기간 관리
 * - 지역별 광고 통계
 */
export const CLUB_PARTNER_BANNER_TODO = true;

export const clubProvinces: (ClubProvince | "전체")[] = [
  "전체",
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
];

export const clubDistrictsByProvince: Record<
  ClubProvince,
  readonly string[]
> = {
  서울: ["전체", "마포구", "강서구", "송파구", "노원구"],
  경기: ["전체", "고양시", "성남시", "수원시", "부천시", "파주시"],
  인천: ["전체", "연수구", "남동구", "서구"],
  강원: ["전체", "춘천시", "원주시", "강릉시"],
  충북: ["전체", "청주시", "충주시"],
  충남: ["전체", "천안시", "아산시"],
  전북: ["전체", "전주시", "익산시"],
  전남: ["전체", "목포시", "순천시"],
  경북: ["전체", "포항시", "구미시"],
  경남: ["전체", "창원시", "김해시"],
  부산: ["전체", "해운대구", "수영구", "사하구"],
  대구: ["전체", "수성구", "달서구"],
  광주: ["전체", "서구", "북구"],
  대전: ["전체", "유성구", "서구"],
  울산: ["전체", "남구", "중구"],
  제주: ["전체", "제주시", "서귀포시"],
};

export const CLUB_DISTRICT_EMPTY_TITLE =
  "해당 기초지역에 등록된 동호회가 아직 없습니다.";

export const CLUB_DISTRICT_EMPTY_SUBTITLE =
  "광역 전체 동호회를 함께 확인해보세요.";

/** @deprecated use CLUB_DISTRICT_EMPTY_TITLE + SUBTITLE */
export const CLUB_DISTRICT_EMPTY_MESSAGE = `${CLUB_DISTRICT_EMPTY_TITLE} ${CLUB_DISTRICT_EMPTY_SUBTITLE}`;

export function getDistrictsForProvince(province: string) {
  if (province === "전체") return ["전체"] as const;
  return clubDistrictsByProvince[province as ClubProvince] ?? ["전체"];
}

export const clubPartnerBannerSamples: ClubPartnerBannerItem[] = [
  {
    id: "banner-local-mapo",
    title: "마포구 동호회 추천 치과",
    description: "동호회 회원을 위한 임플란트 상담 제휴 준비중",
    bannerType: "local",
    province: "서울",
    district: "마포구",
    category: "임플란트 치과",
    ctaText: "제휴 문의",
  },
  {
    id: "banner-local-yeonsu",
    title: "연수구 동호회 건강검진",
    description: "동호회 회원 대상 건강검진 패키지 제휴 준비중",
    bannerType: "local",
    province: "인천",
    district: "연수구",
    category: "건강검진",
    ctaText: "제휴 문의",
  },
  {
    id: "banner-province-gyeonggi",
    title: "경기 동호회 해외 라운딩",
    description: "동호회 단체 라운딩·여행 제휴 준비중",
    bannerType: "province",
    province: "경기",
    category: "해외 라운딩",
    ctaText: "문의하기",
  },
  {
    id: "banner-province-gangwon",
    title: "강원 동호회 단체 여행",
    description: "지역 동호회 맞춤 여행·버스 대절 제휴 준비중",
    bannerType: "province",
    province: "강원",
    category: "단체 여행",
    ctaText: "문의하기",
  },
  {
    id: "banner-province-chungbuk",
    title: "충북 동호회 레슨 제휴",
    description: "파크골프 레슨·교육 할인 제휴 준비중",
    bannerType: "province",
    province: "충북",
    category: "레슨",
    ctaText: "문의하기",
  },
  {
    id: "banner-default",
    title: "PUL 동호회 제휴 광고",
    description: "여행, 건강, 장비, 지역 서비스를 동호회 회원에게 소개하세요.",
    bannerType: "default",
    province: "전체",
    category: "제휴 광고",
    ctaText: "입점 문의",
  },
];

export const clubPartnerDefaultBanner = clubPartnerBannerSamples.find(
  (banner) => banner.bannerType === "default",
)!;

/**
 * 샘플 배너 우선순위: 기초지역 → 광역 → PUL 기본
 * TODO: 실제 광고 승인·기간·통계 연동
 */
export function resolveClubPartnerBanner(filters: {
  province: string;
  district: string;
}): ClubPartnerBannerItem {
  const { province, district } = filters;

  if (province !== "전체" && district !== "전체") {
    const local = clubPartnerBannerSamples.find(
      (banner) =>
        banner.bannerType === "local" &&
        banner.province === province &&
        banner.district === district,
    );
    if (local) return local;
  }

  if (province !== "전체") {
    const provincial = clubPartnerBannerSamples.find(
      (banner) =>
        banner.bannerType === "province" && banner.province === province,
    );
    if (provincial) return provincial;
  }

  return clubPartnerDefaultBanner;
}

export function getClubBannerPriorityLabel(banner: ClubPartnerBannerItem) {
  if (banner.bannerType === "local") return "1순위 · 기초지역 제휴 배너";
  if (banner.bannerType === "province") return "2순위 · 광역지역 제휴 배너";
  return "3순위 · PUL 기본 배너";
}

export const clubPartnerBanners = {
  benefits: {
    slot: "club-partner-benefits",
    title: "PUL 동호회 추천 혜택",
    description:
      "해외 라운딩, 건강검진, 장비 할인, 지역 제휴 서비스를 준비하고 있습니다.",
    buttonLabel: "제휴 문의",
  },
  partnership: {
    slot: "club-partner-ad",
    title: "동호회 제휴·광고 영역 준비중",
    description:
      "동호회 회원에게 필요한 여행, 건강, 장비, 지역 서비스를 소개할 예정입니다.",
    buttonLabel: "입점 문의",
  },
} as const;

export const CLUB_JOIN_APPLICATION_MESSAGE =
  "가입 신청 후 동호회 회장 또는 운영진 승인 후 이용할 수 있습니다. 정식 오픈 전에는 운영자가 확인 후 동호회에 전달하는 방식으로 운영됩니다.";

export const CLUB_MINI_BOARD_APPROVAL_MESSAGE =
  "동호회 미니게시판은 동호회 회장 또는 운영진의 승인 후 이용 가능합니다.";

export const CLUB_MINI_SPACE_NOTICE =
  "정식 오픈 후 승인된 회원만 이용할 수 있습니다.";

export const clubIntroText =
  "가까운 파크골프 동호회를 찾고, 가입 정보와 월례회·친선전·정기 라운드 일정을 확인하세요. 동호회 행사는 대회·이벤트가 아니라 각 동호회 활동 정보로 관리됩니다.";

export const CLUB_PAGE_DISCLAIMER =
  "PUL 동호회 정보는 지역 동호회를 찾고 활동 정보를 확인할 수 있도록 돕기 위한 안내 영역입니다. 월례회, 친선전, 정기 라운드 일정과 모집 상태는 동호회 운영 상황에 따라 변경될 수 있으므로 반드시 동호회 공지를 함께 확인해주세요.";

export const CLUB_EVENTS_VS_TOURNAMENTS_NOTE =
  "동호회 월례회, 친선전, 정기 라운드는 동호회 활동 정보로 관리됩니다. 전국·지역 공식 대회와 스크린 대회는 대회·이벤트 메뉴에서 확인할 수 있습니다.";

/** 동호회 상세 페이지 확장용 탭 (향후 /clubs/[id]) */
export const CLUB_DETAIL_TABS = [
  { id: "intro", label: "소개" },
  { id: "join", label: "가입 안내" },
  { id: "notice", label: "공지사항" },
  { id: "board", label: "자유게시판" },
  { id: "events", label: "행사·월례회" },
  { id: "photos", label: "사진/후기" },
  { id: "inquiry", label: "문의" },
] as const;

export const CLUB_EVENT_PC_PREVIEW = 4;
export const CLUB_EVENT_MOBILE_PREVIEW = 3;
/** 모바일 첫 화면: 추천 동호회 */
export const CLUB_FEATURED_MOBILE_PREVIEW = 4;
/** 모바일 첫 화면: 최근 모집글 */
export const CLUB_RECRUIT_MOBILE_PREVIEW = 3;

export const clubEventTypeLabels: Record<ClubEventType, string> = {
  monthlyMeeting: "월례회",
  friendlyMatch: "친선전",
  regularRound: "정기 라운드",
  memberEvent: "회원 행사",
  casualRound: "번개 라운드",
};

export const clubEventRecruitmentLabels: Record<ClubEventRecruitmentStatus, string> = {
  open: "참가 가능",
  membersOnly: "회원 전용",
  inquiryNeeded: "문의 필요",
  closed: "마감",
  needCheck: "일정 확인 필요",
};

export const clubOfficialEventTypeLabels: Record<ClubOfficialEventType, string> = {
  monthlyMeeting: "정기 월례회",
  clubTournament: "동호회 대회",
  screenTournament: "스크린 대회",
  friendlyMatch: "공식 친선 경기",
  outing: "야유회",
  yearEndParty: "송년회",
  newYearEvent: "신년회",
  generalMeeting: "정기총회",
  training: "교육·레슨",
  other: "기타 공식 행사",
};

export const clubOfficialEventStatusLabels: Record<ClubOfficialEventStatus, string> = {
  draft: "일정 준비 중",
  scheduled: "참가 접수 예정",
  registrationOpen: "참가 접수 중",
  registrationClosed: "참가 마감",
  completed: "일정 완료",
  cancelled: "일정 취소",
};

export const clubOfficialEventReservationMethodLabels: Record<
  ClubOfficialEventReservationMethod,
  string
> = {
  individualSynchronized: "회원 개별 동시 예약",
  clubGroupBooking: "운영진 단체 예약",
  walkIn: "현장 선착순 이용",
  noReservation: "별도 예약 없이 이용",
  checking: "예약 방식 확인 중",
};

export const clubPostTypeLabels: Record<ClubDetailPost["postType"], string> = {
  general: "자유글",
  flashMeeting: "번개 모임",
  companion: "같이 가요",
  question: "질문",
  roundReview: "라운드 후기",
  eventReview: "모임 후기",
  information: "정보 공유",
};

export const clubPostRecruitmentStatusLabels: Record<
  NonNullable<ClubDetailPost["recruitmentStatus"]>,
  string
> = {
  recruiting: "모집 중",
  full: "모집 완료",
  closed: "모집 마감",
  completed: "모임 완료",
  cancelled: "취소",
};

export const clubNoticeTypeLabels: Record<ClubDetailNotice["noticeType"], string> = {
  general: "일반 안내",
  schedule: "일정 안내",
  rule: "운영 규칙",
  urgent: "긴급 안내",
  event: "행사 안내",
  closure: "휴회·휴장",
};

export const clubNoticeImportanceLabels: Record<
  Exclude<ClubDetailNotice["importance"], "normal">,
  string
> = {
  important: "중요",
  urgent: "긴급",
};

export const clubActivityTypeLabels: Record<ClubActivityType, string> = {
  monthlyMeeting: "정기 월례회",
  tournament: "공식 대회",
  friendlyMatch: "친선 경기",
  screenEvent: "스크린 대회",
  outing: "야유회·총회",
  training: "교육·레슨",
  communityEvent: "봉사·지역 행사",
  other: "기타 활동",
};

export const clubContentVerificationLabels: Record<
  ClubContentVerificationStatus,
  string
> = {
  unverified: "확인 중",
  operatorVerified: "운영진 확인",
  adminVerified: "관리자 확인",
  rejected: "확인 반려",
};

export const clubParticipationRequestTypeLabels: Record<
  ClubParticipationRequestType,
  string
> = {
  informationCorrection: "정보 수정 제보",
  representativePhoto: "대표사진 등록 요청",
  operatorVerification: "운영자 인증 신청",
};

export const clubInformationCorrectionStatusLabels: Record<
  ClubInformationCorrectionStatus,
  string
> = {
  received: "제보 접수",
  reviewing: "확인 중",
  needsEvidence: "추가 확인 필요",
  accepted: "반영 완료",
  partiallyAccepted: "일부 반영",
  rejected: "반영 어려움",
  withdrawn: "제보 취소",
};

export const clubRepresentativePhotoRequestStatusLabels: Record<
  ClubRepresentativePhotoRequestStatus,
  string
> = {
  received: "요청 접수",
  reviewing: "확인 중",
  needsRightsReview: "권리·동의 확인 필요",
  accepted: "대표사진 반영",
  rejected: "반영 어려움",
  withdrawn: "요청 취소",
};

export const clubOperatorVerificationStatusLabels: Record<
  ClubOperatorVerificationStatus,
  string
> = {
  received: "신청 접수",
  identityChecking: "본인 확인 중",
  clubChecking: "동호회 확인 중",
  additionalInfoRequired: "추가 확인 필요",
  approved: "인증 승인",
  rejected: "인증 어려움",
  revoked: "권한 회수",
  withdrawn: "신청 취소",
};

export const clubEventStatusLabels: Record<ClubEventStatus, string> = {
  monthlyMeeting: "월례회 운영중",
  regularRound: "정기 라운드 있음",
  friendlyMatch: "친선전 예정",
  memberEvent: "회원 행사 있음",
  none: "행사 정보 없음",
};

export const clubEventOperationFilters = [
  { label: "전체", value: "all" },
  { label: "월례회 있음", value: "monthlyMeeting" },
  { label: "친선전 있음", value: "friendlyMatch" },
  { label: "정기 라운드 있음", value: "regularRound" },
  { label: "초보 행사 있음", value: "beginnerEvent" },
  { label: "회원 행사 있음", value: "memberEvent" },
  { label: "행사 정보 없음", value: "none" },
] as const;

export const clubEvents: ClubEvent[] = [
  {
    id: "ce-1",
    title: "3월 정기 월례회",
    eventType: "monthlyMeeting",
    clubName: "한강 시민 파크골프 동호회",
    region: "서울",
    courseName: "한강 시민공원 파크골프장",
    dateText: "2026년 3월 예정",
    participationCondition: "해당 동호회 회원",
    recruitmentStatus: "membersOnly",
    summary: "정기 월례회와 친목 라운드를 함께 진행합니다.",
    relatedClubId: "1",
    tags: ["월례회", "회원"],
  },
  {
    id: "ce-2",
    title: "봄맞이 동호회 친선전",
    eventType: "friendlyMatch",
    clubName: "송도 파크골프 클럽",
    region: "인천",
    courseName: "송도 센트럴 스크린 파크",
    dateText: "2026년 3월 예정",
    participationCondition: "가입 신청자 참여 가능",
    recruitmentStatus: "open",
    summary: "신규 회원과 기존 회원이 함께 참여하는 친선 행사입니다.",
    relatedClubId: "3",
    tags: ["친선전", "신규회원"],
  },
  {
    id: "ce-3",
    title: "초보 회원 정기 라운드",
    eventType: "regularRound",
    clubName: "춘천 소양강 파크골프회",
    region: "강원",
    courseName: "춘천 소양강 파크골프장",
    dateText: "매주 토요일 오전",
    participationCondition: "초보 회원 가능",
    recruitmentStatus: "inquiryNeeded",
    summary: "초보 회원을 위한 정기 라운드와 기본 매너 안내가 함께 진행됩니다.",
    relatedClubId: "5",
    tags: ["초보", "정기라운드"],
  },
  {
    id: "ce-4",
    title: "주중 번개 라운드",
    eventType: "casualRound",
    clubName: "제주 올레 파크골프 동호회",
    region: "제주",
    courseName: "제주 올레 파크골프장",
    dateText: "수시 공지",
    participationCondition: "해당 동호회 회원",
    recruitmentStatus: "needCheck",
    summary: "동호회 게시판에서 수시로 공지되는 번개 라운드입니다.",
    relatedClubId: "8",
    tags: ["번개", "회원"],
  },
];

/** 운영진이 등록하는 공식 일정. 예약 원본 정보는 linkedCourseId의 골프장 데이터에 둡니다. */
export const clubOfficialEvents: ClubOfficialEvent[] = [
  {
    id: "coe-1-monthly-2026-08",
    relatedClubId: "1",
    officialEventType: "monthlyMeeting",
    officialEventStatus: "scheduled",
    title: "8월 정기 월례회",
    scheduledForLabel: "2026년 8월 예정",
    scheduleDetail: "세부 일정 확인 중",
    applicationDeadlineLabel: "일정 확정 후 안내",
    reservationOpenLabel: "예약 정보 확인 중",
    participationStatus: "upcoming",
    participantVisibility: "membersMasked",
    linkedCourseId: "1",
    location: "집결 장소 확인 중",
    participantTarget: "해당 동호회 회원",
    reservationMethod: "individualSynchronized",
    memberReservationGuidance: "참가 회원은 예약 오픈 시간에 같은 시간대로 개별 예약해 주세요.",
    postReservationGuidance: "예약 완료 후 참가 신청에서 예약 완료 여부를 체크해 주세요.",
    organizerGuidance: "정확한 이용일과 예약 오픈 정보는 확인 후 운영진 공지로 안내합니다.",
    createdByRole: "clubAdmin",
    visibility: "clubMembers",
    moderationStatus: "visible",
    notificationEnabled: false,
  },
];

/** 기존 회원 모임 예시를 공식 일정과 분리해 게시판 글로 변환합니다. */
export const clubDetailPosts: ClubDetailPost[] = [
  {
    id: "cp-1-flash-2026-07-18",
    relatedClubId: "1",
    postType: "flashMeeting",
    title: "이번 토요일 오전 번개 라운딩",
    startsAt: "2026-07-18T09:00:00+09:00",
    endsAt: "2026-07-18T11:30:00+09:00",
    capacity: 8,
    participantCount: 5,
    linkedCourseId: "1",
    location: "1번 코스 입구",
    participantTarget: "동호회 회원",
    contentSummary: "가볍게 두 바퀴 라운딩한 뒤 현장에서 마무리합니다.",
    authorRole: "member",
    recruitmentStatus: "recruiting",
    visibility: "clubMembers",
    moderationStatus: "visible",
    postStatus: "published",
  },
  {
    id: "cp-1-companion-2026-07-20",
    relatedClubId: "1",
    postType: "companion",
    title: "7월 20일 오전 같이 가실 분",
    startsAt: "2026-07-20T08:30:00+09:00",
    endsAt: "2026-07-20T11:00:00+09:00",
    capacity: 4,
    participantCount: 2,
    linkedCourseId: "1",
    location: "매표소 앞",
    participantTarget: "초보 회원 환영",
    contentSummary: "천천히 연습 라운딩하실 회원 두 분을 기다립니다.",
    authorRole: "member",
    recruitmentStatus: "recruiting",
    visibility: "clubMembers",
    moderationStatus: "visible",
    postStatus: "published",
  },
];

export const clubRegisterNotes = [
  "우리 동호회를 PUL에 등록할 수 있습니다.",
  "월례회, 공지사항, 회원 모집 정보를 노출할 수 있습니다.",
  "초기에는 운영자가 확인 후 수동 등록합니다.",
  "동호회 등록 신청 후 PUL 운영자가 확인합니다.",
  "승인된 동호회는 PUL 내 동호회 미니공간을 만들 수 있습니다.",
  "미니공간에는 공지사항, 자유게시판, 월례회 안내를 운영할 수 있습니다.",
  "회원 접근은 동호회장 또는 운영진 승인 방식으로 운영될 예정입니다.",
];

export const clubMiniSpaceItems = [
  { id: "notice", label: "공지사항", icon: "news" as const },
  { id: "free", label: "자유게시판", icon: "chat" as const },
  { id: "meeting", label: "월례회 안내", icon: "calendar" as const },
  { id: "members", label: "회원 전용 공간", icon: "users" as const },
];

/**
 * TODO: 향후 확장
 * - 동호회 가입 신청 데이터 저장
 * - 동호회장/운영진 승인 기능
 * - 승인 회원 전용 미니게시판
 * - 동호회별 공지사항 작성
 * - 동호회별 자유게시판 작성
 * - 월례회/정기모임 공지
 * - 활동 구장 상세 페이지 연결
 * - 운영자 승인 후 동호회 공간 자동 생성
 */
export const CLUB_FUTURE_FEATURES_TODO = true;

export function getHomeCourseHref(homeCourseId: string) {
  return `/courses/${homeCourseId}`;
}

export const clubHomeCourses = [
  { label: "전체", value: "all" },
  { label: "한강 시민공원 파크골프장", value: "한강 시민공원 파크골프장" },
  { label: "수원 화성 파크골프장", value: "수원 화성 파크골프장" },
  { label: "송도 센트럴 스크린 파크", value: "송도 센트럴 스크린 파크" },
  { label: "대전 엑스포 파크골프장", value: "대전 엑스포 파크골프장" },
  { label: "춘천 소양강 파크골프장", value: "춘천 소양강 파크골프장" },
  { label: "부산 해운대 스크린 파크", value: "부산 해운대 스크린 파크" },
  { label: "전주 한옥마을 파크골프장", value: "전주 한옥마을 파크골프장" },
  { label: "제주 올레 파크골프장", value: "제주 올레 파크골프장" },
  { label: "분당 시니어 스크린 파크", value: "분당 시니어 스크린 파크" },
  { label: "청주 무심천 파크골프장", value: "청주 무심천 파크골프장" },
] as const;

export const clubRecruitStatuses = [
  { label: "전체", value: "all" },
  { label: "모집중", value: "recruiting" },
  { label: "대기중", value: "waiting" },
  { label: "모집마감", value: "closed" },
] as const;

export const clubScheduleTypes = [
  { label: "전체", value: "all" },
  { label: "평일", value: "weekday" },
  { label: "주말", value: "weekend" },
  { label: "평일+주말", value: "both" },
] as const;

export const clubMemberStyles = [
  { label: "전체", value: "all" },
  { label: "초보 환영", value: "beginner" },
  { label: "여성 환영", value: "women" },
  { label: "시니어 중심", value: "senior" },
  { label: "가족 모임", value: "family" },
  { label: "대회 준비", value: "competition" },
] as const;

export const recruitStatusLabels: Record<ClubRecruitStatus, string> = {
  recruiting: "모집중",
  waiting: "대기중",
  closed: "모집마감",
};

export const clubDetailRecruitStatusLabels: Record<ClubRecruitStatus, string> = {
  recruiting: "회원 모집 중",
  waiting: "가입 문의",
  closed: "현재 모집 마감",
};

export const clubJoinInquiryStatusLabels: Record<ClubJoinInquiryStatus, string> = {
  received: "문의 접수",
  reviewing: "운영자 확인 중",
  replied: "운영자 안내 완료",
  approved: "가입 승인",
  onHold: "보류",
  rejected: "가입 어려움",
  withdrawn: "신청 취소",
};

export const clubJoinApplicationStatusLabels: Record<
  ClubJoinApplicationStatus,
  string
> = {
  draft: "작성 중",
  submitted: "신청 접수",
  reviewing: "운영진 확인 중",
  additionalInfoRequired: "추가 확인 필요",
  interviewRequested: "운영진 상담 예정",
  approved: "가입 승인",
  waitlisted: "대기",
  rejected: "가입 어려움",
  withdrawn: "신청 취소",
};

export const clubJoinInquiryExperienceOptions: ReadonlyArray<{
  value: ClubJoinInquiryExperience;
  label: string;
}> = [
  { value: "beginner", label: "처음 시작" },
  { value: "underOneYear", label: "1년 미만" },
  { value: "oneToThreeYears", label: "1년 이상 3년 미만" },
  { value: "overThreeYears", label: "3년 이상" },
];

export const clubJoinInquiryAvailableDayOptions: ReadonlyArray<{
  value: ClubJoinInquiryAvailableDay;
  label: string;
}> = [
  { value: "weekday", label: "평일" },
  { value: "weekend", label: "주말" },
  { value: "both", label: "평일·주말 모두" },
  { value: "flexible", label: "일정에 따라 가능" },
];

export const clubJoinInquiryInterestOptions: ReadonlyArray<{
  value: ClubJoinInquiryInterest;
  label: string;
}> = [
  { value: "regularRound", label: "정기 라운딩" },
  { value: "friendlyMatch", label: "친선 경기" },
  { value: "screenPractice", label: "스크린 연습" },
  { value: "beginnerEducation", label: "초보자 교육" },
  { value: "clubEvent", label: "동호회 행사" },
];

export const recruitStatusStyles: Record<ClubRecruitStatus, string> = {
  recruiting: "bg-emerald-100 text-emerald-800",
  waiting: "bg-amber-50 text-amber-800",
  closed: "bg-gray-100 text-pul-muted",
};

export const scheduleTypeLabels: Record<ClubScheduleType, string> = {
  weekday: "평일",
  weekend: "주말",
  both: "평일+주말",
};

export const memberStyleLabels: Record<ClubMemberStyle, string> = {
  beginner: "초보 환영",
  women: "여성 환영",
  senior: "시니어 중심",
  family: "가족 모임",
  competition: "대회 준비",
};

type ClubNoticeDisplayMetadata = Pick<
  ClubDetailNotice,
  "noticeType" | "importance" | "visibility"
>;

/** 기존 공지 제목에 명시적으로 연결된 상세 표시 메타데이터입니다. */
const clubNoticeMetadataByTitle: Record<string, ClubNoticeDisplayMetadata> = {
  "3월 정기 모임 일정 안내": {
    noticeType: "schedule",
    importance: "important",
    visibility: "public",
  },
  "신규 회원 오리엔테이션 3/15": {
    noticeType: "general",
    importance: "normal",
    visibility: "clubMembers",
  },
  "봄맞이 친선 경기 안내": {
    noticeType: "event",
    importance: "normal",
    visibility: "public",
  },
  "4월 회원 대기 명단 접수": {
    noticeType: "general",
    importance: "important",
    visibility: "clubMembers",
  },
  "봄 시즌 개장 안내": {
    noticeType: "general",
    importance: "normal",
    visibility: "public",
  },
  "5월 송도 오픈 대회 참가 신청": {
    noticeType: "event",
    importance: "important",
    visibility: "public",
  },
  "여성회원 모집 공지": {
    noticeType: "general",
    importance: "normal",
    visibility: "public",
  },
  "봄 시즌 정기 모임 일정": {
    noticeType: "schedule",
    importance: "important",
    visibility: "public",
  },
  "신규 멘토 모집": {
    noticeType: "general",
    importance: "normal",
    visibility: "clubMembers",
  },
  "4월 봄나들이 라운딩": {
    noticeType: "event",
    importance: "important",
    visibility: "public",
  },
  "신규 회원 환영회": {
    noticeType: "event",
    importance: "normal",
    visibility: "clubMembers",
  },
  "2026 시즌 모집 마감": {
    noticeType: "closure",
    importance: "important",
    visibility: "public",
  },
  "전국 대회 일정 공유": {
    noticeType: "event",
    importance: "normal",
    visibility: "clubMembers",
  },
  "여성 입문반 4월 개강": {
    noticeType: "schedule",
    importance: "important",
    visibility: "public",
  },
  "대기 명단 순번 안내": {
    noticeType: "general",
    importance: "normal",
    visibility: "clubMembers",
  },
  "봄 제주 오픈 행사": {
    noticeType: "event",
    importance: "important",
    visibility: "public",
  },
  "관광객 회원 안내": {
    noticeType: "general",
    importance: "normal",
    visibility: "public",
  },
  "시니어 입문반 4월 모집": {
    noticeType: "schedule",
    importance: "important",
    visibility: "public",
  },
  "건강검진 연계 프로그램": {
    noticeType: "general",
    importance: "normal",
    visibility: "clubMembers",
  },
  "가족의 날 5월 일정": {
    noticeType: "event",
    importance: "important",
    visibility: "public",
  },
  "대기 명단 안내": {
    noticeType: "general",
    importance: "normal",
    visibility: "clubMembers",
  },
};

const defaultClubNoticeMetadata: ClubNoticeDisplayMetadata = {
  noticeType: "general",
  importance: "normal",
  visibility: "public",
};

export const parkGolfClubs: ParkGolfClub[] = [
  {
    id: "1",
    name: "한강 시민 파크골프 동호회",
    province: "서울",
    district: "마포구",
    regionLabel: "서울 > 마포구",
    homeCourse: "한강 시민공원 파크골프장",
    homeCourseId: "1",
    memberCount: 48,
    schedule: "weekend",
    scheduleLabel: "토·일",
    time: "오전 9:00 ~ 12:00",
    recruitStatus: "recruiting",
    beginnerFriendly: true,
    memberStyles: ["beginner", "senior"],
    tags: ["초보환영", "주말정기", "한강"],
    description:
      "한강 시민공원을 중심으로 정기 라운딩과 친선 활동을 진행하는 동호회입니다. 초보 회원도 기존 회원과 함께 편안하게 적응할 수 있도록 운영합니다.",
    detailSummary: "한강 시민공원을 중심으로 활동하는 친목형 파크골프 동호회입니다.",
    leaderName: "김정호 (회장)",
    feeInfo: "연회비 3만원 (장비 대여 별도)",
    joinConditions: "파크골프 입문 경험 3회 이상, 매너 준수",
    beginnerGuide: "첫 2회는 선배 회원 동행 라운딩으로 진행합니다.",
    mainActivities: ["주말 정기 라운딩", "친선 경기", "지역 동호회 교류 활동"],
    activityAtmosphere: ["초보자도 함께 참여 가능", "회원 간 배려와 친목 중심"],
    meetingInfo: "매월 둘째 주 토요일 오전 10시 월례회 (한강 시민공원 클럽하우스)",
    notices: [
      "3월 정기 모임 일정 안내",
      "신규 회원 오리엔테이션 3/15",
      "봄맞이 친선 경기 안내",
    ],
    contactMethod: "가입 문의 신청 후 운영자가 개별 안내합니다.",
    recentEvent: "2월 친선전 완료",
    nextMonthlyMeeting: "3월 예정",
    eventStatus: "monthlyMeeting",
    featured: true,
  },
  {
    id: "2",
    name: "수원 화성 파크골프회",
    province: "경기",
    district: "수원시",
    regionLabel: "경기 > 수원시",
    homeCourse: "수원 화성 파크골프장",
    homeCourseId: "2",
    memberCount: 36,
    schedule: "both",
    scheduleLabel: "화·목·토",
    time: "오후 2:00 ~ 5:00",
    recruitStatus: "waiting",
    beginnerFriendly: true,
    memberStyles: ["beginner", "family"],
    tags: ["가족모임", "경기서부"],
    description:
      "수원 화성 파크골프장을 기반으로 활동하는 지역 동호회입니다. 가족 단위 참여를 환영합니다.",
    leaderName: "이미경 (총무)",
    feeInfo: "연회비 2만원",
    joinConditions: "만 14세 이상, 동호회 규정 준수",
    beginnerGuide: "입문자 대상 그룹 레슨을 분기별 1회 진행합니다.",
    mainActivities: ["평일 저녁 연습", "주말 라운딩", "가족의 날 행사"],
    meetingInfo: "매월 셋째 주 목요일 오후 7시 정기모임 (수원 화성 파크골프장)",
    notices: ["4월 회원 대기 명단 접수", "봄 시즌 개장 안내"],
    contactMethod: "이메일 문의 (club-suwon@example.com)",
    recentEvent: "1월 가족 라운드 완료",
    nextMonthlyMeeting: "4월 예정",
    eventStatus: "friendlyMatch",
  },
  {
    id: "3",
    name: "송도 파크골프 클럽",
    province: "인천",
    district: "연수구",
    regionLabel: "인천 > 연수구",
    homeCourse: "송도 센트럴 스크린 파크",
    homeCourseId: "3",
    memberCount: 29,
    schedule: "weekday",
    scheduleLabel: "수·금",
    time: "오전 10:00 ~ 12:30",
    recruitStatus: "recruiting",
    beginnerFriendly: false,
    memberStyles: ["competition", "women"],
    tags: ["여성환영", "대회준비"],
    description:
      "송도 지역에서 활동하는 실력 향상 중심 동호회입니다. 대회 참가를 목표로 하는 회원들이 많습니다.",
    leaderName: "박소연 (운영진)",
    feeInfo: "연회비 4만원 + 대회비 별도",
    joinConditions: "핸디캡 32 이하 또는 동호회 심사",
    beginnerGuide: "입문자는 별도 입문반 동호회를 안내해 드립니다.",
    mainActivities: ["평일 스크린 연습", "시·도 대회 참가", "실력 향상 클리닉"],
    meetingInfo: "매월 첫째 주 금요일 오후 6시 월례회 (송도 센트럴 스크린 파크)",
    notices: ["5월 송도 오픈 대회 참가 신청", "여성회원 모집 공지"],
    contactMethod: "PUL 문의 폼 (준비 중)",
    recentEvent: "2월 실력향상 클리닉 완료",
    nextMonthlyMeeting: "3월 친선전 예정",
    eventStatus: "friendlyMatch",
    featured: true,
  },
  {
    id: "4",
    name: "대전 엑스포 파크골프 동호회",
    province: "대전",
    district: "유성구",
    regionLabel: "대전 > 유성구",
    homeCourse: "대전 엑스포 파크골프장",
    homeCourseId: "4",
    memberCount: 42,
    schedule: "weekend",
    scheduleLabel: "토·일",
    time: "오전 8:30 ~ 11:30",
    recruitStatus: "recruiting",
    beginnerFriendly: true,
    memberStyles: ["beginner", "senior"],
    tags: ["충청대표", "초보환영"],
    description:
      "대전·충청 지역 회원이 함께하는 동호회로, 정기 라운딩과 지역 대회 참가를 활발히 진행합니다.",
    leaderName: "최동진 (회장)",
    feeInfo: "연회비 2.5만원",
    joinConditions: "지역 거주 또는 직장 소재지 충청권",
    beginnerGuide: "신규 회원 1:1 멘토 배정 프로그램 운영",
    mainActivities: ["주말 정기 라운딩", "충청권 연합 대회", "월례회"],
    meetingInfo: "매월 넷째 주 토요일 오전 9시 월례회 (대전 엑스포 파크골프장)",
    notices: ["봄 시즌 정기 모임 일정", "신규 멘토 모집"],
    contactMethod: "카카오톡 채널 (준비 중)",
    recentEvent: "2월 월례회 완료",
    nextMonthlyMeeting: "3월 예정",
    eventStatus: "monthlyMeeting",
  },
  {
    id: "5",
    name: "춘천 소양강 파크골프회",
    province: "강원",
    district: "춘천시",
    regionLabel: "강원 > 춘천시",
    homeCourse: "춘천 소양강 파크골프장",
    homeCourseId: "5",
    memberCount: 33,
    schedule: "both",
    scheduleLabel: "목·토",
    time: "오전 9:30 ~ 12:00",
    recruitStatus: "recruiting",
    beginnerFriendly: true,
    memberStyles: ["beginner", "senior", "family"],
    tags: ["강원", "자연친화"],
    description:
      "소양강변 파크골프장에서 활동하는 강원 대표 동호회입니다. 여유로운 분위기 속에서 꾸준히 모입니다.",
    leaderName: "강민수 (회장)",
    feeInfo: "연회비 2만원",
    joinConditions: "파크골프 기본 규칙 이해",
    beginnerGuide: "입문자 환영 주간(매월 첫째 주) 운영",
    mainActivities: ["정기 라운딩", "강원권 연합 모임", "계절 행사"],
    meetingInfo: "매월 둘째 주 목요일 오전 10시 정기모임 (춘천 소양강 파크골프장)",
    notices: ["4월 봄나들이 라운딩", "신규 회원 환영회"],
    contactMethod: "전화 문의 (033-000-0000)",
    recentEvent: "2월 정기 라운드 완료",
    nextMonthlyMeeting: "매주 토요일",
    eventStatus: "regularRound",
    featured: true,
  },
  {
    id: "6",
    name: "부산 해운대 파크골프 동호회",
    province: "부산",
    district: "해운대구",
    regionLabel: "부산 > 해운대구",
    homeCourse: "부산 해운대 스크린 파크",
    homeCourseId: "6",
    memberCount: 51,
    schedule: "weekend",
    scheduleLabel: "토·일",
    time: "오전 7:30 ~ 10:30",
    recruitStatus: "closed",
    beginnerFriendly: false,
    memberStyles: ["competition", "senior"],
    tags: ["경남권", "대회준비"],
    description:
      "부산·경남 지역 실력자들이 모이는 동호회입니다. 대회 준비와 실전 연습을 중심으로 활동합니다.",
    leaderName: "윤태호 (회장)",
    feeInfo: "연회비 5만원",
    joinConditions: "추천 2인 이상 또는 심사 통과",
    beginnerGuide: "입문자는 6개월 후 재신청 가능",
    mainActivities: ["주말 실전 라운딩", "전국 대회 참가", "실력 향상반"],
    meetingInfo: "매월 첫째 주 일요일 오전 8시 월례회 (부산 해운대 스크린 파크)",
    notices: ["2026 시즌 모집 마감", "전국 대회 일정 공유"],
    contactMethod: "PUL 문의 (대기)",
    recentEvent: "전국 대회 참가 완료",
    nextMonthlyMeeting: "모집 마감",
    eventStatus: "none",
    featured: true,
  },
  {
    id: "7",
    name: "전주 한옥마을 파크골프회",
    province: "전북",
    district: "전주시",
    regionLabel: "전북 > 전주시",
    homeCourse: "전주 한옥마을 파크골프장",
    homeCourseId: "7",
    memberCount: 27,
    schedule: "weekday",
    scheduleLabel: "화·목",
    time: "오후 1:00 ~ 4:00",
    recruitStatus: "waiting",
    beginnerFriendly: true,
    memberStyles: ["beginner", "women", "senior"],
    tags: ["전북", "여성환영"],
    description:
      "전주 지역 회원 중심의 친목 동호회입니다. 여성 회원 비율이 높고 편안한 분위기로 활동합니다.",
    leaderName: "한지영 (운영진)",
    feeInfo: "연회비 2만원",
    joinConditions: "전북 지역 거주 우대",
    beginnerGuide: "여성 입문반 별도 운영 (격월 1회)",
    mainActivities: ["평일 정기 모임", "여성회원 친선전", "지역 봉사 라운딩"],
    meetingInfo: "매월 셋째 주 화요일 오후 2시 정기모임 (전주 한옥마을 파크골프장)",
    notices: ["여성 입문반 4월 개강", "대기 명단 순번 안내"],
    contactMethod: "카카오톡 (운영자 확인 후)",
    recentEvent: "2월 여성 친선전 완료",
    nextMonthlyMeeting: "3월 예정",
    eventStatus: "monthlyMeeting",
  },
  {
    id: "8",
    name: "제주 올레 파크골프 동호회",
    province: "제주",
    district: "제주시",
    regionLabel: "제주 > 제주시",
    homeCourse: "제주 올레 파크골프장",
    homeCourseId: "8",
    memberCount: 38,
    schedule: "both",
    scheduleLabel: "수·토",
    time: "오전 9:00 ~ 12:00",
    recruitStatus: "recruiting",
    beginnerFriendly: true,
    memberStyles: ["beginner", "family", "senior"],
    tags: ["제주", "관광객환영"],
    description:
      "제주에 거주하거나 정기적으로 방문하는 회원들의 동호회입니다. 아름다운 제주 구장에서 함께합니다.",
    leaderName: "고영철 (회장)",
    feeInfo: "연회비 3만원 (도민 할인)",
    joinConditions: "제주 거주 또는 월 1회 이상 방문 가능",
    beginnerGuide: "제주 첫 방문 회원 오리엔테이션 제공",
    mainActivities: ["정기 라운딩", "계절 축제", "관광 연계 모임"],
    meetingInfo: "매월 둘째 주 수요일 오전 10시 월례회 (제주 올레 파크골프장)",
    notices: ["봄 제주 오픈 행사", "관광객 회원 안내"],
    contactMethod: "이메일 (jeju-olle@example.com)",
    recentEvent: "2월 번개 라운드 2회",
    nextMonthlyMeeting: "수시 공지",
    eventStatus: "memberEvent",
  },
  {
    id: "9",
    name: "분당 시니어 파크골프회",
    province: "경기",
    district: "성남시",
    regionLabel: "경기 > 성남시",
    homeCourse: "분당 시니어 스크린 파크",
    homeCourseId: "9",
    memberCount: 45,
    schedule: "weekday",
    scheduleLabel: "월·수·금",
    time: "오전 10:00 ~ 12:00",
    recruitStatus: "recruiting",
    beginnerFriendly: true,
    memberStyles: ["senior", "beginner"],
    tags: ["시니어", "경기남부"],
    description:
      "50세 이상 시니어 회원 중심의 동호회입니다. 건강과 친목을 목표로 꾸준히 모입니다.",
    leaderName: "정우식 (회장)",
    feeInfo: "연회비 2만원",
    joinConditions: "만 50세 이상",
    beginnerGuide: "시니어 입문반 매주 금요일 운영",
    mainActivities: ["평일 정기 연습", "시니어 대회", "건강 체조"],
    meetingInfo: "매월 첫째 주 수요일 오전 11시 월례회 (분당 시니어 스크린 파크)",
    notices: ["시니어 입문반 4월 모집", "건강검진 연계 프로그램"],
    contactMethod: "전화 문의 (031-000-0000)",
    recentEvent: "2월 시니어 대회 완료",
    nextMonthlyMeeting: "3월 예정",
    eventStatus: "monthlyMeeting",
  },
  {
    id: "10",
    name: "청주 무심천 파크골프 동호회",
    province: "충북",
    district: "청주시",
    regionLabel: "충북 > 청주시",
    homeCourse: "청주 무심천 파크골프장",
    homeCourseId: "10",
    memberCount: 31,
    schedule: "weekend",
    scheduleLabel: "토·일",
    time: "오후 2:00 ~ 5:00",
    recruitStatus: "waiting",
    beginnerFriendly: true,
    memberStyles: ["beginner", "family"],
    tags: ["충북", "가족모임"],
    description:
      "청주 무심천 일대에서 활동하는 지역 동호회입니다. 가족 단위 참여와 친목 활동을 중시합니다.",
    leaderName: "오세진 (총무)",
    feeInfo: "연회비 2만원",
    joinConditions: "충북 지역 거주 또는 직장",
    beginnerGuide: "가족 입문 프로그램 분기 1회",
    mainActivities: ["주말 라운딩", "가족의 날", "지역 연합 대회"],
    meetingInfo: "매월 넷째 주 일요일 오후 3시 정기모임 (청주 무심천 파크골프장)",
    notices: ["가족의 날 5월 일정", "대기 명단 안내"],
    contactMethod: "PUL 문의 폼 (준비 중)",
    recentEvent: "1월 가족의 날 완료",
    nextMonthlyMeeting: "5월 예정",
    eventStatus: "friendlyMatch",
  },
];

const clubNoticeImportanceRank: Record<ClubDetailNotice["importance"], number> = {
  urgent: 0,
  important: 1,
  normal: 2,
};

const clubRecentActivityTypeByTitle: Record<string, ClubActivityType> = {
  "2월 친선전 완료": "friendlyMatch",
  "1월 가족 라운드 완료": "other",
  "2월 실력향상 클리닉 완료": "training",
  "2월 월례회 완료": "monthlyMeeting",
  "2월 정기 라운드 완료": "other",
  "전국 대회 참가 완료": "tournament",
  "2월 여성 친선전 완료": "friendlyMatch",
  "2월 번개 라운드 2회": "other",
  "2월 시니어 대회 완료": "tournament",
  "1월 가족의 날 완료": "communityEvent",
};

/** 목록 기본정보를 단일 기준으로 사용해 상세페이지 데이터를 구성합니다. */
export function getClubDetailData(id: string): ClubDetailData | undefined {
  const club = parkGolfClubs.find((item) => item.id === id);
  if (!club) return undefined;

  const officialEvents = clubOfficialEvents.filter(
    (event) => event.relatedClubId === club.id && event.moderationStatus === "visible",
  );
  const posts = clubDetailPosts.filter(
    (post) =>
      post.relatedClubId === club.id &&
      post.moderationStatus === "visible" &&
      (post.postStatus === "published" || post.postStatus === "edited"),
  );
  const notices = (club.notices ?? [])
    .map((title, index): ClubDetailNotice => {
      const metadata = clubNoticeMetadataByTitle[title] ?? defaultClubNoticeMetadata;
      return {
        id: `${club.id}-notice-${index + 1}`,
        clubId: club.id,
        title,
        ...metadata,
        status: "published",
      };
    })
    .filter((notice) => notice.status === "published")
    .sort((left, right) => {
      const importanceDifference =
        clubNoticeImportanceRank[left.importance] -
        clubNoticeImportanceRank[right.importance];
      if (importanceDifference !== 0) return importanceDifference;

      const leftPublishedAt = left.publishedAt
        ? Date.parse(left.publishedAt)
        : 0;
      const rightPublishedAt = right.publishedAt
        ? Date.parse(right.publishedAt)
        : 0;
      return rightPublishedAt - leftPublishedAt;
    });
  const recentActivityMonth = club.recentEvent?.match(/^(\d+월)/)?.[1];
  const recentActivitySummary = club.recentEvent?.includes("친선")
    ? "인근 동호회와 친선 경기 진행"
    : "동호회 활동 이력";

  /** PC·모바일 공통 단일 소스 — 뷰포트별 하드코딩 데이터 금지 */
  return {
    club,
    officialEvents,
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
    notices,
    posts,
    photos: [],
    recentActivities:
      club.recentEvent && club.recentEvent !== "최근 행사 없음"
        ? [
            {
              id: `${club.id}-recent-1`,
              clubId: club.id,
              activityType: clubRecentActivityTypeByTitle[club.recentEvent] ?? "other",
              title: club.recentEvent,
              summary: recentActivitySummary,
              occurredAtLabel: recentActivityMonth,
              visibility: "public",
              verificationStatus: "unverified",
              moderationStatus: "visible",
            },
          ]
        : [],
    contact: {
      role: club.leaderName ? "대표·운영진" : undefined,
      name: club.leaderName || undefined,
      availableTime: "문의 가능 시간 확인 중",
      method: club.contactMethod || "동호회에 문의",
      region: club.regionLabel,
    },
  };
}

export const featuredClubs = parkGolfClubs.filter((club) => club.featured);
