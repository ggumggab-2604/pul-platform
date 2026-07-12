/**
 * TODO:
 * - PUL 운영자 수동 등록/관리 백엔드 연동
 * - /news/[id] 상세 페이지
 * - 소식 제보·홍보 문의 폼 (Google Form, 카카오톡, 이메일 등)
 * - 회원 권한·글쓰기
 */

export type NewsCategory =
  | "parkGolfNews"
  | "screenParkGolf"
  | "equipmentBrand"
  | "noticeOperation";

export type NewsCategoryFilter = "all" | NewsCategory;

export type NewsSourceType =
  | "adminVerified"
  | "officialNotice"
  | "memberReport"
  | "organizationNotice"
  | "brandPromotion";

export type NewsStatus = "published" | "checking" | "scheduled";

export type NewsItem = {
  id: string;
  title: string;
  category: NewsCategory;
  summary: string;
  region: string;
  sourceType: NewsSourceType;
  publishedAt: string;
  viewCount: number;
  commentCount: number;
  isFeatured: boolean;
  status: NewsStatus;
  relatedLinkType?: string;
  tags?: string[];
};

export type ScreenParkGolfNewsType =
  | "screenNewOpen"
  | "openEvent"
  | "freeTrial"
  | "startupBriefing"
  | "franchiseRecruitment"
  | "screenTournament"
  | "storePromotion"
  | "vendorPromotion";

export type ScreenParkGolfPromotionBadge =
  | "general"
  | "vendorPromotion"
  | "adPlanned"
  | "event";

export type ScreenParkGolfItem = {
  id: string;
  businessName: string;
  region: string;
  newsType: ScreenParkGolfNewsType;
  title: string;
  summary: string;
  eventPeriod: string;
  features: string[];
  promotionBadge: ScreenParkGolfPromotionBadge;
  category: "screenParkGolf";
};

export type EquipmentPromotionBadge = "general" | "vendorPromotion" | "adPlanned" | "event";

export type EquipmentNewsType =
  | "newProduct"
  | "brandIntro"
  | "trialRecruitment"
  | "discountEvent"
  | "fittingEvent"
  | "vendorPromotion"
  | "marketEntry";

export type EquipmentBrandItem = {
  id: string;
  brandName: string;
  newsType: EquipmentNewsType;
  title: string;
  summary: string;
  promotionBadge: EquipmentPromotionBadge;
  primaryButtonLabel: string;
  secondaryButtonLabel: string;
  category: "equipmentBrand";
};

export type RelatedMenuLink = {
  id: string;
  title: string;
  description: string;
  examples: string[];
  buttonLabel: string;
  href: string;
};

export const NEWS_PAGE_COPY = {
  title: "파크골프 뉴스·정보",
  description:
    "PUL 운영자가 확인한 공식 소식, 정책·규정 안내, 행사 소식, 브랜드·업체 소식, 제보 기반 기사를 모았습니다.",
  subDescription:
    "회원 자유 글은 커뮤니티에서 확인하세요. 뉴스·정보는 운영자·기관·업체 중심의 확인된 정보를 제공합니다.",
  introGuideBox: {
    title: "파크골프를 처음 시작하시나요?",
    description:
      "신규 오픈 구장, 스크린 파크골프장, 대회·행사, 자격증·심판, 대학·학과, 장비·브랜드 소식을 확인할 수 있습니다.",
    buttonLabel: "입문 가이드 보러가기",
    href: "/lessons",
  },
  disclaimer:
    "PUL 뉴스·정보는 파크골프 관련 소식과 홍보 정보를 쉽게 확인할 수 있도록 돕기 위한 정보 제공 영역입니다.\n신규 구장, 스크린 파크골프장, 대회 일정, 자격증 시험, 대학 모집, 상품 정보, 업체 홍보 내용 등은 변경될 수 있으므로 반드시 공식 기관, 지자체, 협회, 학교, 업체의 최신 공지를 함께 확인해주세요.\nPUL은 각 소식의 결과, 참가 가능 여부, 자격 인정, 모집 여부, 상품 구매 결과, 업체 홍보 효과를 보증하지 않습니다.",
  inquiryNote:
    "MVP 단계에서는 실제 제출 폼 대신 안내만 제공합니다. 추후 Google Form, 카카오톡, 이메일 등으로 연결할 예정입니다.",
} as const;

