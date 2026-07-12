import type {
  MarketBuyRequest,
  MarketCategory,
  MarketCondition,
  MarketListing,
  MarketSaleStatus,
  MarketSellerType,
  MarketStartupCategory,
  MarketStartupResaleItem,
  MarketStartupStatus,
  MarketTradeType,
  StartupBoardAuthorType,
  StartupBoardCategory,
  StartupBoardCategoryFilter,
  StartupBoardConsultationType,
  StartupBoardPost,
  StartupBoardStatus,
} from "@/types";

export const MARKET_REGISTER_FORM_URL =
  "https://docs.google.com/forms/d/e/placeholder/viewform";

export const marketCategories = [
  { label: "전체", value: "all" },
  { label: "파크골프채", value: "club" },
  { label: "공", value: "ball" },
  { label: "가방", value: "bag" },
  { label: "의류", value: "apparel" },
  { label: "신발", value: "shoes" },
  { label: "연습용품", value: "practice" },
  { label: "기타", value: "other" },
  { label: "창업·매매", value: "startupResale" },
  { label: "시설·조성", value: "facilityDevelopment" },
] as const;

export const marketRegions = [
  "전체",
  "서울",
  "경기",
  "인천",
  "충청",
  "강원",
  "전라",
  "경상",
  "제주",
] as const;

export const marketConditions = [
  { label: "전체", value: "all" },
  { label: "새상품급", value: "likeNew" },
  { label: "사용감 적음", value: "lightUse" },
  { label: "보통", value: "normal" },
  { label: "수리 필요", value: "needsRepair" },
] as const;

export const marketTradeTypes = [
  { label: "전체", value: "all" },
  { label: "직거래", value: "direct" },
  { label: "택배", value: "delivery" },
  { label: "협의", value: "negotiable" },
] as const;

export const marketSaleStatuses = [
  { label: "전체", value: "all" },
  { label: "판매중", value: "selling" },
  { label: "예약중", value: "reserved" },
  { label: "거래완료", value: "sold" },
] as const;

export const marketSellerTypes = [
  { label: "전체", value: "all" },
  { label: "개인매물", value: "personal" },
  { label: "업체매물", value: "business" },
  { label: "인증업체", value: "verified_business" },
  { label: "브랜드공식", value: "official_brand" },
  { label: "창업·매매", value: "startupResale" },
] as const;

export const sellerTypeLabels: Record<MarketSellerType, string> = {
  personal: "개인매물",
  business: "업체매물",
  verified_business: "인증업체",
  official_brand: "브랜드공식",
  startupResale: "창업·매매",
};

export const sellerTypeStyles: Record<MarketSellerType, string> = {
  personal: "bg-gray-100 text-pul-muted",
  business: "bg-blue-50 text-blue-700",
  verified_business: "bg-pul-light text-pul-deep",
  official_brand: "bg-amber-50 text-amber-800 ring-1 ring-pul-gold/30",
  startupResale: "bg-orange-50 text-orange-800 ring-1 ring-orange-200",
};

export const marketOperationNotes = [
  "PUL 장터는 개인매물과 업체매물을 구분하여 운영할 예정입니다.",
  "초기에는 운영자가 등록 내용을 확인한 뒤 게시할 수 있습니다.",
  "업체·브랜드 매물은 별도 기준에 따라 노출될 수 있습니다.",
  "업로드한 상품 사진은 보기 좋은 크기로 자동 최적화될 예정입니다.",
  "창업·매매 게시판은 일반 중고거래가 아니라 상담·문의 성격의 게시판입니다.",
  "스크린 매장 매매, 구장 조성, 시설 업체 문의는 반드시 당사자와 전문가 확인 후 진행해주세요.",
  "PUL은 거래 결과, 계약 성사, 수익성, 인허가 결과를 보증하지 않습니다.",
];

export const marketRegisterNotes = [
  "초기 장터에서는 상품명, 카테고리, 지역 중심으로 간단히 찾아볼 수 있습니다.",
  "사진은 자동으로 보기 좋은 크기로 조정될 예정입니다.",
  "개인과 업체 매물은 구분되어 노출됩니다.",
];

/**
 * TODO: 상품 이미지 업로드 시 자동 최적화
 * - 썸네일 600px, 상세 이미지 1200px 기준으로 자동 리사이즈
 * - WebP 변환 또는 JPG 압축 적용
 * - 원본 이미지는 필요 시 별도 저장
 */
