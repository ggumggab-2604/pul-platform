import type {
  AdBannerData,
  ClubItem,
  EducationCardItem,
  EventScheduleItem,
  FeaturedEvent,
  FeatureBannerItem,
  HallOfFamePerson,
  LiveNewsItem,
  MarketItem,
  MembershipBenefit,
  MobileNavItem,
  NavItem,
  NewsItem,
  PopularPost,
  QuickMenuItem,
  RecommendedClub,
  WeatherData,
} from "@/types";

export const navItems: NavItem[] = [
  { label: "홈", href: "/", icon: "home" },
  { label: "동호회", href: "/clubs", icon: "users" },
  { label: "골프장", href: "/courses", icon: "flag" },
  { label: "대회·이벤트", href: "/events", icon: "trophy" },
  { label: "레슨·교육", href: "/lessons", icon: "book" },
  { label: "자격증·심판", href: "/certification", icon: "badge" },
  { label: "장터", href: "/market", icon: "cart" },
  { label: "뉴스·정보", href: "/news", icon: "news" },
  { label: "커뮤니티", href: "/community", icon: "chat" },
];

export const mobileNavItems: MobileNavItem[] = [
  { label: "홈", href: "/", icon: "home" },
  { label: "골프장", href: "/courses", icon: "flag" },
  { label: "장터", href: "/market", icon: "cart" },
  { label: "커뮤니티", href: "/community", icon: "chat" },
  { label: "문의", href: "/support", icon: "phone" },
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
  { label: "동호회 찾기", href: "/clubs", icon: "users" },
  { label: "골프장 찾기", href: "/courses", icon: "flag" },
  { label: "대회 일정", href: "/events", icon: "calendar" },
  { label: "레슨 찾기", href: "/lessons", icon: "book" },
  { label: "자격증 안내", href: "/certification", icon: "badge" },
  { label: "장비거래", href: "/market", icon: "cart" },
];

export const liveNewsItems: LiveNewsItem[] = [
  {
    id: "1",
    title: "2026 PUL 전국 파크골프 평가 접수 안내",
    badge: "공지",
    badgeColor: "bg-blue-100 text-blue-700",
    time: "10분 전",
  },
  {
    id: "2",
    title: "파크골프 장비 공동구매 이벤트 진행 중",
    badge: "NEW",
    badgeColor: "bg-orange-100 text-orange-700",
    time: "25분 전",
  },
  {
    id: "3",
    title: "8월 정기 이벤트와 초보자 교육 안내",
    badge: "안내",
    badgeColor: "bg-green-100 text-pul-deep",
    time: "1시간 전",
  },
  {
    id: "4",
    title: "제21회 한강 전국 파크골프 대회 안내",
    badge: "대회",
    badgeColor: "bg-amber-100 text-amber-700",
    time: "2시간 전",
  },
  {
    id: "5",
    title: "파크골프 예약 시스템 점검 안내",
    badge: "공지",
    badgeColor: "bg-blue-100 text-blue-700",
    time: "3시간 전",
  },
];

export const weatherData: WeatherData = {
  location: "서울 마포구",
  temperature: 24,
  condition: "맑음",
  fineDust: "미세먼지 좋음",
  forecast: [
    { label: "오늘", temp: 24 },
    { label: "내일", temp: 27 },
    { label: "모레", temp: 28 },
  ],
};

export const newClubs: ClubItem[] = [
  {
    id: "1",
    name: "한강파크골프회",
    location: "서울 마포구",
    members: 48,
    tag: "초보환영",
  },
  {
    id: "2",
    name: "수원시니어파크골프클럽",
    location: "경기 수원시",
    members: 52,
    tag: "친목",
  },
  {
    id: "3",
    name: "부산해운대파크골프회",
    location: "부산 해운대구",
    members: 41,
    tag: "주말라운딩",
  },
  {
    id: "4",
    name: "대구달서파크골프클럽",
    location: "대구 달서구",
    members: 44,
    tag: "가족모임",
  },
];

export const featuredEvent: FeaturedEvent = {
  title: "제17회 한강배 전국 파크골프 대회",
  date: "2026.07.12 (일)",
  location: "한강 시민공원 파크골프장",
  cta: "접수하기",
};

export const eventSchedule: EventScheduleItem[] = [
  { id: "1", date: "07.19", title: "제89회 PUL 정기 회원대회" },
  { id: "2", date: "07.21", title: "초보자 친선 라운딩 데이" },
  { id: "3", date: "07.25", title: "대구·경북 교류전" },
  { id: "4", date: "07.27", title: "PUL 클럽 챔피언십 예선" },
];