export const LATEST_NEWS_PREVIEW = 5;
export const LATEST_NEWS_MOBILE_PREVIEW = 3;
export const SCREEN_PARK_GOLF_MOBILE_PREVIEW = 3;
export const EQUIPMENT_BRAND_MOBILE_PREVIEW = 2;

export const newsCategoryTabs: { id: NewsCategoryFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "parkGolfNews", label: "행사·대회 소식" },
  { id: "screenParkGolf", label: "스크린·업체 소식" },
  { id: "equipmentBrand", label: "브랜드·업체 소식" },
  { id: "noticeOperation", label: "정책·운영 안내" },
];

export const categoryLabels: Record<NewsCategory, string> = {
  parkGolfNews: "파크골프 소식",
  screenParkGolf: "스크린 파크골프",
  equipmentBrand: "장비·브랜드",
  noticeOperation: "공지·운영",
};

export const sourceTypeLabels: Record<NewsSourceType, string> = {
  adminVerified: "PUL 운영자 확인",
  officialNotice: "지자체 공지 참고",
  organizationNotice: "협회/기관 안내 참고",
  memberReport: "회원 제보 확인",
  brandPromotion: "업체 홍보 문의",
};

export const screenParkGolfTypeLabels: Record<ScreenParkGolfNewsType, string> = {
  screenNewOpen: "스크린 신규 오픈",
  openEvent: "오픈 이벤트",
  freeTrial: "무료 체험",
  startupBriefing: "창업 설명회",
  franchiseRecruitment: "가맹 모집",
  screenTournament: "스크린 대회",
  storePromotion: "매장 홍보",
  vendorPromotion: "업체 홍보",
};

export const screenParkGolfBadgeLabels: Record<ScreenParkGolfPromotionBadge, string> = {
  general: "일반 소식",
  vendorPromotion: "업체 홍보",
  adPlanned: "광고 예정",
  event: "이벤트",
};

export const equipmentNewsTypeLabels: Record<EquipmentNewsType, string> = {
  newProduct: "신제품 출시",
  brandIntro: "브랜드 소개",
  trialRecruitment: "체험단 모집",
  discountEvent: "할인 행사",
  fittingEvent: "시타 행사",
  vendorPromotion: "업체 홍보",
  marketEntry: "장터 입점 안내",
};

export const equipmentBadgeLabels: Record<EquipmentPromotionBadge, string> = {
  general: "일반 소식",
  vendorPromotion: "업체 홍보",
  adPlanned: "광고 예정",
  event: "이벤트",
};

export const reportInquiryTypes = [
  {
    id: "park-news",
    title: "파크골프 소식 제보",
    description: "지역 소식, 운영 공지, 커뮤니티 정보",
  },
  {
    id: "screen-promotion",
    title: "스크린 파크골프 홍보 문의",
    description: "스크린 오픈, 이벤트, 홍보 소식",
  },
  {
    id: "equipment",
    title: "장비·브랜드 홍보 문의",
    description: "신제품, 체험단, 할인 행사 등",
  },
  {
    id: "event",
    title: "대회·이벤트 제보",
    description: "대회, 동호회 행사, 체험 행사 일정",
  },
  {
    id: "license",
    title: "자격증·심판 소식 제보",
    description: "시험, 연수, 심판 모집 관련 소식",
  },
  {
    id: "university",
    title: "대학·학과 소식 등록",
    description: "모집, 학과 활동, 게시판 개설 소식",
  },
] as const;