export const MARKET_IMAGE_OPTIMIZATION_TODO = true;

export const categoryLabels: Record<MarketCategory, string> = {
  club: "파크골프채",
  ball: "공",
  bag: "가방",
  apparel: "의류",
  shoes: "신발",
  practice: "연습용품",
  other: "기타",
  startupResale: "창업·매매",
  facilityDevelopment: "시설·조성",
};

export const conditionLabels: Record<MarketCondition, string> = {
  likeNew: "새상품급",
  lightUse: "사용감 적음",
  normal: "보통",
  needsRepair: "수리 필요",
};

export const tradeTypeLabels: Record<MarketTradeType, string> = {
  direct: "직거래",
  delivery: "택배",
  negotiable: "협의",
};

export const saleStatusLabels: Record<MarketSaleStatus, string> = {
  selling: "판매중",
  reserved: "예약중",
  sold: "거래완료",
};

export const saleStatusStyles: Record<MarketSaleStatus, string> = {
  selling: "bg-pul-light text-pul-deep",
  reserved: "bg-amber-50 text-amber-700",
  sold: "bg-gray-100 text-pul-muted",
};

export const safetyTips = [
  "직거래 시 사람이 많은 장소를 이용해주세요.",
  "선입금을 요구하는 거래는 주의해주세요.",
  "상품 상태 사진을 꼼꼼히 확인해주세요.",
  "거래 완료 전 개인정보를 과도하게 공유하지 마세요.",
  "의심스러운 거래는 PUL에 신고해주세요.",
  "고액 매매나 창업 상담은 반드시 계약서, 사업자 정보, 실제 시설 확인 후 진행해주세요.",
  "부지 조성이나 시설 공사는 지자체 인허가와 법적 조건을 확인해주세요.",
  "예상 수익이나 투자 회수 기간을 과장하는 홍보에 주의해주세요.",
  "업체 답변은 참고 자료이며 최종 결정은 직접 확인 후 진행해주세요.",
];

export const marketOpenEventNote =
  "장터 오픈 기간 판매글·삽니다 글 등록 시 운영팀이 순차 검수 후 노출합니다. 초기에는 샘플 매물과 안내 콘텐츠가 함께 표시됩니다.";

export const equipmentPriceSnapshots = [
  {
    id: "price-1",
    name: "입문용 파크골프채 세트",
    priceRange: "15~25만원",
    note: "중고 기준, 그립·헤드 상태에 따라 차이",
  },
  {
    id: "price-2",
    name: "공인 3피스 공 6개",
    priceRange: "2~4만원",
    note: "사용 횟수·박스 포함 여부 반영",
  },
  {
    id: "price-3",
    name: "캐디백·보스턴백",
    priceRange: "5~12만원",
    note: "브랜드·내피 상태에 따라 차이",
  },
  {
    id: "price-4",
    name: "파크골프화",
    priceRange: "4~9만원",
    note: "사이즈·마모도 확인 필요",
  },
] as const;

export const beginnerEquipmentGuide = [
  {
    id: "guide-1",
    title: "첫 채는 가볍고 짧은 모델부터",
    summary: "입문 단계에서는 무게와 길이가 맞는지 우선 확인하세요.",
  },
  {
    id: "guide-2",
    title: "공은 연습용과 공인구를 구분",
    summary: "연습과 대회용을 나누면 비용 관리가 쉽습니다.",
  },
  {
    id: "guide-3",
    title: "중고 구매 시 그립·헤드 사진 확인",
    summary: "상태 사진과 거래 방식을 카드에서 먼저 확인하세요.",
  },
] as const;

export const marketBuyRequests: MarketBuyRequest[] = [
  {
    id: "buy-1",
    title: "입문용 파크골프채 세트 구합니다",
    category: "club",
    region: "경기",
    budget: "20만원 내외",
    summary: "처음 시작하는 60대 남성용 가벼운 세트를 찾습니다.",
    authorNickname: "초보라운딩",
    createdAt: "1일 전",
    isSample: true,
  },
  {
    id: "buy-2",
    title: "공인 파크골프공 6개 삽니다",
    category: "ball",
    region: "서울",
    budget: "3만원 내외",
    summary: "대회 참가용 공인구를 찾고 있습니다.",
    authorNickname: "대회준비중",
    createdAt: "2일 전",
    isSample: true,
  },
  {
    id: "buy-3",
    title: "여성용 파크골프화 구합니다",
    category: "shoes",
    region: "인천",
    budget: "5만원 내외",
    summary: "240~245 사이즈, 사용감 적은 제품 희망합니다.",
    authorNickname: "라운딩메이트",
    createdAt: "3일 전",
    isSample: true,
  },
];

