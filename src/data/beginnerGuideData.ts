export type BeginnerGuideType = "absolute_beginner" | "golf_experienced";

export type BeginnerGuide = {
  id: string;
  type: BeginnerGuideType;
  title: string;
  description: string;
  checklist: string[];
  ctaText?: string;
  ctaLink?: string;
};

/**
 * TODO:
 * - 입문 가이드 상세 페이지 연결
 * - 골프장·동호회 추천 API 연동
 * - 맞춤 입문 코스 추천
 */
export const beginnerGuides: BeginnerGuide[] = [
  {
    id: "guide-absolute-beginner",
    type: "absolute_beginner",
    title: "파크골프가 처음인 분",
    description:
      "골프 경험이 없어도 파크골프를 시작할 수 있도록 기본 이용 방법, 동호회 가입, 골프장 찾기, 준비물을 안내합니다.",
    checklist: [
      "파크골프는 어디서 시작하나요?",
      "가까운 파크골프장 찾기",
      "동호회에 가입하면 좋은 이유",
      "처음 필요한 준비물",
      "기본 예절과 안전수칙",
      "무료 영상으로 기본 자세 배우기",
    ],
    ctaText: "무료 영상으로 배우기",
    ctaLink: "tab:free-videos",
  },
  {
    id: "guide-golf-experienced",
    type: "golf_experienced",
    title: "기존 골프 경험자",
    description:
      "골프 경험은 있지만 파크골프의 운영 방식, 예약 방식, 동호회 문화가 낯선 분들을 위한 안내입니다.",
    checklist: [
      "골프와 파크골프의 차이",
      "파크골프장 예약 방식",
      "지자체 운영 구장 이해",
      "동호회 네트워크의 중요성",
      "1인 이용과 월례회 문화",
      "파크골프 룰·매너 차이",
    ],
    ctaText: "유료 레슨 찾아보기",
    ctaLink: "tab:paid-lessons",
  },
];

export const introGuideCtaButtons = [
  { id: "courses", label: "가까운 골프장 찾기", href: "/courses" },
  { id: "clubs", label: "동호회 둘러보기", href: "/clubs" },
  { id: "free-videos", label: "무료 영상으로 배우기", href: "tab:free-videos" },
  { id: "paid-lessons", label: "유료 레슨 찾아보기", href: "tab:paid-lessons" },
] as const;

export type StarterGuideAudience = "completeBeginner" | "golfExperienced" | "common";

export const starterGuideAudienceLabels: Record<StarterGuideAudience, string> = {
  completeBeginner: "완전 초보",
  golfExperienced: "골프 경험자",
  common: "공통",
};

export type StarterGuideCard = {
  id: string;
  title: string;
  audience: StarterGuideAudience;
  summary: string;
  highlights: string[];
};

export const starterGuideSectionCopy = {
  title: "처음 시작하는 파크골프 가이드",
  description: "파크골프를 처음 시작할 때 많이 궁금해하는 내용을 단계별로 정리했습니다.",
};

export const starterGuideCards: StarterGuideCard[] = [
  {
    id: "starter-1",
    title: "파크골프 처음 시작하는 방법",
    audience: "completeBeginner",
    summary:
      "파크골프를 어디서 시작하고, 무엇부터 알아봐야 하는지 기본 흐름을 안내합니다.",
    highlights: [
      "가까운 파크골프장 찾기",
      "무료 체험 또는 동호회 문의",
      "기본 장비 준비",
      "첫 라운드 전 확인사항",
    ],
  },
  {
    id: "starter-2",
    title: "장비는 무엇부터 준비해야 할까요?",
    audience: "completeBeginner",
    summary:
      "처음부터 비싼 장비를 사기보다 꼭 필요한 장비부터 확인하도록 안내합니다.",
    highlights: [
      "파크골프채 · 공 · 볼마커",
      "장갑 · 신발 · 가방",
      "중고 장비 활용",
    ],
  },
  {
    id: "starter-3",
    title: "파크골프장 예약은 왜 어려울까요?",
    audience: "common",
    summary:
      "지자체 운영 구장, 예약일, 시간대, 동호회 이용 문화 등 파크골프장 이용 방식을 안내합니다.",
    highlights: [
      "지자체 운영 구장 · 예약 오픈일",
      "1인 예약 · 현장 접수 여부",
      "월 단위 예약 · 구장별 운영 차이",
    ],
  },
  {
    id: "starter-4",
    title: "동호회는 꼭 가입해야 할까요?",
    audience: "common",
    summary:
      "파크골프에서 동호회가 왜 중요한지, 가입하면 어떤 점이 좋은지 안내합니다.",
    highlights: [
      "같이 칠 사람 찾기",
      "구장 이용 정보 공유",
      "대회·행사 참여 · 실력 향상",
      "지역 커뮤니티",
    ],
  },
  {
    id: "starter-5",
    title: "골프 경험자가 파크골프에서 헷갈리는 점",
    audience: "golfExperienced",
    summary:
      "일반 골프 경험자가 파크골프를 시작할 때 헷갈릴 수 있는 차이점을 정리합니다.",
    highlights: [
      "장비 · 스윙 · 거리감 차이",
      "예약 방식 · 동호회 문화",
      "1인 이용 문화 · 매너 차이",
    ],
  },
  {
    id: "starter-6",
    title: "첫 라운드 전 알아야 할 기본 매너",
    audience: "completeBeginner",
    summary:
      "처음 파크골프장에 가기 전 알아두면 좋은 기본 예절과 안전 수칙을 안내합니다.",
    highlights: [
      "앞 팀과의 거리 · 안전 확인",
      "큰소리 주의 · 코스 보호",
      "타순 지키기 · 공 찾기 매너",
      "동반자 배려",
    ],
  },
];

export type StarterPathOption = {
  id: string;
  title: string;
  description: string;
  buttonLabel: string;
  scrollTargetId: string;
};

export const starterPathSectionCopy = {
  title: "나에게 맞는 시작 방법",
};

export const starterPathOptions: StarterPathOption[] = [
  {
    id: "path-absolute",
    title: "골프 경험이 전혀 없어요",
    description: "장비, 기본 자세, 구장 이용 방법부터 천천히 확인하세요.",
    buttonLabel: "완전 초보 가이드 보기",
    scrollTargetId: "intro-absolute-beginner",
  },
  {
    id: "path-golf",
    title: "골프는 쳐봤지만 파크골프는 처음이에요",
    description:
      "일반 골프와 다른 운영 방식, 예약, 동호회 문화를 먼저 확인하세요.",
    buttonLabel: "골프 경험자 가이드 보기",
    scrollTargetId: "intro-golf-experienced",
  },
  {
    id: "path-easy",
    title: "부모님이나 지인에게 알려드리고 싶어요",
    description:
      "나이가 있는 분들도 쉽게 이해할 수 있도록 준비물과 이용 순서를 확인하세요.",
    buttonLabel: "쉬운 시작 안내 보기",
    scrollTargetId: "intro-starter-guides",
  },
];

export const INTRO_GUIDE_DISCLAIMER =
  "파크골프장 운영 방식, 예약 방법, 동호회 가입 조건, 이용 요금은 지역과 구장마다 다를 수 있습니다.\n처음 방문 전에는 해당 구장의 공식 안내, 지자체 공지, 동호회 안내를 함께 확인해주세요.";