export const newsItems: NewsItem[] = [
  {
    id: "news-1",
    title: "경기 ○○파크골프장 신규 오픈 예정 소식",
    category: "parkGolfNews",
    summary: "신규 조성된 파크골프장이 시범 운영을 준비 중입니다.",
    region: "경기",
    sourceType: "officialNotice",
    publishedAt: "2026-03-01",
    viewCount: 342,
    commentCount: 8,
    isFeatured: true,
    status: "published",
    relatedLinkType: "공식 안내 확인 필요",
    tags: ["신규 오픈", "구장"],
  },
  {
    id: "news-2",
    title: "파크골프 지도자·심판 자격 준비 체크리스트",
    category: "parkGolfNews",
    summary: "필기, 실기, 구술, 연수 준비 시 확인할 내용을 정리했습니다.",
    region: "전국",
    sourceType: "adminVerified",
    publishedAt: "2026-02-28",
    viewCount: 276,
    commentCount: 6,
    isFeatured: true,
    status: "published",
    tags: ["자격증", "심판"],
  },
  {
    id: "news-3",
    title: "브랜드 신제품 시타 이벤트 소식",
    category: "equipmentBrand",
    summary: "신제품 파크골프채와 공 시타 이벤트를 소개합니다.",
    region: "전국",
    sourceType: "brandPromotion",
    publishedAt: "2026-02-27",
    viewCount: 221,
    commentCount: 4,
    isFeatured: true,
    status: "published",
  },
  {
    id: "news-4",
    title: "전국 파크골프 동호인 참가 추세와 지역 활성화 소식",
    category: "parkGolfNews",
    summary: "지역별 동호회 활동과 대회 참여 흐름을 정리했습니다.",
    region: "전국",
    sourceType: "adminVerified",
    publishedAt: "2026-02-26",
    viewCount: 189,
    commentCount: 4,
    isFeatured: false,
    status: "published",
  },
  {
    id: "news-5",
    title: "지자체 파크골프장 조성 관련 소식 모음",
    category: "parkGolfNews",
    summary: "신규 조성 계획과 추진 현황을 정리했습니다.",
    region: "전국",
    sourceType: "officialNotice",
    publishedAt: "2026-02-25",
    viewCount: 156,
    commentCount: 3,
    isFeatured: false,
    status: "checking",
    relatedLinkType: "공식 공지 확인 필요",
  },
  {
    id: "news-6",
    title: "PUL 뉴스·정보 운영 공지 및 반영 기준 안내",
    category: "noticeOperation",
    summary: "소식 반영 기준과 확인 절차를 안내합니다.",
    region: "전국",
    sourceType: "adminVerified",
    publishedAt: "2026-02-24",
    viewCount: 122,
    commentCount: 1,
    isFeatured: false,
    status: "published",
  },
  {
    id: "news-7",
    title: "서울 △△스크린 파크골프 신규 오픈 예정",
    category: "screenParkGolf",
    summary: "실내에서 파크골프를 체험할 수 있는 신규 스크린 매장 소식입니다.",
    region: "서울",
    sourceType: "memberReport",
    publishedAt: "2026-02-23",
    viewCount: 134,
    commentCount: 5,
    isFeatured: false,
    status: "checking",
    relatedLinkType: "업체 안내 확인 필요",
  },
];

export const screenParkGolfItems: ScreenParkGolfItem[] = [
  {
    id: "screen-1",
    businessName: "△△스크린 파크골프",
    region: "서울",
    newsType: "screenNewOpen",
    title: "서울 △△스크린 파크골프 신규 오픈 예정",
    summary: "실내에서 파크골프를 체험할 수 있는 신규 스크린 매장입니다.",
    eventPeriod: "오픈 예정일: 2026년 3월 예정",
    features: ["스크린 타석", "실내 레슨룸", "야간 운영 예정"],
    promotionBadge: "vendorPromotion",
    category: "screenParkGolf",
  },
  {
    id: "screen-2",
    businessName: "◇◇스크린 파크골프",
    region: "대구",
    newsType: "openEvent",
    title: "신규 회원 무료 체험 이벤트",
    summary: "신규 회원을 대상으로 무료 체험 이벤트를 진행합니다.",
    eventPeriod: "이벤트 기간: 2026년 3월 예정",
    features: ["신규 회원 이벤트", "기초 레슨 체험", "매장 멤버십 안내"],
    promotionBadge: "event",
    category: "screenParkGolf",
  },
  {
    id: "screen-3",
    businessName: "PUL 제휴 스크린",
    region: "전국",
    newsType: "startupBriefing",
    title: "스크린 파크골프 창업 설명회",
    summary: "스크린 파크골프 창업과 운영 모델을 소개하는 설명회입니다.",
    eventPeriod: "일정: 준비 중",
    features: ["창업 모델 소개", "운영 사례", "가맹 상담"],
    promotionBadge: "adPlanned",
    category: "screenParkGolf",
  },
  {
    id: "screen-4",
    businessName: "○○스크린 파크골프",
    region: "부산",
    newsType: "screenTournament",
    title: "매장 회원 스크린 파크골프 대회",
    summary: "매장 회원을 대상으로 하는 스크린 파크골프 이벤트 대회입니다.",
    eventPeriod: "일정: 2026년 봄 예정",
    features: ["회원 대상 대회", "경품 이벤트", "초보자 부문 운영"],
    promotionBadge: "general",
    category: "screenParkGolf",
  },
];