export const marketListings: MarketListing[] = [
  {
    id: "1",
    name: "PUL 추천 파크골프채 세트 (드라이버+아이언)",
    category: "club",
    sellerType: "personal",
    price: 185000,
    region: "서울",
    condition: "lightUse",
    tradeType: "direct",
    saleStatus: "selling",
    description:
      "입문 후 1년 사용한 파크골프채 세트입니다. 그립 상태 양호하고 케이스 포함입니다.",
    sellerNickname: "잔디위홀인원",
    createdAt: "2시간 전",
    image: "/images/ad-club.jpg",
    featured: true,
  },
  {
    id: "2",
    name: "공인 3피스 파크골프공 6개 세트",
    category: "ball",
    sellerType: "verified_business",
    price: 28000,
    region: "경기",
    condition: "likeNew",
    tradeType: "delivery",
    saleStatus: "selling",
    description: "대회용 공인구 6개, 사용 2회 미만입니다. 박스 포함.",
    sellerNickname: "볼마스터",
    createdAt: "5시간 전",
    image: "/images/ad-ball.jpg",
    featured: true,
  },
  {
    id: "3",
    name: "2단 파크골프 가방 (우산홀더 포함)",
    category: "bag",
    sellerType: "business",
    price: 65000,
    region: "인천",
    condition: "normal",
    tradeType: "negotiable",
    saleStatus: "selling",
    description: "채 7개 수납 가능한 가벼운 가방입니다. 어깨끈 교체 완료.",
    sellerNickname: "라운딩메이트",
    createdAt: "어제",
    image: "/images/banner-equipment.jpg",
    featured: true,
  },
  {
    id: "4",
    name: "여름용 파크골프 장갑 (L)",
    category: "apparel",
    sellerType: "personal",
    price: 12000,
    region: "충청",
    condition: "likeNew",
    tradeType: "delivery",
    saleStatus: "reserved",
    description: "한 번 착용한 장갑입니다. 통풍 잘 되는 소재입니다.",
    sellerNickname: "그린핸드",
    createdAt: "어제",
    image: "/images/ad-wear.jpg",
    featured: true,
  },
  {
    id: "5",
    name: "실내 연습 매트 (3m)",
    category: "practice",
    sellerType: "personal",
    price: 45000,
    region: "강원",
    condition: "lightUse",
    tradeType: "direct",
    saleStatus: "selling",
    description: "집에서 스윙 연습용 매트입니다. 접이식이라 보관 편합니다.",
    sellerNickname: "홈연습러",
    createdAt: "2일 전",
    image: "/images/banner-course.jpg",
  },
  {
    id: "6",
    name: "파크골프화 250mm (거의 새것)",
    category: "shoes",
    sellerType: "official_brand",
    price: 52000,
    region: "전라",
    condition: "likeNew",
    tradeType: "delivery",
    saleStatus: "selling",
    description: "실내 착용 2회, 야외 미사용 신발입니다. 박스·깔창 포함.",
    sellerNickname: "스텝바이스텝",
    createdAt: "2일 전",
    image: "/images/ad-shoes.jpg",
  },
  {
    id: "7",
    name: "중고 퍼터 + 어프로치 클럽",
    category: "club",
    sellerType: "personal",
    price: 95000,
    region: "경상",
    condition: "normal",
    tradeType: "direct",
    saleStatus: "selling",
    description: "숏게임 연습용으로 사용한 클럽 2개입니다. 헤드 스크래치 약간 있음.",
    sellerNickname: "숏게임왕",
    createdAt: "3일 전",
    image: "/images/ad-club.jpg",
  },
  {
    id: "8",
    name: "입문자 스타터 세트 (채+공+가방)",
    category: "other",
    sellerType: "business",
    price: 220000,
    region: "제주",
    condition: "lightUse",
    tradeType: "negotiable",
    saleStatus: "selling",
    description:
      "입문용 세트 전체 판매합니다. 채 5개, 공 4개, 기본 가방 일괄 구성입니다.",
    sellerNickname: "파크입문",
    createdAt: "3일 전",
    image: "/images/banner-equipment.jpg",
  },
  {
    id: "9",
    name: "UV 차단 파크골프 상의 (M)",
    category: "apparel",
    sellerType: "personal",
    price: 35000,
    region: "서울",
    condition: "lightUse",
    tradeType: "delivery",
    saleStatus: "selling",
    description: "여름 라운딩용 상의입니다. 세탁 완료, 얼룩 없음.",
    sellerNickname: "썬가드",
    createdAt: "4일 전",
    image: "/images/ad-wear-blue.jpg",
  },
  {
    id: "10",
    name: "스윙 교정 거울 + 티 세트",
    category: "practice",
    sellerType: "personal",
    price: 18000,
    region: "경기",
    condition: "normal",
    tradeType: "delivery",
    saleStatus: "sold",
    description: "자세 교정용 거울과 티 10개 세트입니다. 거래 완료된 상품입니다.",
    sellerNickname: "폼체크",
    createdAt: "5일 전",
    image: "/images/banner-community.jpg",
  },
  {
    id: "11",
    name: "프리미엄 파크골프채 단품 (7번)",
    category: "club",
    sellerType: "verified_business",
    price: 78000,
    region: "인천",
    condition: "likeNew",
    tradeType: "direct",
    saleStatus: "selling",
    description: "7번 아이언 단품입니다. 그립 교체 완료, 샤프트 상태 우수.",
    sellerNickname: "아이언맨",
    createdAt: "6일 전",
    image: "/images/ad-club.jpg",
  },
  {
    id: "12",
    name: "공용 파크골프 티 & 볼마커 세트",
    category: "other",
    sellerType: "personal",
    price: 8000,
    region: "충청",
    condition: "likeNew",
    tradeType: "delivery",
    saleStatus: "selling",
    description: "티 20개와 볼마커 5개 구성입니다. 소소한 거래 환영합니다.",
    sellerNickname: "티마스터",
    createdAt: "1주 전",
    image: "/images/ad-ball.jpg",
  },
];