export const hallOfFamePeople: HallOfFamePerson[] = [
  {
    id: "1",
    name: "김영수",
    achievement: "홀인원 3회 · 한강파크",
    tab: "holeInOne",
  },
  {
    id: "2",
    name: "최동훈",
    achievement: "홀인원 2회 · 수원클럽",
    tab: "holeInOne",
  },
  {
    id: "3",
    name: "정미경",
    achievement: "홀인원 1회 · 부산해운대",
    tab: "holeInOne",
  },
  {
    id: "4",
    name: "이정희",
    achievement: "베스트 28타 · 2026 시즌",
    tab: "bestScore",
  },
  {
    id: "5",
    name: "박서준",
    achievement: "베스트 29타 · PUL 정기대회",
    tab: "bestScore",
  },
  {
    id: "6",
    name: "한지민",
    achievement: "베스트 30타 · 경기 오픈",
    tab: "bestScore",
  },
  {
    id: "7",
    name: "박민호",
    achievement: "2026 한강배 우승",
    tab: "winner",
  },
  {
    id: "8",
    name: "송재호",
    achievement: "2026 PUL 챔피언십 우승",
    tab: "winner",
  },
  {
    id: "9",
    name: "윤수연",
    achievement: "2026 전국 동호인 대회 우승",
    tab: "winner",
  },
];

export const educationCards: EducationCardItem[] = [
  { id: "1", title: "레슨 찾기", href: "/lessons", icon: "book" },
  { id: "2", title: "자격증 안내", href: "/certification", icon: "badge" },
  { id: "3", title: "시험 정보", href: "/exam", icon: "doc" },
  { id: "4", title: "교육 일정", href: "/lessons", icon: "calendar" },
];

export const featureBanners: FeatureBannerItem[] = [
  {
    id: "1",
    title: "파크골프장 찾기",
    description: "전국 파크골프장 정보와 예약까지 한 번에",
    href: "/courses",
    variant: "course",
  },
  {
    id: "2",
    title: "장비 관리센터",
    description: "장비 리뷰, 리폼, 수리, 중고거래까지",
    href: "/equipment",
    variant: "equipment",
  },
  {
    id: "3",
    title: "PUL 커뮤니티",
    description: "자유게시판, 질문, 후기, 정보를 나누는 공간",
    href: "/community",
    variant: "community",
  },
];

export const popularPosts: PopularPost[] = [
  { id: "1", rank: 1, title: "초보자 추천 클럽 선택 방법", views: 125 },
  { id: "2", rank: 2, title: "오늘 라운딩 후기입니다", views: 98 },
  { id: "3", rank: 3, title: "파크골프 스윙 잘하는 팁 공유", views: 76 },
  { id: "4", rank: 4, title: "가성비 좋은 파크골프 공 추천", views: 63 },
  { id: "5", rank: 5, title: "우리 클럽 정모 인증샷", views: 57 },
];

export const pulNews: NewsItem[] = [
  { id: "1", title: "2026 파크골프 규정 일부 개정 안내", category: "규정" },
  { id: "2", title: "전국 파크골프 대회 일정 발표", category: "대회" },
  { id: "3", title: "신제품 파크골프채 출시 소식", category: "장비" },
  { id: "4", title: "지도자 교육 일정 안내", category: "교육" },
  { id: "5", title: "파크골프장 유지관리 가이드", category: "정보" },
];

export const recommendedClubs: RecommendedClub[] = [
  { id: "1", name: "PUL 드림파크", location: "경기 성남시", members: 32 },
  { id: "2", name: "평택파크골프회", location: "경기 평택시", members: 28 },
  { id: "3", name: "청주파크사랑", location: "충북 청주시", members: 36 },
];

export const marketItems: MarketItem[] = [
  { id: "1", name: "파크골프채 세트", price: 250000 },
  { id: "2", name: "파크골프 공 3피스", price: 25000 },
  { id: "3", name: "파크골프 가방", price: 80000 },
];

export const membershipBenefits: MembershipBenefit[] = [
  { icon: "users", label: "동호회 홍보 지원" },
  { icon: "trophy", label: "대회 참가비 할인" },
  { icon: "cart", label: "장비 할인 혜택" },
  { icon: "star", label: "전용 콘텐츠 제공" },
];

export const footerLinks = {
  company: [
    { label: "회사소개", href: "/about" },
    { label: "PUL 소개", href: "/pul" },
    { label: "이용약관", href: "/terms" },
    { label: "개인정보처리방침", href: "/privacy" },
  ],
  support: [
    { label: "고객센터", href: "/support" },
    { label: "자주 묻는 질문", href: "/faq" },
    { label: "1:1 문의", href: "/inquiry" },
    { label: "공지사항", href: "/notice" },
  ],
  business: [
    { label: "제휴문의", href: "/partnership" },
    { label: "광고문의", href: "/ads" },
    { label: "입점문의", href: "/vendor" },
  ],
};
