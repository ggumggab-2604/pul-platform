import type {
  NewsCategory,
  NewsSourceType,
} from "@/lib/news/newsDirectory";

export type NewsCategoryFilter = "all" | NewsCategory;

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
    "PUL 운영자가 확인한 공식 소식, 정책·규정 안내, 행사 소식, 브랜드·업체 소식을 모았습니다.",
  subDescription:
    "회원 자유 글은 커뮤니티에서 확인하세요. 뉴스·정보는 운영자·기관·업체 중심의 확인된 정보를 제공합니다.",
  introGuideBox: {
    title: "파크골프를 처음 시작하시나요?",
    description:
      "신규 오픈 구장, 스크린 파크골프장, 대회·행사, 자격증·심판, 장비·브랜드 소식을 확인할 수 있습니다.",
    buttonLabel: "입문 가이드 보러가기",
    href: "/lessons",
  },
  disclaimer:
    "PUL 뉴스·정보는 파크골프 관련 소식과 홍보 정보를 쉽게 확인할 수 있도록 돕기 위한 정보 제공 영역입니다.\n신규 구장, 스크린 파크골프장, 대회 일정, 자격증 시험, 상품 정보, 업체 홍보 내용 등은 변경될 수 있으므로 반드시 공식 기관, 지자체, 협회, 업체의 최신 공지를 함께 확인해주세요.\nPUL은 각 소식의 결과, 참가 가능 여부, 자격 인정, 모집 여부, 상품 구매 결과, 업체 홍보 효과를 보증하지 않습니다.",
  inquiryNote:
    "MVP 단계에서는 실제 제출 폼 대신 안내만 제공합니다. 제보·홍보 문의 접수 기능은 후속 단계에서 연결할 예정입니다.",
} as const;

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
  officialNotice: "공식 공지",
  organizationNotice: "협회·기관 안내",
  memberReport: "회원 제보 확인",
  brandPromotion: "업체·브랜드 홍보",
};

export const relatedMenuLinks: RelatedMenuLink[] = [
  {
    id: "shortcut-courses",
    title: "골프장",
    description: "실제 골프장 위치와 운영 정보를 확인합니다.",
    examples: ["지역별 골프장", "운영 정보", "정보 제보"],
    buttonLabel: "골프장 보기",
    href: "/courses",
  },
  {
    id: "shortcut-events",
    title: "대회·이벤트",
    description: "전국 대회와 지역 행사 일정을 확인합니다.",
    examples: ["대회 일정", "지역 행사", "참가 안내"],
    buttonLabel: "대회·이벤트 보기",
    href: "/events",
  },
  {
    id: "shortcut-certification",
    title: "자격증·심판",
    description: "공식 교육과정, 시험 일정, 모집 정보를 확인합니다.",
    examples: ["교육과정", "시험 일정", "심판·강사 모집"],
    buttonLabel: "자격증·심판 보기",
    href: "/certification",
  },
  {
    id: "shortcut-lessons",
    title: "레슨·교육",
    description: "레슨과 무료 교육 영상을 확인합니다.",
    examples: ["지역 레슨", "온라인 교육", "무료 영상"],
    buttonLabel: "레슨·교육 보기",
    href: "/lessons",
  },
  {
    id: "shortcut-market",
    title: "중고장터",
    description: "회원 간 중고 파크골프 용품을 확인합니다.",
    examples: ["판매글", "구매 요청", "안전 거래 안내"],
    buttonLabel: "중고장터 보기",
    href: "/market",
  },
];

export const reportInquiryTypes = [
  { id: "park-news", title: "파크골프 소식 제보", description: "지역 소식과 공식 운영 공지" },
  { id: "screen-promotion", title: "스크린 홍보 문의", description: "신규 오픈과 이벤트 소식" },
  { id: "equipment", title: "장비·브랜드 홍보 문의", description: "신제품과 체험 행사 소식" },
] as const;