export const featuredListings = marketListings
  .filter((item) => item.featured)
  .map((item) => ({ ...item, isSample: true }));

/** 모바일 첫 화면: 추천·인기 */
export const MARKET_FEATURED_MOBILE_PREVIEW = 4;
/** 모바일 첫 화면: 최신 (추천과 중복 제외, 합계 최대 8) */
export const MARKET_LATEST_MOBILE_PREVIEW = 4;

export const STARTUP_BOARD_SUMMARY_PREVIEW = 3;
export const STARTUP_BOARD_FULL_MOBILE_PREVIEW = 5;
export const STARTUP_BOARD_FULL_PC_PREVIEW = 9;

export const startupBoardGuideNotes = [
  "창업 비용과 예상 수익은 업체별로 다를 수 있습니다.",
  "매장 매매는 임대차, 매출, 장비 상태, 계약 조건 확인이 필요합니다.",
  "필드 구장 신설은 부지 조건과 지자체 인허가 확인이 필요합니다.",
  "시설 공사는 전문 업체 상담과 현장 확인이 필요합니다.",
  "PUL은 계약 결과, 수익성, 인허가 결과를 보증하지 않습니다.",
];

export const startupBoardCategoryTabs: {
  id: StartupBoardCategoryFilter;
  label: string;
}[] = [
  { id: "all", label: "전체" },
  { id: "screenStartup", label: "스크린 창업 문의" },
  { id: "screenResale", label: "스크린 매장 매매" },
  { id: "fieldCourseDevelopment", label: "필드 구장 신설" },
  { id: "idleLandUse", label: "유휴지 활용" },
  { id: "constructionFacility", label: "시설·시공 문의" },
  { id: "vendorAnswer", label: "업체 답변" },
];

export const startupBoardCategoryLabels: Record<StartupBoardCategory, string> = {
  screenStartup: "스크린 창업 문의",
  screenResale: "스크린 매장 매매",
  fieldCourseDevelopment: "필드 구장 신설",
  idleLandUse: "유휴지 활용",
  constructionFacility: "시설·시공 문의",
  vendorAnswer: "업체 답변",
};