export const relatedMenuLinks: RelatedMenuLink[] = [
  {
    id: "shortcut-events",
    title: "대회·이벤트",
    description: "전국 대회, 지역 행사, 체험 이벤트, 참가 접수 정보를 확인할 수 있습니다.",
    examples: ["2026년 상반기 대회 일정", "지역 동호인 친선대회", "초보자 체험 행사"],
    buttonLabel: "대회·이벤트 보기",
    href: "/events",
  },
  {
    id: "shortcut-license",
    title: "자격증·심판",
    description:
      "자격증 시험, 실기·구술 준비, 연수, 심판·강사 구인구직 정보를 확인할 수 있습니다.",
    examples: ["필기 시험 준비자료", "실기·구술 준비", "심판·강사 구인구직"],
    buttonLabel: "자격증·심판 보기",
    href: "/certification",
  },
  {
    id: "shortcut-university",
    title: "대학·학과",
    description:
      "파크골프 관련 대학·학과, 학과 게시판, 신입생 모집 배너 정보를 확인할 수 있습니다.",
    examples: ["대학·학과 커뮤니티", "학과 게시판 만들기", "신입생 모집 대학"],
    buttonLabel: "대학·학과 보기",
    href: "/lessons",
  },
];

export const equipmentBrandItems: EquipmentBrandItem[] = [
  {
    id: "equip-1",
    brandName: "예시파크골프",
    newsType: "newProduct",
    title: "2026 신형 파크골프채 출시 예정",
    summary: "신제품 출시 일정과 주요 특징을 미리 확인하세요.",
    promotionBadge: "adPlanned",
    primaryButtonLabel: "장터 보기",
    secondaryButtonLabel: "자세히 보기",
    category: "equipmentBrand",
  },
  {
    id: "equip-2",
    brandName: "예시스포츠웨어",
    newsType: "discountEvent",
    title: "봄맞이 장갑·의류 할인 행사",
    summary: "시즌 할인 행사 안내입니다. 공식 매장에서 확인하세요.",
    promotionBadge: "event",
    primaryButtonLabel: "장터 보기",
    secondaryButtonLabel: "자세히 보기",
    category: "equipmentBrand",
  },
  {
    id: "equip-3",
    brandName: "PUL 제휴 브랜드",
    newsType: "vendorPromotion",
    title: "브랜드 입점 및 공동 프로모션 안내",
    summary: "장비업체의 장터 입점과 프로모션 연계 소식을 제공합니다.",
    promotionBadge: "vendorPromotion",
    primaryButtonLabel: "장터 보기",
    secondaryButtonLabel: "자세히 보기",
    category: "equipmentBrand",
  },
];

export function filterNewsItems(
  items: NewsItem[],
  filter: NewsCategoryFilter,
) {
  if (filter === "all") return items;
  return items.filter((item) => item.category === filter);
}

export function getFeaturedNews(filter: NewsCategoryFilter) {
  return filterNewsItems(newsItems, filter).filter((item) => item.isFeatured);
}

export function shouldShowSection(
  sectionCategory: NewsCategory,
  filter: NewsCategoryFilter,
) {
  return filter === "all" || filter === sectionCategory;
}
