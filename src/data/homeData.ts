import type {
  AdBannerData,
  EducationCardItem,
  FeatureBannerItem,
  MembershipBenefit,
  MobileNavItem,
  NavItem,
  QuickMenuItem,
} from "@/types";

export const navItems: NavItem[] = [
  { label: "홈", href: "/", icon: "home" },
  { label: "장터", href: "/market", icon: "cart" },
  { label: "골프장", href: "/courses", icon: "flag" },
  { label: "동호회", href: "/clubs", icon: "users" },
  { label: "대회·이벤트", href: "/events", icon: "trophy" },
  { label: "명예의 전당", href: "/hall-of-fame", icon: "trophy" },
  { label: "레슨·교육", href: "/lessons", icon: "book" },
  { label: "자격증·심판", href: "/certification", icon: "badge" },
  { label: "뉴스·정보", href: "/news", icon: "news" },
  { label: "커뮤니티", href: "/community", icon: "chat" },
];

export const mobileNavItems: MobileNavItem[] = [
  { label: "홈", href: "/", icon: "home" },
  { label: "골프장", href: "/courses", icon: "flag" },
  { label: "장터", href: "/market", icon: "cart" },
  { label: "동호회", href: "/clubs", icon: "users" },
  { label: "전체 메뉴", href: "#menu", icon: "menu" },
];

export const leftAdBanners: AdBannerData[] = [
  {
    id: "left-top",
    title: "PREMIUM PARK GOLF CLUB",
    subtitle: "최고의 비거리와 컨트롤",
    discount: "UP TO 30% OFF",
    cta: "자세히 보기",
    variant: "club",
  },
  {
    id: "left-middle",
    title: "PREMIUM BALL",
    subtitle: "PUL 파크골프 공인구",
    discount: "UP TO 40% OFF",
    cta: "자세히 보기",
    variant: "ball",
  },
  {
    id: "left-bottom",
    badge: "PUL Academy",
    title: "레슨 찾기",
    subtitle: "전국 레슨 정보를 한눈에",
    cta: "자세히 보기",
    variant: "academy",
  },
];

export const rightAdBanners: AdBannerData[] = [
  {
    id: "right-top",
    badge: "PUL 회원 전용",
    title: "여름 프리미엄 의류",
    discount: "최대 30% 할인",
    cta: "자세히 보기",
    variant: "apparel",
  },
  {
    id: "right-middle",
    badge: "NEW",
    title: "신상 파크골프화",
    subtitle: "편안함과 안정감",
    discount: "UP TO 20% OFF",
    cta: "자세히 보기",
    variant: "shoes",
  },
  {
    id: "right-bottom",
    title: "자외선 차단 의류",
    subtitle: "여름 라운딩 필수템",
    cta: "자세히 보기",
    variant: "uv",
  },
];

/** 모바일 전용 광고 (최대 2개) */
export const mobileAdBanners = {
  mid: leftAdBanners[0],
  bottom: rightAdBanners[0],
} satisfies { mid: AdBannerData; bottom: AdBannerData };

export const quickMenuItems: QuickMenuItem[] = [
  { label: "장터", href: "/market", icon: "cart" },
  { label: "골프장 찾기", href: "/courses", icon: "flag" },
  { label: "대회 일정", href: "/events", icon: "calendar" },
  { label: "동호회 찾기", href: "/clubs", icon: "users" },
  { label: "레슨 찾기", href: "/lessons", icon: "book" },
  { label: "자격증 안내", href: "/certification", icon: "badge" },
];

export const educationCards: EducationCardItem[] = [
  { id: "1", title: "시험 정보", href: "/certification", icon: "doc" },
  { id: "2", title: "교육 일정", href: "/lessons#paid-lessons-section", icon: "calendar" },
  { id: "3", title: "장비관리센터", href: "/market#equipment-care", icon: "wrench" },
  { id: "4", title: "스크린파크골프장", href: "/courses", icon: "flag" },
];

export const featureBanners: FeatureBannerItem[] = [
  {
    id: "1",
    title: "초보자 장비 선택 가이드",
    description: "첫 채·공·중고 구매 전, 기본 선택 팁을 확인해 보세요",
    href: "/market#market-buy-guide",
    variant: "equipment",
  },
  {
    id: "2",
    title: "골프장 정보 등록·수정 제보",
    description: "잘못된 정보나 신규 구장 소식을 PUL에 알려 주세요",
    href: "/courses",
    variant: "course",
  },
  {
    id: "3",
    title: "동호회·대회 등록 및 홍보",
    description: "동호회·대회 등록과 홍보 문의를 남겨 주세요",
    href: "/events",
    variant: "community",
  },
];

export const membershipBenefits: MembershipBenefit[] = [
  { icon: "flag", label: "관심 골프장 저장" },
  { icon: "users", label: "동호회 가입 및 활동" },
  { icon: "calendar", label: "대회 일정 확인" },
  { icon: "chat", label: "기록 등록과 커뮤니티 참여" },
];

export const footerLinks = {
  service: [
    { label: "골프장", href: "/courses" },
    { label: "동호회", href: "/clubs" },
    { label: "대회·이벤트", href: "/events" },
    { label: "레슨·교육", href: "/lessons" },
    { label: "뉴스·정보", href: "/news" },
    { label: "커뮤니티", href: "/community" },
  ],
  business: [
    { label: "장터 제휴·광고 문의", href: "/market" },
  ],
};

export const footerPendingItems = [
  "이용약관 준비 중",
  "개인정보처리방침 준비 중",
  "고객지원 준비 중",
] as const;