export const startupBoardCategoryStyles: Record<StartupBoardCategory, string> = {
  screenStartup: "bg-sky-50 text-sky-800 border-sky-200",
  screenResale: "bg-indigo-50 text-indigo-800 border-indigo-200",
  fieldCourseDevelopment: "bg-emerald-50 text-emerald-800 border-emerald-200",
  idleLandUse: "bg-amber-50 text-amber-800 border-amber-200",
  constructionFacility: "bg-orange-50 text-orange-800 border-orange-200",
  vendorAnswer: "bg-teal-50 text-teal-800 border-teal-200",
};

export const startupBoardConsultationLabels: Record<StartupBoardConsultationType, string> = {
  startupInquiry: "창업 문의",
  resaleInquiry: "매매 문의",
  transfer: "양도양수",
  courseDevelopment: "구장 조성",
  idleLandUse: "유휴지 활용",
  facilityConsulting: "시설 상담",
  vendorAnswer: "업체 답변",
};

export const startupBoardAuthorLabels: Record<StartupBoardAuthorType, string> = {
  prospectiveFounder: "예비 창업자",
  storeOwner: "매장 운영자",
  landOwner: "토지 소유자",
  screenVendor: "스크린 업체",
  facilityVendor: "시설 업체",
  constructionVendor: "시공 업체",
  pulAdmin: "PUL 운영자",
};

export const startupBoardStatusLabels: Record<StartupBoardStatus, string> = {
  waitingAnswer: "답변 대기",
  vendorAnswered: "업체 답변 있음",
  consultationAvailable: "상담 가능",
  resaleConsulting: "매매 상담",
  needCheck: "확인 필요",
  completed: "완료",
};

export const startupBoardStatusStyles: Record<StartupBoardStatus, string> = {
  waitingAnswer: "bg-gray-100 text-gray-600",
  vendorAnswered: "bg-blue-50 text-blue-700",
  consultationAvailable: "bg-green-50 text-green-700",
  resaleConsulting: "bg-purple-50 text-purple-700",
  needCheck: "bg-amber-50 text-amber-700",
  completed: "bg-pul-light text-pul-deep",
};

export const startupVendorRecommendTags = [
  "스크린 시스템 업체",
  "스크린 창업 컨설팅",
  "인조잔디 업체",
  "안전망·조명 업체",
  "파크골프장 설계·시공 업체",
  "시설 유지보수 업체",
];

