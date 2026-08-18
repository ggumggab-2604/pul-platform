import type {
  AdBannerData,
  ClubItem,
  EducationCardItem,
  EventScheduleItem,
  FeaturedEvent,
  FeatureBannerItem,
  HallOfFamePerson,
  HallOfFamePortalData,
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
  locationNote: "관심 지역 · 예시",
  temperature: 24,
  condition: "맑음",
  fineDust: "미세먼지 좋음",
  rainChance: "강수확률 10%",
  wind: "바람 약함",
  forecast: [
    { label: "오늘", temp: 24 },
    { label: "내일", temp: 27 },
    { label: "모레", temp: 28 },
  ],
  detailHref: "/courses",
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
    tab: "holeInOne",
    recordLabel: "홀인원",
    courseName: "한강 시민공원 파크골프장",
    holeInfo: "7번홀",
    date: "2026.06.12",
    clubName: "한강파크골프회",
    achievement: "홀인원 3회 · 한강파크",
  },
  {
    id: "2",
    name: "최동훈",
    tab: "holeInOne",
    recordLabel: "홀인원",
    courseName: "수원 파크골프장",
    holeInfo: "3번홀",
    date: "2026.05.28",
    clubName: "수원시니어파크골프클럽",
    achievement: "홀인원 2회 · 수원클럽",
  },
  {
    id: "3",
    name: "정미경",
    tab: "holeInOne",
    recordLabel: "홀인원",
    courseName: "부산 해운대 파크골프장",
    holeInfo: "12번홀",
    date: "2026.04.19",
    achievement: "홀인원 1회 · 부산해운대",
  },
  /* 모바일 기존 탭용 예시 데이터 */
  {
    id: "4",
    name: "이정호",
    tab: "bestScore",
    achievement: "베스트 28타 · 2026 시즌",
  },
  {
    id: "5",
    name: "박서준",
    tab: "bestScore",
    achievement: "베스트 29타 · PUL 정기대회",
  },
  {
    id: "6",
    name: "한미영",
    tab: "bestScore",
    achievement: "베스트 30타 · 경기 오픈",
  },
  {
    id: "7",
    name: "박민호",
    tab: "tournamentWinner",
    tournamentName: "2026 한강배",
    clubName: "한강파크골프회",
    courseName: "한강 시민공원 파크골프장",
    date: "2026.05.03",
    achievement: "2026 한강배 우승",
  },
  {
    id: "8",
    name: "송재호",
    tab: "tournamentWinner",
    tournamentName: "2026 PUL 챔피언십",
    clubName: "PUL 드림파크",
    courseName: "서울 파크골프장",
    date: "2026.06.01",
    achievement: "2026 PUL 챔피언십 우승",
  },
  {
    id: "9",
    name: "윤수연",
    tab: "tournamentWinner",
    tournamentName: "2026 전국 동호인 대회",
    clubName: "부산해운대파크골프회",
    courseName: "부산 해운대 파크골프장",
    date: "2026.03.22",
    achievement: "2026 전국 동호인 대회 우승",
  },
  /* 모바일 기존 ‘우승자’ 탭 — 동일 인물 재사용 */
  {
    id: "7m",
    name: "박민호",
    tab: "winner",
    achievement: "2026 한강배 우승",
  },
  {
    id: "8m",
    name: "송재호",
    tab: "winner",
    achievement: "2026 PUL 챔피언십 우승",
  },
  {
    id: "9m",
    name: "윤수연",
    tab: "winner",
    achievement: "2026 전국 동호인 대회 우승",
  },
  {
    id: "10",
    name: "김영수",
    tab: "clubWinner",
    clubName: "한강파크골프회",
    eventName: "6월 월례회",
    courseName: "한강 시민공원 파크골프장",
    date: "2026.06.15",
    achievement: "한강파크골프회 6월 월례회 우승",
  },
  {
    id: "11",
    name: "이정희",
    tab: "clubWinner",
    clubName: "마포 파크골프회",
    eventName: "5월 월례회",
    courseName: "한강 시민공원 파크골프장",
    date: "2026.05.18",
    achievement: "마포 파크골프회 5월 월례회 우승",
  },
];

