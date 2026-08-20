import type {
  MarketBuyRequest,
  MarketCategory,
  MarketCondition,
  MarketListing,
  MarketSaleStatus,
  MarketSellerType,
  MarketTradeType,
  StartupBoardCategory,
  StartupBoardCategoryFilter,
  StartupBoardConsultationType,
  StartupBoardStatus,
} from "@/types";

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
  "PUL 장터는 실제 회원이 등록한 판매글과 구매요청을 기반으로 운영합니다.",
  "판매자는 자신의 글만 수정하거나 상태를 변경하고 삭제할 수 있습니다.",
  "업체·브랜드 매물은 별도 기준에 따라 노출될 수 있습니다.",
  "상품 사진은 최대 5장까지 JPG·PNG·WebP 형식으로 등록할 수 있습니다.",
  "창업·매매 게시판은 일반 중고거래가 아니라 상담·문의 성격의 게시판입니다.",
  "스크린 매장 매매, 구장 조성, 시설 업체 문의는 반드시 당사자와 전문가 확인 후 진행해주세요.",
  "PUL은 거래 결과, 계약 성사, 수익성, 인허가 결과를 보증하지 않습니다.",
];

export const marketRegisterNotes = [
  "상품명, 카테고리, 지역, 판매 상태로 실제 등록 상품을 찾을 수 있습니다.",
  "판매글에는 사진을 최대 5장까지 추가할 수 있습니다.",
  "작성자는 자신의 판매글과 구매요청만 변경할 수 있습니다.",
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
  "판매글과 삽니다 글은 실제 데이터로 반영되며 상태 변경 이력은 안전하게 기록됩니다.";

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
];

export const startupBoardCategoryLabels: Record<StartupBoardCategory, string> = {
  screenStartup: "스크린 창업 문의",
  screenResale: "스크린 매장 매매",
  fieldCourseDevelopment: "필드 구장 신설",
  idleLandUse: "유휴지 활용",
  constructionFacility: "시설·시공 문의",
};

export const startupBoardCategoryStyles: Record<StartupBoardCategory, string> = {
  screenStartup: "bg-sky-50 text-sky-800 border-sky-200",
  screenResale: "bg-indigo-50 text-indigo-800 border-indigo-200",
  fieldCourseDevelopment: "bg-emerald-50 text-emerald-800 border-emerald-200",
  idleLandUse: "bg-amber-50 text-amber-800 border-amber-200",
  constructionFacility: "bg-orange-50 text-orange-800 border-orange-200",
};

export const startupBoardConsultationLabels: Record<StartupBoardConsultationType, string> = {
  startupInquiry: "창업 문의",
  resaleInquiry: "매매 문의",
  transfer: "양도양수",
  courseDevelopment: "구장 조성",
  idleLandUse: "유휴지 활용",
  facilityConsulting: "시설 상담",
};

export const startupBoardStatusLabels: Record<StartupBoardStatus, string> = {
  open: "진행 중",
  closed: "종료",
};

export const startupBoardStatusStyles: Record<StartupBoardStatus, string> = {
  open: "bg-emerald-50 text-emerald-800",
  closed: "bg-gray-100 text-gray-600",
};

export const startupVendorRecommendTags = [
  "스크린 시스템 업체",
  "스크린 창업 컨설팅",
  "인조잔디 업체",
  "안전망·조명 업체",
  "파크골프장 설계·시공 업체",
  "시설 유지보수 업체",
];

export const MARKET_PAGE_DISCLAIMER =
  "PUL 장터의 창업·매매 게시판 정보는 참고용이며, 실제 계약·매매·창업 비용·수익성은 반드시 당사자와 전문가 확인이 필요합니다.";