export const startupBoardPosts: StartupBoardPost[] = [
  {
    id: "sb-1",
    title: "30평 공간에 스크린 파크골프 창업이 가능할까요?",
    category: "screenStartup",
    region: "경기",
    desiredScale: "약 30평",
    consultationType: "startupInquiry",
    authorType: "prospectiveFounder",
    answerCount: 0,
    viewCount: 128,
    createdAt: "2시간 전",
    status: "waitingAnswer",
    summary: "소형 상가 공간에서 스크린 파크골프 매장 운영이 가능한지 궁금합니다.",
    tags: ["창업", "소형매장"],
  },
  {
    id: "sb-2",
    title: "스크린 파크골프 창업 비용이 어느 정도 필요한가요?",
    category: "screenStartup",
    region: "전국",
    desiredScale: "50평 내외",
    consultationType: "startupInquiry",
    authorType: "prospectiveFounder",
    answerCount: 3,
    viewCount: 412,
    createdAt: "어제",
    status: "vendorAnswered",
    summary: "장비, 인테리어, 임대료, 운영비 등 초기 비용 구조가 궁금합니다.",
    tags: ["창업비용"],
  },
  {
    id: "sb-3",
    title: "운영 중인 스크린 파크골프장 양도 희망합니다",
    category: "screenResale",
    region: "수도권",
    desiredScale: "매장별 상이",
    consultationType: "transfer",
    authorType: "storeOwner",
    answerCount: 1,
    viewCount: 256,
    createdAt: "3일 전",
    status: "resaleConsulting",
    summary: "기존 운영 중인 매장을 양도하려는 예시 게시글입니다.",
    tags: ["양도", "매매"],
  },
  {
    id: "sb-4",
    title: "기존 스크린 매장 인수할 때 확인할 점이 궁금합니다",
    category: "screenResale",
    region: "서울",
    desiredScale: "40평~80평",
    consultationType: "resaleInquiry",
    authorType: "prospectiveFounder",
    answerCount: 2,
    viewCount: 389,
    createdAt: "4일 전",
    status: "vendorAnswered",
    summary:
      "매출, 임대차, 장비 상태, 회원권, 계약 조건 확인 방법이 궁금합니다.",
    tags: ["인수", "매매"],
  },
  {
    id: "sb-5",
    title: "지방 유휴지에 파크골프장 조성이 가능할까요?",
    category: "fieldCourseDevelopment",
    region: "충청",
    desiredScale: "약 1,000평",
    consultationType: "courseDevelopment",
    authorType: "landOwner",
    answerCount: 0,
    viewCount: 97,
    createdAt: "5일 전",
    status: "needCheck",
    summary:
      "개인 소유 유휴지를 활용해 소규모 파크골프장을 만들 수 있는지 궁금합니다.",
    tags: ["필드", "조성"],
  },
  {
    id: "sb-6",
    title: "전원주택 단지 근처 빈 땅을 연습장으로 활용할 수 있을까요?",
    category: "idleLandUse",
    region: "강원",
    desiredScale: "약 500평",
    consultationType: "idleLandUse",
    authorType: "landOwner",
    answerCount: 0,
    viewCount: 74,
    createdAt: "1주 전",
    status: "waitingAnswer",
    summary:
      "정식 구장까지는 아니더라도 연습장이나 체험장으로 활용 가능한지 궁금합니다.",
    tags: ["유휴지", "연습장"],
  },
  {
    id: "sb-7",
    title: "파크골프장 조성 시 인조잔디와 안전망 비용이 궁금합니다",
    category: "constructionFacility",
    region: "전국",
    desiredScale: "규모별 상이",
    consultationType: "facilityConsulting",
    authorType: "prospectiveFounder",
    answerCount: 2,
    viewCount: 203,
    createdAt: "1주 전",
    status: "vendorAnswered",
    summary: "인조잔디, 안전망, 조명, 배수 공사 비용과 기준이 궁금합니다.",
    tags: ["시설", "비용"],
  },
  {
    id: "sb-8",
    title: "스크린 파크골프 창업 시 기본 확인사항",
    category: "vendorAnswer",
    region: "전국",
    desiredScale: "20평~100평",
    consultationType: "vendorAnswer",
    authorType: "screenVendor",
    answerCount: 5,
    viewCount: 521,
    createdAt: "2주 전",
    status: "consultationAvailable",
    summary: "공간 크기, 장비 구성, 운영 방식, 예상 비용 확인이 필요합니다.",
    tags: ["업체답변", "창업"],
  },
  {
    id: "sb-9",
    title: "필드 파크골프장 조성 전 확인해야 할 조건",
    category: "vendorAnswer",
    region: "전국",
    desiredScale: "부지 조건별 상이",
    consultationType: "vendorAnswer",
    authorType: "constructionVendor",
    answerCount: 4,
    viewCount: 348,
    createdAt: "2주 전",
    status: "consultationAvailable",
    summary:
      "부지 면적, 배수, 진입로, 인허가, 안전시설 조건을 먼저 확인해야 합니다.",
    tags: ["업체답변", "조성"],
  },
];

type BoardFilterInput = {
  keyword: string;
  region: string;
};

function matchesBoardRegion(postRegion: string, filterRegion: string): boolean {
  if (filterRegion === "전체") return true;
  if (postRegion === "전국") return true;
  if (postRegion === filterRegion) return true;
  if (filterRegion === "경기" && postRegion === "수도권") return true;
  if (filterRegion === "서울" && postRegion === "수도권") return true;
  if (filterRegion === "인천" && postRegion === "수도권") return true;
  return false;
}

export function filterStartupBoardPosts(
  posts: StartupBoardPost[],
  boardCategory: StartupBoardCategoryFilter,
  filters: BoardFilterInput,
): StartupBoardPost[] {
  const keyword = filters.keyword.trim().toLowerCase();

  return posts.filter((post) => {
    if (boardCategory !== "all" && post.category !== boardCategory) {
      return false;
    }
    if (!matchesBoardRegion(post.region, filters.region)) {
      return false;
    }
    if (keyword) {
      const haystack =
        `${post.title} ${post.summary} ${post.region} ${startupBoardCategoryLabels[post.category]}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

export const MARKET_PAGE_DISCLAIMER =
  "PUL 장터의 창업·매매 게시판 정보는 참고용이며, 실제 계약·매매·창업 비용·수익성은 반드시 당사자와 전문가 확인이 필요합니다.";