/** PC 포털 명예의 전당 — 3영역 고정 데이터 (모바일 hallOfFamePeople과 분리) */
export const hallOfFamePortalData: HallOfFamePortalData = {
  specialRecords: [
    {
      id: "sr1",
      type: "holeInOne",
      memberName: "김영수",
      courseName: "한강 시민공원 파크골프장",
      hole: "7번홀",
      recordDate: "2026.06.12",
      clubName: "한강파크골프회",
    },
    {
      id: "sr1b",
      type: "holeInOne",
      memberName: "최동훈",
      courseName: "수원 파크골프장",
      hole: "3번홀",
      recordDate: "2026.05.28",
      clubName: "수원시니어파크골프클럽",
    },
    {
      id: "sr1c",
      type: "holeInOne",
      memberName: "정미경",
      courseName: "부산 해운대 파크골프장",
      hole: "12번홀",
      recordDate: "2026.04.19",
    },
    {
      id: "sr2",
      type: "albatross",
      memberName: "한미영",
      courseName: "수원 파크골프장",
      hole: "12번홀",
      recordDate: "2026.06.01",
      clubName: "수원시니어파크골프클럽",
    },
    {
      id: "sr3",
      type: "condor",
      memberName: "박서준",
      courseName: "대구 달서 파크골프장",
      hole: "5번홀",
      recordDate: "2026.03.15",
    },
    {
      id: "sr4",
      type: "holeInOne",
      memberName: "오성민",
      courseName: "춘천 소양강 파크골프장",
      hole: "9번홀",
      recordDate: "2026.06.20",
      clubName: "춘천 소양강 파크골프회",
    },
    {
      id: "sr5",
      type: "albatross",
      memberName: "강은혜",
      courseName: "전주 한옥마을 파크골프장",
      hole: "4번홀",
      recordDate: "2026.05.08",
      clubName: "전주 한옥마을 파크골프회",
    },
    {
      id: "sr6",
      type: "holeInOne",
      memberName: "배준혁",
      courseName: "인천 송도 파크골프장",
      hole: "15번홀",
      recordDate: "2026.04.02",
      clubName: "송도시니어파크골프",
    },
  ],
  clubBestScores: [
    {
      id: "cb1",
      memberName: "이정호",
      score: 48,
      clubName: "PUL 드림파크",
      courseName: "한강 시민공원 파크골프장",
      recordMonth: "2026년 7월",
    },
    {
      id: "cb2",
      memberName: "박서준",
      score: 49,
      clubName: "한강파크골프회",
      courseName: "한강 시민공원 파크골프장",
      recordMonth: "2026년 7월",
    },
    {
      id: "cb3",
      memberName: "김영수",
      score: 50,
      clubName: "마포 파크골프회",
      courseName: "한강 시민공원 파크골프장",
      recordMonth: "2026년 7월",
    },
    {
      id: "cb4",
      memberName: "윤수연",
      score: 51,
      clubName: "부산해운대파크골프회",
      courseName: "부산 해운대 파크골프장",
      recordMonth: "2026년 7월",
    },
    {
      id: "cb5",
      memberName: "송재호",
      score: 52,
      clubName: "수원시니어파크골프클럽",
      courseName: "수원 파크골프장",
      recordMonth: "2026년 7월",
    },
    {
      id: "cb6",
      memberName: "조현우",
      score: 53,
      clubName: "대구달서파크골프클럽",
      courseName: "대구 달서 파크골프장",
      recordMonth: "2026년 7월",
    },
    {
      id: "cb7",
      memberName: "임채원",
      score: 54,
      clubName: "춘천 소양강 파크골프회",
      courseName: "춘천 소양강 파크골프장",
      recordMonth: "2026년 7월",
    },
    {
      id: "cb8",
      memberName: "한지우",
      score: 55,
      clubName: "전주 한옥마을 파크골프회",
      courseName: "전주 한옥마을 파크골프장",
      recordMonth: "2026년 7월",
    },
  ],
  tournamentWinners: [
    {
      id: "tw1",
      winnerName: "정미경",
      tournamentName: "제17회 한강배 전국 파크골프 대회",
      clubName: "부산새터클럽",
      courseName: "한강 시민공원 파크골프장",
      winDate: "2026.07.12",
    },
    {
      id: "tw2",
      winnerName: "박민호",
      tournamentName: "2026 PUL 챔피언십",
      clubName: "한강파크골프회",
      courseName: "서울 파크골프장",
      winDate: "2026.06.01",
    },
    {
      id: "tw3",
      winnerName: "윤수연",
      tournamentName: "2026 전국 동호인 교류 파크골프 챔피언십 본선",
      clubName: "부산해운대파크골프회",
      courseName: "부산 해운대 파크골프장",
      winDate: "2026.03.22",
    },
    {
      id: "tw4",
      winnerName: "김영수",
      tournamentName: "제89회 PUL 정기 회원대회 시니어부 결승전",
      clubName: "한강파크골프회",
      winDate: "2026.05.10",
    },
    {
      id: "tw5",
      winnerName: "이정희",
      tournamentName: "대구·경북 교류전",
      clubName: "대구달서파크골프클럽",
      winDate: "2026.04.05",
    },
    {
      id: "tw6",
      winnerName: "오성민",
      tournamentName: "2026 춘천 소양강배",
      clubName: "춘천 소양강 파크골프회",
      courseName: "춘천 소양강 파크골프장",
      winDate: "2026.06.18",
    },
    {
      id: "tw7",
      winnerName: "강은혜",
      tournamentName: "전북 동호인 친선대회",
      clubName: "전주 한옥마을 파크골프회",
      courseName: "전주 한옥마을 파크골프장",
      winDate: "2026.05.24",
    },
    {
      id: "tw8",
      winnerName: "배준혁",
      tournamentName: "인천 송도 오픈",
      clubName: "송도시니어파크골프",
      courseName: "인천 송도 파크골프장",
      winDate: "2026.04.12",
    },
  ],
};

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

/** 하단 추천 — 상단 신규 등록 동호회(id 1~4)와 중복되지 않음 */
export const recommendedClubs: RecommendedClub[] = [
  { id: "5", name: "춘천 소양강 파크골프회", location: "강원 춘천시", members: 33 },
  { id: "7", name: "전주 한옥마을 파크골프회", location: "전북 전주시", members: 27 },
  { id: "9", name: "분당 시니어 파크골프회", location: "경기 성남시", members: 45 },
];

export const marketItems: MarketItem[] = [
  { id: "1", name: "파크골프채 세트", price: 250000 },
  { id: "2", name: "파크골프 공 3피스", price: 25000 },
  { id: "3", name: "파크골프 가방", price: 80000 },
];

/** 상단 장터 인기 상품 ID — 하단 최근 매물에서 제외 */
export const homeTopMarketItemIds = marketItems.map((item) => item.id);

export const membershipBenefits: MembershipBenefit[] = [
  { icon: "flag", label: "관심 골프장 저장" },
  { icon: "users", label: "동호회 가입 및 활동" },
  { icon: "calendar", label: "대회 일정 확인" },
  { icon: "chat", label: "기록 등록과 커뮤니티 참여" },
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
